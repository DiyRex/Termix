import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import type { AuthenticatedRequest } from "../../../types/index.js";
import { fileLogger } from "../../utils/logger.js";
import { getSessionSftp, type SSHSession } from "./session.js";

/**
 * Transfers between this machine's disk and an SFTP session, for the SFTP tab's
 * two panes.
 *
 * Streams via ssh2's fastPut/fastGet rather than moving bytes through the
 * renderer: an upload route that took a File would have to materialise the whole
 * thing in the JS heap first, which is the very thing the existing chunked
 * upload path works around.
 *
 * Desktop only. On a hosted Termix "local" is the server's disk, so these
 * routes would be arbitrary read/write on someone else's machine.
 */

type LocalTransferRoutesDeps = {
  sshSessions: Record<string, SSHSession>;
  verifySessionOwnership: (session: SSHSession, userId: string) => boolean;
};

const isDesktop = process.env.ELECTRON_EMBEDDED === "true";

/** Shared preamble: every one of these needs the same four checks. */
function resolveSession(
  req: AuthenticatedRequest,
  sshSessions: Record<string, SSHSession>,
  verifySessionOwnership: (session: SSHSession, userId: string) => boolean,
): { session: SSHSession } | { status: number; error: string } {
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) return { status: 400, error: "Session ID is required" };

  const session = sshSessions[sessionId];
  if (!session?.isConnected) {
    return { status: 400, error: "SSH connection not established" };
  }
  if (!verifySessionOwnership(session, req.userId)) {
    return { status: 403, error: "Session access denied" };
  }
  return { session };
}

export function registerLocalTransferRoutes(
  app: Express,
  { sshSessions, verifySessionOwnership }: LocalTransferRoutesDeps,
): void {
  if (!isDesktop) {
    fileLogger.info(
      "Local transfer routes disabled: only the embedded desktop backend may read or write the local disk",
      { operation: "local_transfer_disabled" },
    );
    return;
  }

  /**
   * @openapi
   * /ssh/file_manager/local/upload:
   *   post:
   *     summary: Upload a file from this machine to the remote host
   *     description: >
   *       Streams a file from the local filesystem into an existing SFTP
   *       session. Desktop builds only.
   *     tags:
   *       - File Manager
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               sessionId:
   *                 type: string
   *               localPath:
   *                 type: string
   *               remotePath:
   *                 type: string
   *     responses:
   *       200:
   *         description: Upload completed.
   *       400:
   *         description: Missing parameters, no connection, or the source is not a file.
   *       403:
   *         description: Session access denied.
   *       500:
   *         description: Transfer failed.
   */
  app.post("/ssh/file_manager/local/upload", async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const resolved = resolveSession(
      authedReq,
      sshSessions,
      verifySessionOwnership,
    );
    if ("error" in resolved) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { session } = resolved;

    const { localPath, remotePath } = req.body as {
      localPath?: string;
      remotePath?: string;
    };
    if (!localPath || !remotePath) {
      return res
        .status(400)
        .json({ error: "localPath and remotePath are required" });
    }

    const source = path.resolve(localPath);
    let size: number;
    try {
      const stat = await fs.promises.stat(source);
      // Directories need a recursive walk, which this route deliberately does
      // not attempt — a half-copied tree is worse than a clear refusal.
      if (!stat.isFile()) {
        return res
          .status(400)
          .json({ error: "Only files can be uploaded, not directories" });
      }
      size = stat.size;
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Cannot read local file",
      });
    }

    session.lastActive = Date.now();

    try {
      const sftp = await getSessionSftp(session);
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(source, remotePath, { fileSize: size }, (err) =>
          err ? reject(err) : resolve(),
        );
      });

      fileLogger.info("Uploaded local file to remote host", {
        operation: "local_transfer_upload",
        userId: authedReq.userId,
        bytes: size,
      });
      return res.json({ ok: true, bytes: size });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      fileLogger.error("Local upload failed", {
        operation: "local_transfer_upload_failed",
        userId: authedReq.userId,
        error: message,
      });
      return res.status(500).json({ error: message });
    }
  });

  /**
   * @openapi
   * /ssh/file_manager/local/download:
   *   post:
   *     summary: Download a remote file to this machine
   *     description: >
   *       Streams a file from an existing SFTP session onto the local
   *       filesystem. Desktop builds only.
   *     tags:
   *       - File Manager
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               sessionId:
   *                 type: string
   *               remotePath:
   *                 type: string
   *               localPath:
   *                 type: string
   *     responses:
   *       200:
   *         description: Download completed.
   *       400:
   *         description: Missing parameters, no connection, or the source is not a file.
   *       403:
   *         description: Session access denied.
   *       500:
   *         description: Transfer failed.
   */
  app.post("/ssh/file_manager/local/download", async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const resolved = resolveSession(
      authedReq,
      sshSessions,
      verifySessionOwnership,
    );
    if ("error" in resolved) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { session } = resolved;

    const { remotePath, localPath } = req.body as {
      remotePath?: string;
      localPath?: string;
    };
    if (!remotePath || !localPath) {
      return res
        .status(400)
        .json({ error: "remotePath and localPath are required" });
    }

    const destination = path.resolve(localPath);
    session.lastActive = Date.now();

    try {
      const sftp = await getSessionSftp(session);

      const stat = await new Promise<import("ssh2").Stats>(
        (resolve, reject) => {
          sftp.stat(remotePath, (err, s) =>
            err ? reject(err) : resolve(s as import("ssh2").Stats),
          );
        },
      );
      if (!stat.isFile()) {
        return res
          .status(400)
          .json({ error: "Only files can be downloaded, not directories" });
      }

      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, destination, { fileSize: stat.size }, (err) =>
          err ? reject(err) : resolve(),
        );
      });

      fileLogger.info("Downloaded remote file to this machine", {
        operation: "local_transfer_download",
        userId: authedReq.userId,
        bytes: stat.size,
      });
      return res.json({ ok: true, bytes: stat.size });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      fileLogger.error("Local download failed", {
        operation: "local_transfer_download_failed",
        userId: authedReq.userId,
        error: message,
      });
      return res.status(500).json({ error: message });
    }
  });
}

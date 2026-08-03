/**
 * Transfers between this machine's disk and an open SFTP session.
 *
 * The bytes never pass through the renderer: the backend streams them with
 * ssh2's fastPut/fastGet, so a multi-gigabyte file is never held in the JS heap.
 * Desktop builds only — the routes are not registered otherwise.
 *
 * Routed through getFileManagerApiForSession so the request reaches the same
 * backend that owns the session, which is what every other file-manager call
 * does; a plain axios call would miss the session's origin.
 */
import { getFileManagerApiForSession, handleApiError } from "@/main-axios";

type TransferResult = { ok: true; bytes: number };

/** Sends a local file to `remotePath`, which must be a full destination path. */
export async function uploadLocalFile(
  sessionId: string,
  localPath: string,
  remotePath: string,
): Promise<TransferResult> {
  try {
    const api = getFileManagerApiForSession(sessionId);
    const response = await api.post("/ssh/file_manager/local/upload", {
      sessionId,
      localPath,
      remotePath,
    });
    return response.data as TransferResult;
  } catch (error) {
    throw handleApiError(error, "upload file to host");
  }
}

/** Pulls a remote file down to `localPath`, a full destination path. */
export async function downloadToLocalFile(
  sessionId: string,
  remotePath: string,
  localPath: string,
): Promise<TransferResult> {
  try {
    const api = getFileManagerApiForSession(sessionId);
    const response = await api.post("/ssh/file_manager/local/download", {
      sessionId,
      remotePath,
      localPath,
    });
    return response.data as TransferResult;
  } catch (error) {
    throw handleApiError(error, "download file from host");
  }
}

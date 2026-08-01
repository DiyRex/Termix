import { WebSocketServer, WebSocket, type RawData } from "ws";
import os from "node:os";
import fs from "node:fs";
import { AuthManager } from "../utils/auth-manager.js";
import { sshLogger } from "../utils/logger.js";

/**
 * Local console: a PTY on the machine running this backend.
 *
 * Only reachable from the embedded desktop backend. On a hosted Termix the
 * backend runs on someone else's server, so handing out a shell there would
 * turn "open a local terminal" into remote code execution on the host — the
 * module refuses to listen at all in that mode.
 */

const LOCAL_TERMINAL_PORT = 30012;
const MAX_SESSIONS = 32;

interface ConnectData {
  cols?: number;
  rows?: number;
  cwd?: string;
}

interface ResizeData {
  cols?: number;
  rows?: number;
}

interface WebSocketMessage {
  type: string;
  data?: ConnectData | ResizeData | string | unknown;
}

type PtyProcess = {
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
    dispose: () => void;
  };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  pid: number;
};

type PtyModule = {
  spawn: (
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    },
  ) => PtyProcess;
};

const isDesktop = process.env.ELECTRON_EMBEDDED === "true";

/** The user's login shell, or the best per-platform guess. */
function resolveShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const pwsh = process.env.ProgramW6432
      ? `${process.env.ProgramW6432}\\PowerShell\\7\\pwsh.exe`
      : null;
    if (pwsh && fs.existsSync(pwsh)) return { file: pwsh, args: [] };
    return { file: process.env.COMSPEC || "cmd.exe", args: [] };
  }

  const candidates = [
    process.env.SHELL,
    // os.userInfo().shell is populated from the passwd entry, which is what the
    // user actually logs in with when SHELL is unset (launchd-started apps).
    (() => {
      try {
        return (os.userInfo() as { shell?: string }).shell;
      } catch {
        return undefined;
      }
    })(),
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      // A login shell so the user's profile (PATH, aliases, prompt) applies,
      // matching what they'd get from a normal terminal app.
      return { file: candidate, args: ["-l"] };
    }
  }
  return { file: "/bin/sh", args: [] };
}

/** Drops the variables that would leak backend internals into the shell. */
function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    env[key] = value;
  }
  delete env.ELECTRON_EMBEDDED;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.DATA_DIR;
  delete env.JWT_SECRET;
  delete env.SALT;
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

if (!isDesktop) {
  sshLogger.info(
    "Local console disabled: only the embedded desktop backend may spawn a local shell",
    { operation: "local_terminal_disabled" },
  );
} else {
  startLocalTerminalServer();
}

function startLocalTerminalServer() {
  const authManager = AuthManager.getInstance();

  // Loopback-only. The desktop app is the only client, and binding the default
  // wildcard address would expose a shell to the whole network.
  const wss = new WebSocketServer({
    port: LOCAL_TERMINAL_PORT,
    host: "127.0.0.1",
  });

  let sessionCount = 0;

  wss.on("error", (error) => {
    sshLogger.error("Local console WebSocket server error", error, {
      operation: "local_terminal_wss_error",
    });
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    let userId: string | undefined;

    try {
      let token: string | undefined;

      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)jwt=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice("Bearer ".length);
        }
      }

      if (!token) {
        const urlObj = new URL(req.url || "", "http://localhost");
        const qp = urlObj.searchParams.get("token");
        if (qp) token = qp;
      }

      if (!token) {
        ws.close(1008, "Authentication required");
        return;
      }

      const payload = await authManager.verifyJWTToken(token);
      if (!payload?.userId || payload.pendingTOTP) {
        ws.close(1008, "Authentication required");
        return;
      }

      userId = payload.userId;
    } catch {
      ws.close(1008, "Authentication required");
      return;
    }

    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    if (sessionCount >= MAX_SESSIONS) {
      send({ type: "error", data: "Too many local consoles are already open" });
      ws.close(1013, "Too many sessions");
      return;
    }

    let pty: PtyProcess | null = null;
    let ptyModule: PtyModule | null = null;
    const subscriptions: { dispose: () => void }[] = [];
    let counted = false;

    const cleanup = () => {
      for (const sub of subscriptions.splice(0)) {
        try {
          sub.dispose();
        } catch {
          // The PTY is already gone; nothing left to detach from.
        }
      }
      if (pty) {
        try {
          pty.kill();
        } catch {
          // Already exited.
        }
        pty = null;
      }
      if (counted) {
        counted = false;
        sessionCount--;
      }
    };

    ws.on("message", async (raw: RawData) => {
      let parsed: WebSocketMessage;
      try {
        parsed = JSON.parse(raw.toString()) as WebSocketMessage;
      } catch {
        return;
      }

      const { type, data } = parsed;

      switch (type) {
        case "connect": {
          if (pty) break;

          if (!ptyModule) {
            try {
              // Imported lazily so a missing native build only breaks the local
              // console rather than the whole backend boot.
              ptyModule = (await import("node-pty")) as unknown as PtyModule;
            } catch (err) {
              sshLogger.error("node-pty unavailable", err, {
                operation: "local_terminal_module_missing",
              });
              send({
                type: "error",
                data: "Local console support is not installed in this build",
              });
              break;
            }
          }

          const cfg = (data ?? {}) as ConnectData;
          const cols = Math.min(Math.max(cfg.cols ?? 80, 2), 1000);
          const rows = Math.min(Math.max(cfg.rows ?? 24, 2), 1000);
          const { file, args } = resolveShell();
          const cwd = os.homedir();

          try {
            pty = ptyModule.spawn(file, args, {
              name: "xterm-256color",
              cols,
              rows,
              cwd,
              env: buildEnv(),
            });
          } catch (err) {
            sshLogger.error("Failed to spawn local shell", err, {
              operation: "local_terminal_spawn_failed",
              shell: file,
              userId,
            });
            send({
              type: "error",
              data:
                err instanceof Error ? err.message : "Failed to spawn shell",
            });
            break;
          }

          counted = true;
          sessionCount++;

          sshLogger.info("Local console started", {
            operation: "local_terminal_spawn",
            shell: file,
            pid: pty.pid,
            userId,
          });

          // Shells announce their title with OSC 0 (icon + title) or OSC 2
          // (title), terminated by BEL or ST. Forwarded as its own message so
          // the tab can label itself "user@host: ~" the way a terminal app does,
          // rather than staying on a generic name for its whole life.
          //
          // A sequence can straddle a chunk boundary, so an unterminated tail is
          // carried over instead of being dropped.
          let titleTail = "";
          // ESC ] (0|2) ; <title> terminated by BEL or ESC backslash
          const OSC_TITLE = /\x1b\](?:0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

          subscriptions.push(
            pty.onData((chunk) => {
              send({ type: "data", data: chunk });

              const scan = titleTail + chunk;
              let title: string | undefined;
              let lastEnd = 0;
              OSC_TITLE.lastIndex = 0;
              for (
                let match = OSC_TITLE.exec(scan);
                match;
                match = OSC_TITLE.exec(scan)
              ) {
                title = match[1];
                lastEnd = match.index + match[0].length;
              }

              // Keep only a trailing partial sequence, capped so a stream that
              // never terminates one cannot grow this without bound.
              const rest = scan.slice(Math.max(lastEnd, scan.length - 512));
              const openIdx = rest.lastIndexOf("\x1b]");
              titleTail = openIdx === -1 ? "" : rest.slice(openIdx);

              if (title) send({ type: "title", data: title });
            }),
          );
          subscriptions.push(
            pty.onExit(({ exitCode }) => {
              send({ type: "exit", data: exitCode });
              cleanup();
            }),
          );

          send({ type: "connected", data: { shell: file } });
          break;
        }

        case "input": {
          if (!pty || typeof data !== "string") break;
          pty.write(data);
          break;
        }

        case "resize": {
          if (!pty) break;
          const size = (data ?? {}) as ResizeData;
          const cols = Math.min(Math.max(size.cols ?? 80, 2), 1000);
          const rows = Math.min(Math.max(size.rows ?? 24, 2), 1000);
          try {
            pty.resize(cols, rows);
          } catch {
            // The PTY exited between the resize and this call.
          }
          break;
        }

        case "disconnect": {
          cleanup();
          send({ type: "exit", data: 0 });
          break;
        }
      }
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  sshLogger.info(
    `Local console listening on 127.0.0.1:${LOCAL_TERMINAL_PORT}`,
    {
      operation: "local_terminal_listen",
      port: LOCAL_TERMINAL_PORT,
    },
  );
}

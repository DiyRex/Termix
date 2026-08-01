/**
 * Local filesystem access for the SFTP tab's local pane.
 *
 * Goes through Electron IPC rather than the Termix backend. The backend is the
 * same code in the hosted and Docker deployments, where its disk belongs to a
 * server rather than to the user — so putting "browse the local disk" there would
 * mean adding a port, an auth path and a desktop-only gate to keep it honest.
 * The main process only ever runs on the user's own machine, so none of that is
 * needed and the backend stays untouched.
 */
import { isElectron } from "@/lib/electron";

export type LocalDirEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number | null;
  modified: string | null;
  /** rwx string, shown under the name like a shell's `ls -l`. */
  mode: string;
};

export type LocalListing = {
  path: string;
  parent: string | null;
  entries: LocalDirEntry[];
};

type Failure = { error: string };

type Bridge = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function bridge(): Bridge {
  if (!isElectron()) {
    throw new Error("Local files are only available in the desktop app");
  }
  const api = (window as unknown as { electronAPI?: Bridge }).electronAPI;
  if (!api?.invoke) {
    throw new Error("Local files are only available in the desktop app");
  }
  return api;
}

/** Main returns `{error}` instead of rejecting, so unwrap it into a throw here. */
function unwrap<T>(result: unknown): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error((result as Failure).error);
  }
  return result as T;
}

export async function getLocalHome() {
  const result = await bridge().invoke!("local-fs:home");
  return unwrap<{ path: string; separator: string }>(result);
}

export async function listLocalDirectory(dirPath?: string) {
  const result = await bridge().invoke!("local-fs:list", dirPath ?? null);
  return unwrap<LocalListing>(result);
}

export async function createLocalDirectory(dirPath: string) {
  const result = await bridge().invoke!("local-fs:mkdir", dirPath);
  return unwrap<{ ok: true }>(result);
}

export async function renameLocalEntry(from: string, to: string) {
  const result = await bridge().invoke!("local-fs:rename", from, to);
  return unwrap<{ ok: true }>(result);
}

import type { FileItem, SSHHost } from "@/types/index";
import type { LogEntry } from "@/types/connection-log.ts";

export interface FileManagerProps {
  initialHost?: SSHHost | null;
  initialFilePath?: string;
  initialPath?: string;
  onClose?: () => void;
  onOpenTerminalTab?: (path?: string) => void;
  /** When false, pause keepalive while the tab stays mounted in the background. */
  isVisible?: boolean;
  /**
   * Reports the live SFTP session id, so a host of this browser (the SFTP tab)
   * can run transfers against the same session instead of opening a second one.
   */
  onSessionChange?: (sessionId: string | null) => void;
  /** Directory currently listed, for a drop target outside this component. */
  onPathChange?: (path: string) => void;
}

export type ConnectionLogPayload = Omit<LogEntry, "id" | "timestamp">;

export type SSHConnectionError = Error & {
  connectionLogs?: ConnectionLogPayload[];
  requires_totp?: boolean;
  requires_warpgate?: boolean;
  sessionId?: string;
  prompt?: string;
  url?: string;
  securityKey?: string;
  status?: string;
  reason?: "no_keyboard" | "auth_failed" | "timeout";
};

export interface CreateIntent {
  id: string;
  type: "file" | "directory";
  defaultName: string;
  currentName: string;
}

export type PendingSudoOperation =
  | { type: "delete"; files: FileItem[] }
  | { type: "navigate"; path: string };

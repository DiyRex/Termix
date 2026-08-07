import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { isElectron } from "@/lib/electron";

interface RemoteSyncStatus {
  connected: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  needsReauth: boolean;
}

const TOAST_ID = "remote-sync-reauth";

/**
 * Prompts for re-authentication when a connected remote sync server needs it.
 *
 * Raised as a bottom-right toast rather than a bar across the top of the window:
 * the old banner pushed the entire layout down and stole a row from the terminal
 * for something that is only ever advisory. Never gates or hides any other UI —
 * the local app keeps working regardless of remote sync state.
 *
 * Renders nothing itself; it only drives the toast.
 */
export function RemoteSyncBanner({ onReconnect }: { onReconnect: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RemoteSyncStatus | null>(null);
  // The toast's action must call the latest handler, but the toast itself is
  // created outside React's tree, so it reads through a ref instead of closing
  // over whichever prop existed when it was raised.
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!isElectron()) return;
    window.electronAPI
      ?.invoke?.("get-remote-sync-status")
      .then((s) => setStatus((s as RemoteSyncStatus) ?? null))
      .catch(() => {});
    const unsubscribe = window.electronAPI?.onRemoteSyncStatusChanged?.(
      (nextStatus: RemoteSyncStatus) => setStatus(nextStatus),
    );
    return () => unsubscribe?.();
  }, []);

  const needsReauth = !!status?.connected && !!status.needsReauth;

  useEffect(() => {
    if (!needsReauth) {
      // Reconnected or disconnected: retract the prompt rather than leaving a
      // stale one on screen.
      toast.dismiss(TOAST_ID);
      return;
    }

    toast.warning(t("remoteSync.bannerMessage"), {
      id: TOAST_ID,
      // Stays until acted on or resolved — a re-auth prompt that vanishes on a
      // timer is a prompt you miss.
      duration: Infinity,
      icon: <AlertTriangle className="size-4" />,
      action: {
        label: t("remoteSync.bannerReconnect"),
        onClick: () => onReconnectRef.current(),
      },
    });

    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [needsReauth, t]);

  return null;
}

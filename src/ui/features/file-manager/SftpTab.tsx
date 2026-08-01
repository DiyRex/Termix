import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderClosed, Search, X } from "lucide-react";
import { Button } from "@/components/button.tsx";
import { Input } from "@/components/input.tsx";
import type { Host, HostFolder } from "@/types/ui-types";
import type { SSHHost } from "@/types/index";
import { LocalFilePane } from "@/features/file-manager/LocalFilePane";
import { HostOsBadge } from "@/sidebar/HostOsBadge";
import { guessHostOs } from "@/lib/host-os";

const FileManager = lazy(() =>
  import("@/features/file-manager/FileManager").then((m) => ({
    default: m.FileManager,
  })),
);

function PaneFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70" />
    </div>
  );
}

function isFolder(item: Host | HostFolder): item is HostFolder {
  return (item as HostFolder).children !== undefined;
}

function flattenHosts(children: (Host | HostFolder)[]): Host[] {
  const out: Host[] = [];
  for (const child of children) {
    if (isFolder(child)) out.push(...flattenHosts(child.children));
    else out.push(child);
  }
  return out;
}

/**
 * The pinned SFTP tab: this machine on the left, a remote host on the right.
 *
 * Two panes rather than the single remote browser the file-manager tab uses,
 * because a transfer has two ends and picking the near one shouldn't mean
 * leaving the app. The remote half is the existing FileManager unchanged — this
 * only supplies the local side and the split.
 */
export function SftpTab({
  isVisible,
  hostToSSHHost,
  hostTree,
}: {
  isVisible: boolean;
  hostToSSHHost: (host: Host) => SSHHost;
  hostTree?: HostFolder;
}) {
  const { t } = useTranslation();
  // Selection lives here rather than on the tab record: the pinned tab is
  // permanent, so there is no cross-tab state to coordinate.
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Split position as a percentage, so the panes keep their ratio when the
  // window resizes rather than pinning one side to a pixel width.
  const [splitPct, setSplitPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const hosts = useMemo(() => {
    const all = flattenHosts(hostTree?.children ?? []);
    // SFTP rides the SSH connection, so only hosts with file access are useful.
    return all.filter((h) => h.enableFileManager !== false);
  }, [hostTree]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter((h) =>
      [h.name, h.ip, h.username, h.folder]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [hosts, query]);

  return (
    <div
      className="flex h-full min-h-0 w-full"
      onPointerMove={(e) => {
        if (!dragging) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitPct(Math.min(80, Math.max(20, pct)));
      }}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col bg-background"
        style={{ width: `${splitPct}%` }}
      >
        <LocalFilePane />
      </div>

      <div
        onPointerDown={() => setDragging(true)}
        className={`w-px shrink-0 cursor-col-resize transition-colors hover:bg-accent-brand/60 ${
          dragging ? "bg-accent-brand" : "bg-border"
        }`}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedHost ? (
          <>
            <div className="flex shrink-0 items-center gap-2 px-4 py-3">
              <HostOsBadge
                os={
                  selectedHost.osIcon ||
                  guessHostOs(
                    selectedHost.username,
                    selectedHost.name,
                    selectedHost.folder,
                    selectedHost.ip,
                  )
                }
                size={32}
              />
              <span className="truncate text-base font-semibold text-foreground">
                {selectedHost.name || selectedHost.ip}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedHost(null)}
                title={t("sftp.disconnect", { defaultValue: "Disconnect" })}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Suspense fallback={<PaneFallback />}>
                <FileManager
                  initialHost={hostToSSHHost(selectedHost)}
                  isVisible={isVisible}
                />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-surface">
              <FolderClosed className="size-7 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xl font-semibold text-foreground">
                {t("sftp.emptyTitle", { defaultValue: "Connect to host" })}
              </span>
              <span className="max-w-xs text-sm text-muted-foreground">
                {t("sftp.emptyBody", {
                  defaultValue:
                    "Start by connecting to a saved host to manage your files with SFTP.",
                })}
              </span>
            </div>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              {t("sftp.selectHost", { defaultValue: "Select host" })}
            </Button>
          </div>
        )}

        {pickerOpen && (
          <div className="absolute inset-0 z-20 flex flex-col bg-background">
            <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("sftp.searchPlaceholder", {
                    defaultValue: "Find a host...",
                  })}
                  className="h-9 rounded-lg bg-surface pl-9"
                />
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  {t("sftp.noHosts", {
                    defaultValue: "No hosts with file access.",
                  })}
                </p>
              ) : (
                filtered.map((host) => (
                  <button
                    key={host.id}
                    onClick={() => {
                      setSelectedHost(host);
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <HostOsBadge
                      os={
                        host.osIcon ||
                        guessHostOs(
                          host.username,
                          host.name,
                          host.folder,
                          host.ip,
                        )
                      }
                      size={28}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {host.name || host.ip}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        ssh{host.username ? `, ${host.username}` : ""}
                      </span>
                    </span>
                    {selectedHost?.id === host.id && (
                      <Check className="size-4 shrink-0 text-accent-brand" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Server,
  Plus,
  TerminalSquare,
  Usb,
  Search,
  FolderTree,
  KeyRound,
  Tag,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/button.tsx";
import { Input } from "@/components/input.tsx";
import type { Host, HostFolder, TabType } from "@/types/ui-types";
import { resolveHostTabType } from "@/lib/host-connection-tabs";
import { getSSHHosts } from "@/api/ssh-host-management-api";
import { sshLogger } from "@/lib/frontend-logger";

/**
 * Hosts browsed as a card grid in the main content area, with a details
 * inspector on the right.
 *
 * The sidebar tree remains available, but a narrow rail cannot show a group
 * overview, per-host metadata and an editor at the same time — which is why
 * connecting to something used to mean squeezing the terminal into whatever
 * width was left. Here the browser owns the window until a session opens.
 */

function isFolder(item: Host | HostFolder): item is HostFolder {
  return (item as HostFolder).children !== undefined;
}

/** Depth-first flatten of the host tree. */
function flattenHosts(children: (Host | HostFolder)[]): Host[] {
  const out: Host[] = [];
  for (const child of children) {
    if (isFolder(child)) out.push(...flattenHosts(child.children));
    else out.push(child);
  }
  return out;
}

interface GroupSummary {
  name: string;
  count: number;
}

function collectGroups(children: (Host | HostFolder)[]): GroupSummary[] {
  return children.filter(isFolder).map((folder) => ({
    name: folder.name,
    count: flattenHosts(folder.children).length,
  }));
}

/**
 * Leading icon chip. Tinted per auth type so a grid of hosts is scannable
 * without reading every label.
 */
function HostChip({ host }: { host: Host }) {
  const tint =
    host.authType === "key" || host.authType === "credential"
      ? "bg-chart-2/20 text-chart-2"
      : "bg-accent-brand/20 text-accent-brand";
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-md ${tint}`}
    >
      <Server className="size-4" />
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 pb-3 pt-1 text-base font-semibold text-foreground">
      {children}
    </h2>
  );
}

/** One row of the right-hand inspector: a label above a boxed value. */
function DetailField({
  label,
  value,
  icon,
  muted,
}: {
  label?: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div
        className={`flex h-9 items-center gap-2 rounded-md bg-surface px-3 text-sm ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

export function HostsTab({
  hostTree,
  onOpenTab,
  onEditHost,
}: {
  hostTree?: HostFolder;
  onOpenTab?: (host: Host, type: TabType) => void;
  onEditHost?: (host: Host) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Memoised so the fallback array is not a fresh reference on every render,
  // which would defeat the useMemos below.
  const children = useMemo(() => hostTree?.children ?? [], [hostTree]);
  const treeHosts = useMemo(() => flattenHosts(children), [children]);

  // The grid is the primary hosts view, so it loads its own data instead of
  // depending on a tree assembled elsewhere that may not have been refreshed
  // since the session started. The tree is still used when it has content, so
  // there is no duplicate request on the common path.
  const [fetchedHosts, setFetchedHosts] = useState<Host[] | null>(null);
  const load = useCallback(async () => {
    try {
      const raw = await getSSHHosts();
      setFetchedHosts(
        raw.map((h) => ({
          id: String(h.id),
          name: h.name ?? "",
          username: h.username ?? "",
          ip: h.ip ?? "",
          port: h.port ?? 22,
          folder: h.folder ?? "",
          tags: h.tags ?? [],
          authType: (h.authType ?? "none") as Host["authType"],
          online: false,
          cpu: null,
          ram: null,
          lastAccess: "",
        })) as Host[],
      );
    } catch (err) {
      sshLogger.error("Failed to load hosts for the host grid", err);
    }
  }, []);

  useEffect(() => {
    if (treeHosts.length === 0) void load();
  }, [treeHosts.length, load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("termix:hosts-changed", refresh);
    window.addEventListener("ssh-hosts:changed", refresh);
    window.addEventListener("hosts:refresh", refresh);
    return () => {
      window.removeEventListener("termix:hosts-changed", refresh);
      window.removeEventListener("ssh-hosts:changed", refresh);
      window.removeEventListener("hosts:refresh", refresh);
    };
  }, [load]);

  // Memoised: a bare conditional would hand a new array to the memos below on
  // every render.
  const hosts = useMemo(
    () => (treeHosts.length > 0 ? treeHosts : (fetchedHosts ?? [])),
    [treeHosts, fetchedHosts],
  );

  // Groups come from the hosts themselves so they stay correct regardless of
  // which source supplied them.
  const groups = useMemo(() => {
    if (treeHosts.length > 0) return collectGroups(children);
    const counts = new Map<string, number>();
    for (const h of hosts) {
      if (!h.folder) continue;
      counts.set(h.folder, (counts.get(h.folder) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [treeHosts.length, children, hosts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter((host) =>
      [host.name, host.ip, host.username, host.folder]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [hosts, query]);

  const selected = filtered.find((h) => h.id === selectedId) ?? null;

  function connect(host: Host) {
    onOpenTab?.(host, resolveHostTabType(host));
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search + primary action, mirroring the connect bar at the top of a
            Termius hosts screen. */}
        <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hosts.searchPlaceholder", {
                defaultValue: "Find a host or ssh user@hostname...",
              })}
              className="h-10 rounded-lg bg-surface pl-9"
            />
          </div>
          <Button
            size="lg"
            disabled={!selected}
            onClick={() => selected && connect(selected)}
          >
            {t("hosts.connect", { defaultValue: "Connect" })}
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEditHost?.({} as Host)}
          >
            <Plus className="size-3.5" />
            {t("hosts.newHost", { defaultValue: "New Host" })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected}
            onClick={() => selected && onOpenTab?.(selected, "terminal")}
          >
            <TerminalSquare className="size-3.5" />
            {t("hosts.terminal", { defaultValue: "Terminal" })}
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Usb className="size-3.5" />
            {t("hosts.serial", { defaultValue: "Serial" })}
          </Button>
          <div className="flex-1" />
          {!inspectorOpen && selected && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setInspectorOpen(true)}
              title={t("hosts.details", { defaultValue: "Host Details" })}
            >
              <PanelRightClose className="size-4 rotate-180" />
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {groups.length > 0 && (
            <>
              <SectionHeading>
                {t("hosts.groups", { defaultValue: "Groups" })}
              </SectionHeading>
              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((group) => (
                  <button
                    key={group.name}
                    onClick={() => setQuery(group.name)}
                    className="flex items-center gap-3 rounded-xl bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-chart-2/20 text-chart-2">
                      <FolderTree className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {group.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {group.count}{" "}
                        {group.count === 1
                          ? t("hosts.hostSingular", { defaultValue: "Host" })
                          : t("hosts.hostPlural", { defaultValue: "Hosts" })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <SectionHeading>
            {t("hosts.hostsSection", { defaultValue: "Hosts" })}
          </SectionHeading>
          {filtered.length === 0 ? (
            <p className="px-1 py-8 text-sm text-muted-foreground">
              {t("hosts.empty", {
                defaultValue: "No hosts match your search.",
              })}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((host) => {
                const isSelected = host.id === selectedId;
                return (
                  <button
                    key={host.id}
                    onClick={() => setSelectedId(host.id)}
                    onDoubleClick={() => connect(host)}
                    className={`flex items-center gap-3 rounded-xl bg-card p-3 text-left shadow-sm transition-colors ${
                      isSelected
                        ? "ring-1 ring-accent-brand"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <HostChip host={host} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {host.name || host.ip}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        ssh{host.username ? `, ${host.username}` : ""}
                        {host.tags?.length ? `, ${host.tags.join(", ")}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {inspectorOpen && selected && (
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/40 bg-surface-dim p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("hosts.details", { defaultValue: "Host Details" })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selected.folder ||
                  t("hosts.noGroup", { defaultValue: "No group" })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setInspectorOpen(false)}
              title={t("common.close", { defaultValue: "Close" })}
            >
              <PanelRightClose className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-card/70 p-3">
            <DetailField
              label={t("hosts.address", { defaultValue: "Address" })}
              value={selected.ip}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-card/70 p-3">
            <DetailField
              label={t("hosts.general", { defaultValue: "General" })}
              value={selected.name || selected.ip}
            />
            <DetailField
              value={
                selected.folder ||
                t("hosts.parentGroup", { defaultValue: "Parent Group" })
              }
              icon={<FolderTree className="size-3.5 text-muted-foreground" />}
              muted={!selected.folder}
            />
            <DetailField
              value={
                selected.tags?.length
                  ? selected.tags.join(", ")
                  : t("hosts.tags", { defaultValue: "Tags" })
              }
              icon={<Tag className="size-3.5 text-muted-foreground" />}
              muted={!selected.tags?.length}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-card/70 p-3">
            <DetailField
              label={t("hosts.port", { defaultValue: "SSH port" })}
              value={selected.port}
            />
            <DetailField
              label={t("hosts.credentials", { defaultValue: "Credentials" })}
              value={selected.username}
            />
            <DetailField
              value={selected.authType}
              icon={<KeyRound className="size-3.5 text-muted-foreground" />}
            />
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Button variant="outline" onClick={() => onEditHost?.(selected)}>
              {t("hosts.edit", { defaultValue: "Edit" })}
            </Button>
            <Button size="lg" onClick={() => connect(selected)}>
              {t("hosts.connect", { defaultValue: "Connect" })}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}

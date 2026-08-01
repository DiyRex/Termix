import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  TerminalSquare,
  Usb,
  Search,
  FolderTree,
  PanelRightClose,
  ChevronDown,
  LayoutGrid,
  Rows3,
  Tag,
  ArrowDownAZ,
  Check,
} from "lucide-react";
import { Button } from "@/components/button.tsx";
import { Input } from "@/components/input.tsx";
import type { Host, HostFolder, TabType } from "@/types/ui-types";
import { resolveHostTabType } from "@/lib/host-connection-tabs";
import { createQuickConnectHost } from "@/sidebar/quick-connect-host";
import { parseSshTarget } from "@/lib/ssh-target";
import { getSSHHosts } from "@/api/ssh-host-management-api";
import { sshLogger } from "@/lib/frontend-logger";
import { sshHostToHost } from "@/sidebar/HostManagerData";
import { HostInspector } from "./HostInspector";
import { HostOsBadge } from "@/sidebar/HostOsBadge";
import { guessHostOs } from "@/lib/host-os";

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
 * Leading icon chip — the platform badge, so a grid of hosts is scannable by
 * distro colour rather than by reading every label.
 */
function HostChip({ host }: { host: Host }) {
  return (
    <HostOsBadge
      os={
        host.osIcon ||
        guessHostOs(host.username, host.name, host.folder, host.ip)
      }
      size={30}
    />
  );
}

/** Sort orders offered by the grid's sort control. */
type HostSort = "name" | "recent" | "group";

/** Grid density. "list" is the single-column compact row layout. */
type HostDensity = "grid" | "list";

/**
 * A dropdown for the grid's right-hand controls. Termius groups these as small
 * ghost buttons with a caret; this keeps that shape without pulling in a menu
 * library for three fixed lists.
 */
function GridMenu({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={label}
        className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        {icon}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[170px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function GridMenuItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        active
          ? "text-accent-brand"
          : "hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <span className="flex-1">{children}</span>
      {active && <Check className="size-3.5 shrink-0" />}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 pt-1 pb-2 text-[13px] font-semibold text-foreground">
      {children}
    </h2>
  );
}

export function HostsTab({
  hostTree,
  onOpenTab,
  onEditHost,
  onOpenLocalTerminal,
}: {
  hostTree?: HostFolder;
  onOpenTab?: (host: Host, type: TabType) => void;
  onEditHost?: (host: Host) => void;
  onOpenLocalTerminal?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Closed until asked for. Selecting a card only highlights it; the pencil (or
  // the details button) is what opens the inspector, so a single click never
  // shoves the grid aside.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Opens the inspector in "new host" mode instead of showing the selection.
  const [creatingHost, setCreatingHost] = useState(false);
  // Grid presentation. Persisted so the choice survives a restart, the way a
  // file browser's view mode does.
  const [sort, setSort] = useState<HostSort>(
    () => (localStorage.getItem("termix_hostSort") as HostSort) || "name",
  );
  const [density, setDensity] = useState<HostDensity>(
    () => (localStorage.getItem("termix_hostDensity") as HostDensity) || "grid",
  );
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("termix_hostSort", sort);
  }, [sort]);
  useEffect(() => {
    localStorage.setItem("termix_hostDensity", density);
  }, [density]);

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
      // Mapped through the shared converter rather than picking a few fields:
      // the inspector edits these records, so dropping anything here would
      // silently blank it on save.
      setFetchedHosts(raw.map(sshHostToHost));
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

  /** Every tag in use, for the tag filter's menu. */
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const host of hosts) for (const tag of host.tags ?? []) seen.add(tag);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [hosts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = hosts;

    if (tagFilter) out = out.filter((h) => h.tags?.includes(tagFilter));

    if (q) {
      out = out.filter((host) =>
        [host.name, host.ip, host.username, host.folder]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      );
    }

    // Copied before sorting: `hosts` is memoised upstream and sorting in place
    // would mutate that cached array.
    return [...out].sort((a, b) => {
      if (sort === "recent") {
        // Descending, and hosts never accessed sort last rather than first.
        const at = a.lastAccess ? Date.parse(a.lastAccess) : 0;
        const bt = b.lastAccess ? Date.parse(b.lastAccess) : 0;
        if (bt !== at) return bt - at;
      } else if (sort === "group") {
        const byGroup = (a.folder ?? "").localeCompare(b.folder ?? "");
        if (byGroup !== 0) return byGroup;
      }
      return (a.name || a.ip).localeCompare(b.name || b.ip, undefined, {
        sensitivity: "base",
      });
    });
  }, [hosts, query, tagFilter, sort]);

  const selected = filtered.find((h) => h.id === selectedId) ?? null;

  function connect(host: Host) {
    onOpenTab?.(host, resolveHostTabType(host));
  }

  /** An ad-hoc target typed into the bar, when it isn't naming a saved host. */
  const typedTarget = useMemo(() => parseSshTarget(query), [query]);

  /**
   * What CONNECT and Enter act on: the highlighted host, the single remaining
   * match, or a target typed straight into the bar.
   */
  function resolveConnectTarget(): Host | null {
    if (selected) return selected;
    if (filtered.length === 1) return filtered[0];
    if (typedTarget) {
      return createQuickConnectHost({
        ip: typedTarget.ip,
        port: typedTarget.port,
        // No credentials were given, so the terminal prompts for them — the
        // same path the Quick Connect panel uses.
        username: typedTarget.username,
        authType: "password",
      });
    }
    return null;
  }

  const canConnect = !!selected || filtered.length === 1 || !!typedTarget;

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search + primary action, mirroring the connect bar at the top of a
            Termius hosts screen. */}
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Enter connects: either the highlighted host, or the only one
              // left after filtering, which is what typing a name then pressing
              // Enter is meant to do.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const target = resolveConnectTarget();
                if (target) connect(target);
              }}
              placeholder={t("hosts.searchPlaceholder", {
                defaultValue: "Find a host or ssh user@hostname...",
              })}
              className="h-9 rounded-lg bg-surface pl-8 text-sm"
            />
          </div>
          <Button
            size="default"
            className="text-xs font-semibold tracking-wide uppercase"
            disabled={!canConnect}
            onClick={() => {
              const target = resolveConnectTarget();
              if (target) connect(target);
            }}
          >
            {t("hosts.connect", { defaultValue: "Connect" })}
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 px-4 py-2.5">
          <div className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-r-none border-r-0 text-xs tracking-wide uppercase"
              onClick={() => {
                setCreatingHost(true);
                setInspectorOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              {t("hosts.newHost", { defaultValue: "New Host" })}
            </Button>
            {/* Split caret. The list is short on purpose: a group is the only
                other thing this screen can create. */}
            <GridMenu
              icon={
                <span className="sr-only">
                  {t("hosts.newHostMore", { defaultValue: "More" })}
                </span>
              }
              label={t("hosts.newHostMore", { defaultValue: "More" })}
            >
              {(close) => (
                <>
                  <GridMenuItem
                    onClick={() => {
                      close();
                      setCreatingHost(true);
                      setInspectorOpen(true);
                    }}
                  >
                    {t("hosts.newHost", { defaultValue: "New Host" })}
                  </GridMenuItem>
                  <GridMenuItem
                    onClick={() => {
                      close();
                      window.dispatchEvent(
                        new CustomEvent("host-manager:add-folder"),
                      );
                    }}
                  >
                    {t("hosts.newGroup", { defaultValue: "New Group" })}
                  </GridMenuItem>
                </>
              )}
            </GridMenu>
          </div>
          {/* Opens a shell on this machine, not on the selected host — the host
              row's own Connect action is what opens SSH. */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs tracking-wide uppercase"
            onClick={() => onOpenLocalTerminal?.()}
            title={t("localTerminal.buttonHint", {
              defaultValue: "Open a shell on this computer (⌘L)",
            })}
          >
            <TerminalSquare className="size-3.5" />
            {t("hosts.terminal", { defaultValue: "Terminal" })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs tracking-wide uppercase"
            disabled
          >
            <Usb className="size-3.5" />
            {t("hosts.serial", { defaultValue: "Serial" })}
          </Button>
          <div className="flex-1" />

          {/* Density */}
          <GridMenu
            icon={
              density === "grid" ? (
                <LayoutGrid className="size-4" />
              ) : (
                <Rows3 className="size-4" />
              )
            }
            label={t("hosts.viewDensity", { defaultValue: "View" })}
          >
            {(close) => (
              <>
                <GridMenuItem
                  active={density === "grid"}
                  onClick={() => {
                    setDensity("grid");
                    close();
                  }}
                >
                  {t("hosts.densityGrid", { defaultValue: "Grid" })}
                </GridMenuItem>
                <GridMenuItem
                  active={density === "list"}
                  onClick={() => {
                    setDensity("list");
                    close();
                  }}
                >
                  {t("hosts.densityList", { defaultValue: "List" })}
                </GridMenuItem>
              </>
            )}
          </GridMenu>

          {/* Tags */}
          <GridMenu
            icon={
              <Tag
                className={`size-4 ${tagFilter ? "text-accent-brand" : ""}`}
              />
            }
            label={t("hosts.filterByTag", { defaultValue: "Tags" })}
          >
            {(close) => (
              <>
                <GridMenuItem
                  active={!tagFilter}
                  onClick={() => {
                    setTagFilter(null);
                    close();
                  }}
                >
                  {t("hosts.allTags", { defaultValue: "All tags" })}
                </GridMenuItem>
                {allTags.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground/70">
                    {t("hosts.noTags", { defaultValue: "No tags yet" })}
                  </div>
                ) : (
                  allTags.map((tag) => (
                    <GridMenuItem
                      key={tag}
                      active={tagFilter === tag}
                      onClick={() => {
                        setTagFilter(tag);
                        close();
                      }}
                    >
                      {tag}
                    </GridMenuItem>
                  ))
                )}
              </>
            )}
          </GridMenu>

          {/* Sort */}
          <GridMenu
            icon={<ArrowDownAZ className="size-4" />}
            label={t("hosts.sortBy", { defaultValue: "Sort" })}
          >
            {(close) => (
              <>
                {(
                  [
                    ["name", t("hosts.sortName", { defaultValue: "Name" })],
                    [
                      "recent",
                      t("hosts.sortRecent", { defaultValue: "Recently used" }),
                    ],
                    ["group", t("hosts.sortGroup", { defaultValue: "Group" })],
                  ] as [HostSort, string][]
                ).map(([id, label]) => (
                  <GridMenuItem
                    key={id}
                    active={sort === id}
                    onClick={() => {
                      setSort(id);
                      close();
                    }}
                  >
                    {label}
                  </GridMenuItem>
                ))}
              </>
            )}
          </GridMenu>

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
              <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {groups.map((group) => (
                  <button
                    key={group.name}
                    onClick={() => setQuery(group.name)}
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-chart-2/20 text-chart-2">
                      <FolderTree className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {group.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
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
            <div
              className={
                density === "list"
                  ? "flex flex-col gap-1.5"
                  : "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
              }
            >
              {filtered.map((host) => {
                const isSelected = host.id === selectedId;
                return (
                  // A plain div, not a button: the edit affordance is itself a
                  // button and nesting one inside another is invalid markup.
                  <div
                    key={host.id}
                    className={`group/host flex items-center gap-2.5 rounded-lg border bg-card p-2 transition-colors ${
                      isSelected
                        ? "border-accent-brand ring-1 ring-accent-brand"
                        : "border-border/60 hover:bg-muted/50"
                    }`}
                  >
                    <button
                      type="button"
                      // Selecting only highlights; editing is the pencil.
                      onClick={() => setSelectedId(host.id)}
                      onDoubleClick={() => connect(host)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <HostChip host={host} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {host.name || host.ip}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          ssh{host.username ? `, ${host.username}` : ""}
                          {host.tags?.length ? `, ${host.tags.join(", ")}` : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      title={t("hosts.edit", { defaultValue: "Edit" })}
                      onClick={() => {
                        setSelectedId(host.id);
                        setCreatingHost(false);
                        setInspectorOpen(true);
                      }}
                      className={`shrink-0 rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-0 group-hover/host:opacity-100"
                      }`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {inspectorOpen && (creatingHost || selected) && (
        <HostInspector
          host={creatingHost ? null : selected}
          hosts={hosts}
          onClose={() => {
            setCreatingHost(false);
            setInspectorOpen(false);
          }}
          onSaved={(saved) => {
            setCreatingHost(false);
            setSelectedId(String(saved.id));
            void load();
          }}
          // A just-saved host carries no reachability info yet; the status
          // field is only used for the list's online dot.
          onConnect={(saved) =>
            connect(sshHostToHost({ ...saved, status: "unknown" }))
          }
          onOpenAdvanced={
            selected && !creatingHost ? () => onEditHost?.(selected) : undefined
          }
        />
      )}
    </div>
  );
}

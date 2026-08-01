import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Fingerprint,
  Hammer,
  KeyRound,
  LayoutPanelLeft,
  LogOut,
  Network,
  Play,
  Plug,
  ScrollText,
  Server,
  Settings,
  Usb,
  Zap,
  MoreHorizontal,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import type { SplitMode, TabType, ToolsTab } from "@/types/ui-types";
import { getAlertFirings } from "@/api/alerts-api";
import { isElectron } from "@/lib/electron";

export type RailView =
  | "hosts"
  | "dashboard"
  | "settings"
  | "credentials"
  | "termix-id"
  | "quick-connect"
  | "serial"
  | ToolsTab
  | "connections"
  | "session-logs"
  | "user-profile"
  | "admin-settings"
  | "alerts";

export type HideableRailView =
  | Exclude<RailView, "user-profile" | "admin-settings">
  | "network_graph"
  | "homepage";

// Named members plus explicit guards: the view variant carries `kind?: undefined`,
// which TypeScript will not reliably narrow inside callbacks, so comparing
// `kind` directly produced `never` in some positions.
type RailViewItem = {
  kind?: undefined;
  view: RailView;
  icon: React.ReactNode;
  title: string;
  dot?: boolean;
};
type RailTabItem = {
  kind: "tab";
  tabType: TabType;
  icon: React.ReactNode;
  title: string;
};
type RailSeparator = { kind: "separator" };
type RailItem = RailViewItem | RailTabItem | RailSeparator;

function isRailTab(item: RailItem): item is RailTabItem {
  return item.kind === "tab";
}
function isRailSeparator(item: RailItem): item is RailSeparator {
  return item.kind === "separator";
}
function isRailViewItem(item: RailItem): item is RailViewItem {
  return item.kind === undefined;
}

const PRIMARY_RAIL_TABS = new Set<string>([]);

const PRIMARY_RAIL_VIEWS = new Set<string>([
  "hosts",
  "credentials",
  "connections",
  "snippets",
  "termix-id",
  "session-logs",
]);

function buildRailButtons(
  splitMode: SplitMode,
  t: (key: string) => string,
  hidden: Set<string>,
): RailItem[] {
  const all: RailItem[] = [
    // Every destination here is a full-width main-area tab. Rendering them in a
    // 291px third column is what left the terminal with the leftover width.
    {
      view: "dashboard",
      icon: <LayoutDashboard size={16} />,
      title: t("nav.dashboard"),
    },
    {
      view: "hosts",
      icon: <Server size={16} />,
      title: t("nav.hosts"),
    },
    {
      view: "credentials",
      icon: <KeyRound size={16} />,
      title: t("nav.credentials"),
    },
    {
      view: "connections",
      icon: <Plug size={16} />,
      title: t("nav.connections"),
    },
    {
      view: "snippets",
      icon: <Play size={16} />,
      title: t("nav.snippets"),
    },
    {
      view: "termix-id",
      icon: <Fingerprint size={16} />,
      title: t("nav.termixId"),
    },
    {
      view: "session-logs",
      icon: <ScrollText size={16} />,
      title: t("nav.sessionLogs"),
    },
    // Secondary: collapsed behind "More".
    {
      view: "quick-connect",
      icon: <Zap size={16} />,
      title: t("nav.quickConnect"),
    },
    { view: "serial", icon: <Usb size={16} />, title: t("nav.serial") },
    {
      view: "ssh-tools",
      icon: <Hammer size={16} />,
      title: t("nav.sshTools"),
    },
    {
      view: "history",
      icon: <Clock size={16} />,
      title: t("nav.history"),
    },
    {
      view: "split-screen",
      icon: <LayoutPanelLeft size={16} />,
      title: t("nav.splitScreen"),
      dot: splitMode !== "none",
    },
    {
      kind: "tab",
      tabType: "network_graph" as TabType,
      icon: <Network size={16} />,
      title: t("nav.networkGraph"),
    },
  ];

  // Filter out hidden items, then collapse consecutive/leading/trailing separators
  const filtered = all.filter((item) => {
    if (isRailSeparator(item)) return true;
    if (isRailTab(item)) return !hidden.has(item.tabType);
    return !hidden.has(item.view);
  });

  const result: RailItem[] = [];
  for (const item of filtered) {
    if (item.kind === "separator") {
      if (result.length === 0 || result[result.length - 1].kind === "separator")
        continue;
      result.push(item);
    } else {
      result.push(item);
    }
  }
  if (result[result.length - 1]?.kind === "separator") result.pop();
  return result;
}

const btnBase =
  "relative flex items-center h-8 rounded-lg shrink-0 transition-colors gap-2.5";
const btnStyle = { margin: "0 8px", padding: "0 10px" };

export function AppRail({
  railView,
  splitMode,
  username,
  isAdmin,
  onRailClick,
  onOpenTab,
  onLogout,
}: {
  railView: RailView;
  splitMode: SplitMode;
  username: string;
  isAdmin: boolean;
  onRailClick: (view: RailView) => void;
  onOpenTab?: (type: TabType) => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (document.visibilityState === "hidden") return;
      getAlertFirings({ acknowledged: false, limit: 50 })
        .then((firings) => {
          if (!cancelled) setUnreadAlerts(firings.length);
        })
        .catch(() => {});
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(poll, 30000);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      poll();
      start();
    };

    poll();
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const [hiddenTabs, setHiddenTabs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("hiddenRailTabs");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    return () => {};
  }, []);

  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem("hiddenRailTabs");
        setHiddenTabs(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        setHiddenTabs(new Set());
      }
    };
    window.addEventListener("hiddenRailTabsChanged", handler);
    return () => window.removeEventListener("hiddenRailTabsChanged", handler);
  }, []);

  // Termix ID publishes SSH public keys under a claimed public handle for
  // other servers to fetch -- meaningless for a standalone desktop install
  // with no synced multi-device account, so it stays hidden until a remote
  // server is actually connected.
  const [isRemoteSyncConnected, setIsRemoteSyncConnected] = useState(
    () => !isElectron(),
  );

  useEffect(() => {
    if (!isElectron()) return;
    let cancelled = false;
    const refreshSyncStatus = () => {
      window.electronAPI
        ?.invoke?.("get-remote-sync-config")
        .then((config) => {
          if (!cancelled) {
            setIsRemoteSyncConnected(
              !!(config as { serverUrl?: string } | null)?.serverUrl,
            );
          }
        })
        .catch(() => {});
    };
    refreshSyncStatus();
    const unsubscribe = window.electronAPI?.onRemoteSyncStatusChanged?.(() =>
      refreshSyncStatus(),
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Always expanded. The rail is the app's primary navigation now that
  // destinations render in the content area, so labels are permanent rather
  // than something you hover to reveal. `pinned`/`expandOnHover` are still read
  // so the existing preference UI keeps working, but neither can collapse it.
  const railExpanded = true;
  const effectiveHiddenTabs = isRemoteSyncConnected
    ? hiddenTabs
    : new Set([...hiddenTabs, "termix-id"]);
  const railButtons = buildRailButtons(splitMode, t, effectiveHiddenTabs);

  // Minimal-mode rail: only the six primary destinations stay visible. Termix
  // has far more surfaces than a stock SSH client, and putting all of them in
  // the rail is what made it feel cluttered, so the rest collapse behind
  // "More" and stay one click away.
  const isPrimary = (item: RailItem) => {
    if (isRailTab(item)) return PRIMARY_RAIL_TABS.has(item.tabType);
    if (isRailViewItem(item)) return PRIMARY_RAIL_VIEWS.has(item.view);
    return false;
  };
  const primaryItems = railButtons.filter(isPrimary);
  const secondaryItems = railButtons.filter(
    (item) => !isRailSeparator(item) && !isPrimary(item),
  );
  const secondaryActive = secondaryItems.some(
    (item) => isRailViewItem(item) && railView === item.view,
  );

  return (
    <div
      className="hidden md:flex flex-col items-stretch bg-sidebar border-r border-border/40 shrink-0 overflow-hidden py-2 gap-0.5 transition-[width] duration-200 min-h-0"
      style={{ width: railExpanded ? 190 : 52 }}
    >
      <div className="flex flex-col flex-1 gap-1 overflow-y-auto scrollbar-none min-h-0">
        {primaryItems.map((item, i) =>
          isRailSeparator(item) ? (
            <div key={`sep-${i}`} className="h-1 shrink-0" />
          ) : isRailTab(item) ? (
            <button
              key={item.tabType}
              onClick={() => onOpenTab?.(item.tabType)}
              style={btnStyle}
              className={`${btnBase} text-muted-foreground hover:text-foreground hover:bg-muted/60`}
            >
              <span
                className="shrink-0 flex items-center justify-center"
                style={{ width: 16, height: 16 }}
              >
                {item.icon}
              </span>
              <span
                className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                }`}
              >
                {item.title}
              </span>
            </button>
          ) : (
            <button
              key={item.view}
              onClick={() => onRailClick(item.view)}
              style={btnStyle}
              className={`${btnBase} ${
                railView === item.view
                  ? "text-accent-brand bg-accent-brand/15 ring-1 ring-accent-brand/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span
                className="shrink-0 flex items-center justify-center"
                style={{ width: 16, height: 16 }}
              >
                {item.icon}
              </span>
              <span
                className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                }`}
              >
                {item.title}
              </span>
              {item.dot && (
                <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent-brand" />
              )}
            </button>
          ),
        )}

        {secondaryItems.length > 0 && (
          <>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              style={btnStyle}
              className={`${btnBase} mt-1 ${
                secondaryActive && !moreOpen
                  ? "text-accent-brand"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
              title={t("nav.more")}
            >
              <span
                className="shrink-0 flex items-center justify-center"
                style={{ width: 16, height: 16 }}
              >
                <MoreHorizontal size={16} />
              </span>
              <span
                className={`flex-1 text-[13px] font-medium whitespace-nowrap overflow-hidden text-left transition-[opacity,width] duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                }`}
              >
                {t("nav.more")}
              </span>
              {railExpanded && (
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform duration-150 ${moreOpen ? "rotate-180" : ""}`}
                />
              )}
            </button>

            {moreOpen &&
              secondaryItems.map((item, i) =>
                isRailTab(item) ? (
                  <button
                    key={item.tabType}
                    onClick={() => onOpenTab?.(item.tabType)}
                    style={btnStyle}
                    className={`${btnBase} text-muted-foreground hover:text-foreground hover:bg-muted/60`}
                  >
                    <span
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 16, height: 16 }}
                    >
                      {item.icon}
                    </span>
                    <span
                      className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                        railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                      }`}
                    >
                      {item.title}
                    </span>
                  </button>
                ) : isRailViewItem(item) ? (
                  <button
                    key={item.view}
                    onClick={() => onRailClick(item.view)}
                    style={btnStyle}
                    className={`${btnBase} ${
                      railView === item.view
                        ? "text-accent-brand bg-accent-brand/15 ring-1 ring-accent-brand/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 16, height: 16 }}
                    >
                      {item.icon}
                    </span>
                    <span
                      className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                        railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.dot && (
                      <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent-brand" />
                    )}
                  </button>
                ) : (
                  <span key={`x-${i}`} />
                ),
              )}
          </>
        )}
      </div>

      {/* One account row instead of the four stacked zones this used to be
          (Settings button, rule, Logout button, user card). Settings and logout
          live in its menu, so the rail reads as a list of destinations. */}
      <div ref={accountRef} className="relative shrink-0 pt-1">
        {accountOpen && (
          <div className="absolute bottom-full left-2 right-2 z-50 mb-1 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
            <button
              onClick={() => {
                setAccountOpen(false);
                onRailClick("settings");
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Settings size={14} />
              <span className="flex-1">{t("nav.settings")}</span>
              {unreadAlerts > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold leading-none text-white">
                  {unreadAlerts > 9 ? "9+" : unreadAlerts}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setAccountOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut size={14} />
              {t("common.logout")}
            </button>
          </div>
        )}
        <button
          onClick={() => setAccountOpen((v) => !v)}
          className={`mx-2 flex h-10 items-center gap-2.5 rounded-lg transition-colors ${
            railView === "settings"
              ? "text-accent-brand"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
          style={{ padding: "0 10px" }}
        >
          <div
            className="relative flex shrink-0 items-center justify-center rounded-full border border-accent-brand/30 bg-accent-brand/20 font-bold text-accent-brand"
            style={{ width: 22, height: 22, fontSize: 10 }}
          >
            {username.charAt(0).toUpperCase() || "U"}
            {unreadAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive" />
            )}
          </div>
          <div className="flex min-w-0 flex-col items-start overflow-hidden">
            <span className="truncate text-sm leading-tight font-semibold whitespace-nowrap">
              {username || "User"}
            </span>
            <span className="text-xs leading-tight whitespace-nowrap text-muted-foreground">
              {isAdmin ? t("nav.roleAdministrator") : t("nav.roleUser")}
            </span>
          </div>
          <ChevronDown
            size={13}
            className={`ml-auto shrink-0 transition-transform ${accountOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
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

type RailItem =
  | {
      kind?: undefined;
      view: RailView;
      icon: React.ReactNode;
      title: string;
      dot?: boolean;
    }
  | { kind: "tab"; tabType: TabType; icon: React.ReactNode; title: string }
  | { kind: "separator" };

const PRIMARY_RAIL_TABS = new Set<string>(["network_graph"]);

const PRIMARY_RAIL_VIEWS = new Set<string>([
  "dashboard",
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
    if (item.kind === "separator") return true;
    if (item.kind === "tab") return !hidden.has(item.tabType);
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
  "relative flex items-center h-9 rounded-xl shrink-0 transition-colors gap-3";
const btnStyle = { margin: "0 8px", padding: "0 10px" };

export function AppRail({
  railView,
  sidebarOpen,
  splitMode,
  username,
  isAdmin,
  onRailClick,
  onOpenTab,
  onLogout,
}: {
  railView: RailView;
  sidebarOpen: boolean;
  splitMode: SplitMode;
  username: string;
  isAdmin: boolean;
  onRailClick: (view: RailView) => void;
  onOpenTab?: (type: TabType) => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Expanded by default: the rail is the primary navigation now, so labels
  // should be visible without hovering. Users can still unpin it.
  const [pinned, setPinned] = useState(
    () => localStorage.getItem("pinAppRail") !== "false",
  );
  const [expandOnHover, setExpandOnHover] = useState(
    () => localStorage.getItem("expandAppRailOnHover") !== "false",
  );
  const [unreadAlerts, setUnreadAlerts] = useState(0);

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
    const pinHandler = () =>
      setPinned(localStorage.getItem("pinAppRail") !== "false");
    const hoverHandler = () =>
      setExpandOnHover(
        localStorage.getItem("expandAppRailOnHover") !== "false",
      );
    window.addEventListener("pinAppRailChanged", pinHandler);
    window.addEventListener("expandAppRailOnHoverChanged", hoverHandler);
    return () => {
      window.removeEventListener("pinAppRailChanged", pinHandler);
      window.removeEventListener("expandAppRailOnHoverChanged", hoverHandler);
    };
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

  const railExpanded = pinned || (expandOnHover && hovered);
  const effectiveHiddenTabs = isRemoteSyncConnected
    ? hiddenTabs
    : new Set([...hiddenTabs, "termix-id"]);
  const railButtons = buildRailButtons(splitMode, t, effectiveHiddenTabs);

  // Minimal-mode rail: only the six primary destinations stay visible. Termix
  // has far more surfaces than a stock SSH client, and putting all of them in
  // the rail is what made it feel cluttered, so the rest collapse behind
  // "More" and stay one click away.
  const isPrimary = (item: RailItem) =>
    (item.kind === undefined && PRIMARY_RAIL_VIEWS.has(item.view)) ||
    (item.kind === "tab" && PRIMARY_RAIL_TABS.has(item.tabType));
  const primaryItems = railButtons.filter(isPrimary);
  const secondaryItems = railButtons.filter(
    (item) => item.kind !== "separator" && !isPrimary(item),
  );
  const secondaryActive = secondaryItems.some(
    (item) => item.kind === undefined && railView === item.view && sidebarOpen,
  );

  return (
    <div
      className="hidden md:flex flex-col items-stretch bg-sidebar border-r border-border/40 shrink-0 overflow-hidden py-2 gap-0.5 transition-[width] duration-200 min-h-0"
      style={{ width: railExpanded ? 208 : 56 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col flex-1 gap-1 overflow-y-auto scrollbar-none min-h-0">
        {primaryItems.map((item, i) =>
          item.kind === "separator" ? (
            <div key={`sep-${i}`} className="h-1 shrink-0" />
          ) : item.kind === "tab" ? (
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
                className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
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
                className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
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
                className={`flex-1 text-sm font-medium whitespace-nowrap overflow-hidden text-left transition-[opacity,width] duration-150 ${
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
                item.kind === "tab" ? (
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
                      className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                        railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                      }`}
                    >
                      {item.title}
                    </span>
                  </button>
                ) : item.kind === undefined ? (
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
                      className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
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

      <div className="shrink-0 flex flex-col gap-0.5 pt-2 pb-1">
        {[
          {
            view: "settings" as RailView,
            icon: <Settings size={16} />,
            title: t("nav.settings"),
          },
        ].map((item) => (
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
              className="relative shrink-0 flex items-center justify-center"
              style={{ width: 16, height: 16 }}
            >
              {item.icon}
              {item.view === "settings" && unreadAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white leading-none">
                  {unreadAlerts > 9 ? "9+" : unreadAlerts}
                </span>
              )}
            </span>
            <span
              className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"}`}
            >
              {item.title}
            </span>
          </button>
        ))}
        <div className="mx-3 my-1.5 border-t border-border/50" />
        <button
          onClick={onLogout}
          style={btnStyle}
          className={`${btnBase} text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
        >
          <span
            className="shrink-0 flex items-center justify-center"
            style={{ width: 16, height: 16 }}
          >
            <LogOut size={16} />
          </span>
          <span
            className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"}`}
          >
            {t("common.logout")}
          </span>
        </button>
      </div>

      <div className="shrink-0 mt-1 pt-1 border-t border-border/50">
        <button
          className="flex items-center gap-3 h-11 mx-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          style={{ padding: "0 10px" }}
        >
          <div
            className="rounded-full bg-accent-brand/20 border border-accent-brand/30 flex items-center justify-center font-bold text-accent-brand shrink-0"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {username.charAt(0).toUpperCase() || "U"}
          </div>
          <div
            className={`flex flex-col items-start overflow-hidden transition-opacity duration-150 ${
              railExpanded ? "opacity-100 delay-75" : "opacity-0"
            }`}
          >
            <span className="text-sm font-semibold leading-tight whitespace-nowrap">
              {username || "User"}
            </span>
            <span className="text-xs text-muted-foreground leading-tight whitespace-nowrap">
              {isAdmin ? t("nav.roleAdministrator") : t("nav.roleUser")}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

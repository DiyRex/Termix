import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  RefreshCw,
  X,
  LayoutPanelLeft,
  Plus,
  Minus,
  Pencil,
  FolderOpen,
  Share2,
  ChevronDown,
  Bell,
} from "lucide-react";
import { tabIcon } from "@/shell/tabUtils";
import type { Tab, TabType, SplitMode } from "@/types/ui-types";
import { SPLIT_MODES, PANE_COUNTS } from "@/lib/theme";
import { titleBarInsetLeft, usesInlineTitleBar } from "@/lib/electron";

// The strip doubles as the window's title bar when there is no native one, so
// its empty space drags the window while every control opts back out.
const DRAG = { WebkitAppRegion: "drag" } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

const CONNECTION_TAB_TYPES: TabType[] = [
  "terminal",
  "local-terminal",
  "rdp",
  "vnc",
  "telnet",
];

/**
 * The vault tab is chrome, not a session: it is pinned to the first slot, can't
 * be closed, renamed, dragged or split, and it is what hands the content area
 * back to the navigation rail.
 */
function isPinned(tab: Tab) {
  return tab.type === "vaults" || tab.type === "sftp";
}

export function TabBar({
  tabs,
  activeTabId,
  splitMode,
  paneTabIds,
  focusedPaneIndex,
  onSetActiveTab,
  onCloseTab,
  onRefreshTab,
  onReorderTabs,
  onSplitTab,
  onAddToSplit,
  onRemoveFromSplit,
  onRenameTab,
  onOpenFileManager,
  onOpenShare,
  onOpenVaultMenu,
  onOpenAlerts,
  unreadAlerts = 0,
  onNewTab,
}: {
  tabs: Tab[];
  activeTabId: string;
  splitMode: SplitMode;
  paneTabIds: (string | null)[];
  focusedPaneIndex: number | null;
  onSetActiveTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRefreshTab: (id: string) => void;
  onReorderTabs: (tabs: Tab[]) => void;
  onSplitTab: (tabId: string, mode: SplitMode) => void;
  onAddToSplit: (tabId: string) => void;
  onRemoveFromSplit: (tabId: string) => void;
  onRenameTab?: (tabId: string, newLabel: string) => void;
  onOpenFileManager?: (tabId: string) => void;
  onOpenShare?: (tabId: string) => void;
  onOpenVaultMenu?: (anchor: { x: number; y: number }) => void;
  onOpenAlerts?: () => void;
  unreadAlerts?: number;
  /** The new-tab button. Opens the vault's host list, as in Termius. */
  onNewTab?: () => void;
}) {
  const { t } = useTranslation();
  // The bar is always shown; its collapse toggle and window controls were
  // removed in favour of a plain tab strip.
  const open = true;
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [contextTabId, setContextTabId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragData = useRef<{
    id: string;
    index: number;
    startX: number;
    startY: number;
    offsetX: number;
    width: number;
    barTop: number;
    barHeight: number;
    x: number;
    y: number;
  } | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const didDrag = useRef(false);

  const isSplit = splitMode !== "none";
  const paneCount = PANE_COUNTS[splitMode];
  const inlineTitleBar = usesInlineTitleBar();
  const insetLeft = titleBarInsetLeft();

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!dragTabId) return;

    function onPointerMove(e: PointerEvent) {
      if (!dragData.current || !tabBarRef.current) return;
      const d = dragData.current;
      if (Math.abs(e.clientX - d.startX) > 5) didDrag.current = true;

      const barRect = tabBarRef.current.getBoundingClientRect();
      const x = Math.max(
        barRect.left + 2,
        Math.min(barRect.right - d.width - 6, e.clientX - d.offsetX),
      );
      const y = d.barTop;
      setDragPos({ x, y });

      const centerX = e.clientX - d.offsetX + d.width / 2;
      let newTarget = d.index;
      tabEls.current.forEach((el, id) => {
        if (id === d.id) return;
        const rect = el.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < d.index && centerX < mid)
          newTarget = Math.min(newTarget, idx);
        if (idx > d.index && centerX > mid)
          newTarget = Math.max(newTarget, idx);
      });

      if (tabs[0].type === "vaults") newTarget = Math.max(1, newTarget);
      dragTargetRef.current = newTarget;
      setDragTargetIndex(newTarget);
    }

    function onPointerUp() {
      if (!dragData.current) return;
      const { id, index } = dragData.current;
      const to = dragTargetRef.current ?? index;
      if (to !== index) {
        const next = [...tabs];
        if (next[0].id !== id) next.splice(to, 0, next.splice(index, 1)[0]);
        onReorderTabs(next);
      }
      dragData.current = null;
      dragTargetRef.current = null;
      setDragTabId(null);
      setDragTargetIndex(null);
      setDragPos(null);
      setTimeout(() => {
        didDrag.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragTabId, tabs, onReorderTabs]);

  useEffect(() => {
    if (!contextTabId) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) {
        setContextTabId(null);
        setContextPos(null);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [contextTabId]);

  useEffect(() => {
    if (renamingTabId) {
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [renamingTabId]);

  function commitRename() {
    if (!renamingTabId) return;
    const trimmed = renameValue.trim();
    if (trimmed) onRenameTab?.(renamingTabId, trimmed);
    setRenamingTabId(null);
  }

  const dragIdx = tabs.findIndex((t) => t.id === dragTabId);
  const target = dragTargetIndex ?? dragIdx;

  return (
    <div className="flex flex-col shrink-0 min-w-0">
      <div
        className={`flex items-center bg-sidebar min-w-0 transition-all duration-200 ${open ? "h-12.5" : "h-0 overflow-hidden"}`}
        style={inlineTitleBar ? DRAG : undefined}
      >
        {/* Keeps the first tab clear of the macOS traffic lights. A sibling box
            rather than padding on the scroller, so it cannot scroll away with
            the tabs. */}
        {insetLeft > 0 && (
          <div className="h-full shrink-0" style={{ width: insetLeft }} />
        )}
        <div
          ref={tabBarRef}
          className="flex h-full flex-1 min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none px-2"
        >
          {tabs.map((tab, index) => {
            const active = tab.id === activeTabId;
            const isDragging = dragTabId === tab.id;
            const paneIdx = paneTabIds.indexOf(tab.id);
            const isInPane = paneIdx !== -1;
            const isFocusedPane = isInPane && paneIdx === focusedPaneIndex;
            let translateX = 0;
            if (
              dragTabId &&
              !isDragging &&
              dragIdx !== -1 &&
              target !== null &&
              target !== dragIdx
            ) {
              const draggedWidth =
                tabEls.current.get(dragTabId)?.offsetWidth ?? 0;
              if (dragIdx < target && index > dragIdx && index <= target)
                translateX = -draggedWidth;
              else if (dragIdx > target && index < dragIdx && index >= target)
                translateX = draggedWidth;
            }

            const showFocusIndicator = isFocusedPane && isSplit;
            const showInPaneIndicator = isInPane && isSplit && !isFocusedPane;
            const pinned = isPinned(tab);

            return (
              <div
                key={tab.id}
                ref={(el) => {
                  if (el) tabEls.current.set(tab.id, el);
                  else tabEls.current.delete(tab.id);
                }}
                draggable={isSplit && !pinned}
                onDragStart={(e) => {
                  if (!isSplit || pinned) return;
                  e.dataTransfer.setData("text/plain", tab.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() =>
                  !dragTabId && !didDrag.current && onSetActiveTab(tab.id)
                }
                onMouseDown={(e) => {
                  if (e.button === 1 && !pinned) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
                onContextMenu={(e) => {
                  if (pinned) return;
                  e.preventDefault();
                  setContextTabId(tab.id);
                  setContextPos({ x: e.clientX, y: e.clientY });
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || pinned) return;
                  e.preventDefault();
                  const el = tabEls.current.get(tab.id);
                  if (!el || !tabBarRef.current) return;
                  const rect = el.getBoundingClientRect();
                  const barRect = tabBarRef.current.getBoundingClientRect();
                  dragData.current = {
                    id: tab.id,
                    index,
                    startX: e.clientX,
                    startY: e.clientY,
                    offsetX: e.clientX - rect.left,
                    width: rect.width,
                    barTop: barRect.top,
                    barHeight: barRect.height,
                    x: rect.left,
                    y: barRect.top,
                  };
                  setDragTabId(tab.id);
                  setDragTargetIndex(index);
                  setDragPos({ x: rect.left, y: barRect.top });
                  (e.currentTarget as HTMLElement).setPointerCapture(
                    e.pointerId,
                  );
                }}
                style={{
                  transform: isDragging
                    ? "none"
                    : `translateX(${translateX}px)`,
                  transition:
                    dragTabId && !isDragging ? "transform 200ms ease" : "none",
                  opacity: isDragging ? 0 : 1,
                  cursor: pinned ? "pointer" : isDragging ? "grabbing" : "grab",
                  userSelect: "none",
                  ...(inlineTitleBar ? NO_DRAG : null),
                }}
                className={`group/tab relative flex h-9 items-center gap-2 shrink-0 rounded-lg px-3.5 text-sm transition-colors ${
                  active
                    ? "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/70"
                    : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                }`}
              >
                {/* Focused-pane indicator: brand accent underline overlay */}
                {showFocusIndicator && (
                  <span className="absolute bottom-0.5 left-3 right-3 h-0.5 rounded-full bg-accent-brand/70 z-10" />
                )}
                {/* In-pane (not focused) indicator: subtle dot */}
                {showInPaneIndicator && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-muted-foreground/40 z-10" />
                )}
                {/* Leading slot. The tab's icon becomes its close button on
                    hover, and stays a close button while the tab is active —
                    which is what keeps the pill from changing width. */}
                <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                  {!pinned && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      title={t("nav.close")}
                      className={`absolute inset-0 flex items-center justify-center rounded-sm transition-opacity ${
                        active
                          ? "opacity-100"
                          : "opacity-0 group-hover/tab:opacity-100"
                      }`}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                  {/* Decorative only, and it overlaps the close button that is
                      absolutely positioned in this same slot. An opacity-0
                      element still takes clicks, so without pointer-events-none
                      the faded-out icon swallows every press of the X. */}
                  <span
                    aria-hidden
                    className={`pointer-events-none ${
                      pinned
                        ? ""
                        : active
                          ? "opacity-0"
                          : "group-hover/tab:opacity-0"
                    }`}
                  >
                    {tabIcon(tab.type)}
                  </span>
                </span>
                {!pinned && renamingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenamingTabId(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent border-b border-accent-brand outline-none text-sm w-28 min-w-0"
                    style={{ fontWeight: "inherit" }}
                  />
                ) : (
                  // Capped so one long host name can't stretch the pill wide
                  // enough to push the new-tab button off the strip.
                  <span className="max-w-50 truncate">{tab.label}</span>
                )}
                {/* The vault tab's disclosure chevron. It only appears once the
                    tab is active, matching where the vault switcher lives. */}
                {tab.type === "vaults" && active && onOpenVaultMenu && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      onOpenVaultMenu({ x: rect.left, y: rect.bottom });
                    }}
                    title={t("nav.switchVault")}
                    className="-mr-1 flex size-4 items-center justify-center rounded-sm transition-colors hover:bg-white/10"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                )}
                {/* Refresh and share stay on the right, revealed on hover, so
                    the pill reads as a plain label at rest. Close lives in the
                    leading slot above. */}
                {!pinned &&
                  renamingTabId !== tab.id &&
                  CONNECTION_TAB_TYPES.includes(tab.type) && (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/tab:opacity-100">
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRefreshTab(tab.id);
                        }}
                        title={t("nav.refreshTab")}
                        className="flex size-4 items-center justify-center rounded-sm transition-colors hover:bg-white/10"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                      {onOpenShare && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenShare(tab.id);
                          }}
                          title={t("sessionSharing.shareButton")}
                          className="flex size-4 items-center justify-center rounded-sm transition-colors hover:bg-white/10"
                        >
                          <Share2 className="size-3" />
                        </button>
                      )}
                    </div>
                  )}
              </div>
            );
          })}

          {dragTabId &&
            dragPos &&
            (() => {
              const tab = tabs.find((t) => t.id === dragTabId)!;
              const active = tab.id === activeTabId;
              return (
                <div
                  style={{
                    position: "fixed",
                    left: dragPos.x,
                    top: dragPos.y,
                    width: tabEls.current.get(dragTabId)?.offsetWidth,
                    height: tabEls.current.get(dragTabId)?.offsetHeight,
                    pointerEvents: "none",
                    zIndex: 9999,
                    opacity: 0.85,
                  }}
                  className={`flex h-9 items-center gap-2 shrink-0 rounded-lg px-3.5 text-sm shadow-lg ${
                    active
                      ? "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/70"
                      : "bg-foreground/5 text-muted-foreground"
                  }`}
                >
                  {tabIcon(tab.type)}
                  {tab.label}
                </div>
              );
            })()}

          {/* New-tab affordance. Opens a shell on this machine, which is what
              the equivalent control does in every other terminal app. */}
          {onNewTab && (
            <button
              onClick={() => onNewTab()}
              title={t("nav.newTab")}
              style={inlineTitleBar ? NO_DRAG : undefined}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <Plus className="size-4.5" />
            </button>
          )}
        </div>

        {/* Pinned to the strip's right edge, outside the scrolling tab list, so
            it stays put when tabs overflow. */}
        {onOpenAlerts && (
          <button
            onClick={() => onOpenAlerts()}
            title={t("nav.alerts")}
            style={inlineTitleBar ? NO_DRAG : undefined}
            className="relative mr-2 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <Bell className="size-4.5" />
            {unreadAlerts > 0 && (
              <span className="absolute top-1 right-1 flex min-w-3 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] leading-none font-bold text-white">
                {unreadAlerts > 9 ? "9+" : unreadAlerts}
              </span>
            )}
          </button>
        )}
      </div>
      {/* Right-click context menu */}
      {contextTabId &&
        contextPos &&
        (() => {
          const ctxTab = tabs.find((t) => t.id === contextTabId);
          if (!ctxTab) return null;
          const isInPane = paneTabIds.indexOf(contextTabId) !== -1;
          const hasEmptySlot =
            isSplit && paneTabIds.slice(0, paneCount).some((p) => p === null);
          return (
            <div
              data-context-menu
              style={{
                position: "fixed",
                left: contextPos.x,
                top: contextPos.y,
                zIndex: 10000,
              }}
              className="bg-popover border border-border shadow-lg py-1 min-w-[180px]"
            >
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground truncate max-w-[200px]">
                {ctxTab.label}
              </div>
              <div className="h-px bg-border my-1" />
              {CONNECTION_TAB_TYPES.includes(ctxTab.type) && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onRefreshTab(contextTabId);
                    setContextTabId(null);
                  }}
                >
                  <RefreshCw className="size-3" />
                  {t("nav.refreshTab")}
                </button>
              )}
              {ctxTab.type === "terminal" &&
                ctxTab.host &&
                onOpenFileManager && (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      onOpenFileManager(contextTabId);
                      setContextTabId(null);
                    }}
                  >
                    <FolderOpen className="size-3" />
                    {t("nav.openFileManager")}
                  </button>
                )}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setRenameValue(ctxTab.label);
                  setRenamingTabId(contextTabId);
                  setContextTabId(null);
                  setContextPos(null);
                }}
              >
                <Pencil className="size-3" />
                {t("nav.renameTab")}
              </button>
              <div className="h-px bg-border my-1" />
              {/* Split submenu */}
              <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("terminal.split.splitTab")}
              </div>
              {SPLIT_MODES.filter((m) => m.id !== "none").map((mode) => (
                <button
                  key={mode.id}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onSplitTab(contextTabId, mode.id);
                    setContextTabId(null);
                  }}
                >
                  <LayoutPanelLeft className="size-3 text-muted-foreground" />
                  {mode.label}
                </button>
              ))}
              {isSplit && (
                <>
                  <div className="h-px bg-border my-1" />
                  {isInPane ? (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                      onClick={() => {
                        onRemoveFromSplit(contextTabId);
                        setContextTabId(null);
                      }}
                    >
                      <Minus className="size-3" />
                      {t("terminal.split.removeFromSplit")}
                    </button>
                  ) : hasEmptySlot ? (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        onAddToSplit(contextTabId);
                        setContextTabId(null);
                      }}
                    >
                      <Plus className="size-3" />
                      {t("terminal.split.addToSplit")}
                    </button>
                  ) : null}
                </>
              )}
              <div className="h-px bg-border my-1" />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground text-destructive"
                onClick={() => {
                  onCloseTab(contextTabId);
                  setContextTabId(null);
                }}
              >
                <X className="size-3" />
                {t("nav.close")}
              </button>
            </div>
          );
        })()}
    </div>
  );
}

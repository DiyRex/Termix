import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Play,
  Plug,
  ScrollText,
  Server,
  Settings,
} from "lucide-react";
import type { RailView } from "@/sidebar/AppRail";

/**
 * The vault tab's disclosure menu — a shortcut to the same destinations the
 * sidebar lists, for jumping straight to one without first re-opening the tab.
 */
export function VaultTabMenu({
  anchor,
  railView,
  onSelect,
  onClose,
}: {
  anchor: { x: number; y: number };
  railView: RailView;
  onSelect: (view: RailView) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Deferred to the next frame: the click that opened the menu is still
    // propagating, and would otherwise close it immediately.
    const id = requestAnimationFrame(() => {
      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const items: { view: RailView; icon: React.ReactNode; title: string }[] = [
    {
      view: "hosts",
      icon: <Server className="size-3.5" />,
      title: t("nav.hosts"),
    },
    {
      view: "credentials",
      icon: <KeyRound className="size-3.5" />,
      title: t("nav.credentials"),
    },
    {
      view: "connections",
      icon: <Plug className="size-3.5" />,
      title: t("nav.connections"),
    },
    {
      view: "snippets",
      icon: <Play className="size-3.5" />,
      title: t("nav.snippets"),
    },
    {
      view: "termix-id",
      icon: <Fingerprint className="size-3.5" />,
      title: t("nav.termixId"),
    },
    {
      view: "session-logs",
      icon: <ScrollText className="size-3.5" />,
      title: t("nav.sessionLogs"),
    },
    {
      view: "dashboard",
      icon: <LayoutDashboard className="size-3.5" />,
      title: t("nav.dashboard"),
    },
    {
      view: "settings",
      icon: <Settings className="size-3.5" />,
      title: t("nav.settings"),
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: Math.max(4, Math.min(anchor.x - 8, window.innerWidth - 200)),
        top: anchor.y + 4,
        zIndex: 10000,
      }}
      className="min-w-[184px] rounded-md border border-border bg-popover py-1 shadow-lg"
    >
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("nav.vaults")}
      </div>
      {items.map((item) => (
        <button
          key={item.view}
          onClick={() => onSelect(item.view)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
            railView === item.view
              ? "text-accent-brand"
              : "hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {item.icon}
          {item.title}
        </button>
      ))}
    </div>
  );
}

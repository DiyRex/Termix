import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsNavItem } from "@/components/settings-card.tsx";

/**
 * Settings as a dedicated screen: a rail of rounded pills on the left, one
 * section at a time on the right.
 *
 * Account, admin and alerts each used to be their own sidebar destination,
 * which is a lot of top-level entries for things a user opens rarely. Grouping
 * them here is what keeps the main navigation down to the handful of places
 * you actually work in.
 *
 * Sections are supplied by the caller as nodes, because the underlying panels
 * need a good deal of AppShell state and it is not worth threading all of it
 * through another component.
 */
export interface SettingsSection {
  id: string;
  label: string;
  node: React.ReactNode;
}

export function SettingsTab({ sections }: { sections: SettingsSection[] }) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-6 pt-5 pb-3">
        <h1 className="text-xl font-bold text-foreground">
          {t("nav.settings")}
        </h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto px-3 pb-6">
          {sections.map((section) => (
            <SettingsNavItem
              key={section.id}
              active={section.id === active?.id}
              onClick={() => setActiveId(section.id)}
            >
              {section.label}
            </SettingsNavItem>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto border-l border-border/40 px-6 pb-6">
          {/* Each panel manages its own scrolling internals; give it the full
              width and let it lay out. */}
          <div className="flex min-h-0 flex-col">{active?.node}</div>
        </div>
      </div>
    </div>
  );
}

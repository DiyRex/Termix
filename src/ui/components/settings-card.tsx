import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Settings surface primitives.
 *
 * Content is grouped into large rounded cards that carry their own elevation
 * instead of being fenced off with borders, and rows inside a card are split by
 * hairlines rather than being separate boxes. That keeps a settings screen
 * readable when it has many unrelated controls, which is the problem with
 * hanging every panel off its own sidebar entry.
 */

function SettingsCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-card"
      className={cn(
        "rounded-2xl bg-card/70 shadow-sm overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Optional heading above a card, in the muted small-caps-ish label style. */
function SettingsSectionTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="settings-section-title"
      className={cn(
        "px-1 pb-2 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

/** A list of rows separated by hairlines, to be placed inside a SettingsCard. */
function SettingsList({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-list"
      className={cn("divide-y divide-border/40", className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface SettingsRowProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode;
  /** Right-aligned secondary content: status, current value, chevron, etc. */
  meta?: React.ReactNode;
  /** Renders hover affordance and a pointer cursor. */
  interactive?: boolean;
}

function SettingsRow({
  className,
  icon,
  meta,
  interactive,
  children,
  ...props
}: SettingsRowProps) {
  return (
    <div
      data-slot="settings-row"
      className={cn(
        "flex items-center gap-3 px-5 py-4",
        interactive &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm text-foreground">{children}</div>
      {meta && (
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {meta}
        </span>
      )}
    </div>
  );
}

interface SettingsNavItemProps extends React.ComponentProps<"button"> {
  active?: boolean;
  meta?: React.ReactNode;
}

/**
 * Settings sub-navigation entry: a full-width rounded pill that fills in when
 * selected, rather than a row in a bordered list.
 */
function SettingsNavItem({
  className,
  active,
  meta,
  children,
  ...props
}: SettingsNavItemProps) {
  return (
    <button
      type="button"
      data-slot="settings-nav-item"
      data-active={active ? "true" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors",
        active
          ? "bg-muted/70 font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {meta}
        </span>
      )}
    </button>
  );
}

export {
  SettingsCard,
  SettingsSectionTitle,
  SettingsList,
  SettingsRow,
  SettingsNavItem,
};

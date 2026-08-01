/**
 * Grouped detail-row primitives.
 *
 * These back the "Host Details" and "Edit Key" screens: a single scrolling
 * column of cards, each card holding boxed rows where the placeholder doubles
 * as the field label. Rows keep a fixed minimum height so a card reads as an
 * evenly-spaced list whether its rows are inputs, toggles or navigation.
 */
import type React from "react";
import { ChevronRight, Plus } from "lucide-react";

const ROW_BASE =
  "flex items-center gap-2.5 w-full min-h-9 px-2.5 rounded-md border border-border bg-background/50 text-left transition-colors";

export function DetailGroup({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border border-border bg-card p-2 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          {title && (
            <span className="text-[13px] font-semibold text-foreground">
              {title}
            </span>
          )}
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Leading slot for a row — a muted icon, or a colored badge. */
export function DetailRowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/70 [&>svg]:size-4">
      {children}
    </span>
  );
}

/**
 * Static row shell — use when none of the specialised rows below fit.
 *
 * `icon` goes through the 16px icon slot; pass `leading` instead for anything
 * with its own dimensions (a badge, an avatar) so it isn't squeezed into it.
 */
export function DetailRow({
  icon,
  leading,
  children,
  trailing,
  className = "",
}: {
  icon?: React.ReactNode;
  leading?: React.ReactNode;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${ROW_BASE} ${className}`}>
      {leading}
      {icon && <DetailRowIcon>{icon}</DetailRowIcon>}
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/** Row whose whole surface is an input; the placeholder is the label. */
export function DetailInputRow({
  icon,
  placeholder,
  value,
  onChange,
  type = "text",
  disabled,
  trailing,
  inputClassName = "",
  title,
  onFocus,
  onBlur,
}: {
  icon?: React.ReactNode;
  placeholder: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  trailing?: React.ReactNode;
  inputClassName?: string;
  title?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div
      className={`${ROW_BASE} focus-within:border-accent-brand/50 ${disabled ? "opacity-60" : ""}`}
      title={title}
    >
      {icon && <DetailRowIcon>{icon}</DetailRowIcon>}
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassName}`}
      />
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * Sentence-shaped row with an inline field, e.g. "SSH on [22] port".
 * The narrow input keeps the row reading as prose rather than as a form field.
 */
export function DetailInlineInputRow({
  before,
  after,
  value,
  onChange,
  placeholder,
  width = "w-20",
}: {
  before: string;
  after?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <div className={ROW_BASE}>
      <span className="shrink-0 text-[13px] text-foreground">{before}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} h-8 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground outline-none focus:border-accent-brand/50 placeholder:text-muted-foreground/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      {after && (
        <span className="shrink-0 text-sm text-muted-foreground">{after}</span>
      )}
    </div>
  );
}

/** Row that reads "<label> <value> ⌄" and opens something when clicked. */
export function DetailNavRow({
  icon,
  label,
  value,
  onClick,
  disabled,
  title,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${ROW_BASE} hover:border-accent-brand/40 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {icon && <DetailRowIcon>{icon}</DetailRowIcon>}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {label}
      </span>
      {value && (
        <span className="max-w-[45%] shrink-0 truncate text-[13px] text-muted-foreground">
          {value}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

/**
 * Row that reads "<label>            Enabled" and flips on click.
 * Matches the Agent Forwarding / Mosh rows: the state is the trailing word, not
 * a switch, so a card of mixed rows keeps one visual rhythm.
 */
export function DetailStateRow({
  icon,
  label,
  enabled,
  onToggle,
  enabledLabel,
  disabledLabel,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  enabledLabel: string;
  disabledLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!enabled)}
      className={`${ROW_BASE} hover:border-accent-brand/40 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {icon && <DetailRowIcon>{icon}</DetailRowIcon>}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {label}
      </span>
      <span
        className={`shrink-0 text-[13px] font-medium ${enabled ? "text-accent-brand" : "text-muted-foreground/60"}`}
      >
        {enabled ? enabledLabel : disabledLabel}
      </span>
    </button>
  );
}

/** Row holding a native select styled to match the other rows. */
export function DetailSelectRow({
  icon,
  label,
  value,
  onChange,
  children,
  disabled,
  title,
}: {
  icon?: React.ReactNode;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div
      className={`${ROW_BASE} focus-within:border-accent-brand/50 ${disabled ? "opacity-60" : ""}`}
      title={title}
    >
      {icon && <DetailRowIcon>{icon}</DetailRowIcon>}
      {label && (
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {label}
        </span>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-right text-[13px] text-foreground outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
    </div>
  );
}

/** Dashed "+ …" affordance for optional fields and extra protocols. */
export function DetailAddRow({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-accent-brand/50 hover:text-accent-brand disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}

/** Multi-line field with its label above, used for keys and certificates. */
export function DetailTextareaRow({
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  mono = false,
  action,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  action?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background/50 p-2.5 focus-within:border-accent-brand/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {note}
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full resize-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

/**
 * Bottom action bar. Sticks to the base of the scroll container so the primary
 * action stays reachable in a long form.
 *
 * Negative margins cancel the scroll container's own `p-3` on all three edges:
 * without `-mb-3` the container's bottom padding sits below the pinned bar and
 * content scrolls visibly through that gap. The background must stay fully
 * opaque for the same reason — a translucent bar shows the rows underneath it.
 */
export function DetailActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-3 -mb-3 mt-1 flex flex-col gap-2 border-t border-border bg-background px-3 pt-3 pb-3">
      {children}
    </div>
  );
}

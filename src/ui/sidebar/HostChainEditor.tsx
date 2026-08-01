/**
 * Jump-host chain editor.
 *
 * Expands inline under the Chain row rather than opening an overlay, so it
 * behaves like every other expandable section on the details screen. Hops read
 * top-to-bottom ending at the host being edited, so the order on screen is the
 * order packets travel; the target row is pinned and not removable — it is the
 * host you are editing, not a hop. Edits apply to the form immediately.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, Trash2, X } from "lucide-react";
import { Button } from "@/components/button";
import { HostOsBadge } from "./HostOsBadge";
import { guessHostOs } from "@/lib/host-os";
import type { Host } from "@/types/ui-types";

export function HostChainEditor({
  jumpHosts,
  hosts,
  targetLabel,
  targetOs,
  excludeHostId,
  onChange,
}: {
  jumpHosts: { hostId: string }[];
  hosts: Host[];
  targetLabel: string;
  targetOs?: string | null;
  excludeHostId?: string;
  onChange: (next: { hostId: string }[]) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = React.useState(false);

  const selectable = hosts.filter(
    (h) =>
      h.id !== excludeHostId &&
      !jumpHosts.some((j) => String(j.hostId) === h.id),
  );

  const resolve = (hostId: string) =>
    hosts.find((h) => h.id === String(hostId)) ?? null;

  const firstHop = jumpHosts.length ? resolve(jumpHosts[0].hostId) : null;
  const firstHopLabel = firstHop ? firstHop.name || firstHop.ip : targetLabel;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-xs text-muted-foreground">
        {t("hosts.chainAddHint", { name: firstHopLabel })}
      </p>

      {adding ? (
        <div className="flex flex-col gap-1.5">
          {selectable.length === 0 && (
            <p className="text-xs text-muted-foreground/60">
              {t("hosts.chainNoHostsLeft")}
            </p>
          )}
          {selectable.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onChange([...jumpHosts, { hostId: h.id }]);
                setAdding(false);
              }}
              className="flex min-h-10 items-center gap-2.5 rounded-md border border-border bg-background/50 px-2.5 text-left transition-colors hover:border-accent-brand/40"
            >
              <HostOsBadge
                os={h.osIcon || guessHostOs(h.username, h.name, h.folder, h.ip)}
                size={22}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {h.name || h.ip}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {h.ip}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="self-start text-xs text-muted-foreground hover:text-foreground"
          >
            {t("hosts.cancelBtn")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-10 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-foreground transition-colors hover:border-accent-brand/50 hover:text-accent-brand"
        >
          {t("hosts.chainAddHost")}
        </button>
      )}

      {jumpHosts.map((hop, i) => {
        const h = resolve(hop.hostId);
        return (
          <React.Fragment key={`${hop.hostId}-${i}`}>
            <ArrowDown className="mx-auto size-4 shrink-0 text-muted-foreground/50" />
            <div className="flex min-h-11 items-center gap-2.5 rounded-md border border-border bg-background/50 px-2.5">
              <HostOsBadge
                os={
                  h?.osIcon ||
                  guessHostOs(h?.username, h?.name, h?.folder, h?.ip)
                }
                size={24}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {h ? h.name || h.ip : t("hosts.chainMissingHost")}
              </span>
              <button
                type="button"
                title={t("hosts.chainRemoveHop")}
                onClick={() =>
                  onChange(jumpHosts.filter((_, idx) => idx !== i))
                }
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          </React.Fragment>
        );
      })}

      <ArrowDown className="mx-auto size-4 shrink-0 text-muted-foreground/50" />
      <div className="flex min-h-11 items-center gap-2.5 rounded-md border border-accent-brand/40 bg-accent-brand/5 px-2.5">
        <HostOsBadge os={targetOs} size={24} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {targetLabel}
        </span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-accent-brand">
          {t("hosts.chainTarget")}
        </span>
      </div>

      {jumpHosts.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onChange([])}
        >
          <Trash2 className="mr-1.5 size-3.5" />
          {t("hosts.chainClear")}
        </Button>
      )}
    </div>
  );
}

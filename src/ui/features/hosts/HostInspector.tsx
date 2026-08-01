/**
 * Right-hand host inspector — an editable panel, not a read-only summary.
 *
 * Renders the same details screen as the sidebar editor (address, general, SSH
 * port, credential source, chain, proxy, env, charset, mosh, theme…) so a host
 * can be changed and connected without leaving the hosts browser. The deeper
 * per-protocol and terminal tabs stay in the full manager, reachable from the
 * header's "advanced" action.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Check, PanelRightClose, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/button";
import { HostEditor } from "@/sidebar/HostEditor";
import { mapCredentials } from "@/sidebar/HostManagerData";
import { getCredentials } from "@/main-axios";
import type { Host } from "@/types/ui-types";
// `@/types` (no subpath) does not resolve — tsconfig maps `@/types/*` to
// src/types but bare `@/types` falls through to src/ui/types, which has no
// index. Import the explicit entry point instead.
import type { SSHHost } from "@/types/index";
import type { HostProtocols } from "@/sidebar/HostEditorData";

function protocolsOf(host: Host | null): HostProtocols {
  if (!host)
    return {
      enableSsh: true,
      enableRdp: false,
      enableVnc: false,
      enableTelnet: false,
    };
  return {
    enableSsh: host.enableSsh,
    enableRdp: host.enableRdp,
    enableVnc: host.enableVnc,
    enableTelnet: host.enableTelnet,
  };
}

export function HostInspector({
  host,
  hosts,
  onClose,
  onSaved,
  onConnect,
  onOpenAdvanced,
}: {
  /** null opens the panel in "new host" mode. */
  host: Host | null;
  hosts: Host[];
  onClose: () => void;
  onSaved: (saved: SSHHost) => void;
  onConnect: (saved: SSHHost) => void;
  onOpenAdvanced?: () => void;
}) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = React.useState<
    { id: string; name: string; username: string }[]
  >([]);
  const [protocols, setProtocols] = React.useState<HostProtocols>(() =>
    protocolsOf(host),
  );
  // The editor owns the form, so saving is triggered through a handler it
  // publishes here — that keeps the commit action in the panel header.
  const saveRef = React.useRef<(() => void) | null>(null);
  const connectRef = React.useRef<(() => void) | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [connectable, setConnectable] = React.useState(!!host?.ip);

  // Selecting a different host must re-seed the protocol toggles; the editor
  // itself is remounted via `key` so its form state resets alongside them.
  const hostKey = host?.id ?? "new";
  React.useEffect(() => {
    setProtocols(protocolsOf(host));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostKey]);

  React.useEffect(() => {
    let cancelled = false;
    const load = () =>
      getCredentials()
        .then((res) => {
          if (cancelled) return;
          setCredentials(
            mapCredentials(res).map((c) => ({
              id: c.id,
              name: c.name,
              username: c.username,
            })),
          );
        })
        .catch(() => {});
    load();
    window.addEventListener("termix:credentials-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("termix:credentials-changed", load);
    };
  }, []);

  return (
    <aside className="flex w-full max-w-full shrink-0 flex-col border-l border-border/40 bg-surface-dim md:w-[320px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {host
              ? t("hosts.details", { defaultValue: "Host Details" })
              : t("hosts.newHost", { defaultValue: "New Host" })}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {host?.folder || t("hosts.noGroup", { defaultValue: "No group" })}
          </p>
        </div>
        {onOpenAdvanced && host && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenAdvanced}
            title={t("hosts.advancedSettings")}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={saving}
          onClick={() => saveRef.current?.()}
          title={
            host ? t("hosts.guac.updateHostBtn") : t("hosts.guac.addHostBtn")
          }
          className="text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
        >
          <Check className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title={t("common.close", { defaultValue: "Close" })}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <HostEditor
          key={hostKey}
          host={host}
          activeTab="general"
          onBack={onClose}
          onSave={onSaved}
          onConnect={onConnect}
          protocols={protocols}
          onProtocolChange={(p) => setProtocols((prev) => ({ ...prev, ...p }))}
          onTabChange={() => {}}
          hosts={hosts}
          credentials={credentials}
          saveRef={saveRef}
          connectRef={connectRef}
          onSavingChange={setSaving}
          onConnectableChange={setConnectable}
          showFooterSave={false}
          showFooterConnect={false}
        />
      </div>

      {/* Connect lives outside the scroll region rather than sticking to the
          bottom of it, so it can never overlap the rows above it. */}
      <div className="shrink-0 border-t border-border/40 p-3">
        <Button
          className="h-11 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-500"
          disabled={saving || !connectable}
          onClick={() => connectRef.current?.()}
          title={!connectable ? t("hosts.connectNeedsAddress") : undefined}
        >
          {saving ? t("hosts.guac.savingBtn") : t("hosts.connectBtn")}
        </Button>
      </div>
    </aside>
  );
}

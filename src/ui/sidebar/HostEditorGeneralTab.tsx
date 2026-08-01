/**
 * Host "Details" screen.
 *
 * One scrolling column of grouped rows covering everything needed to reach a
 * host: address, identity, the SSH connection and its per-session options, then
 * the other protocols. Rows that also appear on the deeper tabs (port, auth,
 * theme, mosh…) bind to the same form fields, so editing either place is
 * equivalent — this screen is the overview, the tabs are the detail.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import {
  DetailAddRow,
  DetailGroup,
  DetailInlineInputRow,
  DetailInputRow,
  DetailNavRow,
  DetailRow,
  DetailSelectRow,
  DetailStateRow,
} from "@/components/detail-list";
import { TERMINAL_THEMES } from "@/lib/terminal-themes";
import type { Host, VaultProfile } from "@/types/ui-types";
import {
  Delete,
  Globe,
  KeyRound,
  Link2,
  Network,
  Palette,
  Plus,
  Radio,
  Server,
  Tag,
  Terminal,
  Type,
  User,
  Variable,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { FolderPathPicker } from "./FolderPathPicker";
import { getSSHFolders, isElectron } from "@/main-axios";
import { HostChainEditor } from "./HostChainEditor";
import { HostOsPicker } from "./HostOsBadge";
import { guessHostOs } from "@/lib/host-os";
import { TERMINAL_CHARSETS } from "./HostEditorData";
import type { HostEditorForm, HostProtocols } from "./HostEditorData";

type HostEditorSetField = <K extends keyof HostEditorForm>(
  key: K,
  value: HostEditorForm[K],
) => void;

type Section =
  | "startup"
  | "chain"
  | "proxy"
  | "env"
  | "knock"
  | "wol"
  | "notes"
  | null;

export function HostEditorGeneralTab({
  form,
  setField,
  protocols,
  handleProtocolToggle,
  hosts,
  host,
  credentials = [],
  vaultProfiles = [],
  snippets = [],
  lockAuthReferences = false,
}: {
  form: HostEditorForm;
  setField: HostEditorSetField;
  protocols: HostProtocols;
  handleProtocolToggle: (proto: keyof HostProtocols, value: boolean) => void;
  hosts: Host[];
  host: Host | null;
  credentials?: { id: string; name: string; username: string }[];
  vaultProfiles?: VaultProfile[];
  snippets?: { id: number; name: string }[];
  lockAuthReferences?: boolean;
}) {
  const { t } = useTranslation();

  const [openSection, setOpenSection] = React.useState<Section>(null);
  const [showSecrets, setShowSecrets] = React.useState(false);
  const [folderMeta, setFolderMeta] = React.useState<
    Map<string, { color?: string; icon?: string }>
  >(new Map());

  const toggleSection = (s: Exclude<Section, null>) =>
    setOpenSection((prev) => (prev === s ? null : s));

  React.useEffect(() => {
    let cancelled = false;
    const load = () => {
      getSSHFolders()
        .then((folders) => {
          if (cancelled) return;
          const map = new Map<string, { color?: string; icon?: string }>();
          for (const f of folders) {
            map.set(f.name, {
              color: f.color ?? undefined,
              icon: f.icon ?? undefined,
            });
          }
          setFolderMeta(map);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("termix:hosts-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("termix:hosts-changed", load);
    };
  }, []);

  // Folders come from two sources: paths referenced by existing hosts, and
  // standalone folder records (including empty ones just created).
  // Intermediate ancestor paths are expanded so "A" appears even when only
  // "A / B" is directly stored on a host.
  const folderPaths = React.useMemo(() => {
    const set = new Set<string>();
    const addWithAncestors = (path: string) => {
      const parts = path.split(" / ");
      let accumulated = "";
      for (const part of parts) {
        accumulated = accumulated ? `${accumulated} / ${part}` : part;
        set.add(accumulated);
      }
    };
    for (const h of hosts) {
      if (h.folder) addWithAncestors(h.folder);
    }
    for (const path of folderMeta.keys()) addWithAncestors(path);
    return [...set];
  }, [hosts, folderMeta]);

  const osValue =
    form.osIcon || guessHostOs(form.username, form.name, form.folder, form.ip);
  const selectedCredential = credentials.find(
    (c) => c.id === form.credentialId,
  );
  const noProtocolEnabled =
    !protocols.enableSsh &&
    !protocols.enableRdp &&
    !protocols.enableVnc &&
    !protocols.enableTelnet;

  const themeName =
    form.theme === "custom"
      ? t("hosts.themeCustom")
      : (TERMINAL_THEMES[form.theme]?.name ?? form.theme);
  const themeColors = TERMINAL_THEMES[form.theme]?.colors;

  const chainSummary = (() => {
    const hops = form.jumpHosts.filter((j) => j.hostId);
    if (hops.length === 0) return null;
    const first = hosts.find((h) => h.id === String(hops[0].hostId));
    const name = first ? first.name || first.ip : t("hosts.chainMissingHost");
    return hops.length > 1 ? `${name} +${hops.length - 1}` : name;
  })();

  const proxySummary = form.useSocks5
    ? form.socks5ProxyMode === "chain"
      ? t("hosts.proxyChainSummary", { count: form.socks5ProxyChain.length })
      : form.socks5Host
        ? `${form.socks5Host}:${form.socks5Port}`
        : t("hosts.proxyIncomplete")
    : null;

  const envSummary =
    form.environmentVariables.length > 0
      ? t("hosts.envSummary", { count: form.environmentVariables.length })
      : null;

  const startupSummary = form.startupSnippetId
    ? (snippets.find((s) => s.id === form.startupSnippetId)?.name ??
      `#${form.startupSnippetId}`)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ---------------------------------------------------------------- */}
      {/* Address */}
      <DetailGroup title={t("hosts.addressGroup")}>
        {/* Taller than a standard row and with its own gap: the 32px badge
            would otherwise sit flush against the row's top and bottom edges. */}
        <DetailRow
          leading={
            <HostOsPicker
              value={osValue}
              onChange={(id) => setField("osIcon", id)}
            />
          }
          className="min-h-11 gap-2.5 px-2"
        >
          <input
            value={form.ip}
            placeholder="10.0.0.1 or example.com"
            onChange={(e) => setField("ip", e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </DetailRow>
      </DetailGroup>

      {/* ---------------------------------------------------------------- */}
      {/* General */}
      <DetailGroup title={t("hosts.generalGroup")}>
        <DetailInputRow
          placeholder={t("hosts.friendlyName")}
          value={form.name}
          onChange={(v) => setField("name", v)}
        />

        <DetailRow icon={<Server />}>
          <div className="min-w-0 flex-1">
            <FolderPathPicker
              value={form.folder}
              onChange={(path) => setField("folder", path)}
              folderPaths={folderPaths}
              folderMeta={folderMeta}
            />
          </div>
        </DetailRow>

        <DetailRow icon={<Tag />} className="flex-wrap py-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    setField(
                      "tags",
                      form.tags.filter((tg) => tg !== tag),
                    )
                  }
                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            <input
              className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder={form.tags.length === 0 ? t("hosts.tags") : ""}
              value={form.tagInput}
              onChange={(e) => setField("tagInput", e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.key === " " || e.key === "Enter") &&
                  form.tagInput.trim()
                ) {
                  e.preventDefault();
                  const tag = form.tagInput.trim();
                  if (!form.tags.includes(tag))
                    setField("tags", [...form.tags, tag]);
                  setField("tagInput", "");
                } else if (
                  e.key === "Backspace" &&
                  !form.tagInput &&
                  form.tags.length > 0
                ) {
                  setField("tags", form.tags.slice(0, -1));
                }
              }}
            />
          </div>
        </DetailRow>

        <DetailSelectRow
          icon={<Delete />}
          label={t("hosts.backspaceLabel")}
          value={form.backspaceMode}
          onChange={(v) =>
            setField("backspaceMode", v as HostEditorForm["backspaceMode"])
          }
        >
          <option value="normal">{t("hosts.backspaceNormal")}</option>
          <option value="control-h">{t("hosts.backspaceControlH")}</option>
        </DetailSelectRow>

        <DetailStateRow
          icon={<Zap />}
          label={t("hosts.pinToTop")}
          enabled={form.pin}
          onToggle={(v) => setField("pin", v)}
          enabledLabel={t("common.enabled")}
          disabledLabel={t("common.disabled")}
        />

        <DetailNavRow
          icon={<Type />}
          label={t("hosts.privateNotes")}
          value={form.notes ? t("hosts.notesSet") : null}
          onClick={() => toggleSection("notes")}
        />
        {openSection === "notes" && (
          <textarea
            rows={3}
            placeholder={t("hosts.privateNotesPlaceholder")}
            className="w-full resize-none rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent-brand/50"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        )}
      </DetailGroup>

      {noProtocolEnabled && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <Globe className="size-4 shrink-0 text-muted-foreground/40" />
          <span>{t("hosts.enableAtLeastOneProtocol")}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* SSH */}
      {protocols.enableSsh && (
        <DetailGroup
          title={t("hosts.tabSsh")}
          action={
            <button
              type="button"
              onClick={() => handleProtocolToggle("enableSsh", false)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              {t("hosts.protocolRemove")}
            </button>
          }
        >
          <DetailInlineInputRow
            before={t("hosts.sshOn")}
            after={t("hosts.portWord")}
            value={form.sshPort}
            onChange={(v) => setField("sshPort", Number(v) || 0)}
            placeholder="22"
          />

          {/* Credentials */}
          <DetailSelectRow
            icon={<KeyRound />}
            label={t("hosts.credentialsFrom")}
            value={form.authType}
            disabled={lockAuthReferences}
            title={
              lockAuthReferences
                ? t("hosts.sharing.ownerOnlyControl")
                : undefined
            }
            onChange={(v) =>
              setField("authType", v as HostEditorForm["authType"])
            }
          >
            {[
              "password",
              "key",
              "credential",
              "vault",
              "agent",
              "opkssh",
              "tailscale",
              "none",
            ].map((m) => (
              <option key={m} value={m}>
                {t(`hosts.authSource.${m}`, { defaultValue: m })}
              </option>
            ))}
          </DetailSelectRow>

          {form.authType === "credential" && (
            <DetailSelectRow
              value={form.credentialId}
              disabled={lockAuthReferences}
              onChange={(newId) => {
                setField("credentialId", newId);
                if (!form.overrideCredentialUsername) {
                  const cred = credentials.find((c) => c.id === newId);
                  if (cred?.username) setField("username", cred.username);
                }
              }}
            >
              <option value="">{t("hosts.selectACredential")}</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.username ? `${c.name} (${c.username})` : c.name}
                </option>
              ))}
            </DetailSelectRow>
          )}

          {form.authType === "vault" && (
            <DetailSelectRow
              value={form.vaultProfileId}
              disabled={lockAuthReferences}
              onChange={(v) => setField("vaultProfileId", v)}
            >
              <option value="">{t("hosts.selectAVaultProfile")}</option>
              {vaultProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shared ? `${p.name} (shared)` : p.name}
                </option>
              ))}
            </DetailSelectRow>
          )}

          <DetailInputRow
            icon={<User />}
            placeholder={t("hosts.username")}
            value={form.username}
            disabled={
              form.authType === "credential" &&
              !!selectedCredential?.username &&
              !form.overrideCredentialUsername
            }
            onChange={(v) => setField("username", v)}
            onFocus={() => {
              if (form.username === "root") setField("username", "");
            }}
            onBlur={() => {
              if (form.username === "") setField("username", "root");
            }}
          />

          {/* Optional secrets, revealed on demand like the "+ Password,
              Certificate" affordance. Always shown once something is set so a
              stored value is never hidden. */}
          {showSecrets || form.password || form.keyPassword ? (
            <>
              <DetailRow icon={<KeyRound />}>
                <PasswordInput
                  className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                  placeholder={t("hosts.password")}
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                />
              </DetailRow>
              {form.authType === "key" && (
                <DetailRow icon={<KeyRound />}>
                  <PasswordInput
                    className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                    placeholder={
                      form.keyPassword === "existing_key_password"
                        ? t("hosts.keyPassphraseSaved")
                        : t("hosts.keyPassphrase")
                    }
                    value={
                      form.keyPassword === "existing_key_password"
                        ? ""
                        : form.keyPassword
                    }
                    onFocus={() => {
                      if (form.keyPassword === "existing_key_password")
                        setField("keyPassword", "");
                    }}
                    onChange={(e) => setField("keyPassword", e.target.value)}
                  />
                </DetailRow>
              )}
            </>
          ) : (
            <DetailAddRow
              label={t("hosts.addPasswordCertificate")}
              onClick={() => setShowSecrets(true)}
            />
          )}

          <DetailStateRow
            icon={<Link2 />}
            label={t("hosts.agentForwarding")}
            enabled={form.agentForwarding}
            onToggle={(v) => setField("agentForwarding", v)}
            enabledLabel={t("common.enabled")}
            disabledLabel={t("common.disabled")}
          />

          {/* Startup command */}
          <DetailNavRow
            icon={<Terminal />}
            label={t("hosts.startupCommand")}
            value={startupSummary}
            onClick={() => toggleSection("startup")}
          />
          {openSection === "startup" && (
            <DetailSelectRow
              value={form.startupSnippetId ? String(form.startupSnippetId) : ""}
              onChange={(v) =>
                setField("startupSnippetId", v ? Number(v) : null)
              }
            >
              <option value="">{t("hosts.startupCommandNone")}</option>
              {snippets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </DetailSelectRow>
          )}

          {/* Jump-host chain */}
          <DetailNavRow
            icon={<Network />}
            label={t("hosts.chainLabel")}
            value={chainSummary}
            onClick={() => toggleSection("chain")}
          />
          {openSection === "chain" && (
            <HostChainEditor
              jumpHosts={form.jumpHosts}
              hosts={hosts}
              targetLabel={form.name || form.ip || t("hosts.chainTarget")}
              targetOs={osValue}
              excludeHostId={host?.id}
              onChange={(next) => setField("jumpHosts", next)}
            />
          )}

          {/* Proxy */}
          <DetailNavRow
            icon={<Globe />}
            label={t("hosts.proxyLabel")}
            value={proxySummary}
            onClick={() => toggleSection("proxy")}
          />
          {openSection === "proxy" && (
            <ProxySection form={form} setField={setField} />
          )}

          {/* Environment variables */}
          <DetailNavRow
            icon={<Variable />}
            label={t("hosts.environmentVariable")}
            value={envSummary}
            onClick={() => toggleSection("env")}
          />
          {openSection === "env" && (
            <EnvSection form={form} setField={setField} />
          )}

          {/* Charset */}
          <DetailSelectRow
            icon={<Type />}
            label={t("hosts.charsetLabel")}
            value={form.charset}
            onChange={(v) => setField("charset", v)}
          >
            {TERMINAL_CHARSETS.map((cs) => (
              <option key={cs} value={cs}>
                {cs}
              </option>
            ))}
          </DetailSelectRow>

          {/* Mosh */}
          <DetailStateRow
            icon={<Wifi />}
            label={t("hosts.moshLabel")}
            enabled={form.autoMosh}
            onToggle={(v) => setField("autoMosh", v)}
            enabledLabel={t("common.enabled")}
            disabledLabel={t("common.disabled")}
          />

          {/* Theme — swatch previews the palette the select is sitting on. */}
          <DetailRow
            icon={<Palette />}
            leading={
              themeColors ? (
                <span
                  className="ml-1 flex h-7 w-11 shrink-0 items-center justify-center gap-0.5 rounded border border-border"
                  style={{ backgroundColor: themeColors.background }}
                  title={themeName}
                >
                  {(
                    [
                      themeColors.red,
                      themeColors.green,
                      themeColors.yellow,
                      themeColors.blue,
                    ] as string[]
                  ).map((c, i) => (
                    <span
                      key={i}
                      className="h-3 w-1 rounded-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
              ) : undefined
            }
          >
            <span className="shrink-0 text-sm text-muted-foreground">
              {t("hosts.themeLabel")}
            </span>
            <select
              value={form.theme}
              onChange={(e) => setField("theme", e.target.value)}
              className="min-w-0 flex-1 cursor-pointer bg-transparent text-right text-sm text-foreground outline-none"
            >
              {Object.entries(TERMINAL_THEMES).map(([key, theme]) => (
                <option key={key} value={key}>
                  {theme.name}
                </option>
              ))}
            </select>
          </DetailRow>

          {/* Advanced networking that has no equivalent row in a plain SSH
              client but still belongs to reaching the host. */}
          <DetailNavRow
            icon={<Radio />}
            label={t("hosts.wolLabel")}
            value={form.macAddress || null}
            onClick={() => toggleSection("wol")}
          />
          {openSection === "wol" && (
            <div className="flex flex-col gap-2">
              <DetailInputRow
                placeholder="AA:BB:CC:DD:EE:FF"
                value={form.macAddress}
                onChange={(v) => setField("macAddress", v)}
              />
              {form.macAddress && (
                <DetailInputRow
                  placeholder="192.168.1.255"
                  value={form.wolBroadcastAddress}
                  onChange={(v) => setField("wolBroadcastAddress", v)}
                />
              )}
            </div>
          )}

          <DetailNavRow
            icon={<Network />}
            label={t("hosts.portKnockingSequence")}
            value={
              form.portKnockSequence.length
                ? t("hosts.knockSummary", {
                    count: form.portKnockSequence.length,
                  })
                : null
            }
            onClick={() => toggleSection("knock")}
          />
          {openSection === "knock" && (
            <PortKnockSection form={form} setField={setField} />
          )}

          {isElectron() && (
            <DetailSelectRow
              icon={<Server />}
              label={t("hosts.connectionOrigin")}
              value={form.connectionOrigin ?? ""}
              onChange={(v) =>
                setField(
                  "connectionOrigin",
                  (v || null) as "local" | "remote" | null,
                )
              }
            >
              <option value="">{t("hosts.connectionOriginDefault")}</option>
              <option value="local">{t("hosts.connectionOriginLocal")}</option>
              <option value="remote">
                {t("hosts.connectionOriginRemote")}
              </option>
            </DetailSelectRow>
          )}
        </DetailGroup>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Other protocols */}
      {(
        [
          {
            proto: "enableRdp" as const,
            portField: "rdpPort" as const,
            label: t("hosts.tabRdp"),
            on: t("hosts.rdpOn"),
          },
          {
            proto: "enableVnc" as const,
            portField: "vncPort" as const,
            label: t("hosts.tabVnc"),
            on: t("hosts.vncOn"),
          },
          {
            proto: "enableTelnet" as const,
            portField: "telnetPort" as const,
            label: t("hosts.tabTelnet"),
            on: t("hosts.telnetOn"),
          },
        ] as const
      ).map(({ proto, portField, label, on }) =>
        protocols[proto] ? (
          <DetailGroup
            key={proto}
            title={label}
            action={
              <button
                type="button"
                onClick={() => handleProtocolToggle(proto, false)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {t("hosts.protocolRemove")}
              </button>
            }
          >
            <DetailInlineInputRow
              before={on}
              after={t("hosts.portWord")}
              value={form[portField]}
              onChange={(v) => setField(portField, Number(v) || 0)}
            />
          </DetailGroup>
        ) : null,
      )}

      <DetailGroup>
        {!protocols.enableSsh && (
          <DetailAddRow
            label={t("hosts.addProtocol", { name: t("hosts.tabSsh") })}
            onClick={() => handleProtocolToggle("enableSsh", true)}
          />
        )}
        {!protocols.enableRdp && (
          <DetailAddRow
            label={t("hosts.addProtocol", { name: t("hosts.tabRdp") })}
            onClick={() => handleProtocolToggle("enableRdp", true)}
          />
        )}
        {!protocols.enableVnc && (
          <DetailAddRow
            label={t("hosts.addProtocol", { name: t("hosts.tabVnc") })}
            onClick={() => handleProtocolToggle("enableVnc", true)}
          />
        )}
        {!protocols.enableTelnet && (
          <DetailAddRow
            label={t("hosts.addProtocol", { name: t("hosts.tabTelnet") })}
            onClick={() => handleProtocolToggle("enableTelnet", true)}
          />
        )}
      </DetailGroup>
    </div>
  );
}

/** SOCKS5 proxy, single node or a chain of them. */
function ProxySection({
  form,
  setField,
}: {
  form: HostEditorForm;
  setField: HostEditorSetField;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
      <DetailStateRow
        label={t("hosts.useSocks5Proxy")}
        enabled={form.useSocks5}
        onToggle={(v) => setField("useSocks5", v)}
        enabledLabel={t("common.enabled")}
        disabledLabel={t("common.disabled")}
      />
      {form.useSocks5 && (
        <>
          <div className="flex gap-2">
            {(["single", "chain"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setField("socks5ProxyMode", m)}
                className={`rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${form.socks5ProxyMode === m ? "bg-accent-brand/10 text-accent-brand" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "single"
                  ? t("hosts.proxySingleMode")
                  : t("hosts.proxyChainMode")}
              </button>
            ))}
          </div>

          {form.socks5ProxyMode === "single" ? (
            <div className="flex flex-col gap-2">
              <DetailInputRow
                placeholder={t("hosts.proxyHost")}
                value={form.socks5Host}
                onChange={(v) => setField("socks5Host", v)}
              />
              <DetailInputRow
                type="number"
                placeholder={t("hosts.proxyPort")}
                value={form.socks5Port}
                onChange={(v) => setField("socks5Port", Number(v) || 0)}
              />
              <DetailInputRow
                placeholder={t("hosts.proxyUsername")}
                value={form.socks5Username}
                onChange={(v) => setField("socks5Username", v)}
              />
              <DetailRow>
                <PasswordInput
                  className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                  placeholder={t("hosts.proxyPassword")}
                  value={form.socks5Password}
                  onChange={(e) => setField("socks5Password", e.target.value)}
                />
              </DetailRow>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {form.socks5ProxyChain.map((node, ni) => (
                <div
                  key={ni}
                  className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("hosts.proxyNode")} {ni + 1}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setField(
                          "socks5ProxyChain",
                          form.socks5ProxyChain.filter((_, idx) => idx !== ni),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <DetailInputRow
                    placeholder={t("hosts.proxyHost")}
                    value={node.host}
                    onChange={(v) => {
                      const u = [...form.socks5ProxyChain];
                      u[ni] = { ...u[ni], host: v };
                      setField("socks5ProxyChain", u);
                    }}
                  />
                  <DetailInputRow
                    type="number"
                    placeholder={t("hosts.proxyPort")}
                    value={node.port}
                    onChange={(v) => {
                      const u = [...form.socks5ProxyChain];
                      u[ni] = { ...u[ni], port: Number(v) || 0 };
                      setField("socks5ProxyChain", u);
                    }}
                  />
                  {/* ProxyNode.type is `4 | 5 | "http"` — the SOCKS version as
                      a number, not a label. The previous markup wrote
                      "socks5"/"socks4", which the connect path cannot read. */}
                  <DetailSelectRow
                    label={t("hosts.proxyType")}
                    value={String(node.type)}
                    onChange={(v) => {
                      const u = [...form.socks5ProxyChain];
                      u[ni] = {
                        ...u[ni],
                        type: v === "http" ? "http" : (Number(v) as 4 | 5),
                      };
                      setField("socks5ProxyChain", u);
                    }}
                  >
                    <option value="5">SOCKS5</option>
                    <option value="4">SOCKS4</option>
                    <option value="http">HTTP</option>
                  </DetailSelectRow>
                  <DetailInputRow
                    placeholder={t("hosts.proxyUsername")}
                    value={node.username}
                    onChange={(v) => {
                      const u = [...form.socks5ProxyChain];
                      u[ni] = { ...u[ni], username: v };
                      setField("socks5ProxyChain", u);
                    }}
                  />
                  <DetailRow>
                    <PasswordInput
                      className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                      placeholder={t("hosts.proxyPassword")}
                      value={node.password}
                      onChange={(e) => {
                        const u = [...form.socks5ProxyChain];
                        u[ni] = { ...u[ni], password: e.target.value };
                        setField("socks5ProxyChain", u);
                      }}
                    />
                  </DetailRow>
                </div>
              ))}
              <DetailAddRow
                label={t("hosts.addProxyNode")}
                onClick={() =>
                  setField("socks5ProxyChain", [
                    ...form.socks5ProxyChain,
                    {
                      host: "",
                      port: 1080,
                      type: 5,
                      username: "",
                      password: "",
                    },
                  ])
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EnvSection({
  form,
  setField,
}: {
  form: HostEditorForm;
  setField: HostEditorSetField;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
      {form.environmentVariables.length === 0 && (
        <p className="text-xs text-muted-foreground/60">
          {t("hosts.envEmpty")}
        </p>
      )}
      {form.environmentVariables.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <DetailInputRow
              placeholder={t("hosts.envKey")}
              value={entry.key}
              onChange={(v) => {
                const u = [...form.environmentVariables];
                u[i] = { ...u[i], key: v };
                setField("environmentVariables", u);
              }}
            />
          </div>
          <div className="flex-1">
            <DetailInputRow
              placeholder={t("hosts.envValue")}
              value={entry.value}
              onChange={(v) => {
                const u = [...form.environmentVariables];
                u[i] = { ...u[i], value: v };
                setField("environmentVariables", u);
              }}
            />
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() =>
              setField(
                "environmentVariables",
                form.environmentVariables.filter((_, idx) => idx !== i),
              )
            }
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <DetailAddRow
        label={t("hosts.envAdd")}
        onClick={() =>
          setField("environmentVariables", [
            ...form.environmentVariables,
            { key: "", value: "" },
          ])
        }
      />
    </div>
  );
}

function PortKnockSection({
  form,
  setField,
}: {
  form: HostEditorForm;
  setField: HostEditorSetField;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <a
          href="https://docs.termix.site/features/networking/port-knocking"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-accent-brand hover:underline"
        >
          {t("hosts.docsLink")}
        </a>
        <Button
          variant="outline"
          size="sm"
          className="h-6 border-accent-brand/40 px-2 text-[10px] text-accent-brand"
          onClick={() =>
            setField("portKnockSequence", [
              ...form.portKnockSequence,
              { port: 0, protocol: "tcp" as const, delay: 0 },
            ])
          }
        >
          <Plus className="mr-1 size-3" /> {t("hosts.addKnockBtn")}
        </Button>
      </div>
      {form.portKnockSequence.length === 0 && (
        <p className="text-xs text-muted-foreground/60">
          {t("hosts.noPortKnocking")}
        </p>
      )}
      {form.portKnockSequence.map((knock, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-xs text-muted-foreground/60">
            {i + 1}.
          </span>
          <div className="flex-1">
            <DetailInputRow
              type="number"
              placeholder={t("hosts.knockPort")}
              value={knock.port}
              onChange={(v) => {
                const u = [...form.portKnockSequence];
                u[i] = { ...u[i], port: Number(v) || 0 };
                setField("portKnockSequence", u);
              }}
            />
          </div>
          <select
            className="h-11 shrink-0 rounded-md border border-border bg-background/50 px-2 text-sm outline-none focus:border-accent-brand/50"
            value={knock.protocol}
            onChange={(e) => {
              const u = [...form.portKnockSequence];
              u[i] = { ...u[i], protocol: e.target.value as "tcp" | "udp" };
              setField("portKnockSequence", u);
            }}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
          <div className="w-24">
            <DetailInputRow
              type="number"
              placeholder={t("hosts.delayAfterMs")}
              value={knock.delay}
              onChange={(v) => {
                const u = [...form.portKnockSequence];
                u[i] = { ...u[i], delay: Number(v) || 0 };
                setField("portKnockSequence", u);
              }}
            />
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() =>
              setField(
                "portKnockSequence",
                form.portKnockSequence.filter((_, idx) => idx !== i),
              )
            }
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

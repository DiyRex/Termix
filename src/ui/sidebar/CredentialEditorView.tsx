/**
 * Credential ("key") editor.
 *
 * Laid out as grouped detail rows: identity, then the key material itself
 * (private key / public key / certificate), then export. "Export to host"
 * installs the public key into a host's authorized_keys via the existing
 * credential-deploy endpoint.
 */
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy, KeyRound, Send, Tag, Upload, User, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import {
  DetailActionBar,
  DetailAddRow,
  DetailGroup,
  DetailInputRow,
  DetailRow,
  DetailSelectRow,
  DetailTextareaRow,
} from "@/components/detail-list";
import {
  createCredential,
  generateKeyPair,
  generatePublicKeyFromPrivate,
  updateCredential,
  adminCreateUserCredential,
  adminUpdateUserCredential,
  deployCredentialToHost,
  getSSHHosts,
} from "@/main-axios";
import type { Credential } from "@/types/ui-types";
import { sshHostToHost } from "./HostManagerData";
import { FolderPathPicker } from "./FolderPathPicker";

type CredentialWithCertificate = Credential & { certPublicKey?: string };

export function CredentialEditorView({
  credential,
  activeTab,
  onBack,
  onSave,
  adminTargetUserId,
  existingFolders = [],
  saveRef,
  onSavingChange,
  showFooterSave = true,
}: {
  credential: Credential | null;
  /** Tab id from the manager's strip, or "all" to show every group at once
   *  (used by the keychain inspector, which has no tab strip). */
  activeTab: string;
  onBack: () => void;
  onSave: (saved: Record<string, unknown>) => void;
  adminTargetUserId?: string;
  existingFolders?: string[];
  // Containers that render their own save affordance (the inspector's header
  // tick) take the handler through this ref and pass showFooterSave={false}.
  saveRef?: React.MutableRefObject<(() => void) | null>;
  onSavingChange?: (saving: boolean) => void;
  showFooterSave?: boolean;
}) {
  const [credForm, setCredForm] = useState(() => ({
    name: credential?.name ?? "",
    username: credential?.username ?? "",
    folder: credential?.folder ?? "",
    description: credential?.description ?? "",
    tags: credential?.tags ?? ([] as string[]),
    tagInput: "",
    type: credential?.type ?? "password",
    value: credential?.type === "key" ? (credential?.value ?? "") : "",
    password:
      credential?.type === "password"
        ? (credential?.value ?? "")
        : (credential?.password ?? ""),
    publicKey: credential?.publicKey ?? "",
    passphrase: credential?.passphrase ?? "",
    certPublicKey:
      (credential as CredentialWithCertificate | null)?.certPublicKey ?? "",
  }));
  const { t } = useTranslation();
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatingPublicKey, setGeneratingPublicKey] = useState(false);
  const [showCertificate, setShowCertificate] = useState(
    !!(credential as CredentialWithCertificate | null)?.certPublicKey,
  );
  const [showPassword, setShowPassword] = useState(
    credential?.type === "password" || !!credential?.password,
  );
  const credFileInputRef = useRef<HTMLInputElement>(null);
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const setCredField = <K extends keyof typeof credForm>(
    k: K,
    v: (typeof credForm)[K],
  ) => setCredForm((p) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);

  // Export targets. Loaded lazily so the keychain editor doesn't pull the host
  // list on every open — only once the export row is used.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportHosts, setExportHosts] = useState<
    { id: string; name: string; ip: string }[]
  >([]);
  const [exportHostId, setExportHostId] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!exportOpen || exportHosts.length > 0) return;
    getSSHHosts()
      .then((raw) =>
        setExportHosts(
          raw.map(sshHostToHost).map((h) => ({
            id: h.id,
            name: h.name || h.ip,
            ip: h.ip,
          })),
        ),
      )
      .catch(() => toast.error(t("hosts.failedToLoadHosts")));
  }, [exportOpen, exportHosts.length, t]);

  const handleExport = async () => {
    if (!credential) {
      toast.error(t("credentials.exportSaveFirst"));
      return;
    }
    if (!exportHostId) return;
    setExporting(true);
    try {
      await deployCredentialToHost(Number(credential.id), Number(exportHostId));
      toast.success(t("hosts.keyDeployedSuccess"));
      setExportOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : null;
      toast.error(msg || t("hosts.failedToDeployKey"));
    } finally {
      setExporting(false);
    }
  };

  // Deliberately re-assigned on every render (no dep array): the handler closes
  // over `credForm`, so a memoised version would save stale values.
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => void handleSave();
    return () => {
      saveRef.current = null;
    };
  });

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  const handleSave = async () => {
    if (!credForm.name.trim()) {
      toast.error(t("hosts.credentialNameRequired"));
      return;
    }
    const hasKey =
      credForm.value === "existing_key" || credForm.value.trim() !== "";
    if (!hasKey && !credForm.password) {
      toast.error(t("hosts.credentialAuthRequired"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: credForm.name,
        username: credForm.username,
        folder: credForm.folder || null,
        description: credForm.description || null,
        tags: credForm.tags,
        authType: hasKey ? "key" : "password",
        password: credForm.password || null,
        key: hasKey
          ? credForm.value === "existing_key"
            ? undefined
            : credForm.value || null
          : null,
        publicKey: hasKey ? credForm.publicKey : null,
        certPublicKey: hasKey ? credForm.certPublicKey || null : null,
        keyPassword: hasKey
          ? credForm.passphrase === "existing_key_password"
            ? undefined
            : credForm.passphrase || null
          : null,
      };
      let saved: Record<string, unknown>;
      if (adminTargetUserId) {
        saved = credential
          ? await adminUpdateUserCredential(
              adminTargetUserId,
              Number(credential.id),
              data,
            )
          : await adminCreateUserCredential(adminTargetUserId, data);
      } else {
        saved = credential
          ? await updateCredential(Number(credential.id), data)
          : await createCredential(data);
      }
      toast.success(
        credential
          ? t("hosts.credentialUpdated")
          : t("hosts.credentialCreated"),
      );
      if (!adminTargetUserId) {
        window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      }
      onSave(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : null;
      toast.error(msg || t("hosts.failedToSaveCredential"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {(activeTab === "general" || activeTab === "all") && (
        <>
          <DetailGroup title={t("credentials.identityGroup")}>
            <DetailInputRow
              placeholder={t("hosts.friendlyNameLabel")}
              value={credForm.name}
              onChange={(v) => setCredField("name", v)}
            />
            <DetailRow>
              <div className="min-w-0 flex-1">
                <FolderPathPicker
                  value={credForm.folder}
                  onChange={(path) => setCredField("folder", path)}
                  folderPaths={existingFolders}
                />
              </div>
            </DetailRow>
            <DetailInputRow
              placeholder={t("hosts.descriptionLabel")}
              value={credForm.description}
              onChange={(v) => setCredField("description", v)}
            />
            <DetailRow icon={<Tag />} className="flex-wrap py-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {credForm.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-0.5 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setCredField(
                          "tags",
                          credForm.tags.filter((tg) => tg !== tag),
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
                  placeholder={
                    credForm.tags.length === 0
                      ? t("hosts.addTagsPlaceholder")
                      : ""
                  }
                  value={credForm.tagInput}
                  onChange={(e) => setCredField("tagInput", e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      (e.key === " " || e.key === "Enter") &&
                      credForm.tagInput.trim()
                    ) {
                      e.preventDefault();
                      const tag = credForm.tagInput.trim();
                      if (!credForm.tags.includes(tag))
                        setCredField("tags", [...credForm.tags, tag]);
                      setCredField("tagInput", "");
                    } else if (
                      e.key === "Backspace" &&
                      !credForm.tagInput &&
                      credForm.tags.length > 0
                    ) {
                      setCredField("tags", credForm.tags.slice(0, -1));
                    }
                  }}
                />
              </div>
            </DetailRow>
          </DetailGroup>
        </>
      )}

      {(activeTab === "auth" || activeTab === "all") && (
        <>
          <DetailGroup title={t("credentials.credentialsGroup")}>
            <DetailInputRow
              icon={<User />}
              placeholder={t("hosts.username")}
              value={credForm.username}
              onChange={(v) => setCredField("username", v)}
            />
            {showPassword || credForm.password ? (
              <DetailRow icon={<KeyRound />}>
                <PasswordInput
                  className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                  placeholder={t("hosts.password")}
                  value={credForm.password}
                  onChange={(e) => setCredField("password", e.target.value)}
                />
              </DetailRow>
            ) : (
              <DetailAddRow
                label={t("credentials.addPassword")}
                onClick={() => setShowPassword(true)}
              />
            )}
          </DetailGroup>

          <DetailGroup
            title={t("credentials.keyGroup")}
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "Ed25519", type: "ssh-ed25519" },
                  { label: "ECDSA", type: "ecdsa-sha2-nistp256" },
                  { label: "RSA", type: "ssh-rsa", bits: 2048 },
                ].map(({ label, type: keyType, bits }) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={generatingKey}
                    onClick={async () => {
                      setGeneratingKey(true);
                      try {
                        const result = await generateKeyPair(
                          keyType as
                            | "ssh-ed25519"
                            | "ssh-rsa"
                            | "ecdsa-sha2-nistp256",
                          bits,
                          credForm.passphrase === "existing_key_password"
                            ? undefined
                            : credForm.passphrase || undefined,
                        );
                        if (result.success) {
                          setCredField("value", result.privateKey);
                          setCredField("publicKey", result.publicKey);
                          toast.success(t("hosts.keyPairGenerated", { label }));
                        } else {
                          toast.error(
                            result.error ?? t("hosts.failedToGenerateKeyPair"),
                          );
                        }
                      } catch {
                        toast.error(t("hosts.failedToGenerateKeyPair"));
                      } finally {
                        setGeneratingKey(false);
                      }
                    }}
                  >
                    {generatingKey
                      ? t("hosts.generatingKey")
                      : t("hosts.generateLabel", { label })}
                  </Button>
                ))}
              </div>
            }
          >
            <DetailTextareaRow
              label={t("hosts.sshPrivateKey")}
              mono
              rows={8}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              value={credForm.value === "existing_key" ? "" : credForm.value}
              onChange={(v) => setCredField("value", v)}
              action={
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-accent-brand hover:text-accent-brand/80"
                  onClick={() => credFileInputRef.current?.click()}
                >
                  <Upload className="size-3" /> {t("hosts.uploadFileBtn")}
                </button>
              }
              note={
                credForm.value === "existing_key" ? (
                  <div className="rounded border border-accent-brand/30 bg-accent-brand/5 px-2 py-1 text-[10px] text-accent-brand">
                    {t("hosts.keySaved")} — {t("hosts.keyReplaceNotice")}
                  </div>
                ) : undefined
              }
            />
            <input
              ref={credFileInputRef}
              type="file"
              accept=".pem,.key,.ppk,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setCredField("value", text.trim());
                e.target.value = "";
              }}
            />

            <DetailRow icon={<KeyRound />}>
              <PasswordInput
                className="h-7 border-0 bg-transparent px-0 pr-8 text-sm shadow-none focus-visible:ring-0"
                placeholder={
                  credForm.passphrase === "existing_key_password"
                    ? t("hosts.keyPassphraseSaved")
                    : t("hosts.keyPassphraseOptional")
                }
                value={
                  credForm.passphrase === "existing_key_password"
                    ? ""
                    : credForm.passphrase
                }
                onFocus={() => {
                  if (credForm.passphrase === "existing_key_password")
                    setCredField("passphrase", "");
                }}
                onChange={(e) => setCredField("passphrase", e.target.value)}
              />
            </DetailRow>

            <DetailTextareaRow
              label={t("hosts.sshPublicKeyOptional")}
              mono
              rows={3}
              placeholder="ssh-rsa AAAAB3Nza..."
              value={credForm.publicKey}
              onChange={(v) => setCredField("publicKey", v)}
              action={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="text-[10px] text-accent-brand hover:text-accent-brand/80 disabled:opacity-40"
                    disabled={
                      !credForm.value ||
                      credForm.value === "existing_key" ||
                      generatingPublicKey
                    }
                    onClick={async () => {
                      setGeneratingPublicKey(true);
                      try {
                        const result = await generatePublicKeyFromPrivate(
                          credForm.value,
                          credForm.passphrase === "existing_key_password"
                            ? undefined
                            : credForm.passphrase || undefined,
                        );
                        if (result?.publicKey) {
                          setCredField("publicKey", result.publicKey);
                          toast.success(t("hosts.publicKeyGenerated"));
                        } else {
                          toast.error(t("hosts.failedToGeneratePublicKey"));
                        }
                      } catch {
                        toast.error(t("hosts.failedToGeneratePublicKey"));
                      } finally {
                        setGeneratingPublicKey(false);
                      }
                    }}
                  >
                    {generatingPublicKey
                      ? t("hosts.generatingKey")
                      : t("hosts.generateFromPrivateKey")}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={!credForm.publicKey}
                    onClick={() => {
                      copyToClipboard(credForm.publicKey ?? "");
                      toast.success(t("hosts.publicKeyCopied"));
                    }}
                  >
                    <Copy className="size-3" /> {t("common.copy")}
                  </button>
                </div>
              }
            />

            {showCertificate || credForm.certPublicKey ? (
              <>
                <DetailTextareaRow
                  label={t("credentials.caCertificate")}
                  mono
                  rows={2}
                  placeholder={t("credentials.pasteOrUploadCert")}
                  value={credForm.certPublicKey}
                  onChange={(v) => setCredField("certPublicKey", v)}
                  action={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[10px] text-accent-brand hover:text-accent-brand/80"
                        onClick={() => certFileInputRef.current?.click()}
                      >
                        <Upload className="size-3" />{" "}
                        {t("credentials.uploadCertFile")}
                      </button>
                      {credForm.certPublicKey && (
                        <button
                          type="button"
                          className="text-[10px] text-destructive hover:text-destructive/80"
                          onClick={() => setCredField("certPublicKey", "")}
                        >
                          {t("credentials.clearCert")}
                        </button>
                      )}
                    </div>
                  }
                  note={
                    <p className="text-[10px] text-muted-foreground">
                      {t("credentials.caCertificateDescription")}
                    </p>
                  }
                />
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept=".pub,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setCredField("certPublicKey", text.trim());
                    e.target.value = "";
                  }}
                />
              </>
            ) : (
              <DetailAddRow
                label={t("credentials.addCertificate")}
                onClick={() => setShowCertificate(true)}
              />
            )}
          </DetailGroup>

          {/* Key export ------------------------------------------------- */}
          <DetailGroup title={t("credentials.keyExportGroup")}>
            <p className="px-0.5 text-xs text-muted-foreground">
              {t("credentials.keyExportDescription")}
            </p>
            {exportOpen && (
              <DetailSelectRow
                value={exportHostId}
                onChange={setExportHostId}
                disabled={exportHosts.length === 0}
              >
                <option value="">
                  {exportHosts.length === 0
                    ? t("credentials.exportLoadingHosts")
                    : t("hosts.selectAServer")}
                </option>
                {exportHosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.ip})
                  </option>
                ))}
              </DetailSelectRow>
            )}
            <Button
              className="h-11 w-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
              disabled={
                !credential ||
                exporting ||
                (exportOpen && !exportHostId) ||
                !credForm.publicKey
              }
              title={
                !credential
                  ? t("credentials.exportSaveFirst")
                  : !credForm.publicKey
                    ? t("credentials.noPublicKeyAvailable")
                    : undefined
              }
              onClick={() =>
                exportOpen ? handleExport() : setExportOpen(true)
              }
            >
              <Send className="mr-2 size-4" />
              {exporting
                ? t("hosts.deployingBtn")
                : t("credentials.exportToHost")}
            </Button>
          </DetailGroup>
        </>
      )}

      {showFooterSave && (
        <DetailActionBar>
          <Button
            variant="outline"
            className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? t("hosts.savingBtn")
              : credential
                ? t("hosts.updateCredentialBtn")
                : t("hosts.addCredentialBtn")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={onBack}
            disabled={saving}
          >
            {t("hosts.cancelBtn")}
          </Button>
        </DetailActionBar>
      )}
    </div>
  );
}

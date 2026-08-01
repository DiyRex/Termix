/**
 * Right-hand keychain inspector — the editable "Edit Key" panel.
 *
 * The grid only knows the summary shape returned by GET /credentials, so the
 * full record (key material, passphrase, certificate) is fetched on selection
 * before the editor mounts. Without that the editor would open with blank key
 * fields and overwrite them on save.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Check, PanelRightClose } from "lucide-react";
import { Button } from "@/components/button";
import { CredentialEditorView } from "@/sidebar/CredentialEditorView";
import { getCredentialDetails } from "@/main-axios";
import type { Credential } from "@/types/ui-types";
import { sshLogger } from "@/lib/frontend-logger";

type RawCredential = Record<string, unknown>;

function toCredential(raw: RawCredential): Credential {
  const authType = String(raw.authType ?? "password");
  const isKey = authType === "key";
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    username: String(raw.username ?? ""),
    type: isKey ? "key" : "password",
    // The API returns sentinels rather than secrets for stored material; the
    // editor understands them and shows a "saved — replace to change" notice.
    value: isKey
      ? ((raw.key as string) ?? (raw.hasKey ? "existing_key" : ""))
      : ((raw.password as string) ?? ""),
    password: (raw.password as string) ?? "",
    publicKey: (raw.publicKey as string) ?? "",
    passphrase: raw.hasKeyPassword
      ? "existing_key_password"
      : ((raw.keyPassword as string) ?? ""),
    description: (raw.description as string) ?? "",
    folder: (raw.folder as string) ?? "",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    ...(raw.certPublicKey
      ? { certPublicKey: raw.certPublicKey as string }
      : {}),
  } as Credential;
}

export function CredentialInspector({
  credentialId,
  existingFolders,
  onClose,
  onSaved,
}: {
  /** null opens the panel in "new credential" mode. */
  credentialId: number | null;
  existingFolders: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [credential, setCredential] = React.useState<Credential | null>(null);
  const [loading, setLoading] = React.useState(credentialId !== null);
  // The editor owns the form, so saving is triggered through a handler it
  // publishes here — that keeps the commit action in the panel header.
  const saveRef = React.useRef<(() => void) | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (credentialId === null) {
      setCredential(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCredentialDetails(credentialId)
      .then((raw) => {
        if (cancelled) return;
        setCredential(toCredential(raw as RawCredential));
      })
      .catch((err) => {
        if (cancelled) return;
        sshLogger.error(
          "Failed to load credential for the keychain panel",
          err,
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [credentialId]);

  return (
    <aside className="flex w-full max-w-full shrink-0 flex-col border-l border-border/40 bg-surface-dim md:w-[320px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {credentialId === null
              ? t("credentials.add")
              : t("credentials.editKey")}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {credential?.folder || t("credentials.noFolder")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={saving || loading}
          onClick={() => saveRef.current?.()}
          title={
            credentialId === null
              ? t("hosts.addCredentialBtn")
              : t("hosts.updateCredentialBtn")
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
        {loading ? (
          <p className="px-1 py-8 text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : (
          <CredentialEditorView
            key={credentialId ?? "new"}
            credential={credential}
            activeTab="all"
            existingFolders={existingFolders}
            onBack={onClose}
            onSave={onSaved}
            saveRef={saveRef}
            onSavingChange={setSaving}
            showFooterSave={false}
          />
        )}
      </div>

      {/* Stacked outside the scroll region rather than sticking to the bottom of
          it, so the buttons can never overlap the rows above them. */}
      {!loading && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 p-3">
          <Button
            variant="outline"
            className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
            disabled={saving}
            onClick={() => saveRef.current?.()}
          >
            {saving
              ? t("hosts.savingBtn")
              : credentialId === null
                ? t("hosts.addCredentialBtn")
                : t("hosts.updateCredentialBtn")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={saving}
            onClick={onClose}
          >
            {t("hosts.cancelBtn")}
          </Button>
        </div>
      )}
    </aside>
  );
}

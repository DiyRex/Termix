import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Lock, Plus, Search, FolderTree, User } from "lucide-react";
import { Button } from "@/components/button.tsx";
import { Input } from "@/components/input.tsx";
import { getCredentials } from "@/api/credentials-api";
import { sshLogger } from "@/lib/frontend-logger";

/**
 * Keychain browsed as a card grid, matching the host grid.
 *
 * Shape comes from GET /credentials, which returns records rather than a typed
 * model, so only the fields actually present are read here.
 */
interface CredentialSummary {
  id: number;
  name: string;
  description?: string | null;
  username?: string | null;
  authType?: string | null;
  keyType?: string | null;
  detectedKeyType?: string | null;
  folder?: string | null;
  tags?: string[] | null;
  usageCount?: number | null;
}

function toSummary(raw: Record<string, unknown>): CredentialSummary {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    description: (raw.description as string) ?? null,
    username: (raw.username as string) ?? null,
    authType: (raw.authType as string) ?? null,
    keyType: (raw.keyType as string) ?? null,
    detectedKeyType: (raw.detectedKeyType as string) ?? null,
    folder: (raw.folder as string) ?? null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : null,
    usageCount: (raw.usageCount as number) ?? null,
  };
}

/** "Type RSA" / "Type ED25519", or the auth type when it is a password. */
function subtitleFor(
  cred: CredentialSummary,
  t: (k: string) => string,
): string {
  if (cred.authType === "password") return t("credentials.typePassword");
  const raw = cred.keyType || cred.detectedKeyType;
  if (!raw) return t("credentials.typeKey");
  // ssh-ed25519 -> ED25519, ssh-rsa -> RSA
  const pretty = raw.replace(/^ssh-/, "").replace(/^ecdsa-.*/, "ECDSA");
  return `${t("credentials.typeLabel")} ${pretty.toUpperCase()}`;
}

export function CredentialsTab({
  onAddCredential,
}: {
  onAddCredential?: () => void;
}) {
  const { t } = useTranslation();
  const [creds, setCreds] = useState<CredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCredentials()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setCreds(list.map(toSummary));
      })
      .catch((err) => {
        sshLogger.error("Failed to load credentials for keychain grid", err);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const keys = useMemo(
    () => creds.filter((c) => c.authType !== "password"),
    [creds],
  );
  const passwords = useMemo(
    () => creds.filter((c) => c.authType === "password"),
    [creds],
  );

  const matches = (c: CredentialSummary) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.username, c.folder, ...(c.tags ?? [])]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q));
  };

  const filteredKeys = keys.filter(matches);
  const filteredPasswords = passwords.filter(matches);

  function Card({ cred }: { cred: CredentialSummary }) {
    const isKey = cred.authType !== "password";
    return (
      <div className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-sm transition-colors hover:bg-muted/50">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
            isKey
              ? "bg-chart-2/20 text-chart-2"
              : "bg-accent-brand/20 text-accent-brand"
          }`}
        >
          {isKey ? (
            <KeyRound className="size-4" />
          ) : (
            <Lock className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {cred.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {subtitleFor(cred, t)}
            {cred.username ? ` · ${cred.username}` : ""}
          </p>
        </div>
        {cred.folder && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <FolderTree className="size-3" />
            {cred.folder}
          </span>
        )}
      </div>
    );
  }

  function Section({
    title,
    items,
  }: {
    title: string;
    items: CredentialSummary[];
  }) {
    if (items.length === 0) return null;
    return (
      <>
        <h2 className="px-1 pb-3 pt-1 text-base font-semibold text-foreground">
          {title}
        </h2>
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((cred) => (
            <Card key={cred.id} cred={cred} />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("credentials.searchPlaceholder")}
            className="h-10 rounded-lg bg-surface pl-9"
          />
        </div>
        <Button size="lg" onClick={onAddCredential}>
          <Plus className="size-4" />
          {t("credentials.add")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {loading ? (
          <p className="px-1 py-8 text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : creds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <User className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("credentials.empty")}
            </p>
            <Button variant="outline" onClick={onAddCredential}>
              <Plus className="size-4" />
              {t("credentials.add")}
            </Button>
          </div>
        ) : (
          <>
            <Section title={t("credentials.keys")} items={filteredKeys} />
            <Section
              title={t("credentials.passwords")}
              items={filteredPasswords}
            />
            {filteredKeys.length === 0 && filteredPasswords.length === 0 && (
              <p className="px-1 py-8 text-sm text-muted-foreground">
                {t("credentials.noMatches")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

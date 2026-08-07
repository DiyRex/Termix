import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  File as FileIcon,
  Link2,
  Search,
  SquareTerminal,
  TriangleAlert,
  FolderPlus,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import {
  createLocalDirectory,
  listLocalDirectory,
  renameLocalEntry,
  type LocalDirEntry,
  type LocalListing,
} from "@/api/local-files-api";
import { isElectron } from "@/lib/electron";

/** Human-readable size, or the em dash a directory shows instead. */
function formatSize(entry: LocalDirEntry): string {
  if (entry.type === "directory" || entry.size == null) return "- -";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = entry.size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function formatModified(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

/** Finder-style "Kind" column: a folder/alias label, else the file extension. */
function kindOf(
  entry: LocalDirEntry,
  labels: { folder: string; symlink: string; file: string },
) {
  if (entry.type === "directory") return labels.folder;
  if (entry.type === "symlink") return labels.symlink;
  const ext = entry.name.includes(".")
    ? entry.name.split(".").pop()!.toLowerCase()
    : "";
  return ext || labels.file;
}

function EntryIcon({ entry }: { entry: LocalDirEntry }) {
  if (entry.type === "directory")
    return <Folder className="size-4 shrink-0 fill-current text-chart-2" />;
  if (entry.type === "symlink")
    return <Link2 className="size-4 shrink-0 text-chart-2" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

/**
 * The local half of the SFTP tab: this machine's filesystem as a details table,
 * so a transfer has a near side without opening a second app.
 */
/** Payload carried by a drag between the two SFTP panes. */
export const SFTP_DRAG_MIME = "application/x-termix-sftp-entry";

export function LocalFilePane({
  onDropRemoteFile,
  currentPathRef,
}: {
  /** Called when a remote entry is dropped here; resolves when transferred. */
  onDropRemoteFile?: (remotePath: string, localDir: string) => Promise<void>;
  /** Lets the parent read the directory currently shown, for the reverse drop. */
  currentPathRef?: React.MutableRefObject<string | null>;
} = {}) {
  const { t } = useTranslation();
  const [listing, setListing] = useState<LocalListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  // One inline prompt serves both actions; `kind` decides which.
  const [prompt, setPrompt] = useState<{
    kind: "mkdir" | "rename";
    value: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const supported = isElectron();

  const kindLabels = useMemo(
    () => ({
      folder: t("localFiles.kindFolder", { defaultValue: "folder" }),
      symlink: t("localFiles.kindSymlink", { defaultValue: "alias" }),
      file: t("localFiles.kindFile", { defaultValue: "file" }),
    }),
    [t],
  );

  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!actionsRef.current?.contains(e.target as Node))
        setActionsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [actionsOpen]);

  const load = useCallback(async (target?: string) => {
    setLoading(true);
    try {
      const next = await listLocalDirectory(target);
      setListing(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, supported]);

  useEffect(() => {
    if (currentPathRef) currentPathRef.current = listing?.path ?? null;
  }, [currentPathRef, listing?.path]);

  const selectedEntry = useMemo(
    () => listing?.entries.find((e) => e.path === selected) ?? null,
    [listing?.entries, selected],
  );

  /** Runs a mutation, then refreshes so the table reflects the new state. */
  const runPrompt = useCallback(async () => {
    if (!prompt || !listing) return;
    const name = prompt.value.trim();
    if (!name) return;

    setBusy(true);
    try {
      const sep = listing.path.includes("\\") ? "\\" : "/";
      if (prompt.kind === "mkdir") {
        await createLocalDirectory(`${listing.path}${sep}${name}`);
      } else if (selectedEntry) {
        await renameLocalEntry(
          selectedEntry.path,
          `${listing.path}${sep}${name}`,
        );
      }
      setPrompt(null);
      setSelected(null);
      await load(listing.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }, [prompt, listing, selectedEntry, load]);

  const navigate = useCallback(
    (target: string) => {
      if (listing?.path) setHistory((prev) => [...prev, listing.path]);
      setForward([]);
      void load(target);
    },
    [listing?.path, load],
  );

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      if (listing?.path) setForward((f) => [listing.path, ...f]);
      void load(target);
      return prev.slice(0, -1);
    });
  }, [listing?.path, load]);

  const goForward = useCallback(() => {
    setForward((prev) => {
      if (prev.length === 0) return prev;
      const [target, ...rest] = prev;
      if (listing?.path) setHistory((h) => [...h, listing.path]);
      void load(target);
      return rest;
    });
  }, [listing?.path, load]);

  // Path split into clickable segments, with the leading separator preserved so
  // an absolute POSIX path stays absolute.
  const breadcrumbs = useMemo(() => {
    if (!listing?.path) return [];
    const sep = listing.path.includes("\\") ? "\\" : "/";
    const parts = listing.path.split(sep).filter(Boolean);
    let accumulated = sep === "/" ? "" : "";
    return parts.map((part) => {
      accumulated =
        sep === "/"
          ? `${accumulated}/${part}`
          : accumulated
            ? `${accumulated}\\${part}`
            : part;
      return { name: part, path: accumulated };
    });
  }, [listing?.path]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const entries = listing?.entries ?? [];
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [listing?.entries, filter]);

  if (!supported) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted/40">
          <TriangleAlert className="size-5 text-muted-foreground/50" />
        </div>
        <span className="text-sm font-semibold text-foreground">
          {t("localFiles.notSupportedTitle", {
            defaultValue: "Local files unavailable",
          })}
        </span>
        <span className="max-w-xs text-xs text-muted-foreground">
          {t("localFiles.notSupported", {
            defaultValue:
              "Browsing this computer's files is only available in the Termix desktop app.",
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Pane header — identity on the left, its own actions on the right, so
          each side of the transfer is operated independently. */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-chart-2/20 text-chart-2">
          <SquareTerminal className="size-4" />
        </span>
        <span className="text-base font-semibold text-foreground">
          {t("localFiles.title", { defaultValue: "Local" })}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Search className="size-4" />
          {t("localFiles.filter", { defaultValue: "Filter" })}
        </button>
        <div ref={actionsRef} className="relative">
          <button
            onClick={() => setActionsOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {t("localFiles.actions", { defaultValue: "Actions" })}
            <ChevronDown className="size-4" />
          </button>
          {actionsOpen && (
            <div className="absolute top-full right-0 z-30 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
              <button
                onClick={() => {
                  setActionsOpen(false);
                  setPrompt({ kind: "mkdir", value: "" });
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <FolderPlus className="size-3.5" />
                {t("localFiles.newFolder", { defaultValue: "New Folder" })}
              </button>
              <button
                disabled={!selectedEntry}
                onClick={() => {
                  setActionsOpen(false);
                  setPrompt({
                    kind: "rename",
                    value: selectedEntry?.name ?? "",
                  });
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Pencil className="size-3.5" />
                {t("localFiles.rename", { defaultValue: "Rename" })}
              </button>
              <button
                onClick={() => {
                  setActionsOpen(false);
                  void load(listing?.path);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <RefreshCw className="size-3.5" />
                {t("localFiles.refresh", { defaultValue: "Refresh" })}
              </button>
            </div>
          )}
        </div>
      </div>

      {prompt && (
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
          <input
            autoFocus
            value={prompt.value}
            disabled={busy}
            onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runPrompt();
              else if (e.key === "Escape") setPrompt(null);
            }}
            placeholder={
              prompt.kind === "mkdir"
                ? t("localFiles.newFolderPlaceholder", {
                    defaultValue: "Folder name",
                  })
                : t("localFiles.renamePlaceholder", {
                    defaultValue: "New name",
                  })
            }
            className="h-8 flex-1 rounded-md bg-surface px-2.5 text-sm outline-none disabled:opacity-60"
          />
          <button
            onClick={() => void runPrompt()}
            disabled={busy || !prompt.value.trim()}
            className="h-8 rounded-md bg-accent-brand/15 px-2.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/25 disabled:opacity-40"
          >
            {prompt.kind === "mkdir"
              ? t("localFiles.create", { defaultValue: "Create" })
              : t("localFiles.rename", { defaultValue: "Rename" })}
          </button>
          <button
            onClick={() => setPrompt(null)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {filterOpen && (
        <div className="shrink-0 px-4 pb-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("localFiles.filterPlaceholder", {
              defaultValue: "Filter by name...",
            })}
            className="h-8 w-full rounded-md bg-surface px-2.5 text-sm outline-none"
          />
        </div>
      )}

      {/* Breadcrumb row */}
      <div className="flex shrink-0 items-center gap-1 px-4 pb-3">
        <button
          onClick={goBack}
          disabled={history.length === 0}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={goForward}
          disabled={forward.length === 0}
          className="mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <button
                onClick={() => navigate(crumb.path)}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted/60"
              >
                <Folder className="size-4 shrink-0 fill-current text-chart-2" />
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_190px_100px_110px] border-y border-border/60 px-4 py-2 text-sm font-semibold text-foreground">
        <span>{t("localFiles.colName", { defaultValue: "Name" })}</span>
        <span className="pr-3">
          {t("localFiles.colModified", { defaultValue: "Date Modified" })}
        </span>
        <span className="pr-3 text-right">
          {t("localFiles.colSize", { defaultValue: "Size" })}
        </span>
        <span>{t("localFiles.colKind", { defaultValue: "Kind" })}</span>
      </div>

      <div
        className={`relative min-h-0 flex-1 overflow-y-auto ${
          dropActive ? "ring-2 ring-accent-brand ring-inset" : ""
        }`}
        onDragOver={(e) => {
          if (!onDropRemoteFile) return;
          if (!e.dataTransfer.types.includes(SFTP_DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          setDropActive(false);
          if (!onDropRemoteFile || !listing?.path) return;
          const raw = e.dataTransfer.getData(SFTP_DRAG_MIME);
          if (!raw) return;
          e.preventDefault();
          let payload: { side?: string; path?: string };
          try {
            payload = JSON.parse(raw);
          } catch {
            return;
          }
          // Ignore a drag that started in this pane; only the remote side has
          // anywhere to come from.
          if (payload.side !== "remote" || !payload.path) return;

          const name = payload.path.split("/").pop() || "download";
          setTransferring(name);
          void onDropRemoteFile(payload.path, listing.path)
            .then(() => load(listing.path))
            .catch((err) =>
              setError(err instanceof Error ? err.message : "Transfer failed"),
            )
            .finally(() => setTransferring(null));
        }}
      >
        {transferring && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-surface px-4 py-1.5 text-xs text-muted-foreground">
            <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-accent-brand" />
            {t("localFiles.receiving", {
              defaultValue: "Receiving {{name}}...",
              name: transferring,
            })}
          </div>
        )}
        {error ? (
          <p className="px-4 py-6 text-sm text-destructive">{error}</p>
        ) : loading && !listing ? (
          <div className="flex items-center justify-center p-6">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70" />
          </div>
        ) : (
          <>
            {listing?.parent && (
              <button
                onDoubleClick={() => navigate(listing.parent!)}
                onClick={() => navigate(listing.parent!)}
                className="grid w-full grid-cols-[minmax(0,1fr)_190px_100px_110px] items-center px-4 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex items-center gap-2.5">
                  <Folder className="size-4 shrink-0 fill-current text-chart-2" />
                  <span className="text-sm text-foreground">..</span>
                </span>
                <span />
                <span />
                <span />
              </button>
            )}
            {rows.map((entry) => (
              <button
                key={entry.path}
                // Only files can be dragged: a directory transfer needs a
                // recursive walk the backend route deliberately refuses.
                draggable={entry.type === "file"}
                onDragStart={(e) => {
                  if (entry.type !== "file") return;
                  e.dataTransfer.setData(
                    SFTP_DRAG_MIME,
                    JSON.stringify({ side: "local", path: entry.path }),
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                // Single click selects (giving Rename a target), double click
                // descends — the convention every file browser uses.
                onClick={() =>
                  setSelected((prev) =>
                    prev === entry.path ? null : entry.path,
                  )
                }
                onDoubleClick={() =>
                  entry.type === "directory" && navigate(entry.path)
                }
                className={`grid w-full grid-cols-[minmax(0,1fr)_190px_100px_110px] items-center px-4 py-1.5 text-left transition-colors ${
                  selected === entry.path
                    ? "bg-accent-brand/15"
                    : "hover:bg-muted/40"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <EntryIcon entry={entry} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {entry.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {entry.mode}
                    </span>
                  </span>
                </span>
                <span className="truncate pr-3 text-sm text-muted-foreground">
                  {formatModified(entry.modified)}
                </span>
                <span className="pr-3 text-right text-sm tabular-nums text-muted-foreground">
                  {formatSize(entry)}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {kindOf(entry, kindLabels)}
                </span>
              </button>
            ))}
            {rows.length === 0 && !listing?.parent && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {t("localFiles.empty", {
                  defaultValue: "This folder is empty.",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

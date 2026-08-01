/** Platform badge shown beside a host's address, plus its picker. */
import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Server } from "lucide-react";
import { HOST_OS_OPTIONS, hostOsSpec, type HostOsId } from "@/lib/host-os";

export function HostOsBadge({
  os,
  size = 24,
}: {
  os: string | null | undefined;
  size?: number;
}) {
  const spec = hostOsSpec(os);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md font-bold text-white"
      style={{
        backgroundColor: spec.color,
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
      }}
      title={spec.label}
    >
      {spec.glyph || (
        <Server style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}

/** Badge that opens a grid of platforms when clicked. */
export function HostOsPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (id: HostOsId) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = hostOsSpec(value);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={t("hosts.osBadgeTitle", { name: current.label })}
        className="disabled:cursor-not-allowed disabled:opacity-60"
      >
        <HostOsBadge os={current.id} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 grid w-56 grid-cols-4 gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-xl">
          {HOST_OS_OPTIONS.map((spec) => (
            <button
              key={spec.id}
              type="button"
              title={spec.label}
              onClick={() => {
                onChange(spec.id);
                setOpen(false);
              }}
              className={`relative flex items-center justify-center rounded-md p-1 transition-colors hover:bg-muted ${current.id === spec.id ? "bg-muted" : ""}`}
            >
              <HostOsBadge os={spec.id} size={28} />
              {current.id === spec.id && (
                <Check className="absolute -right-0.5 -top-0.5 size-3 text-accent-brand" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

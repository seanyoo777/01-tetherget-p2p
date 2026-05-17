const SEVERITY_CLASS = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/40 bg-red-500/10 text-red-300",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export function SeverityBadge({ severity, compact = false }) {
  const cls = SEVERITY_CLASS[severity] || SEVERITY_CLASS.info;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border font-semibold uppercase tracking-wide ${cls} ${
        compact ? "px-1 py-0 text-[8px]" : "px-1.5 py-0.5 text-[9px]"
      }`}
    >
      {severity}
    </span>
  );
}

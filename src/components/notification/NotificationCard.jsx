import { SeverityBadge } from "./SeverityBadge.jsx";

function formatWhen(ts) {
  try {
    return new Date(ts).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function NotificationCard({ item, theme, onRead, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => {
        onRead?.(item.id);
        if (item.actionUrl) onNavigate?.(item.actionUrl);
      }}
      className={`w-full rounded-xl border p-2.5 text-left transition ${
        item.read ? "opacity-70" : "border-white/15"
      } ${theme.cardSoft ?? theme.card}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className={`text-xs font-black ${theme.page ?? ""}`}>{item.title}</span>
          <SeverityBadge severity={item.severity} compact />
          {!item.read ? (
            <span className="rounded-full bg-sky-500/20 px-1 text-[8px] font-bold text-sky-300">NEW</span>
          ) : null}
        </div>
        <p className={`mt-0.5 text-[11px] leading-snug ${theme.subtext ?? theme.muted}`}>{item.message}</p>
        <div className={`mt-1 flex flex-wrap gap-2 text-[9px] ${theme.muted}`}>
          <span>{item.source}</span>
          <span>{formatWhen(item.createdAt)}</span>
          <span className="rounded border border-amber-500/30 px-1 text-amber-400/90">MOCK</span>
        </div>
      </div>
    </button>
  );
}

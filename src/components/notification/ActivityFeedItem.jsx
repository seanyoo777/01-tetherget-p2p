function formatWhen(ts) {
  try {
    return new Date(ts).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function ActivityFeedItem({ item, theme }) {
  return (
    <li className={`rounded-xl border p-3 ${theme.cardSoft ?? theme.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${theme.muted}`}>{item.action}</span>
        <span className={`text-[9px] ${theme.muted}`}>{formatWhen(item.createdAt)}</span>
      </div>
      <p className={`mt-1 text-sm font-semibold ${theme.page ?? ""}`}>{item.message}</p>
      <div className={`mt-2 flex flex-wrap gap-2 text-[10px] ${theme.subtext ?? theme.muted}`}>
        <span>@{item.actor}</span>
        <span>
          {item.targetType}:{item.targetId}
        </span>
        <span className="rounded border border-amber-500/30 px-1 text-amber-400/90">MOCK</span>
      </div>
    </li>
  );
}

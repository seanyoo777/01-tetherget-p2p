import { ActivityFeedItem } from "./ActivityFeedItem.jsx";

export function ActivityFeedList({ items, theme, emptyLabel = "최근 활동이 없습니다." }) {
  if (!items?.length) {
    return <p className={`rounded-xl border border-dashed p-6 text-center text-sm ${theme.muted}`}>{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <ActivityFeedItem key={item.id} item={item} theme={theme} />
      ))}
    </ul>
  );
}

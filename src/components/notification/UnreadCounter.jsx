import { NOTIFICATION_TEST_IDS } from "../../notifications/notificationTestIds.js";

export function UnreadCounter({ count, compact = false }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      data-testid={NOTIFICATION_TEST_IDS.unreadBadge}
      className={`absolute font-black tabular-nums text-red-500 ${
        compact
          ? "-right-0.5 -top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500/15 px-0.5 text-[8px]"
          : "-right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500/15 px-1 text-[9px]"
      }`}
      aria-hidden
    >
      {label}
    </span>
  );
}

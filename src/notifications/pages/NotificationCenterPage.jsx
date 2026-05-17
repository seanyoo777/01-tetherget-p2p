import { useMemo, useState } from "react";
import { NOTIFICATION_TEST_IDS } from "../notificationTestIds.js";
import { clearAllNotificationsMock } from "../notificationHelpers.js";
import { NotificationCard } from "../../components/notification/NotificationCard.jsx";
import { useNotificationLive } from "../../components/notification/useNotificationLive.js";

const SOURCE_FILTERS = ["all", "trade", "escrow", "dispute", "membership", "admin", "system"];

export function NotificationCenterPage({ theme, onNavigate }) {
  const { notifications, unread, markRead, markAllRead } = useNotificationLive();
  const [source, setSource] = useState("all");

  const filtered = useMemo(() => {
    if (source === "all") return notifications;
    return notifications.filter((n) => n.source === source);
  }, [notifications, source]);

  return (
    <section data-testid={NOTIFICATION_TEST_IDS.center} className="mx-auto max-w-2xl px-4 py-6">
      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">알림 센터</h2>
            <p className={`mt-1 text-xs ${theme.muted}`}>
              거래 · escrow · 분쟁 · 멤버십 · 관리자 — localStorage · MOCK ONLY (푸시 없음)
            </p>
          </div>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            미읽음 {unread}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {SOURCE_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSource(key)}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                source === key ? theme.main : theme.input
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => markAllRead()} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
            모두 읽음
          </button>
          <button
            type="button"
            onClick={() => clearAllNotificationsMock()}
            className={`rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 ${theme.input}`}
          >
            비우기 (mock)
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <p className={`rounded-xl border border-dashed p-8 text-center text-sm ${theme.muted}`}>표시할 알림이 없습니다.</p>
          ) : (
            filtered.map((item) => (
              <NotificationCard key={item.id} item={item} theme={theme} onRead={markRead} onNavigate={onNavigate} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

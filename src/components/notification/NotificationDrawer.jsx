import { NOTIFICATION_TEST_IDS } from "../../notifications/notificationTestIds.js";
import { clearAllNotificationsMock } from "../../notifications/notificationHelpers.js";
import { NotificationCard } from "./NotificationCard.jsx";
import { useNotificationLive } from "./useNotificationLive.js";

export function NotificationDrawer({ theme, open, onClose, onNavigate, onOpenCenter, onOpenActivity }) {
  const { notifications, unread, markRead, markAllRead } = useNotificationLive();
  const preview = notifications.slice(0, 8);

  if (!open) return null;

  return (
    <div
      data-testid={NOTIFICATION_TEST_IDS.drawer}
      className={`absolute right-0 top-full z-[62] mt-1.5 flex w-[min(96vw,22rem)] max-h-[min(85vh,28rem)] flex-col overflow-hidden rounded-xl border shadow-xl ${theme.popover ?? theme.card}`}
      role="dialog"
      aria-label="알림 센터"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div>
          <div className="text-sm font-black">알림 센터</div>
          <div className={`text-[10px] ${theme.muted}`}>
            {unread > 0 ? `${unread}건 미읽음` : "모두 읽음"} · MOCK ONLY
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => markAllRead()} className={`rounded-lg border px-2 py-1 text-[9px] font-semibold ${theme.input}`}>
            모두 읽음
          </button>
          <button type="button" onClick={onClose} className={`rounded-lg border px-2 py-1 text-[9px] font-semibold ${theme.input}`}>
            닫기
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {preview.length === 0 ? (
          <p className={`p-4 text-center text-xs ${theme.muted}`}>알림이 없습니다.</p>
        ) : (
          preview.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              theme={theme}
              onRead={markRead}
              onNavigate={(url) => {
                onClose?.();
                onNavigate?.(url);
              }}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/10 p-2">
        <button type="button" onClick={onOpenCenter} className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black ${theme.main}`}>
          전체 알림
        </button>
        <button type="button" onClick={onOpenActivity} className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${theme.input}`}>
          활동 피드
        </button>
        <button
          type="button"
          onClick={() => clearAllNotificationsMock()}
          className={`w-full rounded-lg border border-red-500/30 px-2 py-1 text-[9px] text-red-400 ${theme.input}`}
        >
          알림 비우기 (mock)
        </button>
      </div>
    </div>
  );
}

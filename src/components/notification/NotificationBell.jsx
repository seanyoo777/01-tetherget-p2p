import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_TEST_IDS } from "../../notifications/notificationTestIds.js";
import { seedDemoNotificationsIfEmpty } from "../../notifications/notificationHelpers.js";
import { NotificationDrawer } from "./NotificationDrawer.jsx";
import { UnreadCounter } from "./UnreadCounter.jsx";
import { useNotificationLive } from "./useNotificationLive.js";

export function NotificationBell({ theme, compact = false, onNavigate, onOpenCenter, onOpenActivity }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { unread } = useNotificationLive();

  useEffect(() => {
    seedDemoNotificationsIfEmpty();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const btnClass = compact
    ? `relative inline-flex h-7 w-7 items-center justify-center rounded-lg border text-sm ${theme.headerControl ?? theme.input}`
    : `relative inline-flex items-center gap-0.5 rounded-lg border px-1.5 py-1 text-[10px] font-semibold leading-none ${theme.headerControl ?? theme.input}`;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        data-testid={NOTIFICATION_TEST_IDS.bell}
        aria-label={`알림 센터${unread > 0 ? ` ${unread}건 미읽음` : ""}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={btnClass}
      >
        <span aria-hidden>{compact ? "🔔" : "🔔 알림"}</span>
        <UnreadCounter count={unread} compact={compact} />
      </button>
      <NotificationDrawer
        theme={theme}
        open={open}
        onClose={() => setOpen(false)}
        onNavigate={onNavigate}
        onOpenCenter={() => {
          setOpen(false);
          onOpenCenter?.();
        }}
        onOpenActivity={() => {
          setOpen(false);
          onOpenActivity?.();
        }}
      />
    </div>
  );
}

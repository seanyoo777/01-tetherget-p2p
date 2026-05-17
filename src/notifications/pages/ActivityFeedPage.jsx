import { NOTIFICATION_TEST_IDS } from "../notificationTestIds.js";
import { ActivityFeedList } from "../../components/notification/ActivityFeedList.jsx";
import { useNotificationLive } from "../../components/notification/useNotificationLive.js";

export function ActivityFeedPage({ theme }) {
  const { activity } = useNotificationLive();

  return (
    <section data-testid={NOTIFICATION_TEST_IDS.activityFeed} className="mx-auto max-w-2xl px-4 py-6">
      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        <h2 className="text-xl font-black">최근 활동 피드</h2>
        <p className={`mt-1 text-xs ${theme.muted}`}>
          거래·분쟁·escrow·관리자·멤버십 이벤트 타임라인 — append-only mock (localStorage)
        </p>
        <div className="mt-4">
          <ActivityFeedList items={activity} theme={theme} />
        </div>
      </div>
    </section>
  );
}

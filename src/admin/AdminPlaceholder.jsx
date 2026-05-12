/** AdminShell에서 아직 전용 화면이 없을 때 사용 */
export function AdminPlaceholder({ theme, title, body }) {
  const t = theme || {};
  return (
    <div className={`rounded-2xl border p-6 ${t.cardSoft || t.card || ""}`}>
      <div className="text-lg font-black">{title || "준비 중"}</div>
      <p className={`mt-2 text-sm ${t.subtext || t.muted || ""}`}>{body || "이 메뉴는 곧 연결됩니다."}</p>
    </div>
  );
}

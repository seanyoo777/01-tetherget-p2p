import React from "react";

/** `ops` tab — **복구 스냅샷 · 롤백 센터** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsSnapshotRollbackPanel(props) {
  const {
    theme,
    visible,
    loadOpsSnapshots,
    opsSnapshotLoading,
    opsSnapshotLabel,
    setOpsSnapshotLabel,
    opsSnapshotReason,
    setOpsSnapshotReason,
    createOpsSnapshot,
    opsSnapshots,
    formatNumber,
    rollbackSnapshotId,
    setRollbackSnapshotId,
    rollbackReason,
    setRollbackReason,
    rollbackConfirmText,
    setRollbackConfirmText,
    executeRollback,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-black">복구 스냅샷 · 롤백 센터</div>
          <div className={`text-xs ${theme.muted}`}>문제 발생 시 스냅샷 생성, 분석 후 원점 복구를 실행합니다.</div>
        </div>
        <button onClick={loadOpsSnapshots} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          {opsSnapshotLoading ? "동기화중..." : "스냅샷 새로고침"}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <input
          value={opsSnapshotLabel}
          onChange={(e) => setOpsSnapshotLabel(e.target.value)}
          placeholder="스냅샷 라벨 (예: pre-release-v2)"
          className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
        />
        <input
          value={opsSnapshotReason}
          onChange={(e) => setOpsSnapshotReason(e.target.value)}
          placeholder="스냅샷 사유 (5자 이상)"
          className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
        />
        <button onClick={createOpsSnapshot} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          운영 스냅샷 생성
        </button>
      </div>

      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
        {opsSnapshots.length ? (
          opsSnapshots.map((snapshot) => (
            <div key={snapshot.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
              <div className="font-black">#{snapshot.id} · {snapshot.snapshot_type} · {snapshot.label || "-"}</div>
              <div className={theme.muted}>
                {snapshot.created_at} · by {snapshot.created_by_name || snapshot.created_by_user_id} · {formatNumber((snapshot.size_bytes || 0) / 1024)}KB
              </div>
              <div className="mt-1 break-all text-[11px]">{snapshot.sha256_hash}</div>
            </div>
          ))
        ) : (
          <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>생성된 운영 스냅샷이 없습니다.</div>
        )}
      </div>

      <div className="mt-3 rounded-xl border p-3">
        <div className="mb-2 text-xs font-black">롤백 실행 (슈퍼관리자)</div>
        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={rollbackSnapshotId}
            onChange={(e) => setRollbackSnapshotId(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
          >
            <option value="">롤백 대상 스냅샷 선택</option>
            {opsSnapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                #{snapshot.id} · {snapshot.label || snapshot.snapshot_type}
              </option>
            ))}
          </select>
          <input
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
            placeholder="롤백 사유 (5자 이상)"
            className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          />
          <input
            value={rollbackConfirmText}
            onChange={(e) => setRollbackConfirmText(e.target.value)}
            placeholder="확인문구: ROLLBACK"
            className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          />
          <button onClick={executeRollback} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-400">
            원점 롤백 실행
          </button>
        </div>
      </div>
    </div>
  );
}

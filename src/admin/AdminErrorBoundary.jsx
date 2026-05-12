import React from "react";

export class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("[AdminErrorBoundary]", error, info?.componentStack);
    }
  }

  render() {
    const { theme, children } = this.props;
    const { error } = this.state;
    if (error) {
      const t = theme || {};
      return (
        <div className={`rounded-2xl border p-6 ${t.cardSoft || t.card || "bg-slate-900 text-white"}`}>
          <div className="text-lg font-black">관리자 화면 일부를 표시할 수 없습니다</div>
          <p className={`mt-2 text-sm ${t.muted || "text-slate-400"}`}>
            오류가 기록되었습니다. 거래 등 다른 메뉴는 계속 이용할 수 있습니다.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-xs">{String(error?.message || error)}</pre>
          <button
            type="button"
            className={`mt-4 rounded-xl border px-4 py-2 text-sm font-black ${t.input || "border-white/20"}`}
            onClick={() => this.setState({ error: null })}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return children;
  }
}

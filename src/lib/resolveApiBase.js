function trimApiBase(fromEnv) {
  return typeof fromEnv === "string" ? fromEnv.trim().replace(/\/+$/, "") : "";
}

/** Values that become https://./ in the browser (ERR_NAME_NOT_RESOLVED). */
function isClearlyInvalidTrimmed(trimmed) {
  if (!trimmed) return false;
  if (/^\.+\/?$/.test(trimmed) || trimmed === "./") return true;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return !u.hostname || u.hostname === ".";
    } catch {
      return true;
    }
  }
  return false;
}

/** Fail `npm run build` when VITE_API_BASE would break production (e.g. Vercel env typo). */
export function viteApiBaseIsInvalidForBuild(fromEnv) {
  return isClearlyInvalidTrimmed(trimApiBase(fromEnv));
}

/** Deployed UI must not default to localhost (preview/production browsers cannot reach your PC). */
export function resolveApiBase(fromEnv, isDev) {
  const trimmed = trimApiBase(fromEnv);
  if (!trimmed) return isDev ? "http://localhost:4000" : "";

  const fallback = isDev ? "http://localhost:4000" : "";
  if (isClearlyInvalidTrimmed(trimmed)) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[tetherget] 잘못된 VITE_API_BASE를 무시했습니다(https://./ 및 ERR_NAME_NOT_RESOLVED 원인). "
          + "같은 도메인 /api를 쓰려면 비워 두고, 외부 API면 전체 주소를 넣으세요(예: https://api.example.com).",
        fromEnv
      );
    }
    return fallback;
  }

  return trimmed;
}

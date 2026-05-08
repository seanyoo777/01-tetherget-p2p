export function createApiClient({
  baseUrl,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  onAuthFailure,
}) {
  async function parseJsonSafe(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken?.();
    if (!refreshToken) return "";
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) return "";
    const nextAccess = data.accessToken || "";
    const nextRefresh = data.refreshToken || "";
    if (nextAccess) setAccessToken?.(nextAccess);
    if (nextRefresh) setRefreshToken?.(nextRefresh);
    return nextAccess;
  }

  async function request(path, options = {}) {
    const { auth = false, headers, ...rest } = options;

    const send = async (tokenValue = "") => {
      const requestHeaders = {
        "Content-Type": "application/json",
        ...(headers || {}),
      };
      if (auth && tokenValue) requestHeaders.Authorization = `Bearer ${tokenValue}`;
      const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: requestHeaders,
      });
      const data = await parseJsonSafe(response);
      return { response, data };
    };

    const first = await send(auth ? getAccessToken?.() || "" : "");
    if (first.response.ok) return first.data;

    if (auth && first.response.status === 401) {
      const nextToken = await refreshAccessToken();
      if (nextToken) {
        const second = await send(nextToken);
        if (second.response.ok) return second.data;
        throw new Error(second.data?.message || `API ${path} failed`);
      }
      onAuthFailure?.();
      throw new Error("세션이 만료되었습니다.");
    }

    throw new Error(first.data?.message || `API ${path} failed`);
  }

  return { request };
}

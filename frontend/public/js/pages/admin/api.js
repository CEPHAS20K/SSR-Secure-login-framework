import { createApiClient } from "../../lib/api-client.js";

export function createAdminApiLayer(options = {}) {
  const {
    state,
    defaultCacheTtlMs = 12000,
    maxCacheEntries = 120,
    onLoading,
    onUnauthorized,
  } = options;

  const client = createApiClient({
    cache: state?.apiCache,
    pending: state?.pendingRequests,
    maxCacheEntries,
    retries: 1,
    timeoutMs: 7000,
    onUnauthorized,
  });

  async function request(url, requestOptions = {}) {
    const withRange = appendRangeParam(url, state?.rangeDays);
    const method = String(requestOptions.method || "GET").toUpperCase();
    const shouldUseCache = method === "GET" && requestOptions.cache === true;
    const cacheTtlMs = Number.isFinite(requestOptions.cacheTtlMs)
      ? Number(requestOptions.cacheTtlMs)
      : defaultCacheTtlMs;
    const payload =
      requestOptions.body && typeof requestOptions.body === "object"
        ? { ...requestOptions.body, rangeDays: state?.rangeDays }
        : requestOptions.body;

    if (!requestOptions.silent && typeof onLoading === "function") {
      onLoading(true);
    }

    try {
      return await client.request(withRange, {
        method,
        body: payload,
        cache: shouldUseCache,
        cacheTtlMs,
        retries: Number.isInteger(requestOptions.retries) ? requestOptions.retries : 1,
        timeoutMs: Number.isFinite(requestOptions.timeoutMs)
          ? Number(requestOptions.timeoutMs)
          : 7000,
      });
    } finally {
      if (!requestOptions.silent && typeof onLoading === "function") {
        onLoading(false);
      }
    }
  }

  return {
    request,
    clearCache: client.clearCache,
  };
}

function appendRangeParam(url, rangeDays) {
  const value = String(url || "");
  if (!value.startsWith("/admin/api/")) return value;
  if (value.includes("rangeDays=")) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}rangeDays=${encodeURIComponent(rangeDays || 7)}`;
}

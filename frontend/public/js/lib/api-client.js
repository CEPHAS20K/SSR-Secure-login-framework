const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 300;

export function createApiClient(options = {}) {
  const axiosInstance = options.axiosInstance || window.axios || null;
  const fetchImpl =
    options.fetchImpl || (typeof window.fetch === "function" ? window.fetch.bind(window) : null);
  const onUnauthorized =
    typeof options.onUnauthorized === "function" ? options.onUnauthorized : () => {};
  const retries = Number.isInteger(options.retries) ? options.retries : DEFAULT_RETRIES;
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Number(options.retryDelayMs)
    : DEFAULT_RETRY_DELAY_MS;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const cache = options.cache || new Map();
  const pending = options.pending || new Map();
  const maxCacheEntries = Number.isFinite(options.maxCacheEntries)
    ? Number(options.maxCacheEntries)
    : 100;

  async function request(url, requestOptions = {}) {
    const method = String(requestOptions.method || "GET").toUpperCase();
    const shouldCache = method === "GET" && Boolean(requestOptions.cache);
    const cacheTtlMs = Number.isFinite(requestOptions.cacheTtlMs)
      ? Number(requestOptions.cacheTtlMs)
      : 0;
    const payload = requestOptions.data || requestOptions.body || null;
    const headers = requestOptions.headers || {};
    const computedTimeout = Number.isFinite(requestOptions.timeoutMs)
      ? Number(requestOptions.timeoutMs)
      : timeoutMs;
    const computedRetries = Number.isInteger(requestOptions.retries)
      ? requestOptions.retries
      : retries;
    const cacheKey = shouldCache
      ? `${method}:${url}:${payload ? JSON.stringify(payload) : ""}`
      : "";

    if (shouldCache) {
      const cached = readCache(cache, cacheKey);
      if (cached) return cached;
      if (pending.has(cacheKey)) return pending.get(cacheKey);
    }

    const runRequest = async () => {
      const responsePayload = await requestWithRetry({
        url,
        method,
        payload,
        headers,
        timeoutMs: computedTimeout,
        retries: computedRetries,
        retryDelayMs,
        axiosInstance,
        fetchImpl,
        onUnauthorized,
      });

      if (shouldCache && cacheTtlMs > 0) {
        writeCache(cache, cacheKey, responsePayload, cacheTtlMs, maxCacheEntries);
      } else if (method !== "GET") {
        clearCache(cache, pending);
      }
      return responsePayload;
    };

    const task = runRequest();
    if (shouldCache) pending.set(cacheKey, task);
    try {
      return await task;
    } finally {
      if (shouldCache) pending.delete(cacheKey);
    }
  }

  return {
    request,
    clearCache: () => clearCache(cache, pending),
  };
}

async function requestWithRetry(options) {
  const {
    url,
    method,
    payload,
    headers,
    timeoutMs,
    retries,
    retryDelayMs,
    axiosInstance,
    fetchImpl,
    onUnauthorized,
  } = options;

  let attempt = 0;
  let latestError = null;

  while (attempt <= retries) {
    try {
      const responsePayload = axiosInstance
        ? await executeAxiosRequest({
            axiosInstance,
            url,
            method,
            payload,
            headers,
            timeoutMs,
            onUnauthorized,
          })
        : await executeFetchRequest({
            fetchImpl,
            url,
            method,
            payload,
            headers,
            timeoutMs,
            onUnauthorized,
          });
      return responsePayload;
    } catch (error) {
      latestError = normalizeApiError(error);
      const canRetry = latestError.retryable && attempt < retries;
      if (!canRetry) {
        throw latestError;
      }
      await sleep(retryDelayMs * (attempt + 1));
      attempt += 1;
    }
  }

  throw latestError || new Error("Request failed.");
}

async function executeAxiosRequest(options) {
  const { axiosInstance, url, method, payload, headers, timeoutMs, onUnauthorized } = options;
  try {
    const response = await axiosInstance({
      url,
      method,
      data: payload,
      headers: payload ? { "Content-Type": "application/json", ...headers } : headers,
      timeout: timeoutMs,
    });
    return response.data || {};
  } catch (error) {
    if (error?.response?.status === 401) {
      onUnauthorized();
    }
    throw error;
  }
}

async function executeFetchRequest(options) {
  const { fetchImpl, url, method, payload, headers, timeoutMs, onUnauthorized } = options;
  if (!fetchImpl) {
    throw new Error("No HTTP client is available in this environment.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: payload ? { "Content-Type": "application/json", ...headers } : headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const responsePayload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      onUnauthorized();
    }
    if (!response.ok) {
      throw {
        response: {
          status: response.status,
          data: responsePayload,
        },
      };
    }
    return responsePayload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeApiError(error) {
  const status = Number(error?.response?.status || 0);
  const payload = error?.response?.data || {};
  const message =
    payload.error ||
    payload.message ||
    error?.message ||
    "Unable to complete request. Please try again.";

  const retryable =
    error?.code === "ECONNABORTED" || error?.name === "AbortError" || status >= 500 || status === 0;

  return {
    message,
    status,
    code: payload.code || error?.code || "",
    retryable,
  };
}

function readCache(cache, cacheKey) {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return deepClone(entry.payload);
}

function writeCache(cache, cacheKey, payload, ttlMs, maxEntries) {
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, {
    payload: deepClone(payload),
    expiresAt: Date.now() + ttlMs,
  });
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function clearCache(cache, pending) {
  cache.clear();
  pending.clear();
}

function deepClone(value) {
  if (typeof value === "undefined" || value === null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

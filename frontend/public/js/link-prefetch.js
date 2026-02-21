"use strict";

(() => {
  if (typeof document === "undefined") return;

  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const isConstrained =
    Boolean(connection?.saveData) ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";

  if (isConstrained) return;

  const prefetchedUrls = new Set();
  const runWhenIdle =
    typeof window.requestIdleCallback === "function"
      ? (cb) => window.requestIdleCallback(cb, { timeout: 1200 })
      : (cb) => window.setTimeout(cb, 250);

  const prefetchEligible = (href) => {
    if (!href || href.startsWith("#")) return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

    const targetUrl = new URL(href, window.location.href);
    if (targetUrl.origin !== window.location.origin) return false;
    if (targetUrl.pathname.startsWith("/admin/api/")) return false;
    if (targetUrl.pathname.startsWith("/api/")) return false;
    if (targetUrl.pathname.startsWith("/auth/")) return false;

    return true;
  };

  const prefetchUrl = (href) => {
    const targetUrl = new URL(href, window.location.href);
    const key = `${targetUrl.pathname}${targetUrl.search}`;
    if (prefetchedUrls.has(key)) return;
    prefetchedUrls.add(key);

    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = targetUrl.pathname + targetUrl.search;
    hint.as = "document";
    document.head.appendChild(hint);
  };

  const prefetchOnIdle = (href) => {
    runWhenIdle(() => {
      prefetchUrl(href);
    });
  };

  const trackedLinks = Array.from(document.querySelectorAll("a[href]"));
  trackedLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!prefetchEligible(href)) return;

    const onIntent = () => prefetchOnIdle(href);
    link.addEventListener("mouseenter", onIntent, { passive: true, once: true });
    link.addEventListener("focus", onIntent, { passive: true, once: true });
    link.addEventListener("touchstart", onIntent, { passive: true, once: true });
  });

  if (document.body?.dataset?.page === "landing") {
    prefetchOnIdle("/login");
    prefetchOnIdle("/register");
  }
})();

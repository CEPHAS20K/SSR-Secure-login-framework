"use strict";

(() => {
  if (!("serviceWorker" in navigator)) return;
  const script = document.currentScript;
  const version = script
    ? new URL(script.src, window.location.href).searchParams.get("v") || "1"
    : "1";
  const isLocalDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  if (isLocalDev) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`).catch(() => {});
  });
})();

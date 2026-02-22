"use strict";

(() => {
  const DISMISS_STORAGE_KEY = "auth_pwa_install_prompt_dismiss_until";
  const INSTALLED_STORAGE_KEY = "auth_pwa_installed";
  const DISMISS_DAYS = 7;
  const PROMPT_DELAY_MS = 1500;

  let deferredPromptEvent = null;
  let promptShown = false;

  if (!isLikelyMobile()) return;
  if (isDismissed()) return;

  init();

  async function init() {
    if (await isInstalledAppContext()) return;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPromptEvent = event;
      maybePromptInstall();
    });

    window.addEventListener("appinstalled", () => {
      try {
        window.localStorage.setItem(INSTALLED_STORAGE_KEY, "1");
        window.localStorage.removeItem(DISMISS_STORAGE_KEY);
      } catch (error) {
        // ignore storage failures
      }
    });

    maybePromptIosFallback();
  }

  function maybePromptIosFallback() {
    if (!isIosSafari()) return;
    window.setTimeout(() => {
      if (promptShown || isDismissed() || isRunningStandalone()) return;
      promptShown = true;
      const wantsHelp = window.confirm("Install Secure Storage Vault? Tap OK to see how.");
      if (wantsHelp) {
        window.alert("To install: tap Share, then Add to Home Screen.");
      } else {
        dismissForDays(DISMISS_DAYS);
      }
    }, PROMPT_DELAY_MS);
  }

  async function maybePromptInstall() {
    if (!deferredPromptEvent || promptShown) return;
    if (document.visibilityState !== "visible") return;
    if (await isInstalledAppContext()) return;

    window.setTimeout(async () => {
      if (!deferredPromptEvent || promptShown || isDismissed()) return;
      if (await isInstalledAppContext()) return;

      promptShown = true;
      const acceptedPrePrompt = window.confirm(
        "Install Secure Storage Vault for faster access and offline support?"
      );
      if (!acceptedPrePrompt) {
        dismissForDays(DISMISS_DAYS);
        return;
      }

      try {
        deferredPromptEvent.prompt();
        const result = await deferredPromptEvent.userChoice;
        deferredPromptEvent = null;
        if (result?.outcome !== "accepted") {
          dismissForDays(DISMISS_DAYS);
        }
      } catch (error) {
        dismissForDays(DISMISS_DAYS);
      }
    }, PROMPT_DELAY_MS);
  }

  async function isInstalledAppContext() {
    if (isRunningStandalone()) return true;

    if (typeof document.referrer === "string" && document.referrer.startsWith("android-app://")) {
      return true;
    }

    if (typeof navigator.getInstalledRelatedApps === "function") {
      try {
        const relatedApps = await navigator.getInstalledRelatedApps();
        if (Array.isArray(relatedApps) && relatedApps.length > 0) return true;
      } catch (error) {
        // ignore API failures
      }
    }

    try {
      return window.localStorage.getItem(INSTALLED_STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function dismissForDays(days) {
    const dismissUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(dismissUntil));
    } catch (error) {
      // ignore storage failures
    }
  }
})();

function isLikelyMobile() {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 900px)").matches;
  }
  return false;
}

function isRunningStandalone() {
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = window.navigator.standalone === true;
  return mediaStandalone || iosStandalone;
}

function isDismissed() {
  try {
    const value = window.localStorage.getItem("auth_pwa_install_prompt_dismiss_until");
    const dismissUntil = Number.parseInt(value || "0", 10);
    return Number.isFinite(dismissUntil) && dismissUntil > Date.now();
  } catch (error) {
    return false;
  }
}

function isIosSafari() {
  const userAgent = window.navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isWebKit = /WebKit/i.test(userAgent);
  const isCriOS = /CriOS/i.test(userAgent);
  const isFxiOS = /FxiOS/i.test(userAgent);
  return isIos && isWebKit && !isCriOS && !isFxiOS;
}

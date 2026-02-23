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
    maybePromptInsecureContextHelp();
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

  function maybePromptInsecureContextHelp() {
    if (isInstallPromptCapableContext()) return;

    window.setTimeout(() => {
      if (promptShown || isDismissed() || isRunningStandalone()) return;
      promptShown = true;

      const wantsHelp = window.confirm(
        "Install prompt is limited on this network address. Tap OK to see setup steps."
      );
      if (!wantsHelp) {
        dismissForDays(DISMISS_DAYS);
        return;
      }

      const secureHint = "Open the app over HTTPS to enable native install prompts.";
      if (isIosSafari()) {
        window.alert(
          `${secureHint}\n\nOn iPhone/iPad Safari: Share -> Add to Home Screen (when served over HTTPS).`
        );
        return;
      }

      window.alert(
        `${secureHint}\n\nOn Android Chrome: open the HTTPS URL, then use Install app / Add to Home screen.`
      );
    }, PROMPT_DELAY_MS);
  }

  async function maybePromptInstall() {
    if (!isInstallPromptCapableContext()) return;
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
  const ua = window.navigator.userAgent || "";
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport =
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1100px)").matches;
  return uaMobile || coarsePointer || narrowViewport;
}

function isInstallPromptCapableContext() {
  if (window.isSecureContext) return true;
  const hostname = String(window.location.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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

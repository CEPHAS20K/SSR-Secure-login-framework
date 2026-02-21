import { createModalFocusTrap } from "../../lib/modal-a11y.js";

export function createAdminUiHelpers(options = {}) {
  const { root, modal, modalTitle, modalMessage, adminFlash, adminLoading, state, setText } =
    options;

  const modalFocusTrap = createModalFocusTrap(modal, {
    onEscape: () => closeModal(),
  });

  function openModal({ title, message, onConfirm }) {
    if (!modal || !modalTitle || !modalMessage) return;

    state.pendingAction = onConfirm;
    setText(modalTitle, title);
    setText(modalMessage, message);

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    if (window.gsap) {
      gsap.fromTo(
        modal.querySelector("div"),
        { y: 20, autoAlpha: 0, scale: 0.97 },
        {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 0.2,
          ease: "power2.out",
          onComplete: () => modalFocusTrap.activate(),
        }
      );
      return;
    }

    modalFocusTrap.activate();
  }

  function closeModal() {
    if (!modal) return;
    state.pendingAction = null;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modalFocusTrap.deactivate();
  }

  function showFlash(message, tone = "info") {
    if (!adminFlash) return;

    const toneClasses = {
      success: "border-emerald-300 bg-emerald-50 text-emerald-800",
      error: "border-rose-300 bg-rose-50 text-rose-800",
      info: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
    };

    adminFlash.className =
      "pointer-events-none fixed left-1/2 top-20 z-50 w-[92vw] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-bold shadow-xl " +
      (toneClasses[tone] || toneClasses.info);
    setText(adminFlash, message);

    if (window.gsap) {
      gsap.killTweensOf(adminFlash);
      gsap.fromTo(
        adminFlash,
        { autoAlpha: 0, y: -10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.22,
          ease: "power2.out",
          onComplete: () => {
            gsap.to(adminFlash, {
              autoAlpha: 0,
              y: -8,
              delay: 2.2,
              duration: 0.24,
              ease: "power2.in",
            });
          },
        }
      );
    }
  }

  function setLoading(isLoading) {
    if (!adminLoading) return;

    state.loadingCount += isLoading ? 1 : -1;
    state.loadingCount = Math.max(state.loadingCount, 0);

    if (state.loadingCount > 0) {
      adminLoading.classList.remove("hidden");
      adminLoading.classList.add("flex");
      return;
    }

    adminLoading.classList.add("hidden");
    adminLoading.classList.remove("flex");
  }

  function animateIn() {
    if (!window.gsap || !root) return;

    const panels = root.querySelectorAll("section, aside");
    gsap.set(panels, { autoAlpha: 0, y: 18 });
    gsap.to(panels, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.06, ease: "power3.out" });
  }

  return {
    openModal,
    closeModal,
    showFlash,
    setLoading,
    animateIn,
  };
}

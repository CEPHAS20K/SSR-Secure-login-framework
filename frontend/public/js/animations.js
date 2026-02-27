document.addEventListener("DOMContentLoaded", () => {
  const page = document.body?.dataset?.page || "";
  const fromNavTransition = sessionStorage.getItem("auth_view_transition") === "nav_swap";

  const loadGsap = () =>
    new Promise((resolve) => {
      if (window.gsap) {
        resolve(window.gsap);
        return;
      }
      const script = document.createElement("script");
      const version = window.__assetVersion
        ? `?v=${encodeURIComponent(window.__assetVersion)}`
        : "";
      script.src = `/vendor/gsap.min.js${version}`;
      script.async = true;
      script.onload = () => resolve(window.gsap || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });

  const runAnimations = () => {
    const gsap = window.gsap;
    if (!gsap) return;

    sessionStorage.removeItem("auth_view_transition");
    sessionStorage.removeItem("auth_nav_transition");

    if (document.querySelector("#loginCard")) {
      const targets = ["#loginCard", "#loginTitle", ".login-field", "#loginBtn"];
      gsap.set(targets, { autoAlpha: 0, y: fromNavTransition ? 10 : 14 });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to("#loginCard", {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: fromNavTransition ? 0.16 : 0.24,
        })
        .to(
          "#loginTitle",
          { autoAlpha: 1, y: 0, duration: fromNavTransition ? 0.14 : 0.2 },
          "-=0.08"
        )
        .to(
          ".login-field",
          {
            autoAlpha: 1,
            y: 0,
            duration: fromNavTransition ? 0.12 : 0.2,
            stagger: fromNavTransition ? 0.02 : 0.04,
          },
          "-=0.06"
        )
        .to(
          "#loginBtn",
          { autoAlpha: 1, y: 0, duration: fromNavTransition ? 0.1 : 0.16 },
          "-=0.06"
        );
      return;
    }

    if (document.querySelector("#registerCard")) {
      const card = "#registerCard";
      const fields = ".register-field";

      gsap.set(card, {
        autoAlpha: 0,
        y: fromNavTransition ? 20 : 24,
        rotateX: fromNavTransition ? 4 : 5,
        transformOrigin: "50% 100%",
      });
      gsap.set("#registerTitle", { autoAlpha: 0, y: fromNavTransition ? 8 : 14 });
      gsap.set(fields, {
        autoAlpha: 0,
        x: (index) =>
          index % 2 === 0 ? (fromNavTransition ? -8 : -16) : fromNavTransition ? 8 : 16,
      });
      gsap.set("#registerBtn", { autoAlpha: 0, y: fromNavTransition ? 6 : 10 });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to(card, {
          autoAlpha: 1,
          y: 0,
          rotateX: 0,
          duration: fromNavTransition ? 0.18 : 0.28,
        })
        .to(
          "#registerTitle",
          { autoAlpha: 1, y: 0, duration: fromNavTransition ? 0.12 : 0.18 },
          "-=0.1"
        )
        .to(
          fields,
          {
            autoAlpha: 1,
            x: 0,
            duration: fromNavTransition ? 0.12 : 0.2,
            stagger: fromNavTransition ? 0.02 : 0.04,
          },
          "-=0.08"
        )
        .to(
          "#registerBtn",
          { autoAlpha: 1, y: 0, duration: fromNavTransition ? 0.1 : 0.14 },
          "-=0.06"
        );
      return;
    }

    const heroTargets = ["#hero-title", "#hero-copy", "#hero-note"].filter((selector) =>
      document.querySelector(selector)
    );
    if (!heroTargets.length) return;

    gsap.set(heroTargets, { autoAlpha: 0, y: 40 });
    gsap.timeline({ defaults: { ease: "power3.out", duration: 0.7 } }).to(heroTargets, {
      autoAlpha: 1,
      y: 0,
      stagger: 0.2,
    });
  };

  const targetSelector =
    page === "login" ? "#loginCard" : page === "register" ? "#registerCard" : "";
  const shouldLazyLoad =
    (page === "login" || page === "register") && typeof IntersectionObserver !== "undefined";

  if (shouldLazyLoad && targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        loadGsap().then(runAnimations);
      },
      { rootMargin: "0px 0px -40% 0px", threshold: 0.1 }
    );
    observer.observe(target);
    return;
  }

  if (window.gsap) {
    runAnimations();
    return;
  }

  loadGsap().then(runAnimations);
});

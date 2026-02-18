document.addEventListener("DOMContentLoaded", () => {
  if (!window.gsap) return;

  const fromNavTransition = sessionStorage.getItem("auth_view_transition") === "nav_swap";
  const fromOverlayTransition = sessionStorage.getItem("auth_nav_transition") === "1";
  const pageOverlay = document.getElementById("pageTransitionOverlay");
  const pageOverlayStroke = document.getElementById("pageTransitionStroke");
  sessionStorage.removeItem("auth_view_transition");
  sessionStorage.removeItem("auth_nav_transition");
  document.documentElement.removeAttribute("data-nav-transition");

  if (pageOverlay) {
    if (fromOverlayTransition) {
      const viewportWidth = Math.max(
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0
      );
      gsap.set(pageOverlay, {
        visibility: "visible",
        autoAlpha: 1,
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
      });

      if (pageOverlayStroke) {
        gsap.set(pageOverlayStroke, { autoAlpha: 1, x: Math.max(viewportWidth - 2, 0) });
      }

      const transitionTimeline = gsap
        .timeline({ defaults: { ease: "power3.inOut" } })
        .to(
          pageOverlay,
          {
            clipPath: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
            duration: 0.58,
          },
          0
        )
        .set(pageOverlay, {
          visibility: "hidden",
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        });

      if (pageOverlayStroke) {
        transitionTimeline
          .to(
            pageOverlayStroke,
            {
              x: viewportWidth + 18,
              autoAlpha: 0,
              duration: 0.58,
            },
            0
          )
          .set(pageOverlayStroke, { x: 0 });
      }
    } else {
      gsap.set(pageOverlay, {
        visibility: "hidden",
        autoAlpha: 1,
        clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
      });
      if (pageOverlayStroke) {
        gsap.set(pageOverlayStroke, { autoAlpha: 0, x: 0 });
      }
    }
  }

  if (document.querySelector("#loginCard")) {
    const loginParticles = document.getElementById("loginParticles");
    const targets = ["#loginCard", "#loginTitle", ".login-field", "#loginBtn"];
    gsap.set(targets, { autoAlpha: 0, y: fromNavTransition ? 28 : 18 });
    if (loginParticles) {
      gsap.set(loginParticles, { autoAlpha: 0.68 });
    }

    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .to("#loginCard", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: fromNavTransition ? 0.55 : 0.45,
      })
      .to("#loginTitle", { autoAlpha: 1, y: 0, duration: 0.35 }, "-=0.2")
      .to(".login-field", { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.08 }, "-=0.15")
      .to("#loginBtn", { autoAlpha: 1, y: 0, duration: 0.3 }, "-=0.12");

    if (loginParticles) {
      gsap.to(loginParticles, {
        autoAlpha: 0.9,
        duration: 1.8,
        delay: 0.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }
    return;
  }

  if (document.querySelector("#registerCard")) {
    const card = "#registerCard";
    const fields = ".register-field";

    gsap.set(card, {
      autoAlpha: 0,
      y: fromNavTransition ? 54 : 30,
      rotateX: fromNavTransition ? 12 : 6,
      transformOrigin: "50% 100%",
    });
    gsap.set("#registerTitle", { autoAlpha: 0, y: 18 });
    gsap.set(fields, { autoAlpha: 0, x: (index) => (index % 2 === 0 ? -20 : 20) });
    gsap.set("#registerBtn", { autoAlpha: 0, y: 12 });

    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .to(card, {
        autoAlpha: 1,
        y: 0,
        rotateX: 0,
        duration: fromNavTransition ? 0.7 : 0.55,
      })
      .to("#registerTitle", { autoAlpha: 1, y: 0, duration: 0.32 }, "-=0.38")
      .to(fields, { autoAlpha: 1, x: 0, duration: 0.34, stagger: 0.08 }, "-=0.2")
      .to("#registerBtn", { autoAlpha: 1, y: 0, duration: 0.25 }, "-=0.18");
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
});

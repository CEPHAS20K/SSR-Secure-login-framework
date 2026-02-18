document.addEventListener("DOMContentLoaded", () => {
  const hasGsap = Boolean(window.gsap);
  const navbar = document.getElementById("appNavbar");
  if (!navbar) return;

  const navShell = navbar.querySelector("[data-nav-shell]");
  const navLinks = navbar.querySelectorAll("[data-nav-link]");
  const navToggle = document.getElementById("navToggle");
  const navToggleBars = document.getElementById("navToggleBars");
  const mobileNav = document.getElementById("mobileNav");
  const authView = document.getElementById("authView");
  const pageOverlay = document.getElementById("pageTransitionOverlay");
  const pageOverlayStroke = document.getElementById("pageTransitionStroke");
  let isOpen = false;

  if (hasGsap) {
    gsap.set(navbar, { autoAlpha: 0, y: -20 });
    gsap.set(navLinks, { autoAlpha: 0, y: -8 });

    gsap
      .timeline({ defaults: { ease: "power2.out" } })
      .to(navbar, { autoAlpha: 1, y: 0, duration: 0.45 })
      .to(navLinks, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.08 }, "-=0.2");
  }

  navLinks.forEach((link) => {
    link.addEventListener("mouseenter", () => {
      if (!hasGsap) return;
      gsap.to(link, { y: -1, duration: 0.15, ease: "power1.out" });
    });
    link.addEventListener("mouseleave", () => {
      if (!hasGsap) return;
      gsap.to(link, { y: 0, duration: 0.15, ease: "power1.out" });
    });
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      event.preventDefault();

      if (mobileNav && !mobileNav.classList.contains("hidden")) {
        closeMobileMenu(false);
      }

      const navigate = () => {
        window.location.href = href;
      };

      sessionStorage.setItem("auth_nav_transition", "1");
      sessionStorage.setItem("auth_view_transition", "nav_swap");

      if (!hasGsap || !authView || !pageOverlay) {
        navigate();
        return;
      }

      const viewportWidth = Math.max(
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0
      );
      const transitionTimeline = gsap
        .timeline({ defaults: { ease: "power3.inOut" }, onComplete: navigate })
        .set(pageOverlay, {
          visibility: "visible",
          autoAlpha: 1,
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        });

      if (pageOverlayStroke) {
        transitionTimeline.set(pageOverlayStroke, { autoAlpha: 0, x: 0 }, 0).to(
          pageOverlayStroke,
          {
            autoAlpha: 1,
            x: Math.max(viewportWidth - 2, 0),
            duration: 0.56,
          },
          0
        );
      }

      transitionTimeline
        .to(
          pageOverlay,
          {
            clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
            duration: 0.56,
          },
          0
        )
        .to(authView, { y: -10, scale: 0.992, autoAlpha: 0.94, duration: 0.56 }, 0)
        .to(navbar, { y: -6, autoAlpha: 0.9, duration: 0.56 }, 0);
    });
  });

  const updateExpandedState = (open) => {
    if (!navToggle) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const openMobileMenu = () => {
    if (!mobileNav || isOpen) return;
    isOpen = true;
    updateExpandedState(true);
    mobileNav.classList.remove("hidden");

    if (!hasGsap) return;
    gsap.fromTo(
      mobileNav,
      { autoAlpha: 0, height: 0 },
      { autoAlpha: 1, height: "auto", duration: 0.25, ease: "power2.out" }
    );
    if (navToggleBars) {
      gsap.to(navToggleBars, { rotate: 90, duration: 0.2, ease: "power1.out" });
    }
  };

  const closeMobileMenu = (animate = true) => {
    if (!mobileNav || !isOpen) return;
    isOpen = false;
    updateExpandedState(false);

    if (!hasGsap || !animate) {
      mobileNav.classList.add("hidden");
      if (navToggleBars && hasGsap) gsap.set(navToggleBars, { rotate: 0 });
      return;
    }

    gsap.to(mobileNav, {
      autoAlpha: 0,
      height: 0,
      duration: 0.2,
      ease: "power1.in",
      onComplete: () => {
        mobileNav.classList.add("hidden");
        gsap.set(mobileNav, { clearProps: "height,opacity,visibility" });
      },
    });
    if (navToggleBars) {
      gsap.to(navToggleBars, { rotate: 0, duration: 0.2, ease: "power1.out" });
    }
  };

  if (navToggle && mobileNav) {
    navToggle.addEventListener("click", () => {
      if (isOpen) {
        closeMobileMenu();
        return;
      }
      openMobileMenu();
    });
  }

  document.addEventListener("click", (event) => {
    if (!isOpen || !navShell) return;
    if (navbar.contains(event.target)) return;
    closeMobileMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 640) {
      closeMobileMenu(false);
    }
  });
});

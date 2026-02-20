document.addEventListener("DOMContentLoaded", () => {
  const landingPage = document.getElementById("landingPage");
  if (!landingPage) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parallaxLayers = Array.from(landingPage.querySelectorAll("[data-parallax-speed]"));
  const sectionLinks = Array.from(landingPage.querySelectorAll('a[href^="#"]'));
  const heroVisual = document.getElementById("landingHeroVisual");
  const heroSvg = document.getElementById("landingHeroSvg");
  const heroCtaSvg = document.getElementById("heroCtaSvg");
  const heroTitle = document.getElementById("hero-title");
  const heroTitleLines = heroTitle
    ? Array.from(heroTitle.querySelectorAll("[data-typing-line]"))
    : [];
  const heroTitleCaret = document.getElementById("heroTitleCaret");
  const darkModeCards = Array.from(
    landingPage.querySelectorAll(
      "#features .feature-card, #security .security-shell, #security .security-step, #operations .ops-card"
    )
  );
  let darkModeCardPulseTween = null;

  for (const link of sectionLinks) {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  }

  const animateHeroVisual = () => {
    if (!heroVisual || !heroSvg || typeof window.gsap === "undefined") return;
    const gsap = window.gsap;

    if (prefersReducedMotion) {
      gsap.set(heroVisual, { opacity: 1, y: 0, x: 0 });
      gsap.set(heroSvg, {
        opacity: 0.88,
        y: 0,
        x: 0,
        rotate: 0,
        filter: "brightness(1.1) saturate(1.2)",
      });
      return;
    }

    heroSvg.style.animation = "none";
    gsap.killTweensOf(heroSvg);

    gsap.set(heroVisual, {
      transformPerspective: 900,
      transformOrigin: "50% 50%",
      transformStyle: "preserve-3d",
    });

    const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
    intro.fromTo(heroVisual, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1.1 }).fromTo(
      heroSvg,
      { opacity: 0, y: 42, x: -16, rotate: -5, filter: "blur(10px)" },
      {
        opacity: 0.88,
        y: 0,
        x: 0,
        rotate: 0,
        filter: "blur(0px) brightness(1.1) saturate(1.2)",
        duration: 1.35,
      },
      "-=0.8"
    );

    gsap.to(heroSvg, {
      keyframes: [
        { y: -18, x: 8, rotate: 1.1, duration: 1.3, ease: "sine.out" },
        { y: 0, x: 3, rotate: 0.2, duration: 0.95, ease: "bounce.out" },
        { y: -15, x: -9, rotate: -1.05, duration: 1.25, ease: "sine.out" },
        { y: 0, x: 0, rotate: 0, duration: 0.9, ease: "bounce.out" },
      ],
      repeat: -1,
      delay: 1.2,
      overwrite: "auto",
    });

    gsap.to(heroSvg, {
      opacity: 0.82,
      duration: 1.9,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: 1.2,
      overwrite: "auto",
    });

    const moveX = gsap.quickTo(heroVisual, "x", { duration: 0.45, ease: "power2.out" });
    const moveY = gsap.quickTo(heroVisual, "y", { duration: 0.45, ease: "power2.out" });

    heroVisual.addEventListener("mousemove", (event) => {
      const rect = heroVisual.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width - 0.5;
      const relY = (event.clientY - rect.top) / rect.height - 0.5;
      moveX(relX * 8);
      moveY(relY * 8);
    });

    heroVisual.addEventListener("mouseleave", () => {
      moveX(0);
      moveY(0);
    });
  };

  const animateHeroTitleTyping = () => {
    if (!heroTitleLines.length) return;

    const lineValues = heroTitleLines.map((line) => String(line.textContent || "").trim());
    const typingDelay = 170;
    const deletingDelay = 105;
    const betweenLinesDelay = 150;
    const afterDeleteLineDelay = 260;
    const fullWordPause = 1900;
    const fullDeletePause = 500;

    if (prefersReducedMotion) {
      heroTitleLines.forEach((line, index) => {
        line.textContent = lineValues[index] || "";
      });
      if (heroTitleCaret) {
        heroTitleCaret.style.opacity = "0.75";
      }
      return;
    }

    heroTitleLines.forEach((line) => {
      line.textContent = "";
    });

    if (heroTitleCaret) {
      heroTitleCaret.style.opacity = "1";
      if (window.gsap) {
        window.gsap.to(heroTitleCaret, {
          opacity: 0.25,
          duration: 0.65,
          ease: "none",
          repeat: -1,
          yoyo: true,
        });
      } else {
        window.setInterval(() => {
          heroTitleCaret.style.opacity = heroTitleCaret.style.opacity === "0.2" ? "1" : "0.2";
        }, 700);
      }
    }

    const hasContent = lineValues.some((value) => value.length > 0);
    if (!hasContent) return;

    let lineIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId = null;

    const schedule = (delay) => {
      timeoutId = window.setTimeout(step, delay);
    };

    const step = () => {
      const currentLine = heroTitleLines[lineIndex];
      const currentValue = lineValues[lineIndex] || "";
      if (!currentLine) {
        schedule(180);
        return;
      }

      if (!currentValue.length) {
        if (!isDeleting && lineIndex < heroTitleLines.length - 1) {
          lineIndex += 1;
          charIndex = 0;
          schedule(betweenLinesDelay);
          return;
        }
        if (isDeleting && lineIndex > 0) {
          lineIndex -= 1;
          charIndex = (lineValues[lineIndex] || "").length;
          schedule(afterDeleteLineDelay);
          return;
        }
        isDeleting = !isDeleting;
        schedule(fullDeletePause);
        return;
      }

      if (!isDeleting) {
        currentLine.textContent = currentValue.slice(0, charIndex + 1);
        charIndex += 1;

        if (charIndex < currentValue.length) {
          schedule(typingDelay);
          return;
        }

        if (lineIndex < heroTitleLines.length - 1) {
          lineIndex += 1;
          charIndex = 0;
          schedule(betweenLinesDelay);
          return;
        }

        isDeleting = true;
        schedule(fullWordPause);
        return;
      }

      currentLine.textContent = currentValue.slice(0, Math.max(0, charIndex - 1));
      charIndex = Math.max(0, charIndex - 1);

      if (charIndex > 0) {
        schedule(deletingDelay);
        return;
      }

      if (lineIndex > 0) {
        lineIndex -= 1;
        charIndex = (lineValues[lineIndex] || "").length;
        schedule(afterDeleteLineDelay);
        return;
      }

      isDeleting = false;
      schedule(fullDeletePause);
    };

    schedule(160);
  };

  const animateHeroCtaVisual = () => {
    if (!heroCtaSvg || typeof window.gsap === "undefined") return;
    const gsap = window.gsap;

    if (prefersReducedMotion) {
      gsap.set(heroCtaSvg, { y: 0, x: 0, rotate: 0, filter: "brightness(1)" });
      return;
    }

    heroCtaSvg.style.animation = "none";
    gsap.killTweensOf(heroCtaSvg);

    gsap.fromTo(
      heroCtaSvg,
      { autoAlpha: 0, y: 24, rotate: -2, filter: "blur(6px)" },
      {
        autoAlpha: 1,
        y: 0,
        rotate: 0,
        filter: "blur(0px) brightness(1.04) saturate(1.05)",
        duration: 0.95,
        ease: "power3.out",
      }
    );

    gsap.to(heroCtaSvg, {
      keyframes: [
        { y: -11, x: 7, rotate: 1.2, duration: 1.8, ease: "sine.inOut" },
        { y: -16, x: -4, rotate: -0.8, duration: 2.0, ease: "sine.inOut" },
        { y: -6, x: -8, rotate: -1, duration: 1.7, ease: "sine.inOut" },
        { y: 0, x: 0, rotate: 0, duration: 1.6, ease: "sine.inOut" },
      ],
      repeat: -1,
      delay: 0.3,
      overwrite: "auto",
    });
  };

  const animateAdvancedSections = () => {
    if (typeof window.gsap === "undefined") return;
    const gsap = window.gsap;
    const sectionCards = Array.from(
      landingPage.querySelectorAll(
        "#features .feature-card, #security .security-step, #operations .ops-card"
      )
    );
    if (!sectionCards.length) return;

    if (prefersReducedMotion) {
      gsap.set(sectionCards, {
        autoAlpha: 1,
        x: 0,
        y: 0,
      });
      return;
    }

    sectionCards.forEach((card, index) => {
      gsap.set(card, {
        autoAlpha: 0,
        x: index % 2 === 0 ? -12 : 12,
        y: 34 + (index % 3) * 5,
      });
    });

    const revealed = new WeakSet();
    const revealCard = (card, index) => {
      if (revealed.has(card)) return;
      revealed.add(card);

      const cardDelay = (index % 3) * 0.06;
      gsap
        .timeline({ delay: cardDelay })
        .fromTo(
          card,
          { clipPath: "inset(0 0 100% 0 round 24px)", filter: "blur(9px)" },
          {
            clipPath: "inset(0 0 0% 0 round 24px)",
            filter: "blur(0px)",
            duration: 0.95,
            ease: "power2.out",
          },
          0
        )
        .to(
          card,
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            duration: 0.78,
            ease: "power3.out",
          },
          0
        )
        .fromTo(
          card,
          { boxShadow: "0 0 0 rgba(120, 37, 58, 0)" },
          {
            boxShadow: "0 24px 44px rgba(120, 37, 58, 0.16)",
            duration: 1.05,
            ease: "power2.out",
          },
          0.06
        );

      gsap.to(card, {
        yPercent: -1.6,
        duration: 2.2 + (index % 3) * 0.25,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: 0.2 + cardDelay,
      });
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const index = sectionCards.indexOf(entry.target);
            revealCard(entry.target, Math.max(index, 0));
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -12% 0px" }
      );
      sectionCards.forEach((card) => observer.observe(card));
    } else {
      sectionCards.forEach((card, index) => revealCard(card, index));
    }

    sectionCards.forEach((card) => {
      const driftX = gsap.quickTo(card, "x", { duration: 0.34, ease: "power2.out" });
      const driftY = gsap.quickTo(card, "y", { duration: 0.34, ease: "power2.out" });

      card.addEventListener("mousemove", (event) => {
        const rect = card.getBoundingClientRect();
        const relX = (event.clientX - rect.left) / rect.width - 0.5;
        const relY = (event.clientY - rect.top) / rect.height - 0.5;
        const spotX = ((event.clientX - rect.left) / rect.width) * 100;
        const spotY = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty("--spot-x", `${spotX.toFixed(2)}%`);
        card.style.setProperty("--spot-y", `${spotY.toFixed(2)}%`);
        driftX(relX * 8);
        driftY(relY * 6 - 4);
      });

      card.addEventListener("mouseleave", () => {
        card.style.setProperty("--spot-x", "50%");
        card.style.setProperty("--spot-y", "50%");
        driftX(0);
        driftY(0);
      });
    });
  };

  const applyDarkModeCardGsap = () => {
    if (typeof window.gsap === "undefined" || prefersReducedMotion || !darkModeCards.length) return;
    const gsap = window.gsap;

    if (darkModeCardPulseTween) {
      darkModeCardPulseTween.kill();
      darkModeCardPulseTween = null;
    }

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (!isDark) {
      gsap.set(darkModeCards, { clearProps: "boxShadow" });
      return;
    }

    darkModeCardPulseTween = gsap.to(darkModeCards, {
      boxShadow:
        "0 18px 34px rgba(3, 8, 6, 0.46), 0 0 0 1px rgba(140, 168, 154, 0.22), 0 0 14px rgba(16, 185, 129, 0.2)",
      duration: 2.2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      stagger: { each: 0.08, from: "center" },
    });
  };

  animateHeroVisual();
  animateHeroTitleTyping();
  animateHeroCtaVisual();
  animateAdvancedSections();
  applyDarkModeCardGsap();
  window.addEventListener("auth:themechange", applyDarkModeCardGsap);

  if (!parallaxLayers.length || prefersReducedMotion) return;

  for (const layer of parallaxLayers) {
    layer.dataset.baseTransform = layer.dataset.baseTransform || "";
  }

  let ticking = false;

  const renderParallax = () => {
    const viewportCenter = window.innerHeight * 0.5;

    for (const layer of parallaxLayers) {
      const speed = Number.parseFloat(layer.dataset.parallaxSpeed || "0");
      const rect = layer.getBoundingClientRect();
      const layerCenter = rect.top + rect.height * 0.5;
      const distanceFromCenter = layerCenter - viewportCenter;
      const shiftY = -distanceFromCenter * speed;
      layer.style.setProperty("--parallax-shift", `${shiftY.toFixed(2)}px`);
    }
  };

  const queueRender = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      renderParallax();
      ticking = false;
    });
  };

  renderParallax();
  window.addEventListener("scroll", queueRender, { passive: true });
  window.addEventListener("resize", queueRender);
});

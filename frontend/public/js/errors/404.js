document.addEventListener("DOMContentLoaded", () => {
  if (!window.gsap) return;

  const scene = document.getElementById("errorScene");
  const code = document.getElementById("errorCode");
  const title = document.getElementById("errorTitle");
  const message = document.getElementById("errorMessage");
  const imageWrap = document.getElementById("errorIllustrationWrap");
  const image = document.getElementById("errorIllustration");
  const actions = document.getElementById("errorActions");
  const btnLogin = document.getElementById("errorBtnLogin");
  const btnRegister = document.getElementById("errorBtnRegister");
  const orbLeft = document.getElementById("errorOrbLeft");
  const orbRight = document.getElementById("errorOrbRight");

  if (!scene || !code || !title || !message || !imageWrap || !image || !actions) return;

  gsap.set([code, title, message, actions], { autoAlpha: 0, y: 24 });
  gsap.set(imageWrap, { autoAlpha: 0, y: 36, scale: 0.92, rotate: -2 });
  gsap.set([orbLeft, orbRight], { autoAlpha: 0 });

  gsap
    .timeline({ defaults: { ease: "power3.out" } })
    .to([orbLeft, orbRight], { autoAlpha: 1, duration: 0.5 }, 0)
    .to(code, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.04)
    .to(title, { autoAlpha: 1, y: 0, duration: 0.45 }, 0.12)
    .to(message, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.18)
    .to(imageWrap, { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 0.75 }, 0.22)
    .to(actions, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.34);

  if (btnLogin && btnRegister) {
    gsap.set([btnLogin, btnRegister], {
      boxShadow: "0 10px 28px rgba(15,23,42,0.20), 0 0 0 rgba(255,255,255,0)",
    });
  }

  // Continuous float/parallax motion for a dramatic 404 scene.
  gsap.to(image, {
    y: -10,
    rotate: 1.8,
    duration: 2.2,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  gsap.to(title, {
    y: -6,
    duration: 2.4,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  gsap.to(title, {
    textShadow: "0 0 26px rgba(255,255,255,0.85), 0 0 40px rgba(186,39,75,0.5)",
    duration: 2.1,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  if (btnLogin) {
    gsap.to(btnLogin, {
      y: -5,
      duration: 1.9,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    gsap.to(btnLogin, {
      boxShadow: "0 16px 34px rgba(186,39,75,0.35), 0 0 22px rgba(255,255,255,0.5)",
      duration: 2,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  if (btnRegister) {
    gsap.to(btnRegister, {
      y: -7,
      duration: 2.2,
      delay: 0.25,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    gsap.to(btnRegister, {
      boxShadow: "0 16px 34px rgba(166,42,149,0.3), 0 0 20px rgba(255,255,255,0.45)",
      duration: 2.3,
      delay: 0.25,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  gsap.to(orbLeft, {
    x: 22,
    y: -12,
    scale: 1.18,
    duration: 4,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  gsap.to(orbRight, {
    x: -18,
    y: 14,
    scale: 0.88,
    duration: 4.6,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  // Glitch pulse on the heading for a "crazy" 404 feel.
  const glitch = () => {
    gsap
      .timeline()
      .to(title, { x: -4, duration: 0.03, ease: "none" })
      .to(title, { x: 5, duration: 0.03, ease: "none" })
      .to(title, { x: -3, duration: 0.03, ease: "none" })
      .to(title, { x: 0, duration: 0.05, ease: "none" });
  };

  gsap.delayedCall(1.1, glitch);
  gsap.delayedCall(3.8, glitch);
  gsap.delayedCall(6.3, glitch);
});

const initAuthParticles = () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const effectiveType = connection?.effectiveType || "";
  const isDataSaver = Boolean(connection?.saveData);
  const deviceMemory = Number(navigator.deviceMemory || 0);
  const hasDeviceMemory = Number.isFinite(deviceMemory) && deviceMemory > 0;
  const memoryScale = !hasDeviceMemory
    ? 1
    : deviceMemory <= 2
      ? 0.5
      : deviceMemory <= 4
        ? 0.72
        : deviceMemory <= 8
          ? 0.88
          : 1;
  const isUltraLowMemory = hasDeviceMemory && deviceMemory <= 1;
  const isVerySlowConnection =
    effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";

  const scenes = Array.from(document.querySelectorAll("[data-auth-particles]"));
  if (!scenes.length) return;
  if (isDataSaver || isVerySlowConnection || isUltraLowMemory) return;

  const motionScale = prefersReducedMotion ? 0.45 : 1;
  const config = {
    maxParticles: Math.max(24, Math.round(104 * motionScale * memoryScale)),
    areaDensity: Math.round(8600 / Math.max(0.48, memoryScale)),
    minSize: 0.8,
    maxSize: 2.3,
    minSpeed: 0.02 * motionScale,
    maxSpeed: 0.1 * motionScale,
    linkDistance: prefersReducedMotion ? 120 : 160,
    trailScale: prefersReducedMotion ? 0.35 : 0.6,
  };

  const random = (min, max) => min + Math.random() * (max - min);

  const createScene = (canvas) => {
    const scene = canvas.closest("#authView");
    if (!scene) return null;

    const context = canvas.getContext("2d");
    if (!context) return null;

    const state = {
      canvas,
      scene,
      context,
      particles: [],
      width: 0,
      height: 0,
      dpr: 1,
      frameId: 0,
    };

    const createParticle = () => {
      const angle = random(0, Math.PI * 2);
      const speed = random(config.minSpeed, config.maxSpeed);
      return {
        x: random(0, state.width),
        y: random(0, state.height),
        px: random(0, state.width),
        py: random(0, state.height),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: random(config.minSize, config.maxSize),
        alpha: random(0.34, 0.86),
      };
    };

    const seedParticles = () => {
      const estimated = Math.round((state.width * state.height) / config.areaDensity);
      const minimumParticles = Math.max(18, Math.round(34 * motionScale * memoryScale));
      const count = Math.max(minimumParticles, Math.min(config.maxParticles, estimated));
      state.particles = Array.from({ length: count }, createParticle);
    };

    const resize = () => {
      const rect = state.scene.getBoundingClientRect();
      state.width = Math.max(1, Math.floor(rect.width));
      state.height = Math.max(1, Math.floor(rect.height));
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);

      state.canvas.width = Math.floor(state.width * state.dpr);
      state.canvas.height = Math.floor(state.height * state.dpr);
      state.canvas.style.width = `${state.width}px`;
      state.canvas.style.height = `${state.height}px`;
      state.context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

      seedParticles();
    };

    const drawParticle = (particle) => {
      const dx = particle.x - particle.px;
      const dy = particle.y - particle.py;
      const trailLength = (6 + particle.size * 4.5) * config.trailScale;
      const magnitude = Math.sqrt(dx * dx + dy * dy) || 1;
      const tx = particle.x - (dx / magnitude) * trailLength;
      const ty = particle.y - (dy / magnitude) * trailLength;

      state.context.beginPath();
      state.context.strokeStyle = `rgba(255, 214, 165, ${particle.alpha * 0.16})`;
      state.context.lineWidth = Math.max(0.6, particle.size * 0.45);
      state.context.moveTo(particle.x, particle.y);
      state.context.lineTo(tx, ty);
      state.context.stroke();

      state.context.beginPath();
      state.context.fillStyle = `rgba(255, 248, 233, ${particle.alpha})`;
      state.context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      state.context.fill();
    };

    const drawLinks = () => {
      for (let i = 0; i < state.particles.length; i += 1) {
        const source = state.particles[i];
        for (let j = i + 1; j < state.particles.length; j += 1) {
          const target = state.particles[j];
          const dx = source.x - target.x;
          const dy = source.y - target.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > config.linkDistance) continue;

          const opacity = (1 - distance / config.linkDistance) * 0.18;
          state.context.beginPath();
          state.context.strokeStyle = `rgba(255, 230, 190, ${opacity})`;
          state.context.lineWidth = 0.9;
          state.context.moveTo(source.x, source.y);
          state.context.lineTo(target.x, target.y);
          state.context.stroke();
        }
      }
    };

    const moveParticle = (particle) => {
      particle.px = particle.x;
      particle.py = particle.y;
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x <= 0 || particle.x >= state.width) particle.vx *= -1;
      if (particle.y <= 0 || particle.y >= state.height) particle.vy *= -1;
    };

    const tick = () => {
      state.context.clearRect(0, 0, state.width, state.height);
      for (const particle of state.particles) {
        moveParticle(particle);
        drawParticle(particle);
      }
      drawLinks();
      state.frameId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    };

    const start = () => {
      if (state.frameId) return;
      state.frameId = window.requestAnimationFrame(tick);
    };

    resize();
    start();

    return {
      resize,
      stop,
      start,
    };
  };

  const activeScenes = scenes.map(createScene).filter(Boolean);
  if (!activeScenes.length) return;

  const onResize = () => {
    activeScenes.forEach((scene) => scene.resize());
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      activeScenes.forEach((scene) => scene.stop());
      return;
    }
    activeScenes.forEach((scene) => scene.start());
  };

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthParticles, { once: true });
} else {
  initAuthParticles();
}

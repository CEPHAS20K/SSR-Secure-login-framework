document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("loginParticles");
  const scene = document.getElementById("authView");
  if (!canvas || !scene) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const config = {
    maxParticles: 95,
    areaDensity: 16000,
    minSize: 0.8,
    maxSize: 2.4,
    minSpeed: 0.04,
    maxSpeed: 0.2,
    linkDistance: 110,
  };

  let particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frameId = 0;

  const random = (min, max) => min + Math.random() * (max - min);

  const createParticle = () => {
    const angle = random(0, Math.PI * 2);
    const speed = random(config.minSpeed, config.maxSpeed);
    return {
      x: random(0, width),
      y: random(0, height),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: random(config.minSize, config.maxSize),
      alpha: random(0.4, 0.95),
    };
  };

  const seedParticles = () => {
    const estimated = Math.round((width * height) / config.areaDensity);
    const count = Math.max(28, Math.min(config.maxParticles, estimated));
    particles = Array.from({ length: count }, createParticle);
  };

  const resize = () => {
    const rect = scene.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    seedParticles();
  };

  const drawParticle = (particle) => {
    context.beginPath();
    context.fillStyle = `rgba(255, 239, 214, ${particle.alpha})`;
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
  };

  const drawLinks = () => {
    for (let i = 0; i < particles.length; i += 1) {
      const source = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const target = particles[j];
        const dx = source.x - target.x;
        const dy = source.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > config.linkDistance) continue;

        const opacity = (1 - distance / config.linkDistance) * 0.22;
        context.beginPath();
        context.strokeStyle = `rgba(255, 205, 150, ${opacity})`;
        context.lineWidth = 0.85;
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      }
    }
  };

  const moveParticle = (particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;

    if (particle.x <= 0 || particle.x >= width) particle.vx *= -1;
    if (particle.y <= 0 || particle.y >= height) particle.vy *= -1;
  };

  const tick = () => {
    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      moveParticle(particle);
      drawParticle(particle);
    }
    drawLinks();

    frameId = window.requestAnimationFrame(tick);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frameId);
      return;
    }
    frameId = window.requestAnimationFrame(tick);
  };

  resize();
  tick();

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibilityChange);
});

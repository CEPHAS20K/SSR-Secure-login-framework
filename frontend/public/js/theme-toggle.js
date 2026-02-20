(() => {
  const THEME_KEY = "auth_theme";
  const root = document.documentElement;

  const resolveTheme = () => {
    const current = root.getAttribute("data-theme");
    if (current === "dark" || current === "light") {
      return current;
    }

    try {
      const storedTheme = localStorage.getItem(THEME_KEY);
      if (storedTheme === "dark" || storedTheme === "light") {
        return storedTheme;
      }
    } catch (error) {}

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const setTheme = (theme, persist = true) => {
    const nextTheme = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", nextTheme);

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch (error) {}
    }

    const isDark = nextTheme === "dark";
    const labels = document.querySelectorAll("[data-theme-label]");
    const icons = document.querySelectorAll("[data-theme-icon]");
    const toggles = document.querySelectorAll("[data-theme-toggle]");

    labels.forEach((label) => {
      label.textContent = isDark ? "Light" : "Dark";
    });

    icons.forEach((icon) => {
      icon.textContent = isDark ? "light_mode" : "dark_mode";
    });

    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-pressed", isDark ? "true" : "false");
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    });

    window.dispatchEvent(
      new CustomEvent("auth:themechange", {
        detail: { theme: nextTheme },
      })
    );
  };

  document.addEventListener("DOMContentLoaded", () => {
    const toggles = document.querySelectorAll("[data-theme-toggle]");
    if (!toggles.length) return;

    setTheme(resolveTheme(), false);

    toggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const nextTheme = resolveTheme() === "dark" ? "light" : "dark";
        setTheme(nextTheme, true);
      });
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY || !event.newValue) return;
    setTheme(event.newValue, false);
  });
})();

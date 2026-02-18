module.exports = {
  content: ["./views/**/*.pug", "./public/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#ba274b",
        secondary: "#a62a95",
        accent: "#ff7700",
      },
      fontFamily: {
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Playfair Display", "ui-serif", "Georgia", "serif"],
        headline: ["Bebas Neue", "Impact", "ui-sans-serif", "sans-serif"],
        mono: ["Fira Code", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

module.exports = {
  multipass: true,
  js2svg: {
    pretty: false,
  },
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false,
        },
      },
    },
    "removeDimensions",
  ],
};

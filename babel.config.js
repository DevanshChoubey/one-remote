module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // matter.js freezes its model objects and keeps state in `#private` fields. The loose
        // transform that React Native uses turns those into plain properties, which a frozen
        // object refuses to write, so these packages get the spec-compliant (WeakMap) one.
        test: /node_modules[\\/](@matter|@project-chip)[\\/]/,
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: false }],
          ['@babel/plugin-transform-private-methods', { loose: false }],
          ['@babel/plugin-transform-private-property-in-object', { loose: false }],
        ],
      },
    ],
  };
};

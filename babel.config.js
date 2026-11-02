// React Native's codegen plugin treats any export named `Commands` as a native-commands export and
// throws. matter.js has an unrelated function of that name, so give the local binding another name
// (the exported name stays the same).
function renameCommands() {
  return {
    visitor: {
      Program(path) {
        if (path.scope.hasOwnBinding('Commands')) path.scope.rename('Commands', 'MatterCommands');
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // matter.js freezes its model objects and keeps state in `#private` fields. The loose
        // transform that React Native uses turns those into plain properties, which a frozen
        // object refuses to write, so these packages get the spec-compliant (WeakMap) one.
        test: (file) =>
          typeof file === 'string' && /node_modules[\\/](@matter|@project-chip)[\\/]/.test(file),
        plugins: [
          renameCommands,
          ['@babel/plugin-transform-class-properties', { loose: false }],
          ['@babel/plugin-transform-private-methods', { loose: false }],
          ['@babel/plugin-transform-private-property-in-object', { loose: false }],
        ],
      },
    ],
  };
};

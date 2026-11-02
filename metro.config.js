const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// matter.js loads some modules with a computed `import(path)`, which Metro cannot bundle. The
// package ships a static variant of the loader for bundlers; use it.
const staticLoad = path.join(__dirname, 'node_modules/@matter/node/dist/esm/loader/static.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@matter/node/load') return { type: 'sourceFile', filePath: staticLoad };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;

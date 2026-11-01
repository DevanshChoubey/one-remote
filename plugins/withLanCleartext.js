const { withAndroidManifest } = require('expo/config-plugins');

/** Release builds block plain `ws://` and `http://` (target SDK 28+), which LG port 3000 and
 *  Samsung port 8001 use. Android has no rule for "local IPs only", so this allows cleartext
 *  app-wide; modules/lan-socket refuses any host that is not a literal local IP. */
function allowCleartext(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error('withLanCleartext: AndroidManifest.xml has no <application>');
  app.$['android:usesCleartextTraffic'] = 'true';
  return manifest;
}

function withLanCleartext(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = allowCleartext(c.modResults);
    return c;
  });
}

module.exports = withLanCleartext;
module.exports.allowCleartext = allowCleartext;

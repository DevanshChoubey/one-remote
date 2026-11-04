const { withAndroidManifest } = require('expo/config-plugins');

/**
 * expo-camera scans QR codes with Google ML Kit's bundled model, which runs on the phone. ML Kit
 * also logs usage to Google through Firebase datatransport, and its only way off the phone is the
 * CCT backend that datatransport finds through the TransportBackendDiscovery service. Removing
 * that service from the merged manifest leaves datatransport with no backend, so it drops every
 * event. The schedulers stay, because JobScheduler throws for a service that is not declared.
 *
 * It also drops the `barcode_ui` dependency note, which asks Play services to download Google's
 * own scanner UI (unused). expo-camera's unused document scanner stays: the module ships prebuilt,
 * so its `expo.camera.document-scanner-enabled` property has no effect, and its logging goes
 * through the same removed backend.
 */
const TOOLS = 'http://schemas.android.com/tools';
const BACKEND_DISCOVERY =
  'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery';
const MLKIT_DEPENDENCIES = 'com.google.mlkit.vision.DEPENDENCIES';

/** Marks the datatransport backend and the scanner-UI download note as removed, once. */
function removeGoogleTelemetry(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error('withNoGoogleTelemetry: AndroidManifest.xml has no <application>');
  manifest.manifest.$['xmlns:tools'] = TOOLS;

  const services = (app.service ??= []);
  if (!services.some((s) => s.$['android:name'] === BACKEND_DISCOVERY)) {
    services.push({ $: { 'android:name': BACKEND_DISCOVERY, 'tools:node': 'remove' } });
  }
  const meta = (app['meta-data'] ??= []);
  if (!meta.some((m) => m.$['android:name'] === MLKIT_DEPENDENCIES)) {
    meta.push({ $: { 'android:name': MLKIT_DEPENDENCIES, 'tools:node': 'remove' } });
  }
  return manifest;
}

function withNoGoogleTelemetry(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = removeGoogleTelemetry(c.modResults);
    return c;
  });
}

module.exports = withNoGoogleTelemetry;
module.exports.removeGoogleTelemetry = removeGoogleTelemetry;
module.exports.BACKEND_DISCOVERY = BACKEND_DISCOVERY;

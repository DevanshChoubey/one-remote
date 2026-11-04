const { withAndroidManifest } = require('expo/config-plugins');

/**
 * One Remote never asks for location. react-native-ble-plx declares ACCESS_FINE_LOCATION and
 * ACCESS_COARSE_LOCATION for Bluetooth scans on older Android, and other libraries can add them
 * too. Bluetooth scanning uses BLUETOOTH_SCAN with neverForLocation instead, so both permissions
 * are deleted from the manifest and marked removed so the merged manifest drops them as well.
 * Mods run in reverse order of the plugins list, so app.json lists this plugin before ble-plx.
 */
const TOOLS = 'http://schemas.android.com/tools';
const LOCATION = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
];

/** Replaces any location entries in a permission list with remove markers. */
function replaceWithRemoved(list) {
  const kept = list.filter((n) => !LOCATION.includes(n.$['android:name']));
  return [
    ...kept,
    ...LOCATION.map((name) => ({ $: { 'android:name': name, 'tools:node': 'remove' } })),
  ];
}

function removeLocation(manifest) {
  const root = manifest.manifest;
  root.$['xmlns:tools'] = TOOLS;
  root['uses-permission-sdk-23'] = replaceWithRemoved(root['uses-permission-sdk-23'] ?? []);
  root['uses-permission'] = replaceWithRemoved(root['uses-permission'] ?? []);
  return manifest;
}

function withNoLocation(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = removeLocation(c.modResults);
    return c;
  });
}

module.exports = withNoLocation;
module.exports.removeLocation = removeLocation;

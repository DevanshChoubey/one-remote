// From aer-remote (plugins/withNoPushEntitlement.js), extended with the Android Firebase removals.
const { withEntitlementsPlist, withAndroidManifest } = require('expo/config-plugins');

/**
 * One Remote only schedules local notifications, so it has no push. On iOS, expo-notifications adds
 * the aps-environment entitlement, which a free Apple ID can't sign. On Android it pulls in the
 * Firebase messaging services, receiver, discovery service, init provider and the c2dm permission. All of them are removed again.
 * Mods run in reverse order of the plugins list, so app.json lists this plugin before
 * expo-notifications to make it run after.
 */
const TOOLS = 'http://schemas.android.com/tools';
const SERVICES = [
  'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  'com.google.firebase.messaging.FirebaseMessagingService',
  // Firebase's component discovery registers messaging, installations and datatransport. Nothing
  // here initialises a FirebaseApp (no google-services.json), so it would never reach the network;
  // it is removed anyway, so the release manifest carries no Firebase.
  'com.google.firebase.components.ComponentDiscoveryService',
];
const PROVIDERS = ['com.google.firebase.provider.FirebaseInitProvider'];
const RECEIVERS = ['com.google.firebase.iid.FirebaseInstanceIdReceiver'];
const PERMISSIONS = ['com.google.android.c2dm.permission.RECEIVE'];

function removePushEntitlement(entitlements) {
  const { 'aps-environment': _removed, ...rest } = entitlements;
  return rest;
}

/** Adds a `tools:node="remove"` entry for each name, unless the list already has that name. */
function markRemoved(list, names) {
  for (const name of names) {
    const existing = list.find((n) => n.$['android:name'] === name);
    if (existing) existing.$['tools:node'] = 'remove';
    else list.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
  }
}

/** Marks the Firebase messaging services, receiver and permission as removed, once. */
function removeFirebaseMessaging(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error('withNoPush: AndroidManifest.xml has no <application>');
  manifest.manifest.$['xmlns:tools'] = TOOLS;
  markRemoved((app.service ??= []), SERVICES);
  markRemoved((app.receiver ??= []), RECEIVERS);
  markRemoved((app.provider ??= []), PROVIDERS);
  markRemoved((manifest.manifest['uses-permission'] ??= []), PERMISSIONS);
  return manifest;
}

function withNoPush(config) {
  const withIos = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults = removePushEntitlement(cfg.modResults);
    return cfg;
  });
  return withAndroidManifest(withIos, (cfg) => {
    cfg.modResults = removeFirebaseMessaging(cfg.modResults);
    return cfg;
  });
}

module.exports = withNoPush;
module.exports.removePushEntitlement = removePushEntitlement;
module.exports.removeFirebaseMessaging = removeFirebaseMessaging;

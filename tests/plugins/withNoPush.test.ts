// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withNoPush') as {
  removePushEntitlement: (e: Record<string, unknown>) => Record<string, unknown>;
  removeFirebaseMessaging: (manifest: Manifest) => Manifest;
};

type Node = { $: Record<string, string> };
type Manifest = {
  manifest: {
    $: Record<string, string>;
    'uses-permission'?: Node[];
    application?: {
      $: Record<string, string>;
      service?: Node[];
      receiver?: Node[];
      provider?: Node[];
    }[];
  };
};

const manifest = (): Manifest => ({
  manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' } }] },
});

const removed = (name: string): Node => ({ $: { 'android:name': name, 'tools:node': 'remove' } });

describe('withNoPush', () => {
  it('drops the push entitlement and keeps the rest', () => {
    expect(plugin.removePushEntitlement({ 'aps-environment': 'development', x: 1 })).toEqual({
      x: 1,
    });
  });

  it('removes the Firebase messaging services, receiver and permission', () => {
    const out = plugin.removeFirebaseMessaging(manifest());
    const app = out.manifest.application?.[0];
    expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(app?.service).toEqual([
      removed('expo.modules.notifications.service.ExpoFirebaseMessagingService'),
      removed('com.google.firebase.messaging.FirebaseMessagingService'),
      removed('com.google.firebase.components.ComponentDiscoveryService'),
    ]);
    expect(app?.provider).toEqual([removed('com.google.firebase.provider.FirebaseInitProvider')]);
    expect(app?.receiver).toEqual([removed('com.google.firebase.iid.FirebaseInstanceIdReceiver')]);
    expect(out.manifest['uses-permission']).toEqual([
      removed('com.google.android.c2dm.permission.RECEIVE'),
    ]);
  });

  it('changes nothing when run again', () => {
    const once = plugin.removeFirebaseMessaging(manifest());
    expect(plugin.removeFirebaseMessaging(structuredClone(once))).toEqual(once);
  });

  it('throws when the manifest has no application', () => {
    expect(() => plugin.removeFirebaseMessaging({ manifest: { $: {} } })).toThrow('withNoPush');
  });
});

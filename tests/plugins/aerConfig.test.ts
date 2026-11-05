import { execFileSync } from 'child_process';
import * as path from 'path';

type Node = { $: Record<string, string> };
type Compiled = {
  entitlements: Record<string, unknown> | null;
  infoPlist: Record<string, unknown> | null;
  manifest: {
    manifest: {
      'uses-permission'?: Node[];
      'uses-permission-sdk-23'?: Node[];
      application?: { service?: Node[]; receiver?: Node[]; provider?: Node[] }[];
    };
  } | null;
};

const BLUETOOTH_TEXT =
  'One Remote uses Bluetooth to find and control your air freshener in the room.';

// Mods run in reverse order of the plugins list, so the order in app.json decides who wins. The
// compile runs in its own Node process: inside Jest, Expo's lazy test globals throw once the test
// has finished.
function compile(): Compiled {
  const projectRoot = path.resolve(__dirname, '../..');
  const script = `
    // Both come through expo itself (expo-doctor flags them as direct dependencies).
    const fromExpo = (name) => require(require.resolve(name, { paths: [require.resolve('expo/package.json')] }));
    const { getPrebuildConfigAsync } = fromExpo('@expo/prebuild-config');
    const { compileModsAsync, withBaseMod } = require('expo/config-plugins');
    (async () => {
      const root = process.argv[1];
      let { exp } = await getPrebuildConfigAsync(root, { platforms: ['ios', 'android'] });
      // Introspection does not keep the manifest on the config, so a mod added before the base
      // mods are installed wraps every other manifest mod and reads the final result.
      let manifest = null;
      exp = withBaseMod(exp, {
        platform: 'android', mod: 'manifest', isProvider: false,
        action: async ({ modRequest: { nextMod, ...request }, ...rest }) => {
          const results = await nextMod({ modRequest: request, ...rest });
          manifest = results.modResults;
          return results;
        },
      });
      const compiled = await compileModsAsync(exp, {
        projectRoot: root, introspect: true, platforms: ['ios', 'android'],
        assertMissingModProviders: false,
      });
      process.stdout.write(JSON.stringify({
        entitlements: compiled.ios?.entitlements ?? null,
        infoPlist: compiled.ios?.infoPlist ?? null,
        manifest,
      }));
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  const out = execFileSync(process.execPath, ['-e', script, projectRoot], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as Compiled;
}

describe('aer native config', () => {
  let compiled: Compiled;
  beforeAll(() => {
    compiled = compile();
  }, 60_000);
  const man = () => compiled.manifest?.manifest;
  const named = (list: Node[] | undefined, name: string) =>
    (list ?? []).filter((n) => n.$['android:name'] === name);

  it('leaves no push entitlement on iOS', () => {
    expect(compiled.entitlements).not.toBeNull();
    expect(compiled.entitlements).not.toHaveProperty('aps-environment');
  });

  it('explains Bluetooth use on iOS', () => {
    expect(compiled.infoPlist?.NSBluetoothAlwaysUsageDescription).toBe(BLUETOOTH_TEXT);
  });

  it('asks for scan with neverForLocation and for connect on Android', () => {
    const scan = named(man()?.['uses-permission'], 'android.permission.BLUETOOTH_SCAN');
    expect(scan[0]?.$['android:usesPermissionFlags']).toBe('neverForLocation');
    expect(named(man()?.['uses-permission'], 'android.permission.BLUETOOTH_CONNECT')).not.toEqual(
      [],
    );
  });

  it('declares no location permission without a remove marker', () => {
    const lists = [man()?.['uses-permission'], man()?.['uses-permission-sdk-23']];
    for (const list of lists) {
      for (const n of list ?? []) {
        if (/ACCESS_(FINE|COARSE)_LOCATION$/.test(n.$['android:name'] ?? '')) {
          expect(n.$['tools:node']).toBe('remove');
        }
      }
    }
    expect(compiled.manifest).not.toBeNull();
  });

  it('removes the Firebase messaging entries', () => {
    const app = man()?.application?.[0];
    expect(
      named(app?.service, 'expo.modules.notifications.service.ExpoFirebaseMessagingService')[0]?.$[
        'tools:node'
      ],
    ).toBe('remove');
    expect(
      named(app?.service, 'com.google.firebase.messaging.FirebaseMessagingService')[0]?.$[
        'tools:node'
      ],
    ).toBe('remove');
    expect(
      named(app?.receiver, 'com.google.firebase.iid.FirebaseInstanceIdReceiver')[0]?.$[
        'tools:node'
      ],
    ).toBe('remove');
    expect(
      named(man()?.['uses-permission'], 'com.google.android.c2dm.permission.RECEIVE')[0]?.$[
        'tools:node'
      ],
    ).toBe('remove');
  });

  it('removes the Firebase component discovery service and init provider', () => {
    const app = man()?.application?.[0];
    expect(
      named(app?.service, 'com.google.firebase.components.ComponentDiscoveryService')[0]?.$[
        'tools:node'
      ],
    ).toBe('remove');
    expect(
      named(app?.provider, 'com.google.firebase.provider.FirebaseInitProvider')[0]?.$['tools:node'],
    ).toBe('remove');
  });

  it('keeps the datatransport backend removal', () => {
    const svc = named(
      man()?.application?.[0]?.service,
      'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery',
    );
    expect(svc[0]?.$['tools:node']).toBe('remove');
  });
});

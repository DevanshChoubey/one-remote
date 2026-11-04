// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withNoLocation') as {
  removeLocation: (manifest: Manifest) => Manifest;
};

type Node = { $: Record<string, string> };
type Manifest = {
  manifest: {
    $: Record<string, string>;
    'uses-permission'?: Node[];
    'uses-permission-sdk-23'?: Node[];
  };
};

const FINE = 'android.permission.ACCESS_FINE_LOCATION';
const COARSE = 'android.permission.ACCESS_COARSE_LOCATION';
const perm = (name: string): Node => ({ $: { 'android:name': name } });
const removed = (name: string): Node => ({ $: { 'android:name': name, 'tools:node': 'remove' } });

const manifest = (): Manifest => ({
  manifest: {
    $: {},
    'uses-permission': [perm('android.permission.BLUETOOTH_SCAN'), perm(FINE)],
    'uses-permission-sdk-23': [perm(COARSE), perm(FINE), perm('android.permission.OTHER')],
  },
});

describe('withNoLocation', () => {
  it('replaces location permissions with remove markers in both lists', () => {
    const out = plugin.removeLocation(manifest());
    expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(out.manifest['uses-permission']).toEqual([
      perm('android.permission.BLUETOOTH_SCAN'),
      removed(FINE),
      removed(COARSE),
    ]);
    expect(out.manifest['uses-permission-sdk-23']).toEqual([
      perm('android.permission.OTHER'),
      removed(FINE),
      removed(COARSE),
    ]);
  });

  it('adds the markers when the lists are missing', () => {
    const out = plugin.removeLocation({ manifest: { $: {} } });
    expect(out.manifest['uses-permission']).toEqual([removed(FINE), removed(COARSE)]);
    expect(out.manifest['uses-permission-sdk-23']).toEqual([removed(FINE), removed(COARSE)]);
  });

  it('changes nothing when run again', () => {
    const once = plugin.removeLocation(manifest());
    expect(plugin.removeLocation(structuredClone(once))).toEqual(once);
  });
});

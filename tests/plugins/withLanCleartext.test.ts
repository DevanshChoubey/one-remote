// eslint-disable-next-line @typescript-eslint/no-require-imports
const { allowCleartext } = require('../../plugins/withLanCleartext') as {
  allowCleartext: (manifest: Manifest) => Manifest;
};

type Manifest = { manifest: { application?: { $: Record<string, string> }[] } };

const manifest = (): Manifest => ({
  manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] },
});

describe('withLanCleartext', () => {
  it('sets usesCleartextTraffic on the application and keeps its other attributes', () => {
    const app = allowCleartext(manifest()).manifest.application?.[0]?.$ ?? {};
    expect(app['android:usesCleartextTraffic']).toBe('true');
    expect(app['android:name']).toBe('.MainApplication');
  });

  it('changes nothing when run again', () => {
    const once = allowCleartext(manifest());
    expect(allowCleartext(once)).toEqual(once);
  });

  it('throws when the manifest has no application', () => {
    expect(() => allowCleartext({ manifest: {} })).toThrow('withLanCleartext');
  });
});

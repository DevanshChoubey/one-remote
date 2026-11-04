// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withNoGoogleTelemetry') as {
  removeGoogleTelemetry: (manifest: Manifest) => Manifest;
  BACKEND_DISCOVERY: string;
};

type Node = { $: Record<string, string> };
type Manifest = {
  manifest: {
    $: Record<string, string>;
    application?: { $: Record<string, string>; service?: Node[]; 'meta-data'?: Node[] }[];
  };
};

const manifest = (): Manifest => ({
  manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' } }] },
});

describe('withNoGoogleTelemetry', () => {
  it('removes the datatransport backend so ML Kit logs cannot leave the phone', () => {
    const out = plugin.removeGoogleTelemetry(manifest());
    expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(out.manifest.application?.[0]?.service).toEqual([
      {
        $: {
          'android:name':
            'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery',
          'tools:node': 'remove',
        },
      },
    ]);
  });

  it('removes the request to download Google scanner UI', () => {
    const meta = plugin.removeGoogleTelemetry(manifest()).manifest.application?.[0]?.['meta-data'];
    expect(meta).toEqual([
      { $: { 'android:name': 'com.google.mlkit.vision.DEPENDENCIES', 'tools:node': 'remove' } },
    ]);
  });

  it('changes nothing when run again', () => {
    const once = plugin.removeGoogleTelemetry(manifest());
    expect(plugin.removeGoogleTelemetry(structuredClone(once))).toEqual(once);
  });

  it('throws when the manifest has no application', () => {
    expect(() => plugin.removeGoogleTelemetry({ manifest: { $: {} } })).toThrow(
      'withNoGoogleTelemetry',
    );
  });
});

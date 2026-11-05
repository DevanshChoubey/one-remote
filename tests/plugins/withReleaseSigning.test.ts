// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withReleaseSigning') as {
  addReleaseSigning: (buildGradle: string) => string;
  SIGNING_VARS: string[];
};

const gradle = 'android {\n    buildTypes {}\n}\n';

describe('withReleaseSigning', () => {
  it('signs release builds with the upload key when its four variables are set', () => {
    const out = plugin.addReleaseSigning(gradle);
    expect(out.startsWith(gradle)).toBe(true);
    expect(plugin.SIGNING_VARS).toEqual([
      'ONE_REMOTE_UPLOAD_STORE_FILE',
      'ONE_REMOTE_UPLOAD_STORE_PASSWORD',
      'ONE_REMOTE_UPLOAD_KEY_ALIAS',
      'ONE_REMOTE_UPLOAD_KEY_PASSWORD',
    ]);
    for (const name of plugin.SIGNING_VARS) expect(out).toContain(`'${name}'`);
    expect(out).toMatch(/if \(oneRemoteSigning\.every \{ it \}\)/);
    expect(out).toContain(
      'android.buildTypes.release.signingConfig = android.signingConfigs.oneRemoteUpload',
    );
  });

  it('adds the block once and holds no secrets', () => {
    const once = plugin.addReleaseSigning(gradle);
    expect(plugin.addReleaseSigning(once)).toBe(once);
    expect(once).not.toMatch(/\.jks|\.keystore|password\s*=/i);
  });
});

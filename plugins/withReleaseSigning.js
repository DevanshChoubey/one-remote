const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Release builds are signed with the upload key when all four variables are set, read from the
 * environment or from gradle properties (for example ~/.gradle/gradle.properties). Without them
 * release builds keep the debug key, so anyone can still build one, but Play rejects it. The key
 * and its passwords never live in the repo.
 */
const SIGNING_VARS = [
  'ONE_REMOTE_UPLOAD_STORE_FILE',
  'ONE_REMOTE_UPLOAD_STORE_PASSWORD',
  'ONE_REMOTE_UPLOAD_KEY_ALIAS',
  'ONE_REMOTE_UPLOAD_KEY_PASSWORD',
];

const MARKER = '// one-remote: release signing';

const BLOCK = `
${MARKER}
def oneRemoteSigning = [${SIGNING_VARS.map((name) => `'${name}'`).join(', ')}].collect {
    System.getenv(it) ?: findProperty(it)
}
if (oneRemoteSigning.every { it }) {
    android.signingConfigs.create('oneRemoteUpload') {
        storeFile file(oneRemoteSigning[0])
        storePassword oneRemoteSigning[1]
        keyAlias oneRemoteSigning[2]
        keyPassword oneRemoteSigning[3]
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.oneRemoteUpload
}
`;

/** Appends the release signing config to an app build.gradle, once. */
function addReleaseSigning(buildGradle) {
  return buildGradle.includes(MARKER) ? buildGradle : buildGradle + BLOCK;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
module.exports.SIGNING_VARS = SIGNING_VARS;

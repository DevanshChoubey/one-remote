const { withMainActivity } = require('expo/config-plugins');

const MARKER = '// one-remote: volume keys';

const OVERRIDE = `
  ${MARKER}
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (expo.modules.volumekeys.VolumeKeys.handle(event)) return true
    return super.dispatchKeyEvent(event)
  }
`;

/** Adds the `dispatchKeyEvent` override to MainActivity.kt; running it again changes nothing. */
function addVolumeKeys(contents) {
  if (contents.includes(MARKER)) return contents;
  if (contents.includes('dispatchKeyEvent')) {
    throw new Error(
      'withVolumeKeys: MainActivity already overrides dispatchKeyEvent. Merge it by hand.',
    );
  }
  const close = contents.lastIndexOf('}');
  if (close === -1) throw new Error('withVolumeKeys: MainActivity.kt has no class body');
  return `${contents.slice(0, close)}${OVERRIDE}${contents.slice(close)}`;
}

function withVolumeKeys(config) {
  return withMainActivity(config, (c) => {
    if (c.modResults.language !== 'kt') {
      throw new Error('withVolumeKeys: MainActivity must be Kotlin');
    }
    c.modResults.contents = addVolumeKeys(c.modResults.contents);
    return c;
  });
}

module.exports = withVolumeKeys;
module.exports.addVolumeKeys = addVolumeKeys;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addVolumeKeys } = require('../../plugins/withVolumeKeys') as {
  addVolumeKeys: (contents: string) => string;
};

const MAIN_ACTIVITY = `package com.devanshchoubey.oneremote

import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`;

const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe('withVolumeKeys', () => {
  it('adds exactly one dispatchKeyEvent override that calls VolumeKeys.handle', () => {
    const out = addVolumeKeys(MAIN_ACTIVITY);
    expect(count(out, 'override fun dispatchKeyEvent')).toBe(1);
    expect(out).toContain('expo.modules.volumekeys.VolumeKeys.handle(event)');
    expect(out).toContain('super.dispatchKeyEvent(event)');
    expect(out.trimEnd().endsWith('}')).toBe(true);
    expect(out).toContain('override fun getMainComponentName');
  });

  it('is idempotent', () => {
    const once = addVolumeKeys(MAIN_ACTIVITY);
    const twice = addVolumeKeys(once);
    expect(twice).toBe(once);
    expect(count(twice, 'override fun dispatchKeyEvent')).toBe(1);
  });

  it('refuses to guess when MainActivity already has its own override', () => {
    const own = MAIN_ACTIVITY.replace(
      /\}\s*$/,
      '  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean = false\n}\n',
    );
    expect(() => addVolumeKeys(own)).toThrow(/dispatchKeyEvent/);
  });
});

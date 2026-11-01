import { unreachableHintKey, wakeHintKey } from '@/screens/tv/wakeHint';

describe('wakeHintKey', () => {
  it('maps webos to the existing hint', () => {
    expect(wakeHintKey('webos')).toBe('tv.wakeFailed');
  });

  it('falls back for a brand without its own line', () => {
    expect(wakeHintKey('samsung')).toBe('tv.wakeFailed');
  });

  it('maps androidtv to its own hint', () => {
    expect(wakeHintKey('androidtv')).toBe('tv.wakeFailedAndroidTv');
  });
});

describe('unreachableHintKey', () => {
  it('has an Android TV line and defaults to the LG one', () => {
    expect(unreachableHintKey('androidtv')).toBe('addTv.unreachableAndroidTv');
    expect(unreachableHintKey('webos')).toBe('addTv.unreachable');
    expect(unreachableHintKey('samsung')).toBe('addTv.unreachable');
  });
});

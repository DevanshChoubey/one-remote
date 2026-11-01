import { unreachableHintKey, wakeHintKey } from '@/screens/tv/wakeHint';

describe('wakeHintKey', () => {
  it('maps webos to the existing hint', () => {
    expect(wakeHintKey('webos')).toBe('tv.wakeFailed');
  });

  it('maps samsung to its Power on with mobile line', () => {
    expect(wakeHintKey('samsung')).toBe('tv.wakeFailedSamsung');
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

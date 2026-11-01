import { wakeHintKey } from '@/screens/tv/wakeHint';

describe('wakeHintKey', () => {
  it('maps webos to the existing hint', () => {
    expect(wakeHintKey('webos')).toBe('tv.wakeFailed');
  });

  it('maps samsung to its Power on with mobile line', () => {
    expect(wakeHintKey('samsung')).toBe('tv.wakeFailedSamsung');
  });

  it('falls back for a brand without its own line', () => {
    expect(wakeHintKey('androidtv')).toBe('tv.wakeFailed');
  });
});

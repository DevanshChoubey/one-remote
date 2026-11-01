import { wakeHintKey } from '@/screens/tv/wakeHint';

describe('wakeHintKey', () => {
  it('maps webos to the existing hint', () => {
    expect(wakeHintKey('webos')).toBe('tv.wakeFailed');
  });

  it('falls back for a brand without its own line', () => {
    expect(wakeHintKey('samsung')).toBe('tv.wakeFailed');
  });
});

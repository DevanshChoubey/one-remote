import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import { DPad } from '@/screens/tv/DPad';
import { KeyButton } from '@/screens/tv/KeyButton';
import { TouchPad } from '@/screens/tv/TouchPad';
import { darkTokens, lightTokens } from '@/theme';
import { makeServices, renderWith } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const noop = (): void => undefined;

describe('DPad', () => {
  it('labels every key and sends it', async () => {
    const onKey = jest.fn();
    await renderWith(makeServices(), <DPad onKey={onKey} />);
    const keys = [
      ['tv.up', 'up'],
      ['tv.down', 'down'],
      ['tv.left', 'left'],
      ['tv.right', 'right'],
      ['tv.ok', 'ok'],
    ] as const;
    for (const [label, key] of keys) {
      await fireEvent.press(screen.getByLabelText(t(label)));
      expect(onKey).toHaveBeenLastCalledWith(key);
    }
  });

  it('draws OK in the accent colour, light and dark', async () => {
    await renderWith(makeServices(), <DPad onKey={noop} />);
    expect(screen.getByLabelText(t('tv.ok'))).toHaveStyle({
      backgroundColor: lightTokens.color.accent,
    });
    await screen.unmount();
    await renderWith(makeServices(), <DPad onKey={noop} />, { scheme: 'dark' });
    expect(screen.getByLabelText(t('tv.ok'))).toHaveStyle({
      backgroundColor: darkTokens.color.accent,
    });
  });

  it('settles at full opacity under reduced motion', async () => {
    await renderWith(makeServices(), <DPad onKey={noop} />, { reducedMotion: true });
    expect(screen.getByTestId('tv-dpad')).toBeTruthy();
    expect(screen.getByLabelText(t('tv.up'))).toBeTruthy();
  });
});

describe('KeyButton', () => {
  it('keeps its label and role, and rings once pressed', async () => {
    const onPress = jest.fn();
    await renderWith(
      makeServices(),
      <KeyButton label={t('tv.home')} icon="home" size={84} onPress={onPress} />,
    );
    const key = screen.getByRole('button', { name: t('tv.home') });
    await act(async () => {
      fireEvent.press(key);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tv-sent-ring')).toBeTruthy();
  });
});

describe('TouchPad', () => {
  it('shows the hint on a surface pad, with the dot grid and a finger dot', async () => {
    await renderWith(makeServices(), <TouchPad onKey={noop} />);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    const pad = screen.getByTestId('tv-touchpad');
    expect(pad).toHaveStyle({ backgroundColor: lightTokens.color.surface });
    expect(screen.getByLabelText(t('tv.touchpadLabel'))).toBeTruthy();
    expect(screen.getByTestId('tv-touch-dot')).toBeTruthy();
  });

  it('is surface in the dark theme', async () => {
    await renderWith(makeServices(), <TouchPad onKey={noop} />, { scheme: 'dark' });
    expect(screen.getByTestId('tv-touchpad')).toHaveStyle({
      backgroundColor: darkTokens.color.surface,
    });
  });

  it('keeps the hint under reduced motion', async () => {
    await renderWith(makeServices(), <TouchPad onKey={noop} />, { reducedMotion: true });
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });
});

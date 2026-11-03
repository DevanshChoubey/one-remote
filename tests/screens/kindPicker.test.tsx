import { fireEvent, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import { KindPicker } from '@/screens/add/KindPicker';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { makeServices, renderWith } from './helpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

beforeEach(() => mockPush.mockClear());

describe('KindPicker', () => {
  it.each([
    ['add.kindTv', '/add/tv'],
    ['add.kindAc', '/add/ac'],
    ['add.kindFan', '/add/fan'],
  ])('opens %s at %s', async (key, href) => {
    await renderWith(makeServices(), <KindPicker />);
    await fireEvent.press(screen.getByLabelText(t(key)));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('lists every kind and notes the missing IR blaster', async () => {
    await renderWith(makeServices([createFakeDriver('ir', { available: false })]), <KindPicker />);
    expect(screen.getByText(t('add.kindTv'))).toBeTruthy();
    expect(screen.getByText(t('add.kindAc'))).toBeTruthy();
    expect(screen.getByText(t('add.kindFan'))).toBeTruthy();
    expect(screen.getByText(t('add.noIr'))).toBeTruthy();
  });

  it('has no IR note when the phone can send IR', async () => {
    await renderWith(makeServices([createFakeDriver('ir')]), <KindPicker />);
    expect(screen.queryByText(t('add.noIr'))).toBeNull();
  });

  it('draws no emoji: the kinds use the icon set', async () => {
    await renderWith(makeServices(), <KindPicker />);
    expect(screen.queryByText(/[\u{1F300}-\u{1FAFF}\u2744\u{FE0F}]/u)).toBeNull();
  });

  it('renders in dark with reduced motion', async () => {
    await renderWith(makeServices(), <KindPicker />, { scheme: 'dark', reducedMotion: true });
    expect(screen.getByText(t('add.kindTv'))).toBeTruthy();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import { KindPicker } from '@/screens/add/KindPicker';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
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
    ['add.kindAer', '/add/aer'],
  ])('opens %s at %s', async (key, href) => {
    await renderWith(makeServices(), <KindPicker />);
    await fireEvent.press(screen.getByLabelText(t(key)));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('offers the air freshener', async () => {
    await renderWith(makeServices(), <KindPicker />);
    expect(screen.getByText(t('add.kindAer'))).toBeTruthy();
    expect(screen.queryByText(t('add.needsAndroid12'))).toBeNull();
  });

  it('needs Android 12', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <KindPicker />);
    expect(screen.getByText(t('add.needsAndroid12'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('add.kindAer')));
    expect(mockPush).not.toHaveBeenCalled();
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

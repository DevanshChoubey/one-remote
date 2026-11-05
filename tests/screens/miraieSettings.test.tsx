import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { t } from '@/i18n';
import { createFakeMiraieSetup } from '@/miraie/testing/fakeMiraieSetup';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { makeServices, renderWith } from './helpers';

jest.mock('@/screens/aer/openSettings', () => ({
  openNotificationSettings: jest.fn().mockResolvedValue(undefined),
  openBluetoothSettings: jest.fn().mockResolvedValue(undefined),
  openAppSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

beforeEach(() => {
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((() => ({ remove: jest.fn() })) as never);
});
afterEach(() => jest.restoreAllMocks());

async function open() {
  const miraie = createFakeMiraieSetup();
  await renderWith(makeServices([], { miraie }), <SettingsScreen />, { reducedMotion: true });
  return miraie;
}

describe('Settings, MirAIe cloud connection', () => {
  it('is off by default, and turning it on explains before asking anything', async () => {
    const miraie = await open();
    const sw = await screen.findByLabelText(t('miraie.rowTitle'));
    expect(sw.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText(t('miraie.offHint'))).toBeTruthy();
    await fireEvent.press(sw);
    expect(screen.getByText(t('miraie.explain'))).toBeTruthy();
    expect(screen.queryByLabelText(t('miraie.phoneLabel'))).toBeNull();
    await fireEvent.press(screen.getByText(t('miraie.notNow')));
    expect(screen.queryByText(t('miraie.explain'))).toBeNull();
    expect(miraie.signIns).toEqual([]);
  });

  it('signs in after Continue and shows the masked account', async () => {
    const miraie = await open();
    await fireEvent.press(await screen.findByLabelText(t('miraie.rowTitle')));
    await fireEvent.press(screen.getByText(t('miraie.continue')));
    await fireEvent.changeText(screen.getByLabelText(t('miraie.phoneLabel')), '98123 45210');
    await fireEvent.changeText(screen.getByLabelText(t('miraie.passwordLabel')), 'secret');
    await fireEvent.press(screen.getByText(t('miraie.signIn')));
    await waitFor(() =>
      expect(screen.getByText(t('miraie.onHint', { account: '+91 98•••••210' }))).toBeTruthy(),
    );
    expect(miraie.signIns).toEqual([{ phone: '+919812345210', password: 'secret' }]);
    expect(screen.getByLabelText(t('miraie.rowTitle')).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText(t('miraie.disconnect'))).toBeTruthy();
  });

  it('words a refused sign-in and stays off', async () => {
    const miraie = await open();
    miraie.signInError = 'badLogin';
    await fireEvent.press(await screen.findByLabelText(t('miraie.rowTitle')));
    await fireEvent.press(screen.getByText(t('miraie.continue')));
    await fireEvent.changeText(screen.getByLabelText(t('miraie.phoneLabel')), '9812345210');
    await fireEvent.changeText(screen.getByLabelText(t('miraie.passwordLabel')), 'nope');
    await fireEvent.press(screen.getByText(t('miraie.signIn')));
    expect(await screen.findByText(t('miraie.errBadLogin'))).toBeTruthy();
    expect(miraie.status().enabled).toBe(false);
  });

  it('checks the number on the phone', async () => {
    const miraie = await open();
    await fireEvent.press(await screen.findByLabelText(t('miraie.rowTitle')));
    await fireEvent.press(screen.getByText(t('miraie.continue')));
    await fireEvent.changeText(screen.getByLabelText(t('miraie.phoneLabel')), '12345');
    await fireEvent.changeText(screen.getByLabelText(t('miraie.passwordLabel')), 'x');
    await fireEvent.press(screen.getByText(t('miraie.signIn')));
    expect(await screen.findByText(t('miraie.errBadPhone'))).toBeTruthy();
    expect(miraie.signIns).toEqual([]);
  });

  it('Disconnect turns it off', async () => {
    const miraie = await open();
    await act(async () => miraie.set({ enabled: true, account: '+91 98•••••210' }));
    await fireEvent.press(await screen.findByText(t('miraie.disconnect')));
    await waitFor(() => expect(miraie.disconnects).toBe(1));
    expect(screen.getByText(t('miraie.offHint'))).toBeTruthy();
  });

  it('asks to sign in again when MirAIe signed the phone out', async () => {
    const miraie = await open();
    await act(async () => miraie.set({ enabled: true, needsSignIn: true }));
    expect(await screen.findByText(t('miraie.signedOut'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('miraie.signInAgain')));
    expect(screen.getByLabelText(t('miraie.phoneLabel'))).toBeTruthy();
  });

  it('says in Privacy when MirAIe is on', async () => {
    const miraie = await open();
    expect(await screen.findByText(t('settings.privacyHint'))).toBeTruthy();
    await act(async () => miraie.set({ enabled: true, account: '+91 98•••••210' }));
    expect(screen.getByText(t('settings.privacyHintCloud'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('settings.privacy')));
    expect(screen.getByText(t('miraie.privacyOn'))).toBeTruthy();
    expect(screen.getByText(t('settings.privacyBody'))).toBeTruthy();
  });
});

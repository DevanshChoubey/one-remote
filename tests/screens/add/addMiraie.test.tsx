import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { LinkDriver } from '@/core';
import { t } from '@/i18n';
import { createIrDriver } from '@/ir/driver';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { createFakeMiraieSetup } from '@/miraie/testing/fakeMiraieSetup';
import type { FakeMiraieSetup } from '@/miraie/testing/fakeMiraieSetup';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { device, renderWith, room } from '../helpers';

const mockDismissAll = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    dismissAll: mockDismissAll,
    dismiss: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const bedroomAc = {
  deviceId: 'd1',
  homeId: 'h1',
  topic: 'u1/h1/d1',
  name: 'Bedroom AC',
  space: 'Bedroom',
};
const hallAc = { deviceId: 'd2', homeId: 'h1', topic: 'u1/h1/d2', name: 'Hall AC' };

async function setup(opts: { hasIr: boolean; on: boolean }): Promise<{
  s: Services;
  miraie: FakeMiraieSetup;
}> {
  const emitter = createFakeEmitter({ has: opts.hasIr });
  const drivers: LinkDriver[] = [createIrDriver({ emitter })];
  const miraie = createFakeMiraieSetup();
  miraie.acs = [bedroomAc, hallAc];
  if (opts.on) miraie.set({ enabled: true, account: '+91 98•••••210' });
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
    ir: createIrSetup({ emitter }),
    miraie,
  });
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  return { s, miraie };
}

const press = (label: string): Promise<unknown> => fireEvent.press(screen.getByLabelText(label));

beforeEach(() => {
  mockDismissAll.mockClear();
  mockPush.mockClear();
});

describe('Add a Panasonic AC through MirAIe', () => {
  it('never offers MirAIe while the opt-in is off', async () => {
    const { s } = await setup({ hasIr: true, on: false });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    expect(screen.queryByText(t('miraie.viaCloud'))).toBeNull();
  });

  it('lists the account ACs, adds the cloud link and skips the backup', async () => {
    const { s } = await setup({ hasIr: true, on: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    expect(await screen.findByText(t('miraie.brandBadge'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Panasonic'));
    expect(await screen.findByText(t('miraie.viaTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('via-miraie'));
    await fireEvent.press(await screen.findByLabelText('Hall AC'));
    await press(t('miraie.next'));
    expect(await screen.findByText(t('miraie.backupTitle'))).toBeTruthy();
    await press(t('miraie.backupSkip'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        { kind: 'miraie', deviceId: 'd2', homeId: 'h1', topic: 'u1/h1/d2' },
      ]),
    );
  });

  it('adds an IR backup on the same device', async () => {
    const { s } = await setup({ hasIr: true, on: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await fireEvent.press(await screen.findByTestId('via-miraie'));
    await screen.findByLabelText('Bedroom AC');
    await press(t('miraie.next'));
    await press(t('miraie.backupAdd'));
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    await press(t('addAppliance.yes'));
    await press(t('addAppliance.test'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    await press(t('addAppliance.yes'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        { kind: 'miraie', deviceId: 'd1', homeId: 'h1', topic: 'u1/h1/d1' },
        { kind: 'ir', remoteId: 'panasonic-ac/dke' },
      ]),
    );
  });

  it('names the cloud AC straight away on a phone without IR', async () => {
    const { s } = await setup({ hasIr: false, on: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await fireEvent.press(await screen.findByTestId('via-miraie'));
    await screen.findByLabelText('Bedroom AC');
    await press(t('miraie.next'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    expect(screen.queryByText(t('miraie.backupTitle'))).toBeNull();
  });

  it('marks ACs already added and picks the next free one', async () => {
    const { s } = await setup({ hasIr: true, on: true });
    await s.store.upsertDevice(
      device('a1', 'r1', 0, {
        links: [{ kind: 'miraie', deviceId: 'd1', homeId: 'h1', topic: 'u1/h1/d1' }],
      }),
    );
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await fireEvent.press(await screen.findByTestId('via-miraie'));
    expect(await screen.findByText(t('miraie.added'))).toBeTruthy();
    await press(t('miraie.next'));
    await press(t('miraie.backupSkip'));
    await press(t('common.done'));
    await waitFor(async () => {
      const added = (await s.store.devices()).find((d) => d.id !== 'a1');
      expect(added?.links[0]).toMatchObject({ kind: 'miraie', deviceId: 'd2' });
    });
  });

  it('sends a signed-out account to Settings, and lets a failed list try again', async () => {
    const { s, miraie } = await setup({ hasIr: true, on: true });
    miraie.listError = 'signedOut';
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await fireEvent.press(await screen.findByTestId('via-miraie'));
    expect(await screen.findByText(t('miraie.listSignedOut'))).toBeTruthy();
    await press(t('miraie.openSettings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');

    miraie.listError = 'offline';
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    await fireEvent.press(await screen.findByTestId('via-miraie'));
    expect(await screen.findByText(t('miraie.listError'))).toBeTruthy();
    miraie.listError = null;
    await press(t('miraie.tryAgain'));
    expect(await screen.findByLabelText('Hall AC')).toBeTruthy();
  });

  it('still offers plain IR from the connect step', async () => {
    const { s } = await setup({ hasIr: true, on: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await fireEvent.press(await screen.findByTestId('via-ir'));
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
  });
});

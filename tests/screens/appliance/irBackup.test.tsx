import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Device, Link } from '@/core';
import { t } from '@/i18n';
import { createIrDriver } from '@/ir/driver';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import { IrBackupAction } from '@/screens/appliance/IrBackupAction';
import { DeviceSheet } from '@/screens/device';
import { createServices } from '@/services';
import { lightTokens } from '@/theme';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { device, renderWith, room } from '../helpers';
import { flush } from './applianceHelpers';

const mockPush = jest.fn();
const mockDismiss = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    dismissAll: jest.fn(),
    dismiss: mockDismiss,
  }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const matter: Link = { kind: 'matter', nodeId: 'n1' };
const webos: Link = { kind: 'webos', host: '192.168.1.9', secure: false, clientKeyRef: 'k' };

async function setup(hasIr: boolean, d: Device): Promise<Services> {
  const emitter = createFakeEmitter({ has: hasIr });
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [createIrDriver({ emitter })],
    ir: createIrSetup({ emitter }),
  });
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  await s.store.upsertDevice(d);
  await flush();
  return s;
}

const ac = (links: Link[]): Device => device('d1', 'r1', 0, { kind: 'ac', links });
const press = (label: string): Promise<unknown> => fireEvent.press(screen.getByLabelText(label));
const yesEnabled = (): boolean =>
  screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled === false;

/** Answers one press: Test, then Yes. */
async function testAndConfirm(): Promise<void> {
  await press(t('addAppliance.test'));
  await waitFor(() => expect(yesEnabled()).toBe(true));
  await press(t('addAppliance.yes'));
}

/** Answers one press: Test, then No (No shows only after a send). */
async function testAndRefuse(): Promise<void> {
  await press(t('addAppliance.test'));
  await waitFor(() => expect(yesEnabled()).toBe(true));
  await press(t('addAppliance.no'));
}

beforeEach(() => {
  mockPush.mockClear();
  mockDismiss.mockClear();
});

describe('IrBackupAction', () => {
  it('offers "Add IR backup" for an AC with no ir link and opens the backup route', async () => {
    const s = await setup(true, ac([matter]));
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('irBackup.add')));
    expect(mockPush).toHaveBeenCalledWith('/add/ir-backup?id=d1');
  });

  it('leaves an AC with an ir link to the "Redo IR backup" row in the group', async () => {
    const s = await setup(true, ac([{ kind: 'ir', remoteId: 'panasonic-ac/dke' }]));
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await act(flush);
    expect(screen.queryByLabelText(t('irBackup.redo'))).toBeNull();
    expect(screen.queryByLabelText(t('irBackup.add'))).toBeNull();
  });

  it('draws "Redo IR backup" as a chevron row under the IR link and opens the backup route', async () => {
    const s = await setup(true, ac([matter, { kind: 'ir', remoteId: 'panasonic-ac/dke' }]));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    const row = await screen.findByLabelText(t('irBackup.redo'));
    expect(screen.getAllByLabelText(t('irBackup.redo'))).toHaveLength(1);
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/add/ir-backup?id=d1');
  });

  it('has no "Redo IR backup" row on a phone without IR', async () => {
    const s = await setup(false, ac([matter, { kind: 'ir', remoteId: 'panasonic-ac/dke' }]));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    expect(await screen.findByText(t('device.linkIr'))).toBeTruthy();
    expect(screen.queryByLabelText(t('irBackup.redo'))).toBeNull();
  });

  it('says a failed TV backup save in one plain ink2 status sentence', async () => {
    const s = await setup(true, device('d1', 'r1', 0, { kind: 'tv', links: [webos] }));
    jest.spyOn(s.store, 'upsertDevice').mockRejectedValueOnce(new Error('disk'));
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('irBackup.add')));
    const line = await screen.findByText(t('irBackup.failed'));
    expect(line).toHaveStyle({ fontSize: 16 });
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(line).toHaveStyle({ color: lightTokens.color.ink2 });
  });

  it('adds the LG code set to a TV without IR, with no test', async () => {
    const s = await setup(true, device('d1', 'r1', 0, { kind: 'tv', links: [webos] }));
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('irBackup.add')));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        webos,
        { kind: 'ir', remoteId: 'lg-tv/nec' },
      ]),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is hidden for a TV that already has IR', async () => {
    const s = await setup(
      true,
      device('d1', 'r1', 0, { kind: 'tv', links: [webos, { kind: 'ir', remoteId: 'lg-tv/nec' }] }),
    );
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await act(flush);
    expect(screen.queryByLabelText(t('irBackup.add'))).toBeNull();
    expect(screen.queryByLabelText(t('irBackup.redo'))).toBeNull();
  });

  it('renders nothing on a phone without IR', async () => {
    const s = await setup(false, ac([matter]));
    await renderWith(s, <IrBackupAction deviceId="d1" />);
    await act(flush);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('IR backup flow (replaceIrOn)', () => {
  it('appends an ir link after the Matter link', async () => {
    const s = await setup(true, ac([matter]));
    await renderWith(s, <AddApplianceFlow kind="ac" replaceIrOn="d1" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    // Candidates run dke, jke, nke: say no twice, then confirm nke.
    await testAndRefuse();
    await testAndRefuse();
    expect(await screen.findByText('Panasonic · try 3 of 5')).toBeTruthy();
    await testAndConfirm();
    await testAndConfirm();
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        matter,
        { kind: 'ir', remoteId: 'panasonic-ac/nke' },
      ]),
    );
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  it('replaces the existing ir link, starting at the known brand', async () => {
    const s = await setup(true, ac([{ kind: 'ir', remoteId: 'panasonic-ac/dke' }]));
    await renderWith(s, <AddApplianceFlow kind="ac" replaceIrOn="d1" />);
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    await testAndRefuse();
    await testAndRefuse();
    await testAndConfirm();
    await testAndConfirm();
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        { kind: 'ir', remoteId: 'panasonic-ac/nke' },
      ]),
    );
  });
});

describe('IR backup save failure', () => {
  it('shows the message inside the screen and does not leave', async () => {
    const s = await setup(true, ac([{ kind: 'ir', remoteId: 'panasonic-ac/dke' }]));
    jest.spyOn(s.store, 'upsertDevice').mockRejectedValue(new Error('disk'));
    await renderWith(s, <AddApplianceFlow kind="ac" replaceIrOn="d1" />);
    await screen.findByText('Panasonic · try 1 of 5');
    await testAndConfirm();
    await testAndConfirm();
    expect(await screen.findByText(t('addAppliance.saveFailed'))).toBeTruthy();
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

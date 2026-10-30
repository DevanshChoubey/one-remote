import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Device } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { DeviceSheet } from '@/screens/device';
import { TvLinkActions } from '@/screens/tv/TvLinkActions';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { fakeTvSetup } from '../fakeTvSetup';
import type { FakeTvSetup } from '../fakeTvSetup';
import { renderWith, room } from '../helpers';

jest.mock('react-native-udp');
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const tvDevice: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'LG OLED C4',
  roomId: 'r1',
  order: 0,
  links: [
    { kind: 'webos', host: '192.168.1.23', mac: 'AA', secure: true, clientKeyRef: 'key-1' },
    { kind: 'ir', remoteId: 'lg-tv/nec' },
  ],
};

async function rig(device: Device = tvDevice): Promise<{
  s: Services;
  setup: FakeTvSetup;
}> {
  const { setup } = fakeTvSetup();
  setup.findAgain.mockResolvedValue('192.168.1.40');
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [createFakeDriver('webos'), createFakeDriver('ir')],
    tv: setup,
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  await s.store.upsertDevice(device);
  await act(async () => {
    await Promise.resolve();
  });
  return { s, setup };
}

describe('TvLinkActions', () => {
  it('shows the TV address', async () => {
    const r = await rig();
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    expect(await screen.findByText('192.168.1.23')).toBeTruthy();
    expect(screen.getByText(t('addTv.address'))).toBeTruthy();
  });

  it('saves the new address from Find TV again', async () => {
    const r = await rig();
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    await fireEvent.press(await screen.findByLabelText(t('addTv.findAgain')));
    expect(r.setup.findAgain).toHaveBeenCalledWith(expect.objectContaining({ id: 'tv1' }));
    await waitFor(async () => {
      const [d] = await r.s.store.devices();
      expect(d?.links[0]).toMatchObject({ kind: 'webos', host: '192.168.1.40', mac: 'AA' });
      expect(d?.links[1]).toEqual({ kind: 'ir', remoteId: 'lg-tv/nec' });
    });
  });

  it('says so when the TV is not found, and changes nothing', async () => {
    const r = await rig();
    r.setup.findAgain.mockResolvedValueOnce(null);
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    await fireEvent.press(await screen.findByLabelText(t('addTv.findAgain')));
    expect(await screen.findByText(t('addTv.notFound'))).toBeTruthy();
    expect(((await r.s.store.devices())[0]?.links[0] as { host: string }).host).toBe(
      '192.168.1.23',
    );
  });

  it('pairs again with the existing key reference', async () => {
    const r = await rig();
    r.setup.pair.mockResolvedValueOnce({
      link: { kind: 'webos', host: '192.168.1.23', mac: 'AA', secure: true, clientKeyRef: 'key-1' },
      suggestedName: 'x',
    });
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    await fireEvent.press(await screen.findByLabelText(t('addTv.pairAgain')));
    expect(r.setup.pair).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.23', secure: true }),
      expect.any(Function),
      'key-1',
    );
    expect(await screen.findByText(t('addTv.paired'))).toBeTruthy();
  });

  it('renders nothing for a device that is not a TV', async () => {
    const r = await rig({
      ...tvDevice,
      id: 'ac1',
      kind: 'ac',
      links: [{ kind: 'ir', remoteId: 'x/y' }],
    });
    await renderWith(r.s, <TvLinkActions deviceId="ac1" />);
    expect(screen.queryByText(t('addTv.address'))).toBeNull();
  });

  it('shows up under the TV link in the device sheet', async () => {
    const r = await rig();
    await renderWith(r.s, <DeviceSheet deviceId="tv1" />);
    expect(await screen.findByLabelText(t('addTv.pairAgain'))).toBeTruthy();
    expect(screen.getAllByLabelText(t('addTv.findAgain'))).toHaveLength(1);
  });
});

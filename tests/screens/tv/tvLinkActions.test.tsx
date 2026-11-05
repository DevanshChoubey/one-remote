import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PairError } from '@/core';
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
    // Mock `tvLinkBlock`: the "TV address" section label, then the row of the same name.
    expect(screen.getAllByText(t('addTv.address'))).toHaveLength(2);
    expect(screen.getByText('192.168.1.23')).toHaveStyle({ fontSize: 13 });
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
      expect.objectContaining({ kind: 'webos', host: '192.168.1.23', secure: true }),
      expect.objectContaining({ onAllow: expect.any(Function) }),
      expect.objectContaining({ kind: 'webos', clientKeyRef: 'key-1' }),
    );
    expect(await screen.findByText(t('addTv.paired'))).toBeTruthy();
  });

  it('pairs an Android TV link again with that link as reuse', async () => {
    const atv = {
      kind: 'androidtv' as const,
      host: '10.0.0.5',
      certRef: 'phone',
      pinSha256: 'p',
    };
    const r = await rig({ ...tvDevice, links: [atv] });
    r.setup.pair.mockResolvedValueOnce({ link: atv, suggestedName: 'x' });
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    expect(await screen.findByText('10.0.0.5')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('addTv.pairAgain')));
    expect(r.setup.pair).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'androidtv', host: '10.0.0.5' }),
      expect.anything(),
      atv,
    );
    expect(await screen.findByText(t('addTv.paired'))).toBeTruthy();
  });

  it('asks for the code when pairing an Android TV link again, and stays quiet on cancel', async () => {
    const atv = {
      kind: 'androidtv' as const,
      host: '10.0.0.5',
      certRef: 'phone',
      pinSha256: 'p',
    };
    const r = await rig({ ...tvDevice, links: [atv] });
    const asked: (string | null)[] = [];
    r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
      asked.push(await prompts.askCode(false));
      throw new PairError('cancelled');
    });
    await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
    await fireEvent.press(await screen.findByLabelText(t('addTv.pairAgain')));
    await fireEvent.changeText(await screen.findByLabelText(t('addTv.codeTitle')), 'a1b2c3');
    // Mock `tvLinkBlock`: the code label is a plain caption, not the bold field label.
    expect(screen.getByText(t('addTv.codeTitle'))).toHaveStyle({ fontSize: 13, fontWeight: '400' });
    await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
    await waitFor(() => expect(asked).toEqual(['A1B2C3']));
    expect(screen.queryByText(t('addTv.unreachable'))).toBeNull();
  });

  describe('code prompt', () => {
    const atv = {
      kind: 'androidtv' as const,
      host: '10.0.0.5',
      certRef: 'phone',
      pinSha256: 'p',
    };

    it('shows the wrong-code line and clears the field when asked again', async () => {
      const r = await rig({ ...tvDevice, links: [atv] });
      r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
        await prompts.askCode(false);
        const second = prompts.askCode(true);
        await second;
        throw new PairError('cancelled');
      });
      await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
      await fireEvent.press(await screen.findByLabelText(t('addTv.pairAgain')));
      await fireEvent.changeText(await screen.findByLabelText(t('addTv.codeTitle')), 'zzzzzz');
      await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
      expect(await screen.findByText(t('addTv.codeWrong'))).toBeTruthy();
      expect(screen.getByLabelText(t('addTv.codeTitle')).props.value).toBe('');
    });

    it('settles a pending code question when the screen is left', async () => {
      const r = await rig({ ...tvDevice, links: [atv] });
      const asked = jest.fn();
      r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
        asked(await prompts.askCode(false));
        throw new PairError('cancelled');
      });
      await renderWith(r.s, <TvLinkActions deviceId="tv1" />);
      await fireEvent.press(await screen.findByLabelText(t('addTv.pairAgain')));
      await screen.findByLabelText(t('addTv.codeTitle'));
      await screen.unmount();
      await waitFor(() => expect(asked).toHaveBeenCalledWith(null));
    });
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

  it('opened to pair again, offers Pair again as one row in the link group and pairs from it', async () => {
    const r = await rig();
    r.setup.pair.mockResolvedValueOnce({
      link: { kind: 'webos', host: '192.168.1.23', mac: 'AA', secure: true, clientKeyRef: 'key-1' },
      suggestedName: 'x',
    });
    await renderWith(r.s, <DeviceSheet deviceId="tv1" repair />);
    const row = await screen.findByLabelText(t('addTv.pairAgain'));
    expect(screen.getAllByLabelText(t('addTv.pairAgain'))).toHaveLength(1);
    expect(screen.getByLabelText(t('addTv.findAgain'))).toBeTruthy();
    await fireEvent.press(row);
    expect(await screen.findByText(t('addTv.paired'))).toBeTruthy();
  });
});

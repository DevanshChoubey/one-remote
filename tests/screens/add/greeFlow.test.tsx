import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { BrandInfo, LinkDriver } from '@/core';
import { createGreeClient } from '@/gree/client';
import { createGreeDriver } from '@/gree/driver';
import { createGreeSetup } from '@/gree/setup';
import { FakeGreeUnit, createFakeGreeLan } from '@/gree/testing/fakeGree';
import { t } from '@/i18n';
import { createIrDriver } from '@/ir/driver';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import { afterBrand, afterGree, withGreeBrand } from '@/screens/add/appliance/flow';
import type { FlowEnv } from '@/screens/add/appliance/flow';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { renderWith, room } from '../helpers';

const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    dismissAll: mockDismissAll,
    dismiss: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
// createServices reaches AsyncStorage; the jest mock stands in for the native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MAC = 'f4911e0000aa';

async function setup(opts: { units?: FakeGreeUnit[]; gree?: boolean; offWifi?: boolean } = {}) {
  const units = opts.units ?? [
    new FakeGreeUnit({ mac: MAC, host: '192.168.1.40', name: 'Hall', key: 'Dk3Lm9Pq2Rs7Tu1V' }),
  ];
  const lan = createFakeGreeLan(units);
  if (opts.offWifi) lan.onWifiResult = false;
  const client = createGreeClient({ udp: lan });
  const emitter = createFakeEmitter({ has: true });
  const drivers: LinkDriver[] = [createIrDriver({ emitter })];
  if (opts.gree !== false) drivers.push(createGreeDriver({ client }));
  const s: Services = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
    ir: createIrSetup({ emitter }),
    gree: createGreeSetup({ client, scanMs: 10 }),
  });
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  return { s, units, lan };
}

const press = (label: string): Promise<unknown> => fireEvent.press(screen.getByLabelText(label));

beforeEach(() => mockDismissAll.mockClear());

describe('Add a Gree Wi-Fi AC', () => {
  it('lists Gree with a Wi-Fi badge, finds the unit, binds and saves the link', async () => {
    const { s } = await setup();
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Gree'));
    expect(screen.getByText(t('gree.findTitle'))).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Hall, 192.168.1.40'));
    // Gree has IR codes too, so an IR backup is offered first (as after Matter); skip it.
    expect(await screen.findByText(/^Gree · try 1 of \d+$/)).toBeTruthy();
    await press(t('addAppliance.skip'));
    expect(await screen.findByDisplayValue('Gree AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        { kind: 'gree', mac: MAC, host: '192.168.1.40', key: 'Dk3Lm9Pq2Rs7Tu1V', cipher: 'ecb' },
      ]),
    );
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('shows the Wi-Fi badge on the Gree row', async () => {
    const { s } = await setup();
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await screen.findByLabelText('Gree');
    expect(screen.getAllByText(t('gree.brandWifi')).length).toBeGreaterThan(0);
  });

  it('says when nothing answered, searches again, and offers IR instead', async () => {
    const unit = new FakeGreeUnit({ mac: MAC, host: '192.168.1.40', name: '' });
    unit.up = false;
    const { s } = await setup({ units: [unit] });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Gree'));
    expect(await screen.findByText(t('gree.none'))).toBeTruthy();
    unit.up = true;
    await press(t('gree.searchAgain'));
    // A unit with no name shows the generic one.
    expect(await screen.findByLabelText(`${t('gree.unitName')}, 192.168.1.40`)).toBeTruthy();
    await press(t('gree.useIr'));
    // The catalogue has Gree IR codes: the IR test starts.
    expect(await screen.findByText(/^Gree · try 1 of \d+$/)).toBeTruthy();
  });

  it('says to join the Wi-Fi when the phone is off it', async () => {
    const { s } = await setup({ offWifi: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Gree'));
    expect(await screen.findByText(t('gree.offWifi'))).toBeTruthy();
  });

  it('says so when the bind fails, and keeps the list', async () => {
    const unit = new FakeGreeUnit({ mac: MAC, host: '192.168.1.40', name: 'Hall' });
    const { s } = await setup({ units: [unit] });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Gree'));
    const row = await screen.findByLabelText('Hall, 192.168.1.40');
    unit.up = false;
    await fireEvent.press(row);
    expect(await screen.findByText(t('gree.bindFailed'))).toBeTruthy();
    expect(screen.getByLabelText('Hall, 192.168.1.40')).toBeTruthy();
  });

  it('without the Gree driver, Gree is an IR brand only', async () => {
    const { s } = await setup({ gree: false });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Gree'));
    expect(await screen.findByText(/^Gree · try 1 of \d+$/)).toBeTruthy();
    expect(screen.queryByText(t('gree.findTitle'))).toBeNull();
  });
});

describe('flow with Gree', () => {
  const gree: BrandInfo = { id: 'gree', name: 'Gree', kind: 'ac', matter: false, wifi: 'gree' };
  const env = (over: Partial<FlowEnv> = {}): FlowEnv => ({
    kind: 'ac',
    irAvailable: true,
    matterAvailable: false,
    greeAvailable: true,
    hasIrCodes: () => true,
    ...over,
  });

  it('goes to the Gree search when Gree can be used, else IR', () => {
    expect(afterBrand(gree, env())).toEqual({ name: 'gree', brandId: 'gree' });
    expect(afterBrand(gree, env({ greeAvailable: false }))).toEqual({
      name: 'irTest',
      brandId: 'gree',
      backup: false,
    });
  });

  it('offers an IR backup after binding when there are codes', () => {
    const link = { kind: 'gree' as const, mac: MAC, host: 'h', key: 'k', cipher: 'ecb' as const };
    expect(afterGree('gree', link, env())).toEqual({
      name: 'irTest',
      brandId: 'gree',
      backup: true,
    });
    expect(afterGree('gree', link, env({ hasIrCodes: () => false }))).toMatchObject({
      name: 'name',
      links: [link],
    });
  });

  it('marks an IR Gree brand as Wi-Fi, or adds one, only when Gree can be used', () => {
    const panasonic: BrandInfo = { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true };
    const irGree: BrandInfo = { id: 'gree', name: 'Gree', kind: 'ac', matter: false };
    expect(withGreeBrand([panasonic], false)).toEqual([panasonic]);
    expect(withGreeBrand([panasonic], true)).toEqual([panasonic, gree]);
    expect(withGreeBrand([irGree, panasonic], true)).toEqual([gree, panasonic]);
  });
});

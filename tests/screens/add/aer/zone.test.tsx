import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { FoundAer } from '@/aer/types';
import { t } from '@/i18n';
import { AddAerFlow } from '@/screens/add/aer/AddAerFlow';
import { phoneZone } from '@/screens/add/aer/phoneZone';
import { ZoneStep } from '@/screens/add/aer/ZoneStep';
import { AerError } from '@/services';
import { device, makeServices, renderWith, room } from '../../helpers';

const mockBack = jest.fn();
const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, dismissAll: mockDismissAll }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(() => {
  mockBack.mockClear();
  mockDismissAll.mockClear();
});
afterEach(async () => {
  await act(async () => {});
});

const SMART: FoundAer = { bleId: 'B', name: 'Smart Matic', rssi: -50 };
const adds = (aer: ReturnType<typeof createFakeAerService>) =>
  aer.calls.filter((c) => c.op === 'add');

type Fake = ReturnType<typeof createFakeAerService>;
type Services = ReturnType<typeof makeServices>;

/** Scan, pick, blink, Yes, then Next on the name step: ends on the zone step. */
async function toZone(
  opts: { newRoom?: string; display?: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } } = {},
): Promise<{ aer: Fake; s: Services }> {
  const base = makeServices();
  const aer = createFakeAerService({ found: [SMART], home: base.store });
  const s = { ...base, aer };
  if (opts.newRoom === undefined) await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  await renderWith(s, <AddAerFlow />, opts.display);
  await fireEvent.press(await screen.findByTestId('aer-found-B'));
  await fireEvent.press(await screen.findByText(t('aer.yesThatOne')));
  await screen.findByDisplayValue(t('aer.defaultName'));
  if (opts.newRoom !== undefined) {
    await fireEvent.changeText(await screen.findByLabelText(t('add.roomName')), opts.newRoom);
  } else {
    await screen.findByLabelText('Bedroom');
  }
  await fireEvent.press(screen.getByLabelText(t('aer.next')));
  await screen.findByText(t('aer.zoneStep'));
  return { aer, s };
}

describe('the name step of the add flow', () => {
  it('reads Next, says a time zone follows, and saves nothing yet', async () => {
    const aer = createFakeAerService({ found: [SMART] });
    const s = makeServices([], { aer });
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await renderWith(s, <AddAerFlow />);
    await fireEvent.press(await screen.findByTestId('aer-found-B'));
    await fireEvent.press(await screen.findByText(t('aer.yesThatOne')));
    expect(await screen.findByText(t('aer.nameStep'))).toBeTruthy();
    expect(screen.getByLabelText(t('aer.next'))).toBeTruthy();
    expect(adds(aer)).toHaveLength(0);
  });
});

describe('the home time zone when adding', () => {
  it('picks the phone zone and saves the device with it', async () => {
    const { aer, s } = await toZone();
    expect(screen.getByText(t('aer.thisPhone'))).toBeTruthy();
    expect(screen.getByTestId(`zone-${phoneZone()}`).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    const call = adds(aer)[0];
    expect(call?.arg).toMatchObject({
      kind: 'aer',
      name: t('aer.defaultName'),
      roomId: 'r1',
      links: [{ kind: 'aer', bleId: 'B', timeZone: phoneZone() }],
    });
    expect(call?.deviceId).toBe(aer.calls.find((c) => c.op === 'blink')?.deviceId);
    expect(await s.store.devices()).toHaveLength(1);
  });

  it('saves a chosen zone, and a new room is made first', async () => {
    const { aer, s } = await toZone({ newRoom: 'Hall' });
    await fireEvent.changeText(screen.getByLabelText(t('aer.zoneSearch')), 'kolk');
    await fireEvent.press(screen.getByTestId('zone-Asia/Kolkata'));
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(adds(aer)[0]?.arg).toMatchObject({ links: [{ timeZone: 'Asia/Kolkata' }], order: 0 });
    expect((await s.store.rooms()).map((r) => r.name)).toEqual(['Hall']);
  });

  it('search narrows the zones', async () => {
    await toZone();
    await fireEvent.changeText(screen.getByLabelText(t('aer.zoneSearch')), 'kolk');
    expect(screen.getByText('India · Kolkata')).toBeTruthy();
    expect(screen.getByText('UTC+5:30')).toBeTruthy();
    expect(screen.getAllByTestId(/^zone-.*(?<!-surface)$/)).toHaveLength(1);
  });

  it('keeps a zone picked through search in the list after the search is cleared', async () => {
    await toZone();
    const search = screen.getByLabelText(t('aer.zoneSearch'));
    await fireEvent.changeText(search, 'tokyo');
    await fireEvent.press(screen.getByTestId('zone-Asia/Tokyo'));
    await fireEvent.changeText(search, '');
    expect(screen.getByTestId('zone-Asia/Tokyo').props.accessibilityState.selected).toBe(true);
  });

  it('a failed add says why and keeps the step', async () => {
    const { aer, s } = await toZone();
    aer.failNext('add', new AerError('unreachable'));
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    expect(
      await screen.findByText("Couldn't add it. Can't reach it. Move closer and try again."),
    ).toBeTruthy();
    expect(screen.getByText(t('aer.zoneStep'))).toBeTruthy();
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(await s.store.devices()).toEqual([]);
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(adds(aer)).toHaveLength(2);
    expect(await s.store.devices()).toHaveLength(1);
  });

  it('a failed add leaves no new room behind, and Done again retries cleanly', async () => {
    const { aer, s } = await toZone({ newRoom: 'Hall' });
    aer.failNext('add', new AerError('unreachable'));
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await screen.findByText("Couldn't add it. Can't reach it. Move closer and try again.");
    expect(await s.store.rooms()).toEqual([]);
    expect(await s.store.devices()).toEqual([]);
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect((await s.store.rooms()).map((r) => r.name)).toEqual(['Hall']);
    expect(await s.store.devices()).toHaveLength(1);
  });

  it('shows the button loading while the add runs', async () => {
    const { aer } = await toZone();
    const gate = aer.hold('add');
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    await waitFor(() => expect(adds(aer)).toHaveLength(1));
    expect(screen.getByLabelText(t('aer.done')).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    expect(adds(aer)).toHaveLength(1);
    await act(async () => gate.release());
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
  });

  it('goes back to the name', async () => {
    await toZone();
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(await screen.findByText(t('aer.nameStep'))).toBeTruthy();
  });

  it('renders in dark', async () => {
    await toZone({ display: { scheme: 'dark' } });
    expect(screen.getByText(t('aer.zoneBody'))).toBeTruthy();
  });

  it('renders with reduced motion', async () => {
    await toZone({ display: { reducedMotion: true } });
    expect(screen.getByText(t('aer.zoneBody'))).toBeTruthy();
  });
});

describe('the home time zone when editing', () => {
  async function edit(display?: { scheme?: 'light' | 'dark'; reducedMotion?: boolean }) {
    const aer = createFakeAerService();
    const s = makeServices([], { aer });
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(
      device('a1', 'r1', 0, {
        kind: 'aer',
        links: [{ kind: 'aer', bleId: 'B', timeZone: 'Asia/Tokyo' }],
      }),
    );
    await renderWith(s, <ZoneStep edit deviceId="a1" />, display);
    return aer;
  }

  it('starts on the current zone and saves the new one', async () => {
    const aer = await edit();
    const tokyo = await screen.findByTestId('zone-Asia/Tokyo');
    await waitFor(() =>
      expect(screen.getByTestId('zone-Asia/Tokyo').props.accessibilityState.selected).toBe(true),
    );
    expect(tokyo).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t('aer.zoneSearch')), 'kolk');
    await fireEvent.press(screen.getByTestId('zone-Asia/Kolkata'));
    await fireEvent.press(screen.getByLabelText(t('aer.save')));
    expect(await screen.findByText(t('aer.saved'))).toBeTruthy();
    expect(aer.calls.find((c) => c.op === 'setTimeZone')).toMatchObject({
      deviceId: 'a1',
      arg: 'Asia/Kolkata',
    });
    expect(mockBack).toHaveBeenCalled();
    expect(adds(aer)).toHaveLength(0);
  });

  it('says why a save failed and stays', async () => {
    const aer = await edit();
    await waitFor(() =>
      expect(screen.getByTestId('zone-Asia/Tokyo').props.accessibilityState.selected).toBe(true),
    );
    aer.failNext('setTimeZone', new AerError('unreachable'));
    await fireEvent.press(screen.getByLabelText(t('aer.save')));
    expect(await screen.findByText(t('aer.probAway'))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders in dark', async () => {
    await edit({ scheme: 'dark' });
    expect(await screen.findByTestId('zone-Asia/Tokyo')).toBeTruthy();
  });

  it('renders with reduced motion', async () => {
    await edit({ reducedMotion: true });
    expect(await screen.findByTestId('zone-Asia/Tokyo')).toBeTruthy();
  });
});

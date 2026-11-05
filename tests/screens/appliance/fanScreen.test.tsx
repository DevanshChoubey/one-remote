import { StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Capabilities, FanState } from '@/core';
import { t } from '@/i18n';
import { FanScreen } from '@/screens/appliance/FanScreen';
import { fanView } from '@/screens/appliance/fanModel';
import type { DeviceView } from '@/services';
import { createIrDriver } from '@/ir/driver';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { makeServices, renderWith } from '../helpers';
import { fanDevice, heldDriver, servicesWith, silentDriver } from './applianceHelpers';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const on: FanState = { power: true, speed: 2, boost: false, sleep: false, timerHours: 0 };

async function setup(
  caps: Capabilities = { sleep: true },
  start?: FanState,
  available = true,
): Promise<() => FanState[]> {
  const { driver, fake } = silentDriver('ir', { capabilities: caps, available });
  const s = await servicesWith([driver], [fanDevice()]);
  if (start) await s.hub.send('d1', { kind: 'fan.set', state: start });
  fake.sent.length = 0;
  await renderWith(s, <FanScreen deviceId="d1" />);
  return () => fake.sent.flatMap((x) => (x.cmd.kind === 'fan.set' ? [x.cmd.state] : []));
}

describe('fanView', () => {
  it('defaults to a fan that is off', () => {
    const v = { state: undefined, capabilities: { fanLight: true } } as unknown as DeviceView;
    expect(fanView(v)).toEqual({
      state: { power: false, speed: 1, boost: false, sleep: false, timerHours: 0 },
      caps: { fanLight: true },
    });
  });

  it('uses the last sent state', () => {
    const v = {
      state: { kind: 'fan', state: on, lastSent: true },
      capabilities: {},
    } as unknown as DeviceView;
    expect(fanView(v).state).toBe(on);
  });
});

describe('FanScreen', () => {
  it('renders five speed bars as buttons', async () => {
    await setup();
    for (const n of [1, 2, 3, 4, 5]) {
      const bar = await screen.findByLabelText(t('fan.speed', { n }));
      expect(bar.props.accessibilityRole).toBe('button');
    }
  });

  it('turns the fan on at the tapped speed, sending the full state', async () => {
    const sent = await setup();
    await fireEvent.press(await screen.findByLabelText(t('fan.speed', { n: 4 })));
    await waitFor(() =>
      expect(sent()).toEqual([
        { power: true, speed: 4, boost: false, sleep: false, timerHours: 0 },
      ]),
    );
  });

  it('sends boost', async () => {
    const sent = await setup({}, on);
    await fireEvent.press(await screen.findByLabelText(t('fan.boost')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, boost: true }]));
  });

  it('sends the timer', async () => {
    const sent = await setup({}, on);
    await fireEvent.press(await screen.findByLabelText(t('fan.timer.2')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, timerHours: 2 }]));
  });

  it('flips power', async () => {
    const sent = await setup({}, on);
    await fireEvent.press(await screen.findByLabelText(t('fan.power')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, power: false }]));
  });

  it('has no Light row without fanLight, and toggles light with it', async () => {
    await setup({ fanLight: false }, on);
    await screen.findByLabelText(t('fan.boost'));
    expect(screen.queryByLabelText(t('fan.light'))).toBeNull();
  });

  it('toggles the light', async () => {
    const sent = await setup({ fanLight: true }, on);
    await fireEvent.press(await screen.findByLabelText(t('fan.light')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, light: true }]));
  });

  it('hides Boost, Timer and Sleep the fan does not have', async () => {
    await setup({ fanBoost: false, fanTimer: false, sleep: false }, on);
    await screen.findByLabelText(t('fan.speed', { n: 1 }));
    expect(screen.queryByLabelText(t('fan.boost'))).toBeNull();
    expect(screen.queryByLabelText(t('fan.sleep'))).toBeNull();
    expect(screen.queryByLabelText(t('fan.timer.2'))).toBeNull();
    expect(screen.queryByText(t('fan.timerTitle'))).toBeNull();
  });

  it('keeps the extras enabled while the fan is off; one turns it on with it', async () => {
    const sent = await setup({ sleep: true });
    const boost = await screen.findByLabelText(t('fan.boost'));
    expect(boost.props.accessibilityState.disabled).toBe(false);
    expect(boost.props.accessibilityState.selected).toBe(false);
    await fireEvent.press(boost);
    await waitFor(() => expect(sent().at(-1)).toEqual({ ...on, speed: 1, boost: true }));
  });

  it('lights no extra while the fan is off', async () => {
    await setup({ sleep: true }, { ...on, power: false, sleep: true, timerHours: 2 });
    const sleep = await screen.findByLabelText(t('fan.sleep'));
    expect(sleep.props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText(t('fan.timer.0')).props.accessibilityState.selected).toBe(true);
  });

  it('offers a retry on a timeout or a partial send, not on a missing button', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], [fanDevice()]);
    await s.hub.send('d1', { kind: 'fan.set', state: on });
    await renderWith(s, <FanScreen deviceId="d1" />);
    fake.failNext('timeout');
    await fireEvent.press(await screen.findByLabelText(t('fan.speed', { n: 4 })));
    expect(await screen.findByText(t('fan.error.timeout'))).toBeTruthy();
    expect(screen.getByLabelText(t('common.retry'))).toBeTruthy();
  });

  it('says what went wrong and drops the guess', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], [fanDevice()]);
    await s.hub.send('d1', { kind: 'fan.set', state: on });
    await renderWith(s, <FanScreen deviceId="d1" />);
    fake.failNext('unsupported');
    await fireEvent.press(await screen.findByLabelText(t('fan.speed', { n: 5 })));
    expect(await screen.findByText(t('fan.error.unsupported'))).toBeTruthy();
    expect(screen.getByLabelText(t('fan.speed', { n: 2 })).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('on a phone without IR, draws the controls as usual but inert, and says why on a tap', async () => {
    const sent = await setup({}, undefined, false);
    expect(await screen.findByText("Needs a phone with IR · how it's connected")).toBeTruthy();
    const bar = screen.getByLabelText(t('fan.speed', { n: 3 }));
    expect(bar.props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText(t('fan.power')).props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(bar);
    expect(await screen.findByText(t('fan.error.needsIr'))).toBeTruthy();
    expect(sent()).toEqual([]);
    // Nothing was guessed: the bars stay empty.
    expect(screen.getByLabelText(t('fan.speed', { n: 3 })).props.accessibilityState.selected).toBe(
      false,
    );
  });
});

const rotation = (): string | undefined => {
  const style = StyleSheet.flatten(screen.getByTestId('spinning-icon').props.style) as {
    transform?: { rotate?: string }[];
  };
  return style.transform?.find((x) => x.rotate !== undefined)?.rotate;
};

describe('FanScreen design', () => {
  it('keeps the fan icon still under reduced motion', async () => {
    const { driver } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], [fanDevice()]);
    await s.hub.send('d1', { kind: 'fan.set', state: on });
    await renderWith(s, <FanScreen deviceId="d1" />, { reducedMotion: true, scheme: 'dark' });
    await screen.findByTestId('spinning-icon');
    await new Promise((r) => setTimeout(r, 50));
    expect(rotation()).toBe('0deg');
  });

  it('shows the speed labels and the lit bars for the current speed', async () => {
    await setup({}, on);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(await screen.findByLabelText(t('fan.speed', { n }))).toBeTruthy();
    }
    expect(screen.getByLabelText(t('fan.speed', { n: 2 })).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('shows a skeleton while loading and a quiet message once gone', async () => {
    const { driver } = silentDriver('ir', { capabilities: {} });
    const loading = makeServices([driver]);
    loading.store.devices = () => new Promise(() => undefined);
    loading.store.rooms = () => new Promise(() => undefined);
    await renderWith(loading, <FanScreen deviceId="d1" />);
    expect(await screen.findByTestId('fan-skeleton')).toBeTruthy();
    expect(screen.queryByText(t('fan.notFound'))).toBeNull();
  });

  it('draws power as a switch that follows the state', async () => {
    await setup({ sleep: true }, on);
    const power = await screen.findByLabelText(t('fan.power'));
    expect(power.props.accessibilityRole).toBe('switch');
    expect(power.props.accessibilityState.checked).toBe(true);
  });

  it('shows a retryable error, not "gone", when the store cannot be read', async () => {
    const { driver } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], []);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    s.store.devices = () => Promise.reject(new Error('disk'));
    await renderWith(s, <FanScreen deviceId="d1" />);
    expect(await screen.findByText(t('home.loadFailed'))).toBeTruthy();
    expect(screen.queryByText(t('fan.notFound'))).toBeNull();
    err.mockRestore();
  });

  it('says the fan is gone once the store has loaded without it', async () => {
    const { driver } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], []);
    await renderWith(s, <FanScreen deviceId="d1" />);
    expect(await screen.findByText(t('fan.notFound'))).toBeTruthy();
  });

  it('shows a failed send in a toast', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: {} });
    const s = await servicesWith([driver], [fanDevice()]);
    await s.hub.send('d1', { kind: 'fan.set', state: on });
    await renderWith(s, <FanScreen deviceId="d1" />);
    fake.failNext('notSent');
    await fireEvent.press(await screen.findByLabelText(t('fan.speed', { n: 4 })));
    expect(await screen.findByTestId('toast')).toBeTruthy();
    expect(screen.getByLabelText(t('common.retry'))).toBeTruthy();
  });

  it('has no dot glyph in the status line', async () => {
    await setup({}, on);
    await screen.findByLabelText(t('fan.speed', { n: 1 }));
    expect(screen.queryByText(/●/)).toBeNull();
  });
});

describe('FanScreen quick taps and restarts', () => {
  it('builds each press on the latest intended state', async () => {
    const held = heldDriver({});
    const s = await servicesWith([held.driver], [fanDevice()]);
    await s.prefs.set({ lastSent: { d1: { kind: 'fan', state: on } } });
    await renderWith(s, <FanScreen deviceId="d1" />);
    await screen.findByLabelText(t('fan.speed', { n: 2 }));
    await fireEvent.press(screen.getByLabelText(t('fan.speed', { n: 3 })));
    await fireEvent.press(screen.getByLabelText(t('fan.boost')));
    await held.release();
    expect(screen.getByLabelText(t('fan.speed', { n: 3 })).props.accessibilityState.selected).toBe(
      true,
    );
    await held.release();
    expect(held.sent.map((c) => (c.kind === 'fan.set' ? c.state : null))).toEqual([
      { ...on, speed: 3 },
      { ...on, speed: 3, boost: true },
    ]);
  });

  it('tells the IR driver what the fan was doing, so power off sends the off key', async () => {
    const emitter = createFakeEmitter();
    const s = await servicesWith(
      [createIrDriver({ emitter, gapMs: 0 })],
      [fanDevice({ links: [{ kind: 'ir', remoteId: 'atomberg-fan/nec' }] })],
    );
    await s.prefs.set({ lastSent: { d1: { kind: 'fan', state: { ...on, speed: 4 } } } });
    await renderWith(s, <FanScreen deviceId="d1" />);
    await waitFor(() =>
      expect(
        screen.getByLabelText(t('fan.speed', { n: 4 })).props.accessibilityState.selected,
      ).toBe(true),
    );
    await fireEvent.press(screen.getByLabelText(t('fan.power')));
    await waitFor(() => expect(emitter.sent).toHaveLength(1));
    await waitFor(async () =>
      expect((await s.prefs.get()).lastSent.d1).toMatchObject({
        kind: 'fan',
        state: { power: false },
      }),
    );
  });
});

describe('FanScreen seeding', () => {
  it('does not seed the driver over a state the hub already holds', async () => {
    const emitter = createFakeEmitter();
    const s = await servicesWith(
      [createIrDriver({ emitter, gapMs: 0 })],
      [fanDevice({ links: [{ kind: 'ir', remoteId: 'atomberg-fan/nec' }] })],
    );
    const seed = jest.spyOn(s.ir, 'seedFan');
    await s.hub.send('d1', { kind: 'fan.set', state: { ...on, speed: 5 } });
    await s.prefs.set({ lastSent: { d1: { kind: 'fan', state: { ...on, speed: 1 } } } });
    await renderWith(s, <FanScreen deviceId="d1" />);
    await waitFor(async () => expect((await s.prefs.get()).lastSent.d1).toBeDefined());
    await new Promise((r) => setTimeout(r, 20));
    expect(seed).not.toHaveBeenCalled();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

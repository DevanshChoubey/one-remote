import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Capabilities, FanState } from '@/core';
import { t } from '@/i18n';
import { FanScreen } from '@/screens/appliance/FanScreen';
import { fanView } from '@/screens/appliance/fanModel';
import type { DeviceView } from '@/services';
import { renderWith } from '../helpers';
import { fanDevice, servicesWith, silentDriver } from './applianceHelpers';

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

  it('disables the extras while the fan is off', async () => {
    await setup({ sleep: true });
    const boost = await screen.findByLabelText(t('fan.boost'));
    expect(boost.props.accessibilityState.disabled).toBe(true);
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

  it('on a phone without IR, says so and disables the bars', async () => {
    await setup({}, undefined, false);
    expect(await screen.findByText('Needs a phone with IR')).toBeTruthy();
    const bar = screen.getByLabelText(t('fan.speed', { n: 3 }));
    expect(bar.props.accessibilityState.disabled).toBe(true);
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

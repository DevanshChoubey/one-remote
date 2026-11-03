import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { processColor } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { defaultAcState } from '@/core';
import type { AcState, Capabilities } from '@/core';
import { t } from '@/i18n';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Dial } from '@/ui/appliance';
import { makeServices, renderWith } from '../helpers';
import { acDevice, heldDriver, servicesWith, silentDriver } from './applianceHelpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const FULL: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  swing: true,
  sleep: true,
};

// The fan chip is a button around a labelled chip, so its label matches twice: take the button.
const fanChip = async (): Promise<ReactTestInstance> => {
  const [button] = await screen.findAllByLabelText(t('ac.fanAuto'));
  if (!button) throw new Error('no fan chip');
  return button;
};

const at = (temp: number): string => t('ac.setpoint', { temp, mode: t('ac.modeName.cool') });

const on: AcState = { ...defaultAcState(), power: true };

async function setup(
  caps: object = FULL,
  start?: AcState,
): Promise<{ sent: () => AcState[]; fake: ReturnType<typeof silentDriver>['fake'] }> {
  const { driver, fake } = silentDriver('ir', { capabilities: caps });
  const s = await servicesWith([driver], [acDevice()]);
  if (start) await s.hub.send('d1', { kind: 'ac.set', state: start });
  fake.sent.length = 0;
  await renderWith(s, <AcScreen deviceId="d1" />);
  return {
    fake,
    sent: () => fake.sent.flatMap((x) => (x.cmd.kind === 'ac.set' ? [x.cmd.state] : [])),
  };
}

beforeEach(() => mockPush.mockClear());

describe('AcScreen design', () => {
  it('marks the current mode in the segmented control', async () => {
    await setup(FULL, on);
    const cool = await screen.findByLabelText(t('ac.mode.cool'));
    expect(cool.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(t('ac.mode.dry')).props.accessibilityState.selected).toBe(false);
  });

  it('says how to turn on when the AC is off', async () => {
    await setup(FULL);
    expect(await screen.findByText(t('ac.offHint'))).toBeTruthy();
    expect(screen.getByLabelText(t('ac.off'))).toBeTruthy();
  });

  it('shows the dial arc in the cool tone, and the auto mode in the accent tone', async () => {
    await setup(FULL, on);
    expect((await screen.findByTestId('dial-arc')).props.stroke.payload).toBe(
      processColor(lightTokens.color.cool),
    );
    await fireEvent.press(screen.getByLabelText(t('ac.mode.auto')));
    await waitFor(() =>
      expect(screen.getByTestId('dial-arc').props.stroke.payload).toBe(
        processColor(lightTokens.color.accent),
      ),
    );
  });

  it('cycles the fan speed from one chip', async () => {
    const { sent } = await setup(FULL, on);
    await fireEvent.press(await fanChip());
    await waitFor(() => expect(sent()).toEqual([{ ...on, fan: 1 }]));
  });

  it('shows a dial skeleton, not "not in the app", while the view loads', async () => {
    const { driver } = silentDriver('ir', { capabilities: FULL });
    const s = makeServices([driver]);
    s.store.devices = () => new Promise(() => undefined);
    s.store.rooms = () => new Promise(() => undefined);
    await renderWith(s, <AcScreen deviceId="d1" />);
    expect(await screen.findByTestId('dial-skeleton')).toBeTruthy();
    expect(screen.queryByText(t('ac.notFound'))).toBeNull();
  });

  it('says the AC is gone once the store has loaded without it', async () => {
    const { driver } = silentDriver('ir', { capabilities: FULL });
    const s = await servicesWith([driver], []);
    await renderWith(s, <AcScreen deviceId="d1" />);
    expect(await screen.findByText(t('ac.notFound'))).toBeTruthy();
    expect(screen.queryByTestId('dial-skeleton')).toBeNull();
  });

  it('puts a failed send in a toast with a retry that sends again', async () => {
    const { fake, sent } = await setup(FULL, on);
    fake.failNext('notSent');
    await fireEvent.press(await screen.findByLabelText(t('ac.raise')));
    const toast = await screen.findByTestId('toast');
    expect(toast).toBeTruthy();
    expect(screen.getByText(t('ac.error.notSent'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('common.retry')));
    await waitFor(() => expect(sent().at(-1)).toEqual({ ...on, setpoint: 25 }));
  });

  it('has no dot glyph in the connected line', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: FULL });
    const s = await servicesWith(
      [{ ...driver, kind: 'matter', observe: fake.observe }, silentDriver('ir').driver],
      [acDevice({ links: [{ kind: 'matter', nodeId: '1' }] })],
    );
    await renderWith(s, <AcScreen deviceId="d1" />);
    await screen.findByLabelText(t('ac.status.connected'));
    expect(screen.queryByText(/●/)).toBeNull();
  });
});

describe('Dial accessibility', () => {
  it('is adjustable and steps like the steppers', async () => {
    const { sent } = await setup(FULL, on);
    const dial = await screen.findByLabelText(at(24));
    expect(dial.props.accessibilityRole).toBe('adjustable');
    expect(dial.props.accessibilityValue).toEqual({ min: 16, max: 30, now: 24 });
    await fireEvent(dial, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await waitFor(() => expect(sent()).toEqual([{ ...on, setpoint: 25 }]));
    await fireEvent(screen.getByLabelText(at(25)), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    await waitFor(() => expect(sent()).toEqual([{ ...on, setpoint: 25 }, on]));
  });

  it('hints that the fan chip cycles', async () => {
    await setup(FULL, on);
    const chip = await fanChip();
    expect(chip.props.accessibilityHint).toBe(t('ac.fanHint'));
  });
});

describe('Dial', () => {
  const dial = (
    scheme: 'light' | 'dark',
    tone: 'cool' | 'accent' = 'cool',
  ): ReturnType<typeof Dial> => (
    // The element is built inside a provider by the caller below.
    <Dial value={24} min={16} max={30} on tone={tone} caption="Cool" accessibilityLabel={scheme} />
  );

  it('recolours the arc when the theme changes while it is open', async () => {
    const view = await render(<ThemeProvider scheme="light">{dial('light')}</ThemeProvider>);
    expect(screen.getByTestId('dial-arc').props.stroke.payload).toBe(
      processColor(lightTokens.color.cool),
    );
    await view.rerender(<ThemeProvider scheme="dark">{dial('dark')}</ThemeProvider>);
    expect(screen.getByTestId('dial-arc').props.stroke.payload).toBe(
      processColor(darkTokens.color.cool),
    );
    // The accent differs between the themes, so this one proves the arc is not a stale capture.
    await view.rerender(<ThemeProvider scheme="light">{dial('light', 'accent')}</ThemeProvider>);
    await view.rerender(<ThemeProvider scheme="dark">{dial('dark', 'accent')}</ThemeProvider>);
    expect(screen.getByTestId('dial-arc').props.stroke.payload).toBe(
      processColor(darkTokens.color.accent),
    );
  });

  it('shows "Off" and the hint instead of a number when off', async () => {
    await render(
      <ThemeProvider scheme="dark" reducedMotion>
        <Dial
          value={24}
          min={16}
          max={30}
          on={false}
          tone="ink2"
          caption={t('ac.offHint')}
          accessibilityLabel={t('ac.off')}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText(t('ac.off'))).toBeTruthy();
    expect(screen.getByText(t('ac.offHint'))).toBeTruthy();
  });
});

describe('AcScreen', () => {
  it('sends the full state with the setpoint raised', async () => {
    const { sent } = await setup(FULL, on);
    await fireEvent.press(await screen.findByLabelText(t('ac.raise')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, setpoint: 25 }]));
  });

  it('sends the mode on a chip press', async () => {
    const { sent } = await setup(FULL, on);
    await fireEvent.press(await screen.findByLabelText(t('ac.mode.dry')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, mode: 'dry' }]));
  });

  it('shows the sent state at once', async () => {
    await setup(FULL, on);
    await fireEvent.press(await screen.findByLabelText(t('ac.raise')));
    expect(await screen.findByLabelText(at(25))).toBeTruthy();
  });

  it('shows only the controls the AC supports', async () => {
    await setup({ sleep: false, swing: false, acModes: ['cool', 'dry'] }, on);
    await screen.findByLabelText(t('ac.mode.cool'));
    expect(screen.getByLabelText(t('ac.mode.dry'))).toBeTruthy();
    expect(screen.queryByLabelText(t('ac.sleep'))).toBeNull();
    expect(screen.queryByLabelText(t('ac.swing'))).toBeNull();
    expect(screen.queryByLabelText(t('ac.mode.fan'))).toBeNull();
    expect(screen.queryByLabelText(t('ac.mode.auto'))).toBeNull();
  });

  it('shows the room temperature when the AC reports it', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: FULL });
    // A reporting driver: the hub keeps what it observes.
    const reporting = { ...driver, observe: fake.observe };
    const s = await servicesWith([reporting], [acDevice()]);
    await renderWith(s, <AcScreen deviceId="d1" />);
    await act(async () => {
      fake.emit('d1', { kind: 'ac', state: on, roomTemp: 27 });
    });
    expect(await screen.findByText('Bedroom · 27° in the room')).toBeTruthy();
  });

  it('has no room temperature line on IR only', async () => {
    await setup(FULL, on);
    await screen.findByLabelText(t('ac.raise'));
    expect(screen.queryByText(/in the room/)).toBeNull();
    expect(screen.getByText('Bedroom')).toBeTruthy();
  });

  it('disables everything but power while the AC is off', async () => {
    await setup(FULL);
    const minus = await screen.findByLabelText(t('ac.lower'));
    expect(minus.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(t('ac.raise')).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(t('ac.mode.dry')).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(t('ac.power')).props.accessibilityState.disabled).toBe(false);
  });

  it('turns on with the power button', async () => {
    const { sent } = await setup(FULL);
    await fireEvent.press(await screen.findByLabelText(t('ac.power')));
    await waitFor(() => expect(sent()).toEqual([{ ...defaultAcState(), power: true }]));
  });

  it('disables + at the maximum and sends nothing', async () => {
    const { sent } = await setup(FULL, { ...on, setpoint: 30 });
    const plus = await screen.findByLabelText(t('ac.raise'));
    expect(plus.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(plus);
    expect(sent()).toEqual([]);
  });

  it('disables - at the minimum', async () => {
    await setup(FULL, { ...on, setpoint: 16 });
    const minus = await screen.findByLabelText(t('ac.lower'));
    expect(minus.props.accessibilityState.disabled).toBe(true);
  });

  it.each([
    ['notSent', "Couldn't send. Try again"],
    ['timeout', "The AC didn't answer. Try again"],
    ['noIrEmitter', 'Needs a phone with IR'],
  ] as const)('says what went wrong on %s', async (code, text) => {
    const { fake } = await setup(FULL, on);
    fake.failNext(code);
    await fireEvent.press(await screen.findByLabelText(t('ac.raise')));
    expect(await screen.findByText(text)).toBeTruthy();
    // The guess is dropped: the dial goes back to what the hub holds.
    expect(await screen.findByLabelText(at(24))).toBeTruthy();
  });

  it('shows that a phone with IR is needed when the link is unusable', async () => {
    const { driver } = silentDriver('ir', { capabilities: FULL, available: false });
    const s = await servicesWith([driver], [acDevice()]);
    await renderWith(s, <AcScreen deviceId="d1" />);
    expect(await screen.findByText('Needs a phone with IR')).toBeTruthy();
    expect(screen.getByLabelText(t('ac.power')).props.accessibilityState.disabled).toBe(true);
  });

  it('opens the device sheet from the connected line', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: FULL });
    const s = await servicesWith(
      [{ ...driver, kind: 'matter', observe: fake.observe }, silentDriver('ir').driver],
      [acDevice({ links: [{ kind: 'matter', nodeId: '1' }] })],
    );
    await renderWith(s, <AcScreen deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('ac.status.connected')));
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/d1');
  });
});

describe('AcScreen quick taps and restarts', () => {
  it('adds up quick taps and keeps the dial on the intended state while sends are queued', async () => {
    const held = heldDriver(FULL);
    const s = await servicesWith([held.driver], [acDevice()]);
    await s.prefs.set({ lastSent: { d1: { kind: 'ac', state: on } } });
    await renderWith(s, <AcScreen deviceId="d1" />);
    await screen.findByLabelText(at(24));
    const plus = screen.getByLabelText(t('ac.raise'));
    await fireEvent.press(plus);
    await fireEvent.press(plus);
    await fireEvent.press(plus);
    expect(await screen.findByLabelText(at(27))).toBeTruthy();
    await held.release(); // first of the three sends completes
    expect(screen.getByLabelText(at(27))).toBeTruthy();
    await held.release();
    await held.release();
    expect(held.sent.flatMap((c) => (c.kind === 'ac.set' ? [c.state.setpoint] : []))).toEqual([
      25, 26, 27,
    ]);
  });

  it('goes back to the last confirmed state when a send fails', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: FULL });
    const s = await servicesWith([driver], [acDevice()]);
    await s.hub.send('d1', { kind: 'ac.set', state: on });
    await renderWith(s, <AcScreen deviceId="d1" />);
    fake.failNext('notSent');
    await fireEvent.press(await screen.findByLabelText(t('ac.raise')));
    expect(await screen.findByText("Couldn't send. Try again")).toBeTruthy();
    expect(screen.getByLabelText(at(24))).toBeTruthy();
  });

  it('restores the last state sent after a restart, and remembers new ones', async () => {
    const { driver, fake } = silentDriver('ir', { capabilities: FULL });
    const s = await servicesWith([driver], [acDevice()]);
    await s.prefs.set({ lastSent: { d1: { kind: 'ac', state: { ...on, setpoint: 21 } } } });
    await renderWith(s, <AcScreen deviceId="d1" />);
    expect(await screen.findByLabelText(at(21))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('ac.raise')));
    await waitFor(async () =>
      expect((await s.prefs.get()).lastSent.d1).toEqual({
        kind: 'ac',
        state: { ...on, setpoint: 22 },
      }),
    );
    expect(fake.sent).toHaveLength(1);
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

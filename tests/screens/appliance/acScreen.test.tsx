import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { defaultAcState } from '@/core';
import type { AcState, Capabilities } from '@/core';
import { t } from '@/i18n';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { renderWith } from '../helpers';
import { acDevice, servicesWith, silentDriver } from './applianceHelpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const FULL: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  swing: true,
  sleep: true,
};

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
    expect(await screen.findByText('25°')).toBeTruthy();
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
    expect(await screen.findByText('24°')).toBeTruthy();
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

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

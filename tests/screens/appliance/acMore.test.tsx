import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { defaultAcState } from '@/core';
import type { AcState, Capabilities } from '@/core';
import { t } from '@/i18n';
import { panasonicCaps } from '@/ir/lgpl/panasonicAc';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { renderWith } from '../helpers';
import { acDevice, servicesWith, silentDriver } from './applianceHelpers';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const DKE = panasonicCaps('dke');
const JKE = panasonicCaps('jke');
const MATTER: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  swing: true,
  sleep: false,
};

const on: AcState = { ...defaultAcState(), power: true };

async function setup(
  caps: Capabilities,
  start: AcState = on,
  available = true,
): Promise<{ sent: () => AcState[] }> {
  const { driver, fake } = silentDriver('ir', { capabilities: caps, available });
  const s = await servicesWith([driver], [acDevice()]);
  if (available) await s.hub.send('d1', { kind: 'ac.set', state: start });
  fake.sent.length = 0;
  await renderWith(s, <AcScreen deviceId="d1" />);
  return {
    sent: () => fake.sent.flatMap((x) => (x.cmd.kind === 'ac.set' ? [x.cmd.state] : [])),
  };
}

// A chip is a button around a labelled chip, so its label matches twice: take the button.
const first = async (label: string): Promise<ReactTestInstance> => {
  const [el] = await screen.findAllByLabelText(label);
  if (!el) throw new Error(`no ${label}`);
  return el;
};

const openMore = async (): Promise<void> => {
  await fireEvent.press(await first(t('ac.more')));
  await screen.findByTestId('ac-more-panel');
};

describe('AC More', () => {
  it('is not offered when the AC has no extras (a Matter AC)', async () => {
    await setup(MATTER);
    await screen.findByLabelText(t('ac.mode.cool'));
    expect(screen.queryByLabelText(t('ac.more'))).toBeNull();
  });

  it('opens a sheet with Strength, Up and down, Left and right and nanoe on a DKE', async () => {
    await setup(DKE);
    await openMore();
    expect(screen.getByLabelText(t('ac.strengthTitle'))).toBeTruthy();
    expect(screen.getByLabelText(t('ac.swingVTitle'))).toBeTruthy();
    expect(screen.getByText(t('ac.swingHTitle'))).toBeTruthy();
    expect(screen.getByLabelText(t('ac.ion'))).toBeTruthy();
  });

  it('hides left and right and nanoe on a model without them', async () => {
    await setup(JKE);
    await openMore();
    expect(screen.getByLabelText(t('ac.strengthTitle'))).toBeTruthy();
    expect(screen.queryByText(t('ac.swingHTitle'))).toBeNull();
    expect(screen.queryByLabelText(t('ac.ion'))).toBeNull();
  });

  it('sends Powerful, then Quiet turns Powerful off, then Normal turns both off', async () => {
    const { sent } = await setup(DKE);
    await openMore();
    await fireEvent.press(screen.getByLabelText(t('ac.strength.powerful')));
    await waitFor(() => expect(sent().at(-1)).toMatchObject({ powerful: true, quiet: false }));
    await fireEvent.press(screen.getByLabelText(t('ac.strength.quiet')));
    await waitFor(() => expect(sent().at(-1)).toMatchObject({ powerful: false, quiet: true }));
    await fireEvent.press(screen.getByLabelText(t('ac.strength.normal')));
    await waitFor(() => expect(sent().at(-1)).toMatchObject({ powerful: false, quiet: false }));
    expect(screen.getByLabelText(t('ac.strength.normal')).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('sends a vertical position as the whole state, with swing off', async () => {
    const { sent } = await setup(DKE, { ...on, swing: true });
    await openMore();
    const upDown = within(screen.getByLabelText(t('ac.swingVTitle')));
    expect(upDown.getByLabelText(t('ac.swingV.auto')).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(upDown.getByLabelText('2'));
    await waitFor(() => expect(sent()).toEqual([{ ...on, swing: false, swingV: 2 }]));
  });

  it('marks the middle position for an old state with swing off', async () => {
    await setup(DKE, { ...on, swing: false });
    await openMore();
    expect(screen.getByLabelText('3').props.accessibilityState.selected).toBe(true);
  });

  it('sends a horizontal direction', async () => {
    const { sent } = await setup(DKE);
    await openMore();
    await fireEvent.press(await first(t('ac.swingH.fullLeft')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, swingH: 'fullLeft' }]));
  });

  it('turns nanoe on', async () => {
    const { sent } = await setup(DKE);
    await openMore();
    await fireEvent.press(screen.getByLabelText(t('ac.ion')));
    await waitFor(() => expect(sent()).toEqual([{ ...on, ion: true }]));
  });

  it('cycles the fan through five speeds', async () => {
    const { sent } = await setup(DKE, { ...on, fan: 4 });
    await fireEvent.press(await first(t('ac.fanChip', { speed: 4 })));
    await waitFor(() => expect(sent()).toEqual([{ ...on, fan: 5 }]));
  });

  it('is not offered on a phone without IR, which has no capabilities for the AC', async () => {
    await setup(DKE, on, false);
    expect(await screen.findByText(t('ac.status.needsIr'))).toBeTruthy();
    expect(screen.queryByLabelText(t('ac.more'))).toBeNull();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

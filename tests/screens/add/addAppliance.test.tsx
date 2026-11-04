import { Linking } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { LinkDriver } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import type { MatterStepProps } from '@/screens/add/appliance/AddApplianceFlow';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { darkTokens } from '@/theme';
import { Button } from '@/ui';
import { createIrDriver } from '@/ir/driver';
import { renderWith, room, surfaceStyle } from '../helpers';

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

interface Setup {
  s: Services;
  sendTest: jest.Mock;
}

async function setup(opts: { hasIr: boolean; matter?: boolean }): Promise<Setup> {
  const emitter = createFakeEmitter({ has: opts.hasIr });
  const real = createIrSetup({ emitter });
  const sendTest = jest.fn(real.sendTest);
  const drivers: LinkDriver[] = [createIrDriver({ emitter })];
  if (opts.matter) drivers.push(createFakeDriver('matter'));
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
    ir: { ...real, sendTest },
  });
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  return { s, sendTest };
}

const press = (label: string): Promise<unknown> => fireEvent.press(screen.getByLabelText(label));

beforeEach(() => mockDismissAll.mockClear());

describe('Add AC on a phone without IR', () => {
  it('shows the no-IR screen and adds the device anyway, greyed on Home', async () => {
    const { s } = await setup({ hasIr: false });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(await screen.findByText(t('addAppliance.noIrTitle'))).toBeTruthy();
    expect(screen.queryByLabelText(t('addAppliance.scanMatter'))).toBeNull();
    await press(t('addAppliance.addAnyway'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    const saved = (await s.store.devices())[0];
    expect(saved).toMatchObject({
      kind: 'ac',
      name: 'Panasonic AC',
      links: [{ kind: 'ir', remoteId: 'panasonic-ac/dke' }],
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await renderWith(s, <HomeScreen />);
    expect(await screen.findByText(t('home.needsIr'))).toBeTruthy();
  });
});

describe('Add AC on a phone with IR', () => {
  it('tests candidate 1 of 5 and saves the remote that worked', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    expect(screen.getByText(t('addAppliance.press.acOnCool24'))).toBeTruthy();
    // Before a send there is only Test: the answer buttons appear once the test went out.
    expect(screen.queryByLabelText(t('addAppliance.yes'))).toBeNull();
    expect(screen.getByLabelText(t('addAppliance.test'))).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith('panasonic-ac/dke', 'acOnCool24'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    expect(screen.queryByLabelText(t('addAppliance.test'))).toBeNull();
    await press(t('addAppliance.yes'));
    expect(await screen.findByText(t('addAppliance.press.acUp25'))).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenLastCalledWith('panasonic-ac/dke', 'acUp25'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    expect(screen.queryByLabelText(t('addAppliance.test'))).toBeNull();
    await press(t('addAppliance.yes'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([
        { kind: 'ir', remoteId: 'panasonic-ac/dke' },
      ]),
    );
  });

  it('says there are no codes when every candidate fails', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    for (let n = 1; n <= 5; n++) {
      expect(await screen.findByText(`Panasonic · try ${n} of 5`)).toBeTruthy();
      await press(t('addAppliance.test'));
      await screen.findByLabelText(t('addAppliance.no'));
      await press(t('addAppliance.no'));
    }
    expect(await screen.findByText(t('addAppliance.noCodesAc'))).toBeTruthy();
    await press(t('addAppliance.home'));
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('offers Skip on the IR test, which goes to No codes (mock)', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    await press(t('addAppliance.skip'));
    expect(await screen.findByText(t('addAppliance.noCodesAc'))).toBeTruthy();
  });

  it('has no Yes before Test was pressed', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(screen.queryByLabelText(t('addAppliance.yes'))).toBeNull();
    expect(screen.queryByLabelText(t('addAppliance.no'))).toBeNull();
    expect(screen.getByText(t('addAppliance.press.acOnCool24'))).toBeTruthy();
  });

  it('shows try n of total on the progress bar', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(20);
    await press(t('addAppliance.test'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    await press(t('addAppliance.no'));
    expect(await screen.findByText('Panasonic · try 2 of 5')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(40);
  });

  it('says so when the test could not be sent', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    sendTest.mockRejectedValueOnce(new Error('boom'));
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press(t('addAppliance.test'));
    expect(await screen.findByText(t('addAppliance.testFailed'))).toBeTruthy();
  });
});

describe('Add fan', () => {
  it('lists Atomberg and a disabled row for other brands', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="fan" />);
    expect(await screen.findByLabelText('Atomberg')).toBeTruthy();
    expect(screen.queryByLabelText('Panasonic')).toBeNull();
    // A quiet card, not a choice: no button to press (mock).
    expect(screen.getByText(t('addAppliance.otherBrandsRow'))).toBeTruthy();
    expect(screen.queryByLabelText(t('addAppliance.otherBrandsRow'))).toBeNull();
  });

  it('starts the IR test with speed 3 and suggests "{brand} fan"', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="fan" />);
    await fireEvent.press(await screen.findByLabelText('Atomberg'));
    expect(await screen.findByText('Atomberg · try 1 of 2')).toBeTruthy();
    expect(screen.getByText(t('addAppliance.pointFan'))).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith(expect.any(String), 'fanSpeed3'));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    expect(screen.queryByLabelText(t('addAppliance.test'))).toBeNull();
    await press(t('addAppliance.yes'));
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    expect(screen.queryByLabelText(t('addAppliance.test'))).toBeNull();
    await press(t('addAppliance.yes'));
    expect(await screen.findByDisplayValue('Atomberg fan')).toBeTruthy();
  });

  it('shows the no-IR screen for a fan on a phone without IR', async () => {
    const { s } = await setup({ hasIr: false });
    await renderWith(s, <AddApplianceFlow kind="fan" />);
    await fireEvent.press(await screen.findByLabelText('Atomberg'));
    expect(await screen.findByText(t('addAppliance.noIrTitle'))).toBeTruthy();
  });
});

describe('IrTestStep timing', () => {
  it('shows Test as busy while sending, then Yes and No, never a second send', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    let finish: () => void = () => undefined;
    sendTest.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press(t('addAppliance.test'));
    expect(screen.getByLabelText(t('addAppliance.test')).props.accessibilityState.busy).toBe(true);
    expect(screen.queryByLabelText(t('addAppliance.yes'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(t('addAppliance.test')));
    expect(sendTest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Panasonic · try 1 of 5')).toBeTruthy();
    await act(async () => finish());
    await waitFor(() => expect(screen.getByLabelText(t('addAppliance.yes'))).toBeTruthy());
    expect(screen.getByLabelText(t('addAppliance.no'))).toBeTruthy();
  });
});

describe('Add appliance in dark and reduced motion', () => {
  it('renders the brand and test steps with the dark surface', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />, { scheme: 'dark', reducedMotion: true });
    const card = await screen.findByLabelText('Panasonic');
    expect(surfaceStyle(card).backgroundColor).toBe(darkTokens.color.surface);
    expect(screen.getByText(t('addAppliance.brandMatter'))).toBeTruthy();
    await fireEvent.press(card);
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
  });
});

describe('Brand missing', () => {
  it('opens a mail draft and sends nothing itself', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText(t('addAppliance.brandMissing')));
    expect(open).toHaveBeenCalledWith(
      'mailto:devanshc13@gmail.com?subject=One%20Remote%20brand%20request',
    );
    open.mockRestore();
  });
});

describe('the Matter step', () => {
  const matterStep = (p: MatterStepProps): React.JSX.Element => (
    <Button
      label="Pair"
      onPress={() => {
        p.onLink({ kind: 'matter', nodeId: 'n1' });
        p.onDone({ kind: 'matter', nodeId: 'n1' });
      }}
    />
  );

  it('saves a commissioned device when the flow is left before it is named', async () => {
    const { s } = await setup({ hasIr: true, matter: true });
    const onlyLink = (p: MatterStepProps): React.JSX.Element => (
      <Button label="Joined" onPress={() => p.onLink({ kind: 'matter', nodeId: 'n9' })} />
    );
    await renderWith(s, <AddApplianceFlow kind="ac" renderMatterStep={onlyLink} />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press('Joined');
    screen.unmount();
    await waitFor(async () =>
      expect((await s.store.devices())[0]).toMatchObject({
        links: [{ kind: 'matter', nodeId: 'n9' }],
        roomId: 'r1',
      }),
    );
  });

  it('saves once when the flow is left while the named save is still being written', async () => {
    const { s } = await setup({ hasIr: true, matter: true });
    await renderWith(s, <AddApplianceFlow kind="ac" renderMatterStep={matterStep} />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press('Pair');
    await press(t('addAppliance.skip'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    // Press Done and leave in the same tick, before the write resolves.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(t('common.done')));
      screen.unmount();
    });
    await waitFor(async () => expect(await s.store.devices()).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await s.store.devices()).toHaveLength(1);
  });

  it('offers it when plugged in, then an IR backup that can be skipped', async () => {
    const { s } = await setup({ hasIr: true, matter: true });
    await renderWith(s, <AddApplianceFlow kind="ac" renderMatterStep={matterStep} />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press('Pair');
    expect(await screen.findByText('Panasonic · try 1 of 5')).toBeTruthy();
    await press(t('addAppliance.skip'));
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
    await press(t('common.done'));
    await waitFor(async () =>
      expect((await s.store.devices())[0]?.links).toEqual([{ kind: 'matter', nodeId: 'n1' }]),
    );
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

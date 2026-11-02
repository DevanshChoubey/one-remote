import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { LinkDriver } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import type { MatterStepProps } from '@/screens/add/appliance/AddApplianceFlow';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { ThemeProvider } from '@/theme';
import { Button } from '@/ui';
import { createIrDriver } from '@/ir/driver';
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
    await render(
      <ThemeProvider scheme="light">
        <ServicesProvider services={s}>
          <HomeScreen />
        </ServicesProvider>
      </ThemeProvider>,
    );
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
    expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
      true,
    );
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith('panasonic-ac/dke', 'acOnCool24'));
    await waitFor(() =>
      expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
        false,
      ),
    );
    await press(t('addAppliance.yes'));
    expect(await screen.findByText(t('addAppliance.press.acUp25'))).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenLastCalledWith('panasonic-ac/dke', 'acUp25'));
    await waitFor(() =>
      expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
        false,
      ),
    );
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
      await press(t('addAppliance.no'));
    }
    expect(await screen.findByText(t('addAppliance.noCodesAc'))).toBeTruthy();
    await press(t('addAppliance.home'));
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('does not take Yes before Test was pressed', async () => {
    const { s } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press(t('addAppliance.yes'));
    expect(screen.getByText(t('addAppliance.press.acOnCool24'))).toBeTruthy();
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
    expect(
      screen.getByLabelText(t('addAppliance.otherBrandsRow')).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('starts the IR test with speed 3 and suggests "{brand} fan"', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    await renderWith(s, <AddApplianceFlow kind="fan" />);
    await fireEvent.press(await screen.findByLabelText('Atomberg'));
    expect(await screen.findByText('Atomberg · try 1 of 2')).toBeTruthy();
    expect(screen.getByText(t('addAppliance.pointFan'))).toBeTruthy();
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith(expect.any(String), 'fanSpeed3'));
    await waitFor(() =>
      expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
        false,
      ),
    );
    await press(t('addAppliance.yes'));
    await press(t('addAppliance.test'));
    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
        false,
      ),
    );
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
  it('disables Yes and No while a Test is sending, and ignores a double Yes', async () => {
    const { s, sendTest } = await setup({ hasIr: true });
    let finish: () => void = () => undefined;
    sendTest.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderWith(s, <AddApplianceFlow kind="ac" />);
    await fireEvent.press(await screen.findByLabelText('Panasonic'));
    await press(t('addAppliance.test'));
    expect(screen.getByLabelText(t('addAppliance.no')).props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByLabelText(t('addAppliance.no')));
    expect(screen.getByText('Panasonic · try 1 of 5')).toBeTruthy();
    await act(async () => finish());
    await waitFor(() =>
      expect(screen.getByLabelText(t('addAppliance.yes')).props.accessibilityState.disabled).toBe(
        false,
      ),
    );
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
    <Button label="Pair" onPress={() => p.onDone({ kind: 'matter', nodeId: 'n1' })} />
  );

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

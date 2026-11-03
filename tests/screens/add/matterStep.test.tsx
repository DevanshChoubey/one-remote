import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { MatterError } from '@/core/matterSetup';
import type { MatterSetup } from '@/core/matterSetup';
import { t } from '@/i18n';
import { darkTokens } from '@/theme';
import { MatterStep } from '@/screens/add/appliance/MatterStep';
import { makeServices, renderWith } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const link = { kind: 'matter', nodeId: '7' } as const;

function stub(commission: MatterSetup['commission']): MatterSetup {
  return {
    available: () => true,
    parseCode: (input) =>
      /^\d{11}$/.test(input.replace(/-/g, ''))
        ? { kind: 'manual', digits: input.replace(/-/g, '') }
        : null,
    commission,
  };
}

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()],
  CameraView: () => null,
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: () => Promise.resolve('') }));

async function open(
  m: MatterSetup,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): Promise<{ onDone: jest.Mock; onSkip: jest.Mock; onLink: jest.Mock }> {
  const onLink = jest.fn();
  const onDone = jest.fn();
  const onSkip = jest.fn();
  await renderWith(
    { ...makeServices(), matter: m },
    <MatterStep brandId="panasonic" onLink={onLink} onDone={onDone} onSkip={onSkip} />,
    opts,
  );
  return { onDone, onSkip, onLink };
}

describe('MatterStep', () => {
  it('rejects a malformed code without calling the network', async () => {
    const commission = jest.fn();
    await open(stub(commission));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '123');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    expect(screen.getByText(t('matter.badCode'))).toBeTruthy();
    expect(commission).not.toHaveBeenCalled();
  });

  it('commissions a valid code and hands back the link', async () => {
    const commission = jest.fn(async (_c, onStep: (s: 'found') => void) => {
      onStep('found');
      return link;
    });
    const { onDone } = await open(stub(commission as unknown as MatterSetup['commission']));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(
      await screen.findByLabelText(t('matter.codeLabel')),
      '3497-0112-332',
    );
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
  });

  it('shows the failing step and lets the user retry', async () => {
    const commission = jest.fn(async () => {
      throw new MatterError('notFound', 'found');
    });
    await open(stub(commission));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(screen.getByText(t('matter.error.notFound'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('matter.retry')));
    expect(screen.getByText(t('matter.connect'))).toBeTruthy();
  });

  it('marks the failed step and the steps before it on the commissioning list', async () => {
    const commission = jest.fn(async (_c, onStep: (s: 'found') => void) => {
      onStep('found');
      throw new MatterError('unreachable', 'network');
    });
    await open(stub(commission as unknown as MatterSetup['commission']));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(screen.getByText(t('matter.error.unreachable'))).toBeTruthy());
    expect(screen.getAllByTestId('step-fail')).toHaveLength(1);
    expect(screen.getAllByTestId('step-done')).toHaveLength(1);
    expect(screen.getAllByTestId('step-idle')).toHaveLength(1);
    expect(screen.getByText(t('matter.retry'))).toBeTruthy();
    expect(screen.getByText(t('matter.notNow'))).toBeTruthy();
  });

  it('shows the finished list with an ok disc, then hands the link back', async () => {
    const commission = jest.fn(async (_c, onStep: (s: 'found') => void) => {
      onStep('found');
      return link;
    });
    const { onDone } = await open(stub(commission as unknown as MatterSetup['commission']));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(screen.getAllByTestId('step-done')).toHaveLength(3));
    expect(screen.getByLabelText(t('matter.step.responds'))).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
  });

  it('hands the link over at once, and leaving during the success hold loses nothing', async () => {
    const commission = jest.fn(async () => link);
    const { onDone, onLink } = await open(stub(commission as unknown as MatterSetup['commission']));
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith(link));
    expect(onDone).not.toHaveBeenCalled();
    screen.unmount();
    await new Promise((r) => setTimeout(r, 1200));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('draws the step card on the dark surface', async () => {
    const commission = jest.fn(async () => {
      throw new MatterError('notFound', 'found');
    });
    await open(stub(commission), { scheme: 'dark', reducedMotion: true });
    await fireEvent.press(await screen.findByText(t('matter.enter')));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(screen.getByTestId('step-list')).toBeTruthy());
    expect(JSON.stringify(screen.getByTestId('step-list').props.style)).toContain(
      darkTokens.color.surface,
    );
  });
});

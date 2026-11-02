import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { MatterError } from '@/core/matterSetup';
import type { MatterSetup } from '@/core/matterSetup';
import { t } from '@/i18n';
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

async function open(m: MatterSetup): Promise<{ onDone: jest.Mock; onSkip: jest.Mock }> {
  const onDone = jest.fn();
  const onSkip = jest.fn();
  await renderWith(
    { ...makeServices(), matter: m },
    <MatterStep brandId="panasonic" onDone={onDone} onSkip={onSkip} />,
  );
  return { onDone, onSkip };
}

describe('MatterStep', () => {
  it('rejects a malformed code without calling the network', async () => {
    const commission = jest.fn();
    await open(stub(commission));
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
    await fireEvent.changeText(
      await screen.findByLabelText(t('matter.codeLabel')),
      '3497-0112-332',
    );
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link));
  });

  it('shows the failing step and lets the user retry', async () => {
    const commission = jest.fn(async () => {
      throw new MatterError('notFound', 'found');
    });
    await open(stub(commission));
    await fireEvent.changeText(await screen.findByLabelText(t('matter.codeLabel')), '34970112332');
    await fireEvent.press(screen.getByText(t('matter.connect')));
    await waitFor(() => expect(screen.getByText(t('matter.error.notFound'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('matter.retry')));
    expect(screen.getByText(t('matter.connect'))).toBeTruthy();
  });
});

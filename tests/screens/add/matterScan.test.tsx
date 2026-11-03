import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { MatterSetup } from '@/core/matterSetup';
import { t } from '@/i18n';
import { MatterStep } from '@/screens/add/appliance/MatterStep';
import { makeServices, renderWith } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
const mockAsk = jest.fn();
let mockOnScan: ((e: { data: string }) => void) | undefined;

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockAsk],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockOnScan = props.onBarcodeScanned;
    return null;
  },
}));

let mockClipboard = '';
jest.mock('expo-clipboard', () => ({ getStringAsync: () => Promise.resolve(mockClipboard) }));

const link = { kind: 'matter', nodeId: '7' } as const;

function stub(commission: MatterSetup['commission']): MatterSetup {
  return {
    available: () => true,
    parseCode: (input) => {
      if (input.startsWith('MT:')) return { kind: 'qr', payload: input };
      const digits = input.replace(/-/g, '');
      return /^\d{11}$/.test(digits) ? { kind: 'manual', digits } : null;
    },
    commission,
  };
}

async function open(commission: jest.Mock): Promise<{ onDone: jest.Mock }> {
  const onDone = jest.fn();
  await renderWith(
    { ...makeServices(), matter: stub(commission as unknown as MatterSetup['commission']) },
    <MatterStep brandId="panasonic" onDone={onDone} onSkip={jest.fn()} />,
  );
  return { onDone };
}

describe('MatterStep camera', () => {
  beforeEach(() => {
    mockPermission = { granted: true, canAskAgain: true };
    mockOnScan = undefined;
    mockClipboard = '';
    mockAsk.mockClear();
  });

  it('starts commissioning when a Matter QR is scanned', async () => {
    const commission = jest.fn(async () => link);
    const { onDone } = await open(commission);
    mockOnScan?.({ data: 'MT:Y.K9042C00KA0648G00' });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link));
    expect(commission).toHaveBeenCalledTimes(1);
  });

  it('ignores a QR that is not a Matter code and says so', async () => {
    const commission = jest.fn(async () => link);
    await open(commission);
    mockOnScan?.({ data: 'https://example.com' });
    await waitFor(() => expect(screen.getByText(t('matter.notMatter'))).toBeTruthy());
    expect(commission).not.toHaveBeenCalled();
  });

  it('asks for the camera on first open', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await open(jest.fn());
    expect(mockAsk).toHaveBeenCalled();
  });

  it('shows the fallback when the camera is denied', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    await open(jest.fn());
    expect(screen.getByText(t('matter.cameraDenied'))).toBeTruthy();
    expect(screen.getByText(t('matter.paste'))).toBeTruthy();
    expect(screen.getByText(t('matter.enter'))).toBeTruthy();
  });

  it('commissions a valid pasted code', async () => {
    mockClipboard = ' 3497-0112-332 ';
    const commission = jest.fn(async () => link);
    const { onDone } = await open(commission);
    await fireEvent.press(screen.getByText(t('matter.paste')));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link));
  });

  it('rejects a pasted value that is not a code', async () => {
    mockClipboard = 'hello';
    const commission = jest.fn();
    await open(commission);
    await fireEvent.press(screen.getByText(t('matter.paste')));
    await waitFor(() => expect(screen.getByText(t('matter.badCode'))).toBeTruthy());
    expect(commission).not.toHaveBeenCalled();
  });

  it('reveals the typed field on "Enter code instead"', async () => {
    await open(jest.fn());
    expect(screen.queryByLabelText(t('matter.codeLabel'))).toBeNull();
    await fireEvent.press(screen.getByText(t('matter.enter')));
    expect(screen.getByLabelText(t('matter.codeLabel'))).toBeTruthy();
  });
});

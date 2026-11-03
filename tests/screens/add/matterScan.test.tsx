import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { MatterSetup } from '@/core/matterSetup';
import { t } from '@/i18n';
import { darkTokens } from '@/theme';
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
      if (input.startsWith('MT:')) return input.length > 3 ? { kind: 'qr', payload: input } : null;
      const digits = input.replace(/-/g, '');
      return /^\d{11}$/.test(digits) ? { kind: 'manual', digits } : null;
    },
    commission,
  };
}

async function open(
  commission: jest.Mock,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): Promise<{ onDone: jest.Mock }> {
  const onDone = jest.fn();
  await renderWith(
    { ...makeServices(), matter: stub(commission as unknown as MatterSetup['commission']) },
    <MatterStep brandId="panasonic" onDone={onDone} onSkip={jest.fn()} />,
    opts,
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
    await act(async () => mockOnScan?.({ data: 'MT:Y.K9042C00KA0648G00' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
    expect(commission).toHaveBeenCalledTimes(1);
  });

  it('shows the beam while scanning and locks on once a Matter code is seen', async () => {
    await open(jest.fn(async () => link));
    expect(screen.getByTestId('scan-beam')).toBeTruthy();
    expect(screen.getByText(t('matter.scanHint'))).toBeTruthy();
    await act(async () => mockOnScan?.({ data: 'MT:Y.K9042C00KA0648G00' }));
    expect(screen.queryByTestId('scan-beam')).toBeNull();
    expect(screen.getByText(t('matter.lockLabel'))).toBeTruthy();
  });

  it('draws no beam under reduced motion, and still scans', async () => {
    const commission = jest.fn(async () => link);
    const { onDone } = await open(commission, { reducedMotion: true });
    expect(screen.queryByTestId('scan-beam')).toBeNull();
    expect(screen.getByTestId('camera-frame')).toBeTruthy();
    await act(async () => mockOnScan?.({ data: 'MT:Y.K9042C00KA0648G00' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
  });

  it('keeps the camera frame on the dark camera surface', async () => {
    await open(jest.fn(), { scheme: 'dark' });
    expect(JSON.stringify(screen.getByTestId('camera-frame').props.style)).toContain(
      darkTokens.color.cameraBg,
    );
  });

  it('ignores a QR that is not a Matter code and says so', async () => {
    const commission = jest.fn(async () => link);
    await open(commission);
    mockOnScan?.({ data: 'https://example.com' });
    await waitFor(() => expect(screen.getByText(t('matter.notMatter'))).toBeTruthy());
    expect(commission).not.toHaveBeenCalled();
  });

  it('recovers from a rejected MT: code and connects on the next scan', async () => {
    const commission = jest.fn(async () => link);
    const { onDone } = await open(commission);
    // A bare MT: payload is rejected by parseCode.
    await act(async () => mockOnScan?.({ data: 'MT:' }));
    await waitFor(() => expect(screen.getByText(t('matter.badCode'))).toBeTruthy());
    expect(screen.queryByText(t('matter.lockLabel'))).toBeNull();
    await act(async () => mockOnScan?.({ data: 'MT:Y.K9042C00KA0648G00' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
  });

  it('shows the denied panel after a refusal that can still be asked again', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    mockAsk.mockResolvedValue(undefined);
    await open(jest.fn());
    await waitFor(() => expect(screen.getByText(t('matter.cameraDenied'))).toBeTruthy());
    expect(screen.queryByTestId('camera-frame')).toBeNull();
    expect(screen.getByText(t('matter.paste'))).toBeTruthy();
    expect(screen.getByText(t('matter.enter'))).toBeTruthy();
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
    expect(screen.queryByTestId('camera-frame')).toBeNull();
    expect(screen.getByText(t('matter.paste'))).toBeTruthy();
    expect(screen.getByText(t('matter.enter'))).toBeTruthy();
  });

  it('commissions a valid pasted code', async () => {
    mockClipboard = ' 3497-0112-332 ';
    const commission = jest.fn(async () => link);
    const { onDone } = await open(commission);
    await fireEvent.press(screen.getByText(t('matter.paste')));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(link), { timeout: 4000 });
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

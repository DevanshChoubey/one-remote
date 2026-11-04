import { fireEvent, screen } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import { t } from '@/i18n';
import { AddAerFlow } from '@/screens/add/aer/AddAerFlow';
import { makeServices, renderWith } from '../../helpers';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(() => mockBack.mockClear());

describe('AddAerFlow', () => {
  it('needs Android 12', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    expect(screen.getByText(t('add.kindAer'))).toBeTruthy();
    expect(screen.getByText(t('add.needsAndroid12'))).toBeTruthy();
    expect(aer.calls).toEqual([]);
  });

  it('goes back from the gate', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders in dark with reduced motion', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />, {
      scheme: 'dark',
      reducedMotion: true,
    });
    expect(screen.getByText(t('add.needsAndroid12'))).toBeTruthy();
    expect(aer.calls).toEqual([]);
  });
});

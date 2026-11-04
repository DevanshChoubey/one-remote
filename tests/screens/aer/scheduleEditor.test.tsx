import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { FakeAerService } from '@/aer/testing/fakeAerService';
import { t } from '@/i18n';
import { ScheduleEditor } from '@/screens/aer/ScheduleEditor';
import { AerError } from '@/services';
import type { AerSchedule as Schedule, AerView } from '@/services';
import { makeServices, renderWith } from '../helpers';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: () => mockBack() }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));
jest.mock('@react-native-community/datetimepicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return {
    __esModule: true,
    // The spinner stand-in: pressing it picks 9:50 pm.
    default: (props: { onValueChange: (e: unknown, d: Date) => void }) => (
      <Text testID="picker" onPress={() => props.onValueChange({}, new Date(2000, 0, 1, 21, 50))}>
        picker
      </Text>
    ),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const ALL: Schedule['days'] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const sch = (
  from: [number, number],
  to: [number, number],
  interval: Schedule['interval'] = 40,
  days: Schedule['days'] = ALL,
): Schedule => ({
  start: { h: from[0], m: from[1] },
  end: { h: to[0], m: to[1] },
  days,
  interval,
});
const view = (list: Schedule[]): AerView => ({
  deviceId: 'a1',
  schedules: { list, at: new Date().toISOString() },
});

function setup(list: Schedule[] = [sch([18, 0], [22, 0])], index?: number) {
  const aer: FakeAerService = createFakeAerService({ views: { a1: view(list) } });
  const services = makeServices([], { aer });
  const ui = <ScheduleEditor deviceId="a1" index={index} />;
  return { aer, services, ui };
}

beforeEach(() => mockBack.mockClear());

const saveButton = () => screen.getByLabelText(t('aer.saveSchedule'));
const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  el.props.accessibilityState?.disabled === true;
const selected = (label: string) =>
  screen.getByLabelText(label).props.accessibilityState?.selected === true;

describe('ScheduleEditor', () => {
  it('estimates the sprays as you edit', async () => {
    const { services, ui } = setup([sch([18, 0], [22, 0])], 0);
    await renderWith(services, ui);
    expect(screen.getByText('About 7 sprays a day')).toBeTruthy();
    expect(screen.getByLabelText('Start time, 6:00 pm')).toBeTruthy();
    expect(selected('Mon')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Mon'));
    expect(selected('Mon')).toBe(false);
    await fireEvent.press(screen.getByLabelText('Mon'));
    expect(selected('Mon')).toBe(true);
    await fireEvent.press(screen.getByLabelText('10 min'));
    expect(selected('10 min')).toBe(true);
    expect(screen.getByText('About 25 sprays a day')).toBeTruthy();
  });

  it('end before start blocks Save', async () => {
    const { services, ui } = setup([sch([22, 0], [7, 0])], 0);
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.endBeforeStart'))).toBeTruthy();
    expect(disabled(saveButton())).toBe(true);
    expect(screen.queryByText(/sprays a day/)).toBeNull();
  });

  it('no day picked says so under the chips', async () => {
    const { services, ui } = setup([sch([18, 0], [22, 0], 40, ['mon'])], 0);
    await renderWith(services, ui);
    expect(disabled(saveButton())).toBe(false);
    await fireEvent.press(screen.getByLabelText('Mon'));
    expect(screen.getByText(t('aer.noDays'))).toBeTruthy();
    expect(disabled(saveButton())).toBe(true);
  });

  it('a window shorter than the interval says so', async () => {
    const { services, ui } = setup([sch([18, 0], [18, 30], 40)], 0);
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.tooShort'))).toBeTruthy();
    expect(screen.queryByText(/sprays a day/)).toBeNull();
    expect(disabled(saveButton())).toBe(true);
  });

  it('a new schedule starts at 8 am to 8 pm, every day, every 20 minutes', async () => {
    const { aer, services, ui } = setup([]);
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.titleNew'))).toBeTruthy();
    expect(screen.getByLabelText('Start time, 8:00 am')).toBeTruthy();
    expect(screen.getByLabelText('End time, 8:00 pm')).toBeTruthy();
    expect(selected('20 min')).toBe(true);
    expect(screen.getByText('About 37 sprays a day')).toBeTruthy();
    expect(screen.queryByLabelText(t('aer.deleteSchedule'))).toBeNull();
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const call = aer.calls.find((c) => c.op === 'saveSchedules');
    expect(call?.arg).toEqual([sch([8, 0], [20, 0], 20)]);
  });

  it('saves, reads back and says Saved', async () => {
    const other = sch([6, 0], [7, 0], 20);
    const { aer, services, ui } = setup([other, sch([18, 0], [22, 0])], 1);
    await renderWith(services, ui);
    const gate = aer.hold('saveSchedules');
    await fireEvent.press(screen.getByLabelText('20 min'));
    await fireEvent.press(saveButton());
    expect(await screen.findByText(t('aer.stepSaving'))).toBeTruthy();
    expect(screen.getByText(t('aer.stepReading'))).toBeTruthy();
    expect(screen.getByTestId('step-done')).toBeTruthy();
    expect(screen.getByTestId('step-active')).toBeTruthy();
    await act(async () => gate.release());
    expect(await screen.findByText(t('aer.saved'))).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
    const call = aer.calls.find((c) => c.op === 'saveSchedules');
    expect(call?.arg).toEqual([other, sch([18, 0], [22, 0], 20)]);
  });

  it('tells when the dispenser rounded the end time', async () => {
    const orig = sch([18, 0], [21, 40], 20);
    const { aer, services, ui } = setup([orig], 0);
    await renderWith(services, ui);
    // Whatever is saved, the dispenser answers with whole intervals: 18:00 + 11 x 20 min.
    await act(async () => aer.setView(view([orig])));
    await fireEvent.press(screen.getByLabelText('End time, 9:40 pm'));
    await fireEvent.press(await screen.findByTestId('picker'));
    await fireEvent.press(screen.getByLabelText(t('aer.done')));
    expect(await screen.findByLabelText('End time, 9:50 pm')).toBeTruthy();
    await fireEvent.press(saveButton());
    expect(await screen.findByText('The dispenser rounded the end time to 9:40 pm.')).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
  });

  it('a read-back mismatch keeps the draft and offers Try again', async () => {
    const { aer, services, ui } = setup([sch([18, 0], [22, 0])], 0);
    await renderWith(services, ui);
    // The dispenser keeps the old entry whatever is saved.
    await act(async () => aer.setView(view([sch([18, 0], [22, 0])])));
    await fireEvent.press(screen.getByLabelText('10 min'));
    await fireEvent.press(saveButton());
    expect(await screen.findByText(t('aer.notKept'))).toBeTruthy();
    expect(screen.getByTestId('step-fail')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(selected('10 min')).toBe(true);
    await fireEvent.press(screen.getByLabelText(t('aer.tryAgain')));
    await waitFor(() => expect(aer.calls.filter((c) => c.op === 'saveSchedules')).toHaveLength(2));
  });

  it('a failed save words the problem and offers Try again', async () => {
    const { aer, services, ui } = setup([sch([18, 0], [22, 0])], 0);
    await renderWith(services, ui);
    aer.failNext('saveSchedules', new AerError('unreachable'));
    await fireEvent.press(screen.getByLabelText('10 min'));
    await fireEvent.press(saveButton());
    expect(await screen.findByText(t('aer.probAway'))).toBeTruthy();
    expect(screen.getByLabelText(t('aer.tryAgain'))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('deletes after asking', async () => {
    const keep = sch([6, 0], [7, 0], 20);
    const { aer, services, ui } = setup([keep, sch([18, 0], [22, 0])], 1);
    await renderWith(services, ui);
    await fireEvent.press(screen.getByLabelText(t('aer.deleteSchedule')));
    expect(screen.getByText(t('aer.deleteTitle'))).toBeTruthy();
    expect(screen.getByText(t('aer.deleteBody'))).toBeTruthy();
    expect(aer.calls.find((c) => c.op === 'saveSchedules')).toBeUndefined();
    await fireEvent.press(screen.getByLabelText(t('aer.cancel')));
    expect(screen.queryByText(t('aer.deleteTitle'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(t('aer.deleteSchedule')));
    await fireEvent.press(screen.getByLabelText(t('aer.yesDelete')));
    expect(await screen.findByText(t('aer.deleted'))).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
    expect(aer.calls.find((c) => c.op === 'saveSchedules')?.arg).toEqual([keep]);
  });

  it('10 already shows the banner before anything is typed', async () => {
    const full = Array.from({ length: 10 }, (_, i) => sch([i, 0], [i + 1, 0], 20));
    const { services, ui } = setup(full);
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.scheduleFull', { max: 10 }))).toBeTruthy();
    expect(disabled(saveButton())).toBe(true);
  });

  it('refreshes when the list was never read', async () => {
    const aer = createFakeAerService({ views: { a1: { deviceId: 'a1' } } });
    const services = makeServices([], { aer });
    await renderWith(services, <ScheduleEditor deviceId="a1" />);
    expect(aer.calls).toContainEqual({ op: 'refresh', deviceId: 'a1' });
  });

  it.each([
    ['dark', { scheme: 'dark' as const }],
    ['reduced motion', { reducedMotion: true }],
  ])('renders in %s', async (_n, opts) => {
    const { services, ui } = setup([sch([22, 0], [7, 0])], 0);
    await renderWith(services, ui, opts);
    expect(screen.getByText(t('aer.endBeforeStart'))).toBeTruthy();
  });
});

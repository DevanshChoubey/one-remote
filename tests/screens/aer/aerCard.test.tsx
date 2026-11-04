import { act, fireEvent, screen } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { FakeAerService } from '@/aer/testing/fakeAerService';
import type { Device } from '@/core';
import { t } from '@/i18n';
import { cardLine } from '@/screens/aer/cardLine';
import { AerCard } from '@/screens/home/AerCard';
import type { HomeCard } from '@/screens/home/useHome';
import { AerError } from '@/services';
import type { AerView } from '@/services';
import { makeServices, renderWith } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const aerDevice: Device = {
  id: 'a1',
  kind: 'aer',
  name: 'Air freshener',
  roomId: 'r1',
  order: 0,
  links: [{ kind: 'aer', bleId: 'AA:BB', timeZone: 'Asia/Kolkata' }],
};

const reading = (over: { mv?: number; sprays?: number; ageMs?: number } = {}): AerView => ({
  deviceId: 'a1',
  status: {
    batteryMv: over.mv ?? 2900,
    firmware: '1.0.0',
    autoSpray: null,
    scheduleRunning: false,
    spraysSinceRefill: over.sprays ?? 700,
    at: new Date(Date.now() - (over.ageMs ?? 0)).toISOString(),
  },
});

function setup(view?: AerView) {
  const aer: FakeAerService = createFakeAerService(view ? { views: { a1: view } } : {});
  const services = makeServices([], { aer });
  const onOpen = jest.fn();
  const onSettings = jest.fn();
  const card = { view: { device: aerDevice } } as unknown as HomeCard;
  const ui = <AerCard card={card} onOpen={onOpen} onSettings={onSettings} />;
  return { aer, services, ui, onOpen, onSettings };
}

describe('AerCard', () => {
  it('shows next spray and the levels', async () => {
    const { services, ui } = setup(reading());
    await renderWith(services, ui);
    expect(screen.getByText('Air freshener')).toBeTruthy();
    expect(screen.getByText(t('aer.noScheduleToday'))).toBeTruthy();
    expect(screen.getByText('Battery 71% · Refill 68%')).toBeTruthy();
  });

  it('says it was not read yet and hides the levels', async () => {
    const { services, ui } = setup();
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.notRead'))).toBeTruthy();
    expect(screen.queryByText(/^Battery/)).toBeNull();
  });

  it('says when it last read instead of a next spray', async () => {
    const { services, ui } = setup(reading({ ageMs: 2 * 3_600_000 }));
    await renderWith(services, ui);
    expect(screen.getByText('Last read 2 h ago')).toBeTruthy();
  });

  it('flat disables Spray and reads red', async () => {
    const { aer, services, ui } = setup(reading({ mv: 2350 }));
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.cardFlat'))).toBeTruthy();
    const key = screen.getByTestId('aer-spray-a1');
    expect(key.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(key);
    expect(aer.calls).toEqual([]);
  });

  it('low refill reads as a warning', async () => {
    const { services, ui } = setup(reading({ sprays: 2100 }));
    await renderWith(services, ui);
    expect(screen.getByText(t('aer.cardLow'))).toBeTruthy();
  });

  it('Spray sprays without opening', async () => {
    const { aer, services, ui, onOpen } = setup(reading());
    const gate = aer.hold('sprayNow');
    await renderWith(services, ui);
    await fireEvent.press(screen.getByTestId('aer-spray-a1'));
    expect(screen.getByTestId('aer-spray-a1').props.accessibilityState?.busy).toBe(true);
    expect(screen.queryByText(t('aer.sprayed'))).toBeNull();
    await act(async () => gate.release());
    expect(await screen.findByText(t('aer.sprayed'))).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
    expect(aer.calls).toContainEqual({ op: 'sprayNow', deviceId: 'a1' });
  });

  it('a failed spray says why', async () => {
    const { aer, services, ui } = setup(reading());
    aer.failNext('sprayNow', new AerError('busy'));
    await renderWith(services, ui);
    await fireEvent.press(screen.getByTestId('aer-spray-a1'));
    expect(await screen.findByText(t('aer.probBusy'))).toBeTruthy();
  });

  it('opens on a tap and opens settings on a long press', async () => {
    const { services, ui, onOpen, onSettings } = setup(reading());
    await renderWith(services, ui);
    await fireEvent.press(screen.getByTestId('device-open-a1'));
    expect(onOpen).toHaveBeenCalledWith('a1');
    await fireEvent(screen.getByTestId('device-open-a1'), 'longPress');
    expect(onSettings).toHaveBeenCalledWith('a1');
  });

  it('does not update after unmount mid-spray', async () => {
    const { aer, services, ui } = setup(reading());
    const gate = aer.hold('sprayNow');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWith(services, ui);
    await fireEvent.press(screen.getByTestId('aer-spray-a1'));
    await screen.unmount();
    await act(async () => gate.release());
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('renders in the dark and with reduced motion', async () => {
    const dark = setup(reading());
    await renderWith(dark.services, dark.ui, { scheme: 'dark' });
    expect(screen.getByText('Battery 71% · Refill 68%')).toBeTruthy();
    await screen.unmount();
    const calm = setup(reading());
    await renderWith(calm.services, calm.ui, { reducedMotion: true });
    expect(screen.getByText('Battery 71% · Refill 68%')).toBeTruthy();
  });
});

describe('cardLine', () => {
  const now = new Date('2026-11-04T10:00:00Z');
  const withSchedule = (): AerView => ({
    ...reading(),
    status: { ...(reading().status as NonNullable<AerView['status']>), at: now.toISOString() },
    schedules: {
      list: [
        {
          start: { h: 18, m: 0 },
          end: { h: 20, m: 0 },
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          interval: 10,
        },
      ],
      at: now.toISOString(),
    },
  });
  it('names the next spray when the reading is fresh', () => {
    expect(cardLine(withSchedule(), 'UTC', now)).toEqual({
      text: 'Next spray 6:00 pm',
      tone: 'ink2',
    });
  });
  it('flat beats low beats not read', () => {
    expect(cardLine(reading({ mv: 2350, sprays: 2100 }), 'UTC', now).tone).toBe('bad');
    expect(cardLine(reading({ sprays: 2100 }), 'UTC', new Date()).tone).toBe('warn');
    expect(cardLine({ deviceId: 'a1' }, 'UTC', now).text).toBe(t('aer.notRead'));
  });
});

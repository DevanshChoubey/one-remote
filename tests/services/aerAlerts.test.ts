import * as Notifications from 'expo-notifications';

import { createExpoScheduler } from '@/services/aerAlerts';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 5 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getExpoPushTokenAsync: jest.fn(),
}));

const mock = jest.mocked(Notifications);
const alert = (at: Date) => ({ key: 'd1:refillLow', dispenserId: 'd1', at, title: 'T', body: 'B' });

beforeEach(() => jest.clearAllMocks());

describe('createExpoScheduler', () => {
  it('schedule uses the key as identifier and a date trigger', async () => {
    const at = new Date(Date.now() + 3_600_000);
    await createExpoScheduler().schedule(alert(at));
    expect(mock.setNotificationChannelAsync).toHaveBeenCalledWith(
      'aer-alerts',
      expect.objectContaining({ name: 'Air freshener alerts', importance: 5 }),
    );
    expect(mock.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'd1:refillLow',
      content: { title: 'T', body: 'B', data: { dispenserId: 'd1' } },
      trigger: { type: 'date', date: at, channelId: 'aer-alerts' },
    });
  });

  it('never asks for a push token', async () => {
    await createExpoScheduler().schedule(alert(new Date(Date.now() + 3_600_000)));
    expect(mock.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('a past time schedules immediately', async () => {
    await createExpoScheduler().schedule(alert(new Date(Date.now() - 1000)));
    const call = mock.scheduleNotificationAsync.mock.calls[0]?.[0];
    expect(call?.trigger).toEqual({ channelId: 'aer-alerts' });
  });

  it('pendingKeys ignores other identifiers', async () => {
    mock.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'd1:checkIn' },
      { identifier: 'someone-else' },
    ] as never);
    expect(await createExpoScheduler().pendingKeys()).toEqual(['d1:checkIn']);
  });

  it('onOpen passes the dispenser id', async () => {
    const cb = jest.fn();
    const unsubscribe = createExpoScheduler().onOpen(cb);
    const listener = mock.addNotificationResponseReceivedListener.mock.calls[0]?.[0];
    listener?.({
      notification: { request: { identifier: 'n9', content: { data: { dispenserId: 'd9' } } } },
      actionIdentifier: 'default',
    } as never);
    expect(cb).toHaveBeenCalledWith('d9');
    unsubscribe();
  });

  it('onOpen also reports the notification that cold-started the app', async () => {
    mock.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { identifier: 'n2', content: { data: { dispenserId: 'd2' } } } },
      actionIdentifier: 'default',
    } as never);
    const cb = jest.fn();
    createExpoScheduler().onOpen(cb);
    await new Promise((r) => setImmediate(r));
    expect(cb).toHaveBeenCalledWith('d2');
  });

  it('maps permission status', async () => {
    const s = createExpoScheduler();
    expect(await s.permission()).toBe('undetermined');
    expect(await s.requestPermission()).toBe('granted');
  });

  it('counts a not-yet-asked Android 13 permission as askable', async () => {
    // Android 13+ reports denied before POST_NOTIFICATIONS was ever requested.
    mock.getPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      canAskAgain: true,
    } as never);
    expect(await createExpoScheduler().permission()).toBe('undetermined');
  });

  it('counts denied as denied only when the phone will not ask again', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      canAskAgain: false,
    } as never);
    expect(await createExpoScheduler().permission()).toBe('denied');
    mock.requestPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      canAskAgain: false,
    } as never);
    expect(await createExpoScheduler().requestPermission()).toBe('denied');
  });

  it('retries channel setup after a failure', async () => {
    // The channel promise is cached per module, so use a fresh module for a clean cache.
    let fresh!: typeof import('@/services/aerAlerts');
    let freshMock!: jest.MockedObject<typeof Notifications>;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      freshMock = jest.mocked(require('expo-notifications') as typeof Notifications);
      fresh = require('@/services/aerAlerts') as typeof fresh;
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    freshMock.setNotificationChannelAsync.mockRejectedValueOnce(new Error('boom'));
    const s = fresh.createExpoScheduler();
    const at = new Date(Date.now() + 3_600_000);
    await expect(s.schedule(alert(at))).rejects.toThrow('boom');
    await expect(s.schedule(alert(at))).resolves.toBeUndefined();
    expect(freshMock.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
  });

  it('warns instead of leaking a rejection when the cold-start read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mock.getLastNotificationResponseAsync.mockRejectedValueOnce(new Error('nope'));
    createExpoScheduler().onOpen(jest.fn());
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('handles a cold-start tap once across subscriptions', async () => {
    const last = {
      notification: {
        date: 1000,
        request: { identifier: 'n3', content: { data: { dispenserId: 'd3' } } },
      },
      actionIdentifier: 'default',
    } as never;
    mock.getLastNotificationResponseAsync.mockResolvedValue(last);
    const cb = jest.fn();
    const s = createExpoScheduler();
    s.onOpen(cb);
    s.onOpen(cb);
    await new Promise((r) => setImmediate(r));
    // The live listener may also deliver the same tap.
    mock.addNotificationResponseReceivedListener.mock.calls[0]?.[0](last);
    expect(cb).toHaveBeenCalledTimes(1);
    mock.getLastNotificationResponseAsync.mockResolvedValue(null);
  });

  it('tells repeat taps of the same alert apart by delivery time', () => {
    const cb = jest.fn();
    createExpoScheduler().onOpen(cb);
    const listener = mock.addNotificationResponseReceivedListener.mock.calls[0]?.[0];
    const tap = (date: number) =>
      ({
        notification: {
          date,
          request: { identifier: 'd5:refillLow', content: { data: { dispenserId: 'd5' } } },
        },
        actionIdentifier: 'default',
      }) as never;
    listener?.(tap(1));
    listener?.(tap(2));
    listener?.(tap(2));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// From aer-remote tests/setup/expoNotifications.ts (2026-11-04). Adapted: added getExpoPushTokenAsync so a test can assert it is never called.
// Keeps every test off the native expo-notifications module. Tests that exercise the scheduler
// itself (tests/alerts/expoScheduler.test.ts) declare their own mock, which replaces this one.
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getExpoPushTokenAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

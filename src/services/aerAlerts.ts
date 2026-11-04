// From aer-remote src/alerts/expoScheduler.ts (2026-11-04). Adapted: channel id aer-alerts, channel name from aerAlerts, AlertScheduler types from @/aer/alerts/types.
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { t } from '@/i18n';

import type { AlertPermission, AlertScheduler, ScheduledAlert } from '@/aer/alerts/types';

const CHANNEL = 'aer-alerts';

let handlerSet = false;
let channelReady: Promise<unknown> | undefined;
// getLastNotificationResponseAsync keeps returning the same tap, so remember the one handled.
let lastHandled: string | undefined;

function ensureHandler(): void {
  if (handlerSet) return;
  handlerSet = true;
  // Show alerts as banners while the app is open too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function ensureChannel(): Promise<unknown> {
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t('aerAlerts.channel'),
    importance: AndroidImportance.DEFAULT,
  }).catch((e: unknown) => {
    channelReady = undefined; // let the next schedule() retry
    throw e;
  });
  return channelReady;
}

/**
 * Askable counts as undetermined: Android 13+ reports 'denied' before the app ever asked, and
 * still lets it ask after one refusal. Denied means the phone will not show the prompt again.
 */
function toPermission(r: Notifications.NotificationPermissionsStatus): AlertPermission {
  if (r.status === Notifications.PermissionStatus.GRANTED) return 'granted';
  return r.canAskAgain ? 'undetermined' : 'denied';
}

function deviceIdOf(response: Notifications.NotificationResponse | null): string | undefined {
  const id: unknown = response?.notification.request.content.data?.dispenserId;
  return typeof id === 'string' ? id : undefined;
}

/** Local notifications through expo-notifications. No push tokens and no exact alarms. */
export function createExpoScheduler(): AlertScheduler {
  ensureHandler();
  return {
    async permission() {
      return toPermission(await Notifications.getPermissionsAsync());
    },
    async requestPermission() {
      return toPermission(await Notifications.requestPermissionsAsync());
    },
    async pendingKeys() {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      return all.map((n) => n.identifier).filter((id) => id.includes(':'));
    },
    async schedule(a: ScheduledAlert) {
      await ensureChannel();
      const future = a.at.getTime() > Date.now();
      await Notifications.scheduleNotificationAsync({
        identifier: a.key,
        content: { title: a.title, body: a.body, data: { dispenserId: a.dispenserId } },
        // Without a type the trigger fires now; the channel id still routes it on Android.
        trigger: future
          ? {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: a.at,
              channelId: CHANNEL,
            }
          : { channelId: CHANNEL },
      });
    },
    async cancel(key) {
      await Notifications.cancelScheduledNotificationAsync(key);
    },
    async cancelAll() {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },
    onOpen(cb) {
      let active = true;
      // Calls back once per tap, however many subscriptions see it.
      const handle = (r: Notifications.NotificationResponse | null): void => {
        const id = deviceIdOf(r);
        if (!r || !id) return;
        // The delivery time tells apart two notifications that reuse one identifier.
        const key = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
        if (key === lastHandled) return;
        lastHandled = key;
        cb(id);
      };
      const sub = Notifications.addNotificationResponseReceivedListener(handle);
      // A tap that launched the app arrives before the listener exists.
      Notifications.getLastNotificationResponseAsync()
        .then((r) => {
          if (active) handle(r);
        })
        .catch((e: unknown) =>
          console.warn('Could not read the notification that opened the app', e),
        );
      return () => {
        active = false;
        sub.remove();
      };
    },
  };
}

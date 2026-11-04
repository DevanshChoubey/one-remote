import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState } from 'react-native';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { AlertGroup, AlertPermission, AlertSwitches } from '@/services';
import { Banner, Box, Button, Column, Group, Row, Toggle, Txt } from '@/ui';
import { openNotificationSettings } from '../aer/openSettings';

/** Mock `.dim`. */
const DIM = 0.45;

const ROWS: readonly { group: AlertGroup; title: string; sub: string }[] = [
  { group: 'refill', title: 'settings.alertRefill', sub: 'settings.alertRefillSub' },
  { group: 'battery', title: 'settings.alertBattery', sub: 'settings.alertBatterySub' },
  { group: 'checkIn', title: 'settings.alertCheckIn', sub: 'settings.alertCheckInSub' },
];

/** False once the component is gone, so a late result sets no state. */
function useAlive(): { current: boolean } {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

/** Mock `alertsGroup`: three switches; a banner and a way to the phone's settings when notifications are refused. */
export function AlertsGroup(): ReactElement {
  const { aerAlerts } = useServices();
  const alive = useAlive();
  const [switches, setSwitches] = useState<AlertSwitches | null>(null);
  const [permission, setPermission] = useState<AlertPermission>('granted');

  const readPermission = useCallback((): void => {
    aerAlerts.permission().then(
      (p) => {
        if (alive.current) setPermission(p);
      },
      (e: unknown) => console.error('Could not read the notification permission', e),
    );
  }, [aerAlerts, alive]);

  useEffect(() => {
    aerAlerts.switches().then(
      (s) => {
        if (alive.current) setSwitches(s);
      },
      (e: unknown) => console.error('Could not read the alert switches', e),
    );
    readPermission();
    // The phone's notification switch is in another app: look again when the user comes back.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') readPermission();
    });
    return () => sub.remove();
  }, [aerAlerts, alive, readPermission]);

  const change = (group: AlertGroup, on: boolean): void => {
    setSwitches((s) => (s ? { ...s, [group]: on } : s));
    aerAlerts.setSwitch(group, on).catch((e: unknown) => {
      console.error('Could not save the alert switch', e);
      if (alive.current) setSwitches((s) => (s ? { ...s, [group]: !on } : s));
    });
  };

  const denied = permission === 'denied';
  return (
    <Column gap={2}>
      <Box px={1}>
        <Txt variant="captionBold" color="ink2">
          {t('settings.alerts')}
        </Txt>
      </Box>
      {denied ? (
        <Column gap={2}>
          <Banner icon="bell" text={t('settings.notificationsOff')} />
          <Row>
            <Button
              size="small"
              variant="secondary"
              label={t('settings.openSettings')}
              onPress={() => {
                openNotificationSettings().catch((e: unknown) =>
                  console.error('Could not open the settings', e),
                );
              }}
            />
          </Row>
        </Column>
      ) : null}
      <Box opacity={denied ? DIM : undefined}>
        <Group>
          {ROWS.map((r) => (
            <Row key={r.group} gap={3} align="center" px={4} py={2} minH={56}>
              <Box flex={1}>
                <Txt weight="semibold">{t(r.title)}</Txt>
                <Txt variant="caption" color="ink2">
                  {t(r.sub)}
                </Txt>
              </Box>
              <Box testID={`alerts-${r.group}`}>
                <Toggle
                  hideLabel
                  noDim
                  label={t(r.title)}
                  value={switches?.[r.group] ?? true}
                  disabled={denied || switches === null}
                  onChange={(v) => change(r.group, v)}
                />
              </Box>
            </Row>
          ))}
        </Group>
      </Box>
    </Column>
  );
}

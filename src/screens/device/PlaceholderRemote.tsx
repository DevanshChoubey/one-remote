import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import type { DeviceKind } from '@/core';
import { t } from '@/i18n';
import { Column, Screen, Txt } from '@/ui';
import { DeviceSettingsButton } from './DeviceSettingsButton';
import { useKnownDevice } from './useKnownDevice';

/**
 * Stands in for a per-kind remote until a lane replaces its branch in `app/device/[id].tsx`.
 * Without `kind` it is the "device not found" screen.
 */
export function PlaceholderRemote(props: { id: string; kind?: DeviceKind }): ReactElement {
  const router = useRouter();
  const name = useKnownDevice(props.id)?.name;
  return (
    <Screen title={name ?? t('common.appName')} onBack={() => router.back()}>
      <Column gap={4} {...(props.kind ? { testID: `remote-placeholder-${props.kind}` } : {})}>
        <Txt color="ink2">
          {name === undefined ? t('home.notFound') : t('home.placeholderBody', { name })}
        </Txt>
        {name === undefined ? null : <DeviceSettingsButton deviceId={props.id} />}
      </Column>
    </Screen>
  );
}

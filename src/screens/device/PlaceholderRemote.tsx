import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Column, Screen, Txt } from '@/ui';
import { DeviceSettingsButton } from './DeviceSettingsButton';

/** Stands in for the per-kind remotes until the lane plans replace it. */
export function PlaceholderRemote(props: { id: string }): ReactElement {
  const { hub } = useServices();
  const router = useRouter();
  let name: string | undefined;
  try {
    name = hub.view(props.id).device.name;
  } catch {
    name = undefined;
  }
  return (
    <Screen title={name ?? t('common.appName')} onBack={() => router.back()}>
      <Column gap={4}>
        <Txt color="ink2">
          {name === undefined ? t('home.notFound') : t('home.placeholderBody', { name })}
        </Txt>
        {name === undefined ? null : <DeviceSettingsButton deviceId={props.id} />}
      </Column>
    </Screen>
  );
}

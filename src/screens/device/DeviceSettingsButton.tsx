import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Touchable, Txt } from '@/ui';

/** The ⋯ that opens a device's settings sheet. Every lane's remote screen includes one. */
export function DeviceSettingsButton(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  return (
    <Touchable
      onPress={() => router.push(`/device-sheet/${props.deviceId}`)}
      accessibilityLabel={t('device.open')}
    >
      <Box px={3}>
        <Txt variant="heading">⋯</Txt>
      </Box>
    </Touchable>
  );
}

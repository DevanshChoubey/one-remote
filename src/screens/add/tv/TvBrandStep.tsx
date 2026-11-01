import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Button, Column, Screen, Touchable, Txt } from '@/ui';

export function TvBrandStep(props: { onFind: () => void; onManual: () => void }): ReactElement {
  const router = useRouter();
  const { tvBrands } = useServices();
  return (
    <Screen title={t('addTv.title')} onBack={() => router.back()} scroll>
      <Column gap={3}>
        <Button label={t('addTv.findMine')} onPress={props.onFind} />
        {tvBrands.map((b) => (
          <Touchable key={b.kind} onPress={props.onFind} accessibilityLabel={t(b.labelKey)}>
            <Box bg="surface" border="line" radius="md" p={4}>
              <Txt variant="bodyBold">{t(b.labelKey)}</Txt>
            </Box>
          </Touchable>
        ))}
        <Touchable onPress={props.onManual} accessibilityLabel={t('addTv.typeAddress')}>
          <Txt color="accent">{t('addTv.typeAddress')}</Txt>
        </Touchable>
      </Column>
    </Screen>
  );
}

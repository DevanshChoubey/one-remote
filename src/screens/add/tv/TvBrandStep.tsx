import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Column, Screen, Touchable, Txt } from '@/ui';

export function TvBrandStep(props: { onLg: () => void }): ReactElement {
  const router = useRouter();
  return (
    <Screen title={t('addTv.title')} onBack={() => router.back()}>
      <Column gap={3}>
        <Touchable onPress={props.onLg} accessibilityLabel={t('addTv.brandLg')}>
          <Box bg="surface" border="line" radius="md" p={4}>
            <Column gap={1}>
              <Txt variant="bodyBold">{t('addTv.brandLg')}</Txt>
              <Txt variant="caption" color="ink2">
                {t('addTv.brandLgNote')}
              </Txt>
            </Column>
          </Box>
        </Touchable>
        <Touchable onPress={() => undefined} disabled accessibilityLabel={t('addTv.brandOther')}>
          <Box bg="surface" border="line" radius="md" p={4}>
            <Column gap={1}>
              <Txt variant="bodyBold" color="ink2">
                {t('addTv.brandOther')}
              </Txt>
              <Txt variant="caption" color="ink2">
                {t('addTv.brandOtherNote')}
              </Txt>
            </Column>
          </Box>
        </Touchable>
      </Column>
    </Screen>
  );
}

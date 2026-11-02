import { Linking } from 'react-native';
import type { ReactElement } from 'react';
import type { BrandInfo } from '@/core';
import { t } from '@/i18n';
import { Box, Column, Row, Screen, Touchable, Txt } from '@/ui';
import { BRAND_REQUEST_URL } from './feedback';

export interface BrandStepProps {
  brands: BrandInfo[];
  onPick(b: BrandInfo): void;
  onBack?: () => void;
}

export function BrandStep(props: BrandStepProps): ReactElement {
  const askForBrand = (): void => {
    // The mail app opens with the address filled in; the user sends it, or not.
    Linking.openURL(BRAND_REQUEST_URL).catch((e: unknown) => console.error('No mail app', e));
  };
  return (
    <Screen title={t('addAppliance.brandTitle')} onBack={props.onBack} scroll>
      <Column gap={3}>
        {props.brands.map((b) => (
          <Touchable key={b.id} onPress={() => props.onPick(b)} accessibilityLabel={b.name}>
            <Box bg="surface" border="line" radius="md" p={4}>
              <Row align="center" justify="between">
                <Txt variant="bodyBold">{b.name}</Txt>
                {b.matter ? (
                  <Txt variant="caption" color="ink2">
                    {t('addAppliance.brandMatter')}
                  </Txt>
                ) : null}
              </Row>
            </Box>
          </Touchable>
        ))}
        <Touchable
          onPress={() => undefined}
          disabled
          accessibilityLabel={t('addAppliance.otherBrandsRow')}
        >
          <Box bg="surface2" border="line" radius="md" p={4}>
            <Txt color="ink2">{t('addAppliance.otherBrandsRow')}</Txt>
          </Box>
        </Touchable>
        <Touchable
          onPress={askForBrand}
          accessibilityRole="link"
          accessibilityLabel={t('addAppliance.brandMissing')}
        >
          <Txt color="accent">{t('addAppliance.brandMissing')}</Txt>
        </Touchable>
      </Column>
    </Screen>
  );
}

import { Linking } from 'react-native';
import type { ReactElement } from 'react';
import type { BrandInfo } from '@/core';
import { t } from '@/i18n';
import { Column, OptionCard, Screen, Touchable, Txt } from '@/ui';
import { BRAND_REQUEST_URL } from './feedback';

export interface BrandStepProps {
  brands: BrandInfo[];
  /** Which icon the brand rows carry. Defaults to the AC. */
  kind?: 'ac' | 'fan';
  onPick(b: BrandInfo): void;
  onBack?: () => void;
}

export function BrandStep(props: BrandStepProps): ReactElement {
  const askForBrand = (): void => {
    // The mail app opens with the address filled in; the user sends it, or not.
    Linking.openURL(BRAND_REQUEST_URL).catch((e: unknown) => console.error('No mail app', e));
  };
  return (
    <Screen title={t('addAppliance.brandTitle')} largeTitle onBack={props.onBack} scroll>
      <Column gap={3}>
        {props.brands.map((b, i) => (
          <OptionCard
            key={b.id}
            title={b.name}
            icon={props.kind ?? 'ac'}
            index={i}
            {...(b.matter
              ? { badge: { label: t('addAppliance.brandMatter'), tone: 'accent' } }
              : {})}
            onPress={() => props.onPick(b)}
            accessibilityLabel={b.name}
          />
        ))}
        <OptionCard
          title={t('addAppliance.otherBrandsRow')}
          icon="room"
          disabled
          onPress={() => undefined}
          accessibilityLabel={t('addAppliance.otherBrandsRow')}
        />
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

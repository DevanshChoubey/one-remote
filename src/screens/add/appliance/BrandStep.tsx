import { Linking } from 'react-native';
import type { ReactElement } from 'react';
import type { BrandInfo } from '@/core';
import { t } from '@/i18n';
import { Box, Card, Column, OptionCard, Screen, Tile, Txt } from '@/ui';
import type { BadgeProps } from '@/ui';
import { TextLink } from '@/ui/add';
import { BRAND_REQUEST_URL } from './feedback';

export interface BrandStepProps {
  brands: BrandInfo[];
  /** Which icon the brand rows carry. Defaults to the AC. */
  kind?: 'ac' | 'fan';
  /** miraie lane: brands that can also be added through the opt-in MirAIe cloud right now. */
  cloudBrands?: string[];
  onPick(b: BrandInfo): void;
  onBack?: () => void;
}

function brandBadge(b: BrandInfo, cloud: boolean): { badge?: BadgeProps } {
  if (b.matter && cloud) return { badge: { label: t('miraie.brandBadge'), tone: 'accent' } };
  if (cloud) return { badge: { label: t('miraie.brandBadgeCloud'), tone: 'accent' } };
  if (b.matter) return { badge: { label: t('addAppliance.brandMatter'), tone: 'accent' } };
  if (b.wifi) return { badge: { label: t('gree.brandWifi'), tone: 'accent' } };
  return {};
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
            size="regular"
            index={i}
            {...brandBadge(b, props.cloudBrands?.includes(b.id) ?? false)}
            onPress={() => props.onPick(b)}
            accessibilityLabel={b.name}
          />
        ))}
        {/* Not a choice: a quiet card at 0.6, its name 600, no chevron (mock). */}
        <Card row off>
          <Tile icon="room" />
          <Box flex={1}>
            <Txt weight="semibold">{t('addAppliance.otherBrandsRow')}</Txt>
          </Box>
        </Card>
      </Column>
      <TextLink
        label={t('addAppliance.brandMissing')}
        onPress={askForBrand}
        align="start"
        external
      />
    </Screen>
  );
}

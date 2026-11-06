import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Column, OptionCard, Screen, Txt } from '@/ui';

export interface ConnectViaStepProps {
  /** Matter can pair on this phone and the brand has it. */
  matter: boolean;
  onMatter(): void;
  onMiraie(): void;
  onIr(): void;
  onBack(): void;
}

/** Mock `addConnectVia`: Panasonic with the MirAIe opt-in on. Matter and IR stay local; MirAIe says it does not. */
export function ConnectViaStep(props: ConnectViaStepProps): ReactElement {
  const options = [
    ...(props.matter
      ? [
          {
            key: 'matter',
            title: t('miraie.viaMatter'),
            sub: t('miraie.viaMatterSub'),
            icon: 'ac' as const,
            onPress: props.onMatter,
          },
        ]
      : []),
    {
      key: 'miraie',
      title: t('miraie.viaCloud'),
      sub: t('miraie.viaCloudSub'),
      icon: 'globe' as const,
      onPress: props.onMiraie,
      badge: { label: t('miraie.viaCloudBadge') },
    },
    {
      key: 'ir',
      title: t('miraie.viaIr'),
      sub: t('miraie.viaIrSub'),
      icon: 'ir' as const,
      onPress: props.onIr,
    },
  ];
  return (
    <Screen title={t('miraie.viaTitle')} largeTitle onBack={props.onBack} scroll>
      <Column gap={3}>
        <Txt color="ink2">{t('miraie.viaSub')}</Txt>
        {options.map((o, i) => (
          <OptionCard
            key={o.key}
            title={o.title}
            subtitle={o.sub}
            icon={o.icon}
            index={i}
            onPress={o.onPress}
            {...(o.badge ? { badge: o.badge } : {})}
            testID={`via-${o.key}`}
          />
        ))}
      </Column>
    </Screen>
  );
}

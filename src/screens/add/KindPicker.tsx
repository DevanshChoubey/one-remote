import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Banner, Box, Column, OptionCard, Screen, Spacer, Txt } from '@/ui';
import type { IconName } from '@/ui';

const KINDS: readonly {
  key: string;
  icon: IconName;
  href: '/add/tv' | '/add/ac' | '/add/fan' | '/add/aer';
}[] = [
  { key: 'add.kindTv', icon: 'tv', href: '/add/tv' },
  { key: 'add.kindAc', icon: 'ac', href: '/add/ac' },
  { key: 'add.kindFan', icon: 'fan', href: '/add/fan' },
  { key: 'add.kindAer', icon: 'aer', href: '/add/aer' },
];

/** Step one of every add flow: what is it? The lane plans own the screens each kind opens. */
export function KindPicker(props: { onBack?: () => void }): ReactElement {
  const router = useRouter();
  const { drivers, aer } = useServices();
  const aerSupported = aer.supported();
  const canIr = drivers.some((d) => d.kind === 'ir' && d.available());
  return (
    <Screen
      title={t('add.title')}
      subtitle={t('add.question')}
      largeTitle
      onBack={props.onBack ?? (() => router.back())}
      scroll
    >
      {/* The banner, the cards and the hint are 16 apart; the cards 12 among themselves. */}
      {canIr ? null : <Banner icon="ir" text={t('add.noIr')} />}
      <Column gap={3}>
        {KINDS.map((k, i) => (
          <OptionCard
            key={k.key}
            index={i}
            icon={k.icon}
            title={t(k.key)}
            disabled={k.href === '/add/aer' && !aerSupported}
            subtitle={k.href === '/add/aer' && !aerSupported ? t('add.needsAndroid12') : undefined}
            onPress={() => router.push(k.href)}
          />
        ))}
      </Column>
      {/* The mock's hint sits 4 px further down and 4 px in (`margin: 4px 4px 0`). */}
      <Column>
        <Spacer size={1} />
        <Box px={1}>
          <Txt variant="caption" color="ink2">
            {t('add.hint')}
          </Txt>
        </Box>
      </Column>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Banner, Column, OptionCard, Screen, Txt } from '@/ui';
import type { IconName } from '@/ui';

const KINDS: readonly { key: string; icon: IconName; href: '/add/tv' | '/add/ac' | '/add/fan' }[] =
  [
    { key: 'add.kindTv', icon: 'tv', href: '/add/tv' },
    { key: 'add.kindAc', icon: 'ac', href: '/add/ac' },
    { key: 'add.kindFan', icon: 'fan', href: '/add/fan' },
  ];

/** Step one of every add flow: what is it? The lane plans own the screens each kind opens. */
export function KindPicker(props: { onBack?: () => void }): ReactElement {
  const router = useRouter();
  const { drivers } = useServices();
  const canIr = drivers.some((d) => d.kind === 'ir' && d.available());
  return (
    <Screen
      title={t('add.title')}
      subtitle={t('add.question')}
      largeTitle
      onBack={props.onBack ?? (() => router.back())}
      scroll
    >
      <Column gap={3}>
        {canIr ? null : <Banner icon="ir" text={t('add.noIr')} />}
        {KINDS.map((k, i) => (
          <OptionCard
            key={k.key}
            index={i}
            icon={k.icon}
            title={t(k.key)}
            onPress={() => router.push(k.href)}
          />
        ))}
        <Txt variant="caption" color="ink2">
          {t('add.hint')}
        </Txt>
      </Column>
    </Screen>
  );
}

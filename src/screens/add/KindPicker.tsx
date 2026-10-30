import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Column, Row, Screen, Touchable, Txt } from '@/ui';

const KINDS = [
  { key: 'add.kindTv', icon: '📺', href: '/add/tv' },
  { key: 'add.kindAc', icon: '❄️', href: '/add/ac' },
  { key: 'add.kindFan', icon: '🌀', href: '/add/fan' },
] as const;

/** Step one of every add flow: what is it? The lane plans own the screens each kind opens. */
export function KindPicker(props: { onBack?: () => void }): ReactElement {
  const router = useRouter();
  const { drivers } = useServices();
  const canIr = drivers.some((d) => d.kind === 'ir' && d.available());
  return (
    <Screen title={t('add.title')} onBack={props.onBack ?? (() => router.back())} scroll>
      <Column gap={3}>
        <Txt variant="heading">{t('add.question')}</Txt>
        {KINDS.map((k) => (
          <Touchable key={k.key} onPress={() => router.push(k.href)} accessibilityLabel={t(k.key)}>
            <Box bg="surface" border="line" radius="md" p={4}>
              <Row gap={3} align="center">
                <Txt variant="title">{k.icon}</Txt>
                <Txt variant="bodyBold">{t(k.key)}</Txt>
              </Row>
            </Box>
          </Touchable>
        ))}
        <Txt variant="caption" color="ink2">
          {t('add.hint')}
        </Txt>
        {canIr ? null : (
          <Box bg="surface2" radius="md" p={4}>
            <Txt color="ink2">{t('add.noIr')}</Txt>
          </Box>
        )}
      </Column>
    </Screen>
  );
}

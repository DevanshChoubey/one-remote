import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Button, Column, EmptyState, Row, Screen, Touchable, Txt } from '@/ui';
import { DeviceCard } from './DeviceCard';
import { useHome } from './useHome';

export function HomeScreen(): ReactElement {
  const router = useRouter();
  const home = useHome();
  const empty = home.loaded && home.deviceCount === 0;

  const header = (
    <Row align="center" justify="between">
      {empty ? (
        <Box />
      ) : (
        <Column>
          <Txt variant="title">{t('home.title')}</Txt>
          <Txt variant="caption" color="ink2">
            {home.deviceCount === 1
              ? t('home.deviceCountOne')
              : t('home.deviceCountMany', { count: home.deviceCount })}
          </Txt>
        </Column>
      )}
      <Row gap={1} align="center">
        {empty ? null : (
          <Touchable onPress={() => router.push('/add')} accessibilityLabel={t('home.add')}>
            <Box px={3}>
              <Txt variant="heading">+</Txt>
            </Box>
          </Touchable>
        )}
        <Touchable onPress={() => router.push('/settings')} accessibilityLabel={t('home.settings')}>
          <Box px={3}>
            <Txt variant="heading">⚙</Txt>
          </Box>
        </Touchable>
      </Row>
    </Row>
  );

  return (
    <Screen scroll>
      {header}
      {empty ? (
        <EmptyState
          title={t('home.welcomeTitle')}
          body={t('home.welcomeBody')}
          action={<Button label={t('home.addFirst')} onPress={() => router.push('/add')} />}
        />
      ) : (
        <Column gap={4}>
          {home.showNoIrBanner ? (
            <Box bg="surface2" radius="md" p={4}>
              <Txt color="ink2">{t('home.noIrBanner')}</Txt>
            </Box>
          ) : null}
          {home.sections.map((section) => (
            <Column key={section.room.id} gap={2}>
              <Txt variant="heading">{section.room.name}</Txt>
              {section.cards.map((card) => (
                <DeviceCard
                  key={card.view.device.id}
                  card={card}
                  onOpen={(id) => router.push(`/device/${id}`)}
                  onSettings={(id) => router.push(`/device-sheet/${id}`)}
                  onTogglePower={home.togglePower}
                />
              ))}
            </Column>
          ))}
        </Column>
      )}
    </Screen>
  );
}

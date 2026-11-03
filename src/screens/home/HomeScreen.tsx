import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import {
  Banner,
  Box,
  Button,
  Column,
  EmptyState,
  IconButton,
  Row,
  Screen,
  SkelCard,
  Skeleton,
  Txt,
} from '@/ui';
import { DeviceCard } from './DeviceCard';
import { useHome } from './useHome';

export function HomeScreen(): ReactElement {
  const router = useRouter();
  const home = useHome();
  const empty = home.loaded && home.deviceCount === 0;
  // Damaged data is never shown as an empty home: that would invite adding devices over it.
  const bare = empty || home.corrupt;
  const loading = !home.loaded && !home.corrupt;

  const gear = (
    <IconButton
      icon="gear"
      label={t('home.settings')}
      onPress={() => router.push('/settings')}
      disabled={loading}
    />
  );
  const plus = (
    <IconButton
      icon="plus"
      label={t('home.add')}
      onPress={() => router.push('/add')}
      disabled={loading}
    />
  );

  if (bare) {
    return (
      <Screen
        bare
        footer={
          empty && !home.corrupt ? (
            <Button label={t('home.addFirst')} onPress={() => router.push('/add')} />
          ) : undefined
        }
      >
        <Row justify="end">{gear}</Row>
        {home.corrupt ? (
          <EmptyState
            art="alert"
            tone="danger"
            fill
            title={t('home.corruptTitle')}
            body={t('home.corruptBody')}
          />
        ) : (
          <EmptyState art="mark" fill title={t('home.welcomeTitle')} body={t('home.welcomeBody')} />
        )}
      </Screen>
    );
  }

  const header = (
    <Row align="start" justify="between" gap={2}>
      <Column flex={1} gap={1}>
        {loading ? (
          <>
            <Txt variant="title">{t('home.title')}</Txt>
            <Skeleton width={70} height={13} />
          </>
        ) : (
          <>
            <Txt variant="title" numberOfLines={1}>
              {t('home.title')}
            </Txt>
            <Txt variant="caption" color="ink2">
              {home.deviceCount === 1
                ? t('home.deviceCountOne')
                : t('home.deviceCountMany', { count: home.deviceCount })}
            </Txt>
          </>
        )}
      </Column>
      <Row gap={2} align="center">
        {gear}
        {plus}
      </Row>
    </Row>
  );

  if (loading) {
    return (
      <Screen scroll>
        {header}
        <Box
          gap={3}
          accessibilityLabel={t('common.loading')}
          accessibilityRole="progressbar"
          testID="home-loading"
        >
          <Skeleton width={90} height={13} />
          {[0, 1, 2].map((n) => (
            <Box key={n} testID="skel-card">
              <SkelCard />
            </Box>
          ))}
          <Skeleton width={70} height={13} />
          {[3, 4].map((n) => (
            <Box key={n} testID="skel-card">
              <SkelCard />
            </Box>
          ))}
        </Box>
      </Screen>
    );
  }

  let n = 0;
  return (
    <Screen scroll>
      {header}
      <Column gap={4}>
        {home.showNoIrBanner ? <Banner icon="ir" text={t('home.noIrBanner')} /> : null}
        {home.sections.map((section) => (
          <Column key={section.room.id} gap={2}>
            <Txt variant="label" color="ink2">
              {section.room.name}
            </Txt>
            {section.cards.map((card) => (
              <DeviceCard
                key={card.view.device.id}
                card={card}
                index={n++}
                onOpen={(id) => router.push(`/device/${id}`)}
                onSettings={(id) => router.push(`/device-sheet/${id}`)}
                onTogglePower={home.togglePower}
              />
            ))}
          </Column>
        ))}
      </Column>
    </Screen>
  );
}

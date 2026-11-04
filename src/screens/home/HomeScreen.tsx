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
  Spacer,
  Txt,
} from '@/ui';
import { AerCard } from './AerCard';
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

  // The mock draws Home's head inside its `.bar`, whose `h1` rule makes "Home" the 21 px heading
  // with the count right under it; the bar is at least 56 high and its buttons sit at the top.
  const header = (
    <Row align="start" justify="between" gap={2} minH={56}>
      <Column flex={1}>
        <Txt variant="heading" numberOfLines={1}>
          {t('home.title')}
        </Txt>
        {loading ? (
          // The count's skeleton sits 6 px under the title (mock `margin-top: 6px`).
          <Box h={19} justify="end">
            <Skeleton width={70} height={13} />
          </Box>
        ) : (
          <Txt variant="caption" color="ink2" numberOfLines={1}>
            {home.deviceCount === 1
              ? t('home.deviceCountOne')
              : t('home.deviceCountMany', { count: home.deviceCount })}
          </Txt>
        )}
      </Column>
      <Row gap={2} align="center">
        {gear}
        {plus}
      </Row>
    </Row>
  );

  if (loading) {
    // Mock: each section skeleton sits 4 px in, the first 8 px below the header, the second 24 px
    // below the last card (its 12 px margin on the 12 px gap).
    const skelSection = (width: number, cards: number[]): ReactElement => (
      <Column gap={3}>
        <Box px={1}>
          <Skeleton width={width} height={13} />
        </Box>
        {cards.map((n) => (
          <Box key={n} testID="skel-card">
            <SkelCard />
          </Box>
        ))}
      </Column>
    );
    return (
      <Screen scroll header={header}>
        <Box
          accessibilityLabel={t('common.loading')}
          accessibilityRole="progressbar"
          testID="home-loading"
        >
          <Spacer size={2} />
          <Column gap={6}>
            {skelSection(90, [0, 1, 2])}
            {skelSection(70, [3, 4])}
          </Column>
        </Box>
      </Screen>
    );
  }

  // First card index of each section, so the staggered rise needs no counter during render.
  const starts = home.sections.reduce<number[]>(
    (acc, sec) => [...acc, (acc[acc.length - 1] ?? 0) + sec.cards.length],
    [0],
  );
  // Mock `.scroll` gap 12 between cards and under a room name; a room name has 8 px more above it
  // (20 from the card or banner before it, 8 from the top when it comes first).
  return (
    <Screen scroll header={header}>
      <Box>
        {home.showNoIrBanner ? null : <Spacer size={2} />}
        <Column gap={5}>
          {home.showNoIrBanner ? <Banner icon="ir" text={t('home.noIrBanner')} /> : null}
          {home.sections.map((section, si) => (
            <Column key={section.room.id} gap={3}>
              <Txt variant="captionBold" color="ink2">
                {section.room.name}
              </Txt>
              {section.cards.map((card, ci) =>
                card.view.device.kind === 'aer' ? (
                  <AerCard
                    key={card.view.device.id}
                    card={card}
                    index={(starts[si] ?? 0) + ci}
                    onOpen={(id) => router.push(`/device/${id}`)}
                    onSettings={(id) => router.push(`/device-sheet/${id}`)}
                  />
                ) : (
                  <DeviceCard
                    key={card.view.device.id}
                    card={card}
                    index={(starts[si] ?? 0) + ci}
                    onOpen={(id) => router.push(`/device/${id}`)}
                    onSettings={(id) => router.push(`/device-sheet/${id}`)}
                    onTogglePower={home.togglePower}
                  />
                ),
              )}
            </Column>
          ))}
        </Column>
      </Box>
    </Screen>
  );
}

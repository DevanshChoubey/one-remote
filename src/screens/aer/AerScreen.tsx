import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { MAX_SCHEDULES, sprayCount } from '@/services';
import type { AerInterval, AerProblem, AerView } from '@/services';
import { useMotion } from '@/theme';
import {
  AnimatedBox,
  Banner,
  Box,
  Button,
  Column,
  Group,
  Icon,
  Touchable,
  Row,
  Screen,
  SegmentedControl,
  StatusDot,
  Tile,
  Toggle,
  Txt,
} from '@/ui';
import { useKnownDevice } from '@/screens/device';
import type { IconName, StatusDotProps } from '@/ui';
import { LinkLine } from '@/ui/appliance';
import { LevelTile, SprayDisc } from '@/ui/aer';
import { AER_FRESH_MS, daysLabel, formatTime, formatWhen, PROBLEM_COPY } from './format';
import { levels, REFILL_LOW_PERCENT } from './screenState';
import type { AerScreenState } from './screenState';
import { useAerDevice } from './useAerDevice';

export interface AerScreenProps {
  deviceId: string;
  /** Opens the phone's Bluetooth or app settings (wired by the route). */
  onOpenSettings?: () => void;
}

const LIVE: readonly AerScreenState[] = ['ready', 'spraying', 'low'];
const CACHED: readonly AerScreenState[] = ['connecting', 'btoff', 'denied', 'away', 'busy'];
const PROBLEM_OF: Partial<Record<AerScreenState, AerProblem>> = {
  btoff: 'btoff',
  denied: 'denied',
  away: 'away',
  busy: 'busy',
  flat: 'flat',
};
const PROBLEM_ICON: Record<string, IconName> = {
  btoff: 'btoff',
  denied: 'btoff',
  away: 'bt',
  busy: 'lock',
  flat: 'battery',
};
const INTERVALS: readonly AerInterval[] = [10, 20, 40];
const DEFAULT_INTERVAL: AerInterval = 20;
/** Mock `.dim`. */
const DIMMED = 0.45;

const BAR_DOT: Partial<Record<AerScreenState, Pick<StatusDotProps, 'tone' | 'live'>>> = {
  spraying: { tone: 'ok', live: true },
  connecting: { tone: 'warn', live: true },
  btoff: { tone: 'err' },
  denied: { tone: 'err' },
  away: { tone: 'err' },
  busy: { tone: 'err' },
  flat: { tone: 'err' },
};

function isStale(view: AerView, now: Date): boolean {
  return !view.status || now.getTime() - new Date(view.status.at).getTime() > AER_FRESH_MS;
}

/** "Read just now" while the reading is fresh and the dispenser answered; else when it was read. */
function readText(view: AerView, state: AerScreenState, now: Date): string {
  if (view.status && (CACHED.includes(state) || isStale(view, now))) {
    return t('aer.lastRead', { when: formatWhen(view.status.at, now) });
  }
  return view.status ? t('aer.readNow') : t('aer.notRead');
}

function subtitleOf(view: AerView, state: AerScreenState, now: Date): string {
  switch (state) {
    case 'spraying':
      return t('aer.subSpraying');
    case 'connecting':
      return t('aer.subConnecting');
    case 'btoff':
    case 'denied':
    case 'away':
    case 'busy':
    case 'flat':
      return t(PROBLEM_COPY[PROBLEM_OF[state] ?? 'failed'].bar);
    default:
      return readText(view, state, now);
  }
}

/** The mock's `.fade`: fades in over `base` when it appears; at once under reduced motion. */
function Fade(props: { children: ReactNode }): ReactElement {
  const motion = useMotion();
  const shown = useSharedValue(motion.reduced ? 1 : 0);
  useEffect(() => {
    shown.value = motion.reduced ? 1 : withTiming(1, motion.timing('base'));
  }, [shown, motion]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <AnimatedBox animatedStyle={style}>{props.children}</AnimatedBox>;
}

function linkOf(state: AerScreenState): { text: string; icon: IconName; fell: boolean } {
  switch (state) {
    case 'btoff':
    case 'denied':
      return { text: t('aer.linkOff'), icon: 'btoff', fell: true };
    case 'away':
      return { text: t('aer.linkAway'), icon: 'bt', fell: true };
    case 'busy':
      return { text: t('aer.linkBusy'), icon: 'bt', fell: true };
    default:
      return { text: t('aer.linkReady'), icon: 'bt', fell: false };
  }
}

export function AerScreen(props: AerScreenProps): ReactElement {
  const router = useRouter();
  const { deviceId } = props;
  const dev = useAerDevice(deviceId);
  const { view, state } = dev;
  const now = new Date();
  const live = LIVE.includes(state);
  const cached = CACHED.includes(state);
  const problem = PROBLEM_OF[state];
  const auto = view.status?.autoSpray ?? null;
  const list = view.schedules?.list ?? [];
  const full = list.length >= MAX_SCHEDULES;
  const lv = levels(view);
  const loading = state === 'connecting';
  const dot = BAR_DOT[state];
  const name = useKnownDevice(deviceId)?.name;
  const link = linkOf(state);
  const canOpenSettings = state === 'btoff' || state === 'denied';

  return (
    <Screen
      title={name ?? t('aer.defaultName')}
      onBack={() => router.back()}
      subtitle={
        <>
          {dot ? <StatusDot {...dot} /> : null}
          <Txt variant="caption" color="ink2" numberOfLines={1}>
            {subtitleOf(view, state, now)}
          </Txt>
        </>
      }
      scroll
      footer={
        <LinkLine
          kind={link.fell ? 'fellBack' : 'connected'}
          icon={link.icon}
          text={link.text}
          onPress={() => router.push(`/device-sheet/${deviceId}`)}
        />
      }
    >
      {problem ? (
        <Fade>
          <Column gap={2}>
            <Banner
              tone="error"
              icon={PROBLEM_ICON[problem]}
              text={t(PROBLEM_COPY[problem].line)}
              testID="aer-banner"
            />
            <Row gap={2} wrap>
              {canOpenSettings ? (
                <Button
                  label={t('aer.openSettings')}
                  variant="secondary"
                  size="small"
                  onPress={props.onOpenSettings ?? noop}
                />
              ) : null}
              <Button label={t('aer.tryAgain')} size="small" onPress={() => void dev.retry()} />
            </Row>
          </Column>
        </Fade>
      ) : state === 'low' ? (
        <Banner text={t('aer.lowBanner')} icon="drop" testID="aer-banner" />
      ) : null}

      <Row justify="center">
        <SprayDisc
          onPress={() => void dev.spray()}
          spraying={state === 'spraying'}
          disabled={!live}
          label={state === 'spraying' ? t('aer.spraying') : t('aer.sprayNow')}
        />
      </Row>

      <AnimatedBox
        gap={3}
        opacity={cached ? DIMMED : undefined}
        pointerEvents={cached ? 'none' : 'auto'}
        testID="aer-body"
      >
        <Group>
          <Box px={4} py={2} gap={2}>
            <Toggle
              label={t('aer.autoSpray')}
              value={auto !== null}
              disabled={!live}
              onChange={(on) => void dev.setAuto(on ? DEFAULT_INTERVAL : null)}
            />
            <Txt variant="caption" color="ink2">
              {auto === null ? t('aer.autoOff') : t('aer.autoEvery', { minutes: auto })}
            </Txt>
          </Box>
          {auto !== null ? (
            <Fade>
              <Box px={4} py={3} gap={3}>
                <SegmentedControl
                  label={t('aer.autoSpray')}
                  options={INTERVALS.map((m) => ({
                    value: String(m),
                    label: t('aer.intervalChip', { minutes: m }),
                  }))}
                  value={String(auto)}
                  disabled={!live}
                  onChange={(v) => void dev.setAuto(Number(v) as AerInterval)}
                />
                <Txt variant="caption" color="ink2">
                  {t('aer.autoNote')}
                </Txt>
              </Box>
            </Fade>
          ) : null}
        </Group>

        <Column gap={2}>
          <Box px={1}>
            <Txt variant="captionBold" color="ink2">
              {t('aer.status')}
            </Txt>
          </Box>
          <Row gap={3} align="stretch">
            <LevelTile
              icon="battery"
              label={t('aer.battery')}
              percent={lv?.battery}
              tone={lv !== null && lv.battery < REFILL_LOW_PERCENT ? 'danger' : 'accent'}
              loading={loading}
              testID="aer-battery"
            />
            <LevelTile
              icon="drop"
              label={t('aer.refill')}
              percent={lv?.refill}
              tone={lv !== null && lv.refill < REFILL_LOW_PERCENT ? 'warm' : 'accent'}
              loading={loading}
              testID="aer-refill"
            />
          </Row>
          {view.status ? (
            <Box px={1}>
              <Txt variant="caption" color="ink2">
                {t('aer.firmwareLine', {
                  version: view.status.firmware,
                  read: readText(view, state, now),
                })}
              </Txt>
            </Box>
          ) : null}
        </Column>

        <Row justify="between" align="center">
          <Box px={1}>
            <Txt variant="captionBold" color="ink2">
              {t('aer.schedules')}
            </Txt>
          </Box>
          <Txt variant="caption" color="ink2" tabular>
            {t('aer.scheduleCount', { n: list.length, max: MAX_SCHEDULES })}
          </Txt>
        </Row>
        <Group>
          {list.length === 0
            ? [
                <Box key="none" px={4} py={3}>
                  <Txt variant="caption" color="ink2">
                    {t('aer.noSchedules')}
                  </Txt>
                </Box>,
              ]
            : list.map((s, i) => {
                const title = t('aer.scheduleWindow', {
                  start: formatTime(s.start),
                  end: formatTime(s.end),
                });
                return (
                  <Touchable
                    key={i}
                    onPress={() => router.push(`/aer/schedule/${deviceId}?index=${i}`)}
                    accessibilityLabel={title}
                    pressedBg="surface2"
                    pressScale={1}
                  >
                    <Row gap={3} align="center" px={4} py={2} minH={56}>
                      <Tile icon="clock" />
                      <Box flex={1}>
                        <Txt weight="semibold">{title}</Txt>
                        <Txt variant="caption" color="ink2">
                          {t('aer.scheduleLine', {
                            days: daysLabel(s.days),
                            minutes: s.interval,
                            sprays: sprayCount(s),
                          })}
                        </Txt>
                      </Box>
                      <Icon name="chev" size={22} color="ink2" />
                    </Row>
                  </Touchable>
                );
              })}
        </Group>
        <Button
          label={t('aer.addSchedule')}
          variant="secondary"
          icon="plus"
          disabled={full || !live}
          onPress={() => router.push(`/aer/schedule/${deviceId}`)}
        />
        {full ? (
          <Box px={1}>
            <Txt variant="caption" color="ink2">
              {t('aer.scheduleFull', { max: MAX_SCHEDULES })}
            </Txt>
          </Box>
        ) : null}
      </AnimatedBox>
    </Screen>
  );
}

function noop(): void {}

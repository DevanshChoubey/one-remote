import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { FanState } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import {
  Box,
  Chip,
  Column,
  EmptyState,
  IconButton,
  Row,
  Screen,
  Skeleton,
  Txt,
  useToast,
} from '@/ui';
import { LinkLine, SpeedBars, SpinningIcon } from '@/ui/appliance';
import { useHomeData } from '../shared/useHomeData';
import { fanView } from './fanModel';
import { useLastSent } from './useLastSent';
import { usePendingState } from './usePendingState';
import { pressFeedback } from './pressFeedback';
import { sendErrorKey } from './sendErrors';
import { statusLine } from './statusLine';
import { useDeviceView } from './useDeviceView';

const TIMERS: FanState['timerHours'][] = [0, 1, 2, 4, 8];

export function FanScreen(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  const found = useDeviceView(props.deviceId);
  if (found.state === 'loading') return <FanSkeleton onBack={() => router.back()} />;
  if (found.state === 'gone') {
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <EmptyState art="alert" tone="ink2" title={t('fan.notFound')} body="" fill />
      </Screen>
    );
  }
  return <FanRemote view={found.view} />;
}

function FanSkeleton(props: { onBack: () => void }): ReactElement {
  return (
    <Screen onBack={props.onBack} scroll>
      <Column gap={5} align="center">
        <Box testID="fan-skeleton">
          <Skeleton width={112} height={112} radius="art" />
        </Box>
        <Skeleton width="100%" height={250} radius="md" />
        <Skeleton width="60%" height={20} />
      </Column>
    </Screen>
  );
}

function FanRemote({ view }: { view: DeviceView }): ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { hub, prefs } = useServices();
  const { rooms } = useHomeData();
  const irFirst = view.device.links[0]?.kind === 'ir';
  const { stored, save } = useLastSent(view.device.id, irFirst, view.state?.kind === 'fan');
  const shown = fanView(view, stored?.kind === 'fan' ? stored.state : undefined);
  const { caps } = shown;
  const usable = view.usable;
  const deviceId = view.device.id;
  const lastChange = useRef<Partial<FanState> | null>(null);
  const retry = useRef<() => void>(() => undefined);
  const { state, press: pressWith } = usePendingState<FanState>(
    shown.state,
    (next) =>
      hub.send(deviceId, { kind: 'fan.set', state: next }).then((r) => {
        if (r.via === 'ir') save({ kind: 'fan', state: next });
      }),
    (e) => {
      const key = sendErrorKey(e, 'fan');
      toast.show(t(key), {
        kind: 'error',
        ...(key === 'fan.error.notSent'
          ? { action: { label: t('common.retry'), onPress: () => retry.current() } }
          : {}),
      });
    },
  );
  const live = usable && state.power;

  const press = (change: Partial<FanState>): void => {
    lastChange.current = change;
    pressFeedback(prefs);
    pressWith((base) => ({ ...base, ...change }));
  };
  useEffect(() => {
    retry.current = () => {
      if (lastChange.current) press(lastChange.current);
    };
  });

  const room = rooms.find((r) => r.id === view.device.roomId)?.name;
  const status = statusLine(view);
  const showBoost = caps.fanBoost !== false;
  const showSleep = caps.sleep === true;
  const showLight = caps.fanLight === true;
  const showTimer = caps.fanTimer !== false;

  return (
    <Screen
      title={view.device.name}
      onBack={() => router.back()}
      scroll
      subtitle={room ? <Txt color="ink2">{room}</Txt> : undefined}
      actions={
        <IconButton
          icon="power"
          tone="power"
          label={t('fan.power')}
          onPress={() => press({ power: !state.power })}
          disabled={!usable}
          testID="fan-power"
        />
      }
    >
      <Column gap={5}>
        <Row justify="center">
          <SpinningIcon name="fan" spinning={state.power} speed={state.speed} />
        </Row>

        <Column gap={3}>
          <Txt variant="bodyBold" color="ink2">
            {t('fan.speedTitle')}
          </Txt>
          <SpeedBars
            value={state.power ? state.speed : 0}
            max={5}
            onPick={(n) => press({ power: true, speed: n as FanState['speed'] })}
            labelFor={(n) => t('fan.speed', { n })}
            disabled={!usable}
          />
        </Column>

        {showBoost || showSleep || showLight ? (
          <Row gap={2} wrap justify="center">
            {showBoost ? (
              <Chip
                icon="bolt"
                label={t('fan.boost')}
                state={state.boost ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ boost: !state.boost })}
              />
            ) : null}
            {showSleep ? (
              <Chip
                icon="moon"
                label={t('fan.sleep')}
                state={state.sleep ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ sleep: !state.sleep })}
              />
            ) : null}
            {showLight ? (
              <Chip
                icon="bulb"
                label={t('fan.light')}
                state={state.light === true ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ light: !(state.light ?? false) })}
              />
            ) : null}
          </Row>
        ) : null}

        {showTimer ? (
          <Column gap={2}>
            <Txt variant="bodyBold" color="ink2">
              {t('fan.timerTitle')}
            </Txt>
            <Row gap={2} wrap>
              {TIMERS.map((h) => (
                <Chip
                  key={h}
                  label={t(`fan.timer.${h}`)}
                  state={state.timerHours === h ? 'selected' : 'neutral'}
                  disabled={!live}
                  onToggle={() => press({ timerHours: h })}
                />
              ))}
            </Row>
          </Column>
        ) : null}

        <LinkLine
          kind={status.kind}
          text={t(status.key, status.params)}
          onPress={() => router.push(`/device-sheet/${deviceId}`)}
        />
      </Column>
    </Screen>
  );
}

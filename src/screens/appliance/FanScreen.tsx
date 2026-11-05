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
  Button,
  EmptyState,
  IconButton,
  Row,
  Screen,
  Skeleton,
  Txt,
  useToast,
} from '@/ui';
import {
  LinkLine,
  RemoteBody,
  RemoteGrow,
  RemoteSection,
  SpeedBars,
  SpeedBarsSkeleton,
  SpinningIcon,
} from '@/ui/appliance';
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
  if (found.state === 'loading') {
    return <FanSkeleton name={found.name} onBack={() => router.back()} />;
  }
  if (found.state === 'failed') {
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <EmptyState
          art="alert"
          tone="danger"
          title={t('home.loadFailed')}
          action={<Button label={t('common.retry')} onPress={found.retry} />}
          fill
        />
      </Screen>
    );
  }
  if (found.state === 'gone') {
    // Mock `S.gone`: one quiet sentence under the back bar.
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <Txt color="ink2" live>
          {t('fan.notFound')}
        </Txt>
      </Screen>
    );
  }
  return <FanRemote view={found.view} />;
}

/** Mock `skelFan`: the bar (name, a sub-line bar), the hero, the five bars and two chips. */
function FanSkeleton(props: { name?: string; onBack: () => void }): ReactElement {
  return (
    <Screen title={props.name} onBack={props.onBack} subtitle={<Skeleton width={90} height={12} />}>
      <RemoteBody>
        <Row justify="center">
          <Box testID="fan-skeleton">
            <Skeleton width={112} height={112} radius="hero" />
          </Box>
        </Row>
        <SpeedBarsSkeleton />
        <Row gap={2}>
          <Skeleton width={100} height={48} radius="pill" />
          <Skeleton width={100} height={48} radius="pill" />
        </Row>
      </RemoteBody>
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
      // Every failure the user can retry carries the action (mock: not sent, timeout, partial).
      const final = key === 'fan.error.needsIr' || key === 'fan.error.unsupported';
      toast.show(t(key), {
        kind: 'error',
        ...(final ? {} : { action: { label: t('common.retry'), onPress: () => retry.current() } }),
      });
    },
  );
  // Needs IR: the controls are drawn as usual but inert (mock "visible but inert"); a tap says why.
  const locked = !view.usable;

  const press = (change: Partial<FanState>): void => {
    if (locked) {
      toast.show(t('fan.error.needsIr'), { kind: 'error' });
      return;
    }
    lastChange.current = change;
    pressFeedback(prefs);
    pressWith((base) => ({ ...base, ...change }));
  };
  // Off, the chips are not dimmed (mock): like a speed, picking one turns the fan on with it. An
  // off fan has no boost, sleep, light or timer running (as the IR keys treat it), so none is lit.
  const on = state.power
    ? {
        boost: state.boost,
        sleep: state.sleep,
        light: state.light === true,
        timerHours: state.timerHours,
      }
    : { boost: false, sleep: false, light: false, timerHours: 0 };
  const pick = (change: Partial<FanState>): void => press({ power: true, ...change });
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
      subtitle={room || undefined}
      actions={
        <IconButton
          icon="power"
          tone="power"
          label={t('fan.power')}
          checked={state.power}
          onPress={() => press({ power: !state.power })}
          testID="fan-power"
        />
      }
    >
      <RemoteBody>
        <Row justify="center">
          <SpinningIcon name="fan" spinning={state.power} speed={state.speed} />
        </Row>

        <RemoteSection label={t('fan.speedTitle')} gap={2}>
          <SpeedBars
            value={state.power ? state.speed : 0}
            max={5}
            onPick={(n) => pick({ speed: n as FanState['speed'] })}
            labelFor={(n) => t('fan.speed', { n })}
          />
        </RemoteSection>

        {showBoost || showSleep || showLight ? (
          <Row gap={2} wrap>
            {showBoost ? (
              <Chip
                icon="bolt"
                label={t('fan.boost')}
                state={on.boost ? 'selected' : 'neutral'}
                onToggle={() => pick({ boost: !on.boost })}
              />
            ) : null}
            {showSleep ? (
              <Chip
                icon="moon"
                label={t('fan.sleep')}
                state={on.sleep ? 'selected' : 'neutral'}
                onToggle={() => pick({ sleep: !on.sleep })}
              />
            ) : null}
            {showLight ? (
              <Chip
                icon="bulb"
                label={t('fan.light')}
                state={on.light ? 'selected' : 'neutral'}
                onToggle={() => pick({ light: !on.light })}
              />
            ) : null}
          </Row>
        ) : null}

        {showTimer ? (
          <RemoteSection label={t('fan.timerTitle')} gap={1}>
            <Row gap={2} wrap>
              {TIMERS.map((h) => (
                <Chip
                  key={h}
                  label={t(`fan.timer.${h}`)}
                  state={on.timerHours === h ? 'selected' : 'neutral'}
                  onToggle={() => pick({ timerHours: h })}
                />
              ))}
            </Row>
          </RemoteSection>
        ) : null}

        <RemoteGrow />
        <LinkLine
          kind={status.kind}
          text={t(status.key, status.params)}
          onPress={() => router.push(`/device-sheet/${deviceId}`)}
        />
      </RemoteBody>
    </Screen>
  );
}

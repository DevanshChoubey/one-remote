import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import {
  Chip,
  Button,
  EmptyState,
  IconButton,
  Row,
  Screen,
  SegmentedControl,
  Skeleton,
  Txt,
  useToast,
} from '@/ui';
import {
  Dial,
  DialSkeleton,
  LinkLine,
  RemoteBody,
  RemoteGrow,
  Stepper,
  StepperRow,
} from '@/ui/appliance';
import type { IconName } from '@/ui';
import { useHomeData } from '../shared/useHomeData';
import { acView, nextAc } from './acModel';
import { useLastSent } from './useLastSent';
import { usePendingState } from './usePendingState';
import { pressFeedback } from './pressFeedback';
import { sendErrorKey } from './sendErrors';
import { statusLine } from './statusLine';
import { useDeviceView } from './useDeviceView';

const ALL_MODES: AcMode[] = ['cool', 'dry', 'fan', 'auto'];
const ALL_FANS: AcFan[] = ['auto', 1, 2, 3];
const MODE_ICON: Record<AcMode, IconName> = {
  cool: 'snow',
  dry: 'drop',
  fan: 'wind',
  auto: 'auto',
};
const MODE_TONE = { cool: 'cool', dry: 'cool', fan: 'ink2', auto: 'accent' } as const;

export function AcScreen(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  const found = useDeviceView(props.deviceId);
  if (found.state === 'loading') {
    return <AcSkeleton name={found.name} onBack={() => router.back()} />;
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
          {t('ac.notFound')}
        </Txt>
      </Screen>
    );
  }
  return <AcRemote view={found.view} />;
}

/** Mock `skelAc`: the bar (name, a sub-line bar), the dial, the mode pill, chips and the line. */
function AcSkeleton(props: { name?: string; onBack: () => void }): ReactElement {
  return (
    <Screen
      title={props.name}
      onBack={props.onBack}
      subtitle={<Skeleton width={120} height={12} />}
    >
      <RemoteBody>
        <DialSkeleton />
        <RemoteGrow />
        <Skeleton width="100%" height={56} radius="pill" />
        <Row gap={2} justify="center">
          <Skeleton width={110} height={48} radius="pill" />
          <Skeleton width={96} height={48} radius="pill" />
          <Skeleton width={96} height={48} radius="pill" />
        </Row>
        <Row justify="center">
          <Skeleton width="60%" height={20} />
        </Row>
      </RemoteBody>
    </Screen>
  );
}

function AcRemote({ view }: { view: DeviceView }): ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { hub, prefs } = useServices();
  const { rooms } = useHomeData();
  const hubShown = acView(view);
  const irFirst = view.device.links[0]?.kind === 'ir';
  const { stored, save } = useLastSent(view.device.id, irFirst, view.state?.kind === 'ac');
  // After a restart the hub knows nothing yet: fall back to what was last sent.
  const shown =
    hubShown.source === 'none' && stored?.kind === 'ac'
      ? { ...hubShown, state: stored.state, source: 'lastSent' as const }
      : hubShown;
  const { caps } = shown;
  const deviceId = view.device.id;
  const lastChange = useRef<Partial<AcState> | null>(null);
  const retry = useRef<() => void>(() => undefined);
  const { state, press: pressWith } = usePendingState<AcState>(
    shown.state,
    (next) =>
      hub.send(deviceId, { kind: 'ac.set', state: next }).then((r) => {
        if (r.via === 'ir') save({ kind: 'ac', state: next });
      }),
    (e) => {
      const key = sendErrorKey(e, 'ac');
      // Every failure the user can retry carries the action (mock: not sent, timeout, partial).
      toast.show(t(key), {
        kind: 'error',
        ...(key === 'ac.error.needsIr'
          ? {}
          : { action: { label: t('common.retry'), onPress: () => retry.current() } }),
      });
    },
  );
  const power = state.power;
  // Needs IR: the controls are drawn as usual but inert (mock "visible but inert"); a tap says why.
  const locked = !view.usable;

  const press = (change: Partial<AcState>): void => {
    if (locked) {
      toast.show(t('ac.error.needsIr'), { kind: 'error' });
      return;
    }
    lastChange.current = change;
    pressFeedback(prefs);
    pressWith((base) => nextAc(base, change, caps));
  };
  useEffect(() => {
    retry.current = () => {
      if (lastChange.current) press(lastChange.current);
    };
  });

  const modes = ALL_MODES.filter((m) => caps.acModes?.includes(m) ?? true);
  const fans = ALL_FANS.filter((f) => caps.acFan?.includes(f) ?? true);
  // Only the steppers are disabled: while off, and at the ends of the range (mock S.ac).
  const canDown =
    power && nextAc(state, { setpoint: state.setpoint - 1 }, caps).setpoint !== state.setpoint;
  const canUp =
    power && nextAc(state, { setpoint: state.setpoint + 1 }, caps).setpoint !== state.setpoint;

  const lower = (): void => {
    if (canDown) press({ setpoint: state.setpoint - 1 });
  };
  const raise = (): void => {
    if (canUp) press({ setpoint: state.setpoint + 1 });
  };

  const room = rooms.find((r) => r.id === view.device.roomId)?.name;
  const subtitle =
    shown.roomTemp === undefined
      ? room
      : room
        ? t('ac.subtitleTemp', { room, temp: shown.roomTemp })
        : t('ac.subtitleTempOnly', { temp: shown.roomTemp });

  const status = statusLine(view);
  const modeName = t(`ac.modeName.${state.mode}`);

  return (
    <Screen
      title={view.device.name}
      onBack={() => router.back()}
      subtitle={subtitle || undefined}
      actions={
        <IconButton
          icon="power"
          tone="power"
          label={t('ac.power')}
          checked={power}
          onPress={() => press({ power: !power })}
          testID="ac-power"
        />
      }
    >
      <RemoteBody>
        <RemoteGrow />
        <Dial
          value={state.setpoint}
          min={clampSetpoint(-1000, caps)}
          max={clampSetpoint(1000, caps)}
          on={power}
          tone={MODE_TONE[state.mode]}
          caption={power ? modeName : t('ac.offHint')}
          accessibilityLabel={
            power ? t('ac.setpoint', { temp: state.setpoint, mode: modeName }) : t('ac.off')
          }
          onIncrement={raise}
          onDecrement={lower}
        >
          {/* Mock `.stepper`: 14 px in from the dial's sides, 6 px below it. */}
          <StepperRow>
            <Stepper icon="minus" label={t('ac.lower')} onPress={lower} disabled={!canDown} />
            <Stepper icon="plus" label={t('ac.raise')} onPress={raise} disabled={!canUp} />
          </StepperRow>
        </Dial>
        <RemoteGrow />

        <SegmentedControl
          label={t('ac.modeTitle')}
          options={modes.map((m) => ({ value: m, label: t(`ac.mode.${m}`), icon: MODE_ICON[m] }))}
          value={state.mode}
          onChange={(m) => press({ mode: m })}
        />

        <Row gap={2} wrap justify="center">
          {fans.length > 1 ? (
            <Chip
              icon="wind"
              label={state.fan === 'auto' ? t('ac.fanAuto') : t('ac.fanChip', { speed: state.fan })}
              state="neutral"
              onPress={() => press({ fan: fans[(fans.indexOf(state.fan) + 1) % fans.length] })}
              accessibilityHint={t('ac.fanHint')}
            />
          ) : null}
          {caps.swing === true ? (
            <Chip
              icon="swing"
              label={t('ac.swing')}
              state={state.swing ? 'selected' : 'neutral'}
              onToggle={() => press({ swing: !state.swing })}
            />
          ) : null}
          {caps.sleep === true ? (
            <Chip
              icon="moon"
              label={t('ac.sleep')}
              state={state.sleep ? 'selected' : 'neutral'}
              onToggle={() => press({ sleep: !state.sleep })}
            />
          ) : null}
        </Row>

        <LinkLine
          kind={status.kind}
          text={t(status.key, status.params)}
          onPress={() => router.push(`/device-sheet/${deviceId}`)}
        />
      </RemoteBody>
    </Screen>
  );
}

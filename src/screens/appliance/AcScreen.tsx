import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState } from '@/core';
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
  SegmentedControl,
  Skeleton,
  Touchable,
  Txt,
  useToast,
} from '@/ui';
import { Dial, LinkLine, Stepper } from '@/ui/appliance';
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
  if (found.state === 'loading') return <AcSkeleton onBack={() => router.back()} />;
  if (found.state === 'gone') {
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <EmptyState art="alert" tone="ink2" title={t('ac.notFound')} body="" fill />
      </Screen>
    );
  }
  return <AcRemote view={found.view} />;
}

/** The dial's shape while the first state is read. */
function AcSkeleton(props: { onBack: () => void }): ReactElement {
  return (
    <Screen onBack={props.onBack} scroll>
      <Column gap={5} align="center">
        <Box testID="dial-skeleton">
          <Skeleton width={290} height={290} radius="pill" />
        </Box>
        <Skeleton width="100%" height={56} radius="pill" />
        <Row gap={2}>
          <Skeleton width={110} height={48} radius="pill" />
          <Skeleton width={96} height={48} radius="pill" />
          <Skeleton width={96} height={48} radius="pill" />
        </Row>
        <Skeleton width="60%" height={20} />
      </Column>
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
      toast.show(t(key), {
        kind: 'error',
        ...(key === 'ac.error.notSent'
          ? { action: { label: t('common.retry'), onPress: () => retry.current() } }
          : {}),
      });
    },
  );
  const power = state.power;
  const live = view.usable && power;

  const press = (change: Partial<AcState>): void => {
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
  const canDown =
    live && nextAc(state, { setpoint: state.setpoint - 1 }, caps).setpoint !== state.setpoint;
  const canUp =
    live && nextAc(state, { setpoint: state.setpoint + 1 }, caps).setpoint !== state.setpoint;

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
      scroll
      subtitle={subtitle ? <Txt color="ink2">{subtitle}</Txt> : undefined}
      actions={
        <IconButton
          icon="power"
          tone="power"
          label={t('ac.power')}
          onPress={() => press({ power: !power })}
          disabled={!view.usable}
          testID="ac-power"
        />
      }
    >
      <Column gap={5}>
        <Column align="center">
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
            <Row float={{ left: 0, right: 0, bottom: -6 }} justify="between" px={3}>
              <Stepper icon="minus" label={t('ac.lower')} onPress={lower} disabled={!canDown} />
              <Stepper icon="plus" label={t('ac.raise')} onPress={raise} disabled={!canUp} />
            </Row>
          </Dial>
        </Column>

        <SegmentedControl
          label={t('ac.modeTitle')}
          options={modes.map((m) => ({ value: m, label: t(`ac.mode.${m}`), icon: MODE_ICON[m] }))}
          value={state.mode}
          onChange={(m) => press({ mode: m })}
          disabled={!live}
        />

        <Row gap={2} wrap justify="center">
          {fans.length > 1 ? (
            <Touchable
              onPress={() => press({ fan: fans[(fans.indexOf(state.fan) + 1) % fans.length] })}
              disabled={!live}
              accessibilityLabel={
                state.fan === 'auto' ? t('ac.fanAuto') : t('ac.fanChip', { speed: state.fan })
              }
              accessibilityHint={t('ac.fanHint')}
              radius="pill"
              pressScale={0.95}
            >
              <Chip
                icon="wind"
                label={
                  state.fan === 'auto' ? t('ac.fanAuto') : t('ac.fanChip', { speed: state.fan })
                }
                state="neutral"
                disabled={!live}
              />
            </Touchable>
          ) : null}
          {caps.swing === true ? (
            <Chip
              icon="swing"
              label={t('ac.swing')}
              state={state.swing ? 'selected' : 'neutral'}
              disabled={!live}
              onToggle={() => press({ swing: !state.swing })}
            />
          ) : null}
          {caps.sleep === true ? (
            <Chip
              icon="moon"
              label={t('ac.sleep')}
              state={state.sleep ? 'selected' : 'neutral'}
              disabled={!live}
              onToggle={() => press({ sleep: !state.sleep })}
            />
          ) : null}
        </Row>

        <LinkLine
          kind={status.kind}
          text={t(status.key, status.params)}
          onPress={() => router.push(`/device-sheet/${deviceId}`)}
        />
      </Column>
    </Screen>
  );
}

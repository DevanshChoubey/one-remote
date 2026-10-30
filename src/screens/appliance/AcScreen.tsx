import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { AcFan, AcMode, AcState } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import { Box, Chip, Column, Row, Screen, Touchable, Txt } from '@/ui';
import { DeviceSettingsButton } from '../device/DeviceSettingsButton';
import { useHomeData } from '../shared/useHomeData';
import { acView, nextAc } from './acModel';
import { pressFeedback } from './pressFeedback';
import { sendErrorKey } from './sendErrors';
import { statusLine } from './statusLine';
import { useDeviceView } from './useDeviceView';

const ALL_MODES: AcMode[] = ['cool', 'dry', 'fan', 'auto'];
const ALL_FANS: AcFan[] = ['auto', 1, 2, 3];

export function AcScreen(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  const view = useDeviceView(props.deviceId);
  if (!view) {
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <Txt color="ink2">{t('ac.notFound')}</Txt>
      </Screen>
    );
  }
  return <AcRemote view={view} />;
}

function AcRemote({ view }: { view: DeviceView }): ReactElement {
  const router = useRouter();
  const { hub, prefs } = useServices();
  const { rooms } = useHomeData();
  const shown = acView(view);
  const { caps } = shown;
  // The guess is valid only until the hub's view changes (a report, or the state it remembers).
  const [guess, setOptimistic] = useState<{ state: AcState; basedOn: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hubState = view.state;
  const state = guess && guess.basedOn === hubState ? guess.state : shown.state;
  const power = state.power;
  const live = view.usable && power;
  const deviceId = view.device.id;

  const press = (change: Partial<AcState>): void => {
    const next = nextAc(state, change, caps);
    setOptimistic({ state: next, basedOn: hubState });
    setError(null);
    pressFeedback(prefs);
    hub.send(deviceId, { kind: 'ac.set', state: next }).catch((e: unknown) => {
      setOptimistic(null);
      setError(sendErrorKey(e, 'ac'));
    });
  };

  const modes = ALL_MODES.filter((m) => caps.acModes?.includes(m) ?? true);
  const fans = ALL_FANS.filter((f) => caps.acFan?.includes(f) ?? true);
  const canDown =
    live && nextAc(state, { setpoint: state.setpoint - 1 }, caps).setpoint !== state.setpoint;
  const canUp =
    live && nextAc(state, { setpoint: state.setpoint + 1 }, caps).setpoint !== state.setpoint;

  const room = rooms.find((r) => r.id === view.device.roomId)?.name;
  const subtitle =
    shown.roomTemp === undefined
      ? room
      : room
        ? t('ac.subtitleTemp', { room, temp: shown.roomTemp })
        : t('ac.subtitleTempOnly', { temp: shown.roomTemp });

  const status = statusLine(view);
  const statusText = t(status.key, status.params);

  return (
    <Screen title={view.device.name} onBack={() => router.back()} scroll>
      <Column gap={5}>
        <Row align="center" justify="between">
          <Box flex={1}>{subtitle ? <Txt color="ink2">{subtitle}</Txt> : null}</Box>
          <Touchable
            onPress={() => press({ power: !power })}
            disabled={!view.usable}
            accessibilityLabel={t('ac.power')}
            accessibilityRole="switch"
            checked={power}
          >
            <Box px={3}>
              <Txt variant="heading" color={power ? 'accent' : 'ink2'}>
                ⏻
              </Txt>
            </Box>
          </Touchable>
          <DeviceSettingsButton deviceId={deviceId} />
        </Row>

        <Row align="center" justify="center" gap={5}>
          <Touchable
            onPress={() => press({ setpoint: state.setpoint - 1 })}
            disabled={!canDown}
            accessibilityLabel={t('ac.lower')}
          >
            <Box px={4}>
              <Txt variant="title">−</Txt>
            </Box>
          </Touchable>
          <Column align="center">
            <Txt variant="title" color={power ? 'ink' : 'ink2'}>
              {`${state.setpoint}°`}
            </Txt>
            <Txt color="ink2">{t(`ac.modeName.${state.mode}`)}</Txt>
          </Column>
          <Touchable
            onPress={() => press({ setpoint: state.setpoint + 1 })}
            disabled={!canUp}
            accessibilityLabel={t('ac.raise')}
          >
            <Box px={4}>
              <Txt variant="title">+</Txt>
            </Box>
          </Touchable>
        </Row>

        <Row gap={2} wrap>
          {modes.map((m) => (
            <Chip
              key={m}
              label={t(`ac.mode.${m}`)}
              state={state.mode === m ? 'selected' : 'neutral'}
              disabled={!live}
              onToggle={() => press({ mode: m })}
            />
          ))}
        </Row>

        <Row gap={2} wrap>
          {fans.map((f) => (
            <Chip
              key={String(f)}
              label={f === 'auto' ? t('ac.fanAuto') : t('ac.fanChip', { speed: f })}
              state={state.fan === f ? 'selected' : 'neutral'}
              disabled={!live}
              onToggle={() => press({ fan: f })}
            />
          ))}
        </Row>

        {caps.swing === true || caps.sleep === true ? (
          <Row gap={2} wrap>
            {caps.swing === true ? (
              <Chip
                label={t('ac.swing')}
                state={state.swing ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ swing: !state.swing })}
              />
            ) : null}
            {caps.sleep === true ? (
              <Chip
                label={t('ac.sleep')}
                state={state.sleep ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ sleep: !state.sleep })}
              />
            ) : null}
          </Row>
        ) : null}

        {error ? (
          <Txt live color="ink2">
            {t(error)}
          </Txt>
        ) : null}

        {status.key === 'ac.status.connected' ? (
          <Touchable
            onPress={() => router.push(`/device-sheet/${deviceId}`)}
            accessibilityLabel={statusText}
          >
            <Txt color="ink2">{statusText}</Txt>
          </Touchable>
        ) : (
          <Txt color="ink2">{statusText}</Txt>
        )}
      </Column>
    </Screen>
  );
}

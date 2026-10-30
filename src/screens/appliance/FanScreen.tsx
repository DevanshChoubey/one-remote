import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FanSpeed, FanState } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import { Box, Chip, Column, Row, Screen, Touchable, Txt } from '@/ui';
import { DeviceSettingsButton } from '../device/DeviceSettingsButton';
import { useHomeData } from '../shared/useHomeData';
import { fanView } from './fanModel';
import { pressFeedback } from './pressFeedback';
import { sendErrorKey } from './sendErrors';
import { statusLine } from './statusLine';
import { useDeviceView } from './useDeviceView';

const TIMERS: FanState['timerHours'][] = [0, 1, 2, 4, 8];
const TOP_ROW: FanSpeed[] = [1, 2, 3];
const BOTTOM_ROW: FanSpeed[] = [4, 5];

export function FanScreen(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  const view = useDeviceView(props.deviceId);
  if (!view) {
    return (
      <Screen title={t('common.appName')} onBack={() => router.back()}>
        <Txt color="ink2">{t('fan.notFound')}</Txt>
      </Screen>
    );
  }
  return <FanRemote view={view} />;
}

function FanRemote({ view }: { view: DeviceView }): ReactElement {
  const router = useRouter();
  const { hub, prefs } = useServices();
  const { rooms } = useHomeData();
  const shown = fanView(view);
  const { caps } = shown;
  const hubState = view.state;
  // The guess is valid only until the hub's view changes.
  const [guess, setGuess] = useState<{ state: FanState; basedOn: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = guess && guess.basedOn === hubState ? guess.state : shown.state;
  const usable = view.usable;
  const live = usable && state.power;
  const deviceId = view.device.id;

  const press = (change: Partial<FanState>): void => {
    const next: FanState = { ...state, ...change };
    setGuess({ state: next, basedOn: hubState });
    setError(null);
    pressFeedback(prefs);
    hub.send(deviceId, { kind: 'fan.set', state: next }).catch((e: unknown) => {
      setGuess(null);
      setError(sendErrorKey(e, 'fan'));
    });
  };

  const room = rooms.find((r) => r.id === view.device.roomId)?.name;
  const status = statusLine(view);
  const statusText = t(status.key, status.params);
  const showBoost = caps.fanBoost !== false;
  const showSleep = caps.sleep === true;
  const showTimer = caps.fanTimer !== false;

  const bar = (n: FanSpeed): ReactElement => (
    <Box key={n} flex={1}>
      <Touchable
        onPress={() => press({ power: true, speed: n })}
        disabled={!usable}
        selected={state.power && state.speed === n}
        accessibilityLabel={t('fan.speed', { n })}
      >
        <Box
          bg={state.power && n <= state.speed ? 'accent' : 'surface2'}
          border="line"
          radius="md"
          py={6}
          align="center"
        >
          <Txt variant="heading" color={state.power && n <= state.speed ? 'accentInk' : 'ink'}>
            {String(n)}
          </Txt>
        </Box>
      </Touchable>
    </Box>
  );

  return (
    <Screen title={view.device.name} onBack={() => router.back()} scroll>
      <Column gap={5}>
        <Row align="center" justify="between">
          <Box flex={1}>{room ? <Txt color="ink2">{room}</Txt> : null}</Box>
          <Touchable
            onPress={() => press({ power: !state.power })}
            disabled={!usable}
            accessibilityLabel={t('fan.power')}
            accessibilityRole="switch"
            checked={state.power}
          >
            <Box px={3}>
              <Txt variant="heading" color={state.power ? 'accent' : 'ink2'}>
                ⏻
              </Txt>
            </Box>
          </Touchable>
          <DeviceSettingsButton deviceId={deviceId} />
        </Row>

        <Column gap={2}>
          <Txt variant="bodyBold">{t('fan.speedTitle')}</Txt>
          <Row gap={2}>{TOP_ROW.map(bar)}</Row>
          <Row gap={2}>
            {BOTTOM_ROW.map(bar)}
            <Box flex={1} />
          </Row>
        </Column>

        {showBoost || showSleep ? (
          <Row gap={2} wrap>
            {showBoost ? (
              <Chip
                label={t('fan.boost')}
                state={state.boost ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ boost: !state.boost })}
              />
            ) : null}
            {showSleep ? (
              <Chip
                label={t('fan.sleep')}
                state={state.sleep ? 'selected' : 'neutral'}
                disabled={!live}
                onToggle={() => press({ sleep: !state.sleep })}
              />
            ) : null}
          </Row>
        ) : null}

        {showTimer ? (
          <Column gap={2}>
            <Txt variant="bodyBold">{t('fan.timerTitle')}</Txt>
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

        {caps.fanLight === true ? (
          <Row>
            <Chip
              label={t('fan.light')}
              state={state.light === true ? 'selected' : 'neutral'}
              disabled={!live}
              onToggle={() => press({ light: !(state.light ?? false) })}
            />
          </Row>
        ) : null}

        {error ? (
          <Txt live color="ink2">
            {t(error)}
          </Txt>
        ) : null}

        {status.key.endsWith('.connected') ? (
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

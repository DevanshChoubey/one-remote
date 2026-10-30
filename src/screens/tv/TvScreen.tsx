import { useFocusEffect, useRouter } from 'expo-router';
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { Command, TvKey } from '@/core';
import { DeviceError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import { Box, Chip, Column, Row, Screen, Touchable, Txt } from '@/ui';
import { DeviceSettingsButton } from '../device/DeviceSettingsButton';
import { useKnownDevice } from '../device/useKnownDevice';
import { DPad } from './DPad';
import { KeyButton } from './KeyButton';
import { KeyboardSheet } from './KeyboardSheet';
import { pressFeedback } from './pressFeedback';
import { TouchPad } from './TouchPad';
import { TvOffPanel } from './TvOffPanel';
import { tvMode } from './tvMode';
import { UnreachablePanel } from './UnreachablePanel';
import { usePreferences } from './usePreferences';
import { useVolumeKeys } from './useVolumeKeys';
import { VolumeRocker } from './VolumeRocker';

type Pad = 'touchpad' | 'dpad';

function nowMs(): number {
  return Date.now();
}

function errorLine(e: unknown): string {
  const code = e instanceof DeviceError ? e.code : 'notSent';
  if (code === 'timeout') return t('tv.errTimeout');
  if (code === 'notPaired') return t('tv.errNotPaired');
  return t('tv.errNotSent');
}

/** Whether the app is in the foreground. */
function useAppActive(): boolean {
  // `currentState` is null until React Native has read it; that is a fresh launch, so active.
  const [active, setActive] = useState(
    AppState.currentState === null || AppState.currentState === 'active',
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

export function TvScreen(props: { deviceId: string }): ReactElement {
  const { deviceId } = props;
  const services = useServices();
  const { hub, prefs, tv } = services;
  const router = useRouter();
  const device = useKnownDevice(deviceId);
  const preferences = usePreferences();
  const network = Network.useNetworkState();
  const active = useAppActive();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const [openedAt] = useState(nowMs);
  const [now, setNow] = useState(openedAt);
  const [wakeSentAt, setWakeSentAt] = useState<number | undefined>(undefined);
  const [view, setView] = useState<DeviceView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [pickedPad, setPickedPad] = useState<Pad | null>(null);
  const watching = focused && active;
  useVolumeKeys(deviceId, watching);

  // Live state: only while this screen is in front and the app is in the foreground.
  useEffect(() => {
    if (!watching || !device) return;
    const show = (): void => {
      try {
        setView(hub.view(deviceId));
      } catch {
        // The device was removed meanwhile; the route shows "not found".
      }
    };
    show();
    const stop = hub.subscribe(deviceId, (v) => {
      setView(v);
      // Once the TV says it is on, the wake is over: a later "off" is a plain off.
      if (v.state?.kind === 'tv' && v.state.state.power) setWakeSentAt(undefined);
    });
    return stop;
  }, [watching, hub, deviceId, device]);

  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(id);
  }, [watching]);

  const onWifi = network.type === undefined || network.type === Network.NetworkStateType.WIFI;
  const mode = tvMode(view, {
    onWifi,
    openedAt,
    ...(wakeSentAt !== undefined ? { wakeSentAt } : {}),
    now,
  });
  const haptics = preferences?.haptics ?? true;

  const send = (cmd: Command): void => {
    hub.send(deviceId, cmd).then(
      () => {
        setProblem(null);
      },
      (e: unknown) => {
        setProblem(errorLine(e));
      },
    );
  };
  const key = (k: TvKey): void => {
    pressFeedback(haptics);
    send({ kind: 'tv.key', key: k });
  };
  const turnOn = (): void => {
    pressFeedback(haptics);
    setWakeSentAt(nowMs());
    send({ kind: 'tv.powerOn' });
  };

  const pad: Pad = pickedPad ?? preferences?.tvPad[deviceId] ?? 'touchpad';
  const choosePad = (next: Pad): void => {
    setPickedPad(next);
    prefs.get().then(
      (p) => prefs.set({ tvPad: { ...p.tvPad, [deviceId]: next } }),
      (e: unknown) => console.error('Could not save the pad style', e),
    );
  };

  const wifiSettings = (): void => {
    const open =
      Platform.OS === 'android'
        ? Linking.sendIntent('android.settings.WIFI_SETTINGS')
        : Linking.openSettings();
    open.catch((e: unknown) => console.error('Could not open Wi-Fi settings', e));
  };
  const findAgain = (): void => {
    if (!device) return;
    tv.findAgain(device).catch((e: unknown) => console.error('Could not look for the TV', e));
  };

  const status =
    mode === 'connecting'
      ? t('tv.statusConnecting')
      : mode === 'ready'
        ? view?.status.fellBack && view.status.via === 'ir'
          ? t('tv.statusIr')
          : t('tv.statusConnected')
        : null;

  const body = ((): ReactElement => {
    if (mode === 'unreachable') {
      return <UnreachablePanel onWifiSettings={wifiSettings} onFindAgain={findAgain} />;
    }
    if (mode === 'off' || mode === 'waking' || mode === 'wakeFailed') {
      return <TvOffPanel mode={mode} onTurnOn={turnOn} />;
    }
    if (keyboard) {
      return (
        <KeyboardSheet
          onText={(text) => send({ kind: 'tv.text', text })}
          onDone={() => setKeyboard(false)}
        />
      );
    }
    return (
      <Column gap={4}>
        <Row gap={2} justify="center">
          <Chip
            label={t('tv.touchpad')}
            state={pad === 'touchpad' ? 'selected' : 'neutral'}
            onToggle={() => choosePad('touchpad')}
          />
          <Chip
            label={t('tv.dpad')}
            state={pad === 'dpad' ? 'selected' : 'neutral'}
            onToggle={() => choosePad('dpad')}
          />
        </Row>
        {pad === 'touchpad' ? <TouchPad onKey={key} /> : <DPad onKey={key} />}
        <VolumeRocker onKey={key} />
        <Row gap={3} justify="center">
          <KeyButton label={t('tv.goBack')} glyph="↩" onPress={() => key('back')} />
          <KeyButton label={t('tv.home')} glyph="⌂" onPress={() => key('home')} />
          <KeyButton label={t('tv.mute')} glyph="🔇" onPress={() => key('mute')} />
        </Row>
        <Row gap={3} justify="center">
          <KeyButton label={t('tv.keyboard')} glyph="⌨" onPress={() => setKeyboard(true)} />
          <KeyButton label={t('tv.input')} glyph="⇄" onPress={() => key('input')} />
          <KeyButton label={t('tv.playPause')} glyph="▶❚❚" onPress={() => key('playPause')} />
        </Row>
      </Column>
    );
  })();

  return (
    <Screen title={device?.name ?? t('common.appName')} onBack={() => router.back()} scroll>
      <Column gap={4} testID="tv-screen">
        <Row align="center" justify="between">
          <Box flex={1}>
            {status ? (
              <Txt variant="caption" color="ink2" live>
                {status}
              </Txt>
            ) : null}
          </Box>
          <Touchable
            onPress={() => (mode === 'ready' ? key('power') : turnOn())}
            accessibilityLabel={t('tv.power')}
          >
            <Box px={3}>
              <Txt variant="heading">⏻</Txt>
            </Box>
          </Touchable>
          <DeviceSettingsButton deviceId={deviceId} />
        </Row>
        {body}
        {problem ? (
          <Txt live color="ink2">
            {problem}
          </Txt>
        ) : null}
      </Column>
    </Screen>
  );
}

import { useFocusEffect, useRouter } from 'expo-router';
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { Command, TvKey } from '@/core';
import { DeviceError, tvLinkOf } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import { Box, Column, Row, Screen, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';
import { BarButton } from './BarButton';
import { DPad } from './DPad';
import { KeyButton } from './KeyButton';
import { MicButton } from './MicButton';
import { InputSheet } from './InputSheet';
import { KeyboardSheet } from './KeyboardSheet';
import { pressFeedback } from './pressFeedback';
import { TouchPad } from './TouchPad';
import { TvBar } from './TvBar';
import { TvMenu } from './TvMenu';
import type { Pad } from './TvMenu';
import { TvOffPanel } from './TvOffPanel';
import { tvMode } from './tvMode';
import { UnreachablePanel } from './UnreachablePanel';
import { wakeHintKey } from './wakeHint';
import { usePreferences } from './usePreferences';
import { useVolumeKeys } from './useVolumeKeys';

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

/** The power symbol drawn from boxes: Android's Roboto has no ⏻, which showed as an empty box. */
function PowerGlyph(): ReactElement {
  return (
    <Box w={16} h={18}>
      <Box
        float={{ top: 2, right: 0 }}
        w={16}
        h={16}
        bg="danger"
        radius="pill"
        align="center"
        justify="center"
      >
        <Box w={12} h={12} bg="surface2" radius="pill" />
      </Box>
      <Box float={{ top: 0, right: 5 }} w={6} h={9} bg="surface2" />
      <Box float={{ top: 0, right: 7 }} w={2} h={9} bg="danger" radius="pill" />
    </Box>
  );
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
  const [inputsOpen, setInputsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [pickedPad, setPickedPad] = useState<Pad | null>(null);
  const watching = focused && active;

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
    // Refresh at once on resume, so the first frame never uses a stale clock.
    const first = setTimeout(() => setNow(nowMs()), 0);
    const id = setInterval(() => setNow(nowMs()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [watching]);

  const onWifi = network.type === undefined || network.type === Network.NetworkStateType.WIFI;
  const mode = tvMode(view, {
    onWifi,
    openedAt,
    ...(wakeSentAt !== undefined ? { wakeSentAt } : {}),
    now,
  });
  const caps = view?.capabilities.tv;
  const canTurnOn = caps?.powerOn !== false;
  const brandKind = (device ? tvLinkOf(device)?.kind : undefined) ?? 'webos';
  const haptics = preferences?.haptics ?? true;
  // Volume is the phone's keys only (no buttons on screen); they steer the TV in these modes.
  useVolumeKeys(deviceId, watching && (mode === 'ready' || mode === 'connecting'));

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
    if (!canTurnOn) return;
    pressFeedback(haptics);
    setWakeSentAt(nowMs());
    send({ kind: 'tv.powerOn' });
  };

  const pad: Pad = pickedPad ?? preferences?.tvPad[deviceId] ?? 'touchpad';
  const choosePad = (next: Pad): void => {
    setPickedPad(next);
    prefs
      .get()
      .then((p) => prefs.set({ tvPad: { ...p.tvPad, [deviceId]: next } }))
      .catch((e: unknown) => console.error('Could not save the pad style', e));
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
    setFinding(true);
    setFindNote(null);
    // The services save a new address; here the person just sees what happened.
    tv.findAgain(device).then(
      (host) => {
        setFinding(false);
        setFindNote(host === null ? t('tv.notFound') : t('tv.foundAt', { host }));
      },
      (e: unknown) => {
        console.error('Could not look for the TV', e);
        setFinding(false);
        setFindNote(t('tv.notFound'));
      },
    );
  };

  const live = mode === 'ready' || mode === 'connecting';

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
      return (
        <UnreachablePanel
          onWifiSettings={wifiSettings}
          onFindAgain={findAgain}
          busy={finding}
          note={findNote}
        />
      );
    }
    if (mode === 'off' || mode === 'waking' || mode === 'wakeFailed') {
      return (
        <TvOffPanel
          mode={mode}
          onTurnOn={turnOn}
          canTurnOn={canTurnOn}
          wakeHintKey={wakeHintKey(brandKind)}
        />
      );
    }
    if (inputsOpen) {
      return (
        <InputSheet
          inputs={view?.state?.kind === 'tv' ? view.state.state.inputs : undefined}
          onPick={(inputId) => {
            pressFeedback(haptics);
            send({ kind: 'tv.input', inputId });
          }}
          onDone={() => setInputsOpen(false)}
        />
      );
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
      <Column flex={1} gap={4}>
        {pad === 'touchpad' ? <TouchPad onKey={key} /> : <DPad onKey={key} />}
        <Row px={1} align="center" justify="between">
          <KeyButton label={t('tv.goBack')} icon="back" size={64} onPress={() => key('back')} />
          <KeyButton label={t('tv.home')} icon="home" size={84} onPress={() => key('home')} />
          <MicButton
            deviceId={deviceId}
            voice={caps?.voice === true}
            text={caps?.text !== false}
            watching={watching}
            send={(cmd) => hub.send(deviceId, cmd).then(() => undefined)}
            onProblem={setProblem}
            errorLine={errorLine}
            onPress={() => pressFeedback(haptics)}
          />
        </Row>
      </Column>
    );
  })();

  return (
    <Screen bare>
      <Column flex={1} gap={4} testID="tv-screen">
        <TvBar
          name={device?.name ?? t('common.appName')}
          status={status}
          onBack={() => router.back()}
        >
          <BarButton
            icon={<PowerGlyph />}
            label={t('tv.power')}
            onPress={() => (live ? key('power') : turnOn())}
          />
          {live && caps?.text !== false ? (
            <BarButton
              glyph="⌨"
              label={t('tv.keyboard')}
              onPress={() => {
                setMenuOpen(false);
                setKeyboard(true);
              }}
            />
          ) : null}
          <BarButton
            glyph="⋮"
            label={t('tv.more')}
            expanded={menuOpen}
            onPress={() => setMenuOpen((o) => !o)}
          />
        </TvBar>
        {body}
        {problem ? (
          <Txt live color="ink2">
            {problem}
          </Txt>
        ) : null}
        {menuOpen ? (
          <TvMenu
            live={live}
            pad={pad}
            onPad={(next) => {
              setMenuOpen(false);
              choosePad(next);
            }}
            onInput={() => {
              setMenuOpen(false);
              if (caps?.inputList === false) key('input');
              else setInputsOpen(true);
            }}
            onSettings={() => {
              setMenuOpen(false);
              router.push(`/device-sheet/${deviceId}`);
            }}
          />
        ) : null}
      </Column>
    </Screen>
  );
}

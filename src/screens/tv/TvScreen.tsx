import { useFocusEffect, useRouter } from 'expo-router';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, BackHandler, Linking, Platform } from 'react-native';
import type { Command, TvKey } from '@/core';
import { DeviceError, tvLinkOf } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';
import {
  Banner,
  Box,
  Button,
  Column,
  Icon,
  IconButton,
  Row,
  Screen,
  Spinner,
  Txt,
  useToast,
} from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';
import { DPad } from './DPad';
import { KeyButton } from './KeyButton';
import { MicButton } from './MicButton';
import { InputSheet } from './InputSheet';
import { KeyboardSheet } from './KeyboardSheet';
import { pressFeedback } from './pressFeedback';
import { TouchPad } from './TouchPad';
import { TvBar } from './TvBar';
import type { TvStatus } from './TvBar';
import { TvMenu } from './TvMenu';
import type { Pad } from './TvMenu';
import { TvOffPanel } from './TvOffPanel';
import { tvMode } from './tvMode';
import { UnreachablePanel } from './UnreachablePanel';
import { wakeHintKey } from './wakeHint';
import { usePreferences } from './usePreferences';
import { useVolumeKeys } from './useVolumeKeys';

const SENT_MS = 1600;

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
  const { hub, prefs, tv, voice: engines } = services;
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

  const [openedAt, setOpenedAt] = useState(nowMs);
  const [now, setNow] = useState(openedAt);
  const [wakeSentAt, setWakeSentAt] = useState<number | undefined>(undefined);
  const [view, setView] = useState<DeviceView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Each sheet stays mounted through its exit: `open` turns false first, `onClosed` unmounts.
  const [keyboard, setKeyboard] = useState(false);
  const [keyboardMounted, setKeyboardMounted] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inputsMounted, setInputsMounted] = useState(false);
  // Picking Input closes the menu first; the sheet opens once the menu's Modal is gone (iOS cannot
  // present a second Modal over one that is still leaving).
  const inputAfterMenu = useRef(false);
  const openKeyboard = (): void => {
    setKeyboardMounted(true);
    setKeyboard(true);
  };
  const openInputs = (): void => {
    setInputsMounted(true);
    setInputsOpen(true);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const [pickedPad, setPickedPad] = useState<Pad | null>(null);
  const [trustLost, setTrustLost] = useState(false);
  const [sent, setSent] = useState(false);
  const [dictation, setDictation] = useState(false);
  const toast = useToast();
  const [repairing, setRepairing] = useState(false);
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watching = focused && active;

  // Back from the pairing flow the lost trust counts as mended (a failed key brings it back).
  const [wasFocused, setWasFocused] = useState(focused);
  if (wasFocused !== focused) {
    setWasFocused(focused);
    if (focused && repairing) {
      setRepairing(false);
      setTrustLost(false);
    }
  }

  // Each look starts its own connecting window: the TV is asked afresh, and the old answer is gone.
  const [wasWatching, setWasWatching] = useState(watching);
  if (wasWatching !== watching) {
    setWasWatching(watching);
    if (watching) {
      const t = nowMs();
      setOpenedAt(t);
      setNow(t);
      setView(null);
      setWakeSentAt(undefined);
    }
  }

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
    try {
      hub.renew(deviceId);
    } catch {
      // The device was removed meanwhile; the route shows "not found".
    }
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
        setTrustLost(false);
      },
      (e: unknown) => {
        if (e instanceof DeviceError && e.code === 'notPaired') {
          setTrustLost(true);
          return;
        }
        toast.show(errorLine(e), {
          kind: 'error',
          action: { label: t('common.retry'), onPress: () => send(cmd) },
        });
      },
    );
  };
  const key = (k: TvKey): void => {
    if (mode === 'connecting' && k !== 'power') return;
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
        setFindNote(
          host === null
            ? { text: t('tv.notFound'), ok: false }
            : { text: t('tv.foundAt', { host }), ok: true },
        );
      },
      (e: unknown) => {
        console.error('Could not look for the TV', e);
        setFinding(false);
        setFindNote({ text: t('tv.notFound'), ok: false });
      },
    );
  };

  // Pad styles, Input and Keyboard need a settled link; Power also works while connecting.
  const live = mode === 'ready';
  const linkUp = mode === 'ready' || mode === 'connecting';
  const voiceOn = caps?.voice === true;
  const hasMic = voiceOn || (caps?.text !== false && dictation);

  // Can this phone dictate? (The mic key hides itself when neither voice nor dictation works.)
  useEffect(() => {
    if (!watching) return;
    let current = true;
    engines.dictation.available().then(
      (ok) => current && setDictation(ok),
      () => current && setDictation(false),
    );
    return () => {
      current = false;
    };
  }, [watching, engines.dictation]);

  // "Sent to the TV" stays 1.6 s under the keys.
  const voiceSent = (): void => {
    if (sentTimer.current !== null) clearTimeout(sentTimer.current);
    setSent(true);
    sentTimer.current = setTimeout(() => {
      sentTimer.current = null;
      setSent(false);
    }, SENT_MS);
  };
  useEffect(
    () => () => {
      if (sentTimer.current !== null) clearTimeout(sentTimer.current);
    },
    [],
  );

  // A sheet over a TV that is no longer live goes away (the typed text is still sent on close).
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    if (!live) {
      setKeyboard(false);
      setInputsOpen(false);
    }
  }

  // Android back closes the ⋮ menu first, not the screen under it.
  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen]);

  const blockedByWifi = mode === 'unreachable' && !onWifi;
  const status: TvStatus | null =
    mode === 'off' || mode === 'wakeFailed'
      ? { text: t('tv.statusOff'), tone: 'warn' }
      : mode === 'waking'
        ? { text: t('tv.waking'), tone: 'warn', live: true }
        : mode === 'unreachable' && (blockedByWifi || !trustLost)
          ? finding
            ? { text: t('tv.finding'), tone: 'warn', live: true }
            : { text: t('tv.unreachableTitle'), tone: 'err' }
          : trustLost
            ? { text: t('tv.statusPairAgain'), tone: 'err' }
            : mode === 'connecting'
              ? { text: t('tv.statusConnecting'), tone: 'warn', live: true }
              : view?.status.fellBack && view.status.via === 'ir'
                ? { text: t('tv.statusIr'), tone: 'warn' }
                : { text: t('tv.statusConnected'), tone: 'ok' };

  const pairAgain = (): void => {
    setRepairing(true);
    router.push(`/device-sheet/${deviceId}`);
  };
  // The vertical padding keeps the keys' shadows inside the row, which is one faded layer while
  // connecting.
  const keyRow = (
    <Row px={1} py={2} align="center" justify={hasMic ? 'between' : 'center'}>
      <KeyButton label={t('tv.goBack')} icon="back" size={64} onPress={() => key('back')} />
      {hasMic ? null : <Box w={56} />}
      <KeyButton label={t('tv.home')} icon="home" size={84} onPress={() => key('home')} />
      <MicButton
        deviceId={deviceId}
        voice={voiceOn}
        text={caps?.text !== false}
        watching={watching}
        send={(cmd) => hub.send(deviceId, cmd).then(() => undefined)}
        onProblem={setProblem}
        errorLine={errorLine}
        onPress={() => pressFeedback(haptics)}
        onSent={voiceSent}
        onListening={setListening}
      />
    </Row>
  );

  const captions = (
    <>
      {problem ? (
        <Txt live color="ink2">
          {problem}
        </Txt>
      ) : null}
      {sent && !problem ? (
        <Row gap={2} align="center" justify="center">
          <Icon name="check" size={18} color="okInk" />
          <Txt live variant="bodyBold" color="okInk">
            {t('tv.voiceSent')}
          </Txt>
        </Row>
      ) : null}
    </>
  );

  const body = ((): ReactElement => {
    if (mode === 'unreachable' && (blockedByWifi || !trustLost)) {
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
    if (trustLost) {
      return (
        <Column flex={1} gap={4}>
          <Box
            flex={1}
            bg="surface2"
            border="line"
            radius="lg"
            opacity={0.45}
            align="center"
            justify="center"
          >
            <Txt color="ink2">{t('tv.touchpadHint')}</Txt>
          </Box>
          <Banner tone="error" icon="lock" text={t('tv.errNotPaired')} testID="tv-not-paired" />
          <Button label={t('addTv.pairAgain')} onPress={pairAgain} />
        </Column>
      );
    }
    if (mode === 'connecting') {
      return (
        <Column flex={1} gap={4}>
          <Box flex={1} radius="lg" bg="surface" border="line" align="center" justify="center">
            <Box
              float={{ top: 0, right: 0, bottom: 0, left: 0 }}
              radius="lg"
              bg="line"
              opacity={0.7}
            />
            <Row gap={3} align="center" bg="surface" radius="pill" shadow="pop" px={4} py={3}>
              <Spinner size="sm" />
              <Txt variant="bodyBold">{t('tv.statusConnecting')}</Txt>
            </Row>
          </Box>
          <Box opacity={0.45}>{keyRow}</Box>
        </Column>
      );
    }
    return (
      <Column flex={1} gap={4}>
        <Box flex={1} opacity={listening ? 0.55 : 1} testID="tv-pad-area">
          {pad === 'touchpad' ? <TouchPad onKey={key} /> : <DPad onKey={key} />}
        </Box>
        {keyRow}
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
          <IconButton
            icon="power"
            tone="power"
            label={t('tv.power')}
            onPress={() => (linkUp ? key('power') : turnOn())}
          />
          {live && caps?.text !== false ? (
            <IconButton
              icon="keyboard"
              label={t('tv.keyboard')}
              onPress={() => {
                setMenuOpen(false);
                openKeyboard();
              }}
            />
          ) : null}
          <IconButton
            icon="more"
            label={t('tv.more')}
            expanded={menuOpen}
            onPress={() => setMenuOpen((o) => !o)}
          />
        </TvBar>
        {body}
        {captions}
      </Column>
      <TvMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onClosed={() => {
          if (!inputAfterMenu.current) return;
          inputAfterMenu.current = false;
          if (live) openInputs();
        }}
        live={live}
        pad={pad}
        onPad={(next) => {
          setMenuOpen(false);
          choosePad(next);
        }}
        onInput={() => {
          setMenuOpen(false);
          if (caps?.inputList === false) key('input');
          else inputAfterMenu.current = true;
        }}
        onSettings={() => {
          setMenuOpen(false);
          router.push(`/device-sheet/${deviceId}`);
        }}
      />
      {inputsMounted ? (
        <InputSheet
          open={inputsOpen}
          onClosed={() => setInputsMounted(false)}
          inputs={view?.state?.kind === 'tv' ? view.state.state.inputs : undefined}
          {...(view?.state?.kind === 'tv' && view.state.state.currentInputId !== undefined
            ? { currentInputId: view.state.state.currentInputId }
            : {})}
          onPick={(inputId) => {
            pressFeedback(haptics);
            send({ kind: 'tv.input', inputId });
          }}
          onDone={() => setInputsOpen(false)}
        />
      ) : null}
      {keyboardMounted ? (
        <KeyboardSheet
          open={keyboard}
          onClosed={() => setKeyboardMounted(false)}
          onText={(text) => send({ kind: 'tv.text', text })}
          onDone={() => setKeyboard(false)}
        />
      ) : null}
    </Screen>
  );
}

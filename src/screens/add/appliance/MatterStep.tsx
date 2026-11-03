import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MatterError } from '@/core/matterSetup';
import type { CommissionStep } from '@/core/matterSetup';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { useServices } from '@/services';
import { Box, Button, Column, ErrorLine, Field, Icon, ResultDisc, Screen, Txt } from '@/ui';
import { CameraFrame, StepList } from '@/ui/add';
import type { StepState } from '@/ui/add';
import type { MatterStepProps } from './AddApplianceFlow';

const STEPS: CommissionStep[] = ['found', 'network', 'responds'];

const STEP_LABEL: Record<CommissionStep, string> = {
  found: t('matter.step.found'),
  network: t('matter.step.network'),
  responds: t('matter.step.responds'),
};

const ERROR_TEXT: Record<string, string> = {
  badCode: t('matter.error.badCode'),
  notFound: t('matter.error.notFound'),
  networkFailed: t('matter.error.networkFailed'),
  noResponse: t('matter.error.noResponse'),
  unavailable: t('matter.error.unavailable'),
  cancelled: t('matter.error.cancelled'),
  unreachable: t('matter.error.unreachable'),
  rejected: t('matter.error.rejected'),
};

type Phase =
  | { name: 'code'; error?: string }
  | { name: 'connecting'; done: CommissionStep[] }
  | { name: 'success' }
  | { name: 'failed'; done: CommissionStep[]; failedAt: CommissionStep; error: string };

/** How long a lock-on and the finished checklist stay on screen before moving on. */
const LOCK_MS = 450;
const SUCCESS_MS = 900;

/** Scan the AC's Matter QR (or paste or type the code), then watch it join. Nothing is saved unless every step passes. */
export function MatterStep(props: MatterStepProps): ReactElement {
  const { matter } = useServices();
  const motion = useMotion();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(0);
  const [permission, askPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: 'code' });
  const run = useRef(0);
  const scanned = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number): void => {
    if (ms <= 0) return fn();
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  // Ask once when the screen opens; after a refusal the typed and pasted routes stay open.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void askPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const badCode = (message: string): void => {
    setPhase({ name: 'code', error: message });
    setShake((n) => n + 1);
  };

  const connect = (input: string): void => {
    const code = matter.parseCode(input);
    if (!code) {
      badCode(t('matter.badCode'));
      return;
    }
    const mine = ++run.current;
    const done: CommissionStep[] = [];
    setPhase({ name: 'connecting', done });
    matter
      .commission(code, (s) => {
        if (mine !== run.current) return;
        done.push(s);
        setPhase({ name: 'connecting', done: [...done] });
      })
      .then(
        (link) => {
          if (mine !== run.current) return;
          // Let the finished checklist be seen before the next step.
          setPhase({ name: 'success' });
          later(() => {
            if (mine === run.current) props.onDone(link);
          }, SUCCESS_MS);
        },
        (e: unknown) => {
          if (mine !== run.current) return;
          const err = e instanceof MatterError ? e : new MatterError('unreachable');
          const next = STEPS[done.length] ?? 'responds';
          setPhase({
            name: 'failed',
            done: [...done],
            failedAt: err.step ?? next,
            error: ERROR_TEXT[err.code] ?? t('matter.error.unreachable'),
          });
        },
      );
  };

  const onScan = ({ data }: { data: string }): void => {
    if (scanned.current) return;
    if (!data.startsWith('MT:')) {
      setPhase({ name: 'code', error: t('matter.notMatter') });
      return;
    }
    scanned.current = true;
    // Lock on first, so the corners snap in and turn green, then connect.
    setLocked(true);
    later(() => connect(data), motion.reduced ? 0 : LOCK_MS);
  };

  const paste = (): void => {
    void Clipboard.getStringAsync().then((value) => connect(value.trim()));
  };

  if (phase.name === 'code') {
    const denied = permission && !permission.granted && !permission.canAskAgain;
    return (
      <Screen
        title={t('matter.title')}
        onBack={props.onSkip}
        scroll
        footer={
          <Column gap={2}>
            {typing ? <Button label={t('matter.connect')} onPress={() => connect(text)} /> : null}
            {typing ? null : (
              <>
                <Button label={t('matter.paste')} variant="secondary" icon="clip" onPress={paste} />
                <Button
                  label={t('matter.enter')}
                  variant="secondary"
                  onPress={() => setTyping(true)}
                />
              </>
            )}
            <Button label={t('matter.notNow')} variant="ghost" onPress={props.onSkip} />
          </Column>
        }
      >
        <Column gap={4}>
          <Txt color="ink2">{t('matter.intro')}</Txt>
          {permission?.granted && !typing ? (
            <Box accessibilityLabel={t('matter.scanLabel')} accessibilityRole="image">
              <CameraFrame
                locked={locked}
                hint={t('matter.scanHint')}
                lockLabel={t('matter.lockLabel')}
              >
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onScan}
                />
              </CameraFrame>
            </Box>
          ) : null}
          {denied ? (
            <Box
              h={280}
              bg="surface2"
              border="line"
              radius="lg"
              px={6}
              gap={3}
              align="center"
              justify="center"
              accessibilityLabel={t('matter.scanLabel')}
              accessibilityRole="image"
            >
              <Icon name="cameraoff" size={40} color="ink2" />
              <Txt live color="ink2">
                {t('matter.cameraDenied')}
              </Txt>
            </Box>
          ) : null}
          {typing ? (
            <Field
              label={t('matter.codeLabel')}
              value={text}
              onChangeText={setText}
              placeholder={t('matter.codeHint')}
              autoCapitalize="characters"
              maxLength={60}
              onSubmitEditing={() => connect(text)}
              error={phase.error ?? null}
              shakeKey={shake}
            />
          ) : phase.error ? (
            <ErrorLine text={phase.error} />
          ) : null}
        </Column>
      </Screen>
    );
  }

  const failed = phase.name === 'failed' ? phase.failedAt : null;
  const done = phase.name === 'success' ? STEPS : phase.done;
  const active = phase.name === 'connecting' ? STEPS.find((s) => !done.includes(s)) : undefined;
  const state = (s: CommissionStep): StepState =>
    done.includes(s) ? 'done' : s === failed ? 'fail' : s === active ? 'active' : 'idle';
  return (
    <Screen
      title={t('matter.connectingTitle')}
      onBack={phase.name === 'failed' ? props.onSkip : undefined}
      scroll
      footer={
        phase.name === 'failed' ? (
          <Column gap={2}>
            <Button
              label={t('matter.retry')}
              onPress={() => {
                scanned.current = false;
                setLocked(false);
                setPhase({ name: 'code' });
              }}
            />
            <Button label={t('matter.notNow')} variant="ghost" onPress={props.onSkip} />
          </Column>
        ) : undefined
      }
    >
      <Column gap={4}>
        <Txt color="ink2">{t('matter.connectingHint')}</Txt>
        <StepList steps={STEPS.map((s) => ({ label: STEP_LABEL[s], state: state(s) }))} />
        {phase.name === 'failed' ? <ErrorLine text={phase.error} /> : null}
        {phase.name === 'success' ? (
          <Column align="center">
            <ResultDisc kind="ok" label={t('matter.step.responds')} />
          </Column>
        ) : null}
      </Column>
    </Screen>
  );
}

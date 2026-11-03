import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MatterError } from '@/core/matterSetup';
import type { CommissionStep } from '@/core/matterSetup';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Button, Column, Input, Screen, Txt } from '@/ui';
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
  | { name: 'failed'; done: CommissionStep[]; failedAt: CommissionStep; error: string };

/** Type the AC's Matter setup code, then watch it join. Nothing is saved unless every step passes. */
export function MatterStep(props: MatterStepProps): ReactElement {
  const { matter } = useServices();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [permission, askPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: 'code' });
  const run = useRef(0);
  const scanned = useRef(false);

  // Ask once when the screen opens; after a refusal the typed and pasted routes stay open.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void askPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const connect = (input: string): void => {
    const code = matter.parseCode(input);
    if (!code) {
      setPhase({ name: 'code', error: t('matter.badCode') });
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
          if (mine === run.current) props.onDone(link);
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
    connect(data);
  };

  const paste = (): void => {
    void Clipboard.getStringAsync().then((value) => connect(value.trim()));
  };

  if (phase.name === 'code') {
    return (
      <Screen title={t('matter.title')} onBack={props.onSkip} scroll>
        <Column gap={4}>
          <Txt color="ink2">{t('matter.intro')}</Txt>
          {permission?.granted && !typing ? (
            <Box accessibilityLabel={t('matter.scanLabel')} h={280}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onScan}
              />
            </Box>
          ) : null}
          {permission && !permission.granted && !permission.canAskAgain ? (
            <Txt live color="danger">
              {t('matter.cameraDenied')}
            </Txt>
          ) : null}
          {typing ? (
            <>
              <Input
                value={text}
                onChangeText={setText}
                accessibilityLabel={t('matter.codeLabel')}
                placeholder={t('matter.codeHint')}
                autoCapitalize="characters"
                maxLength={60}
                onSubmitEditing={() => connect(text)}
              />
              <Button label={t('matter.connect')} onPress={() => connect(text)} />
            </>
          ) : null}
          {phase.error ? (
            <Txt live color="danger">
              {phase.error}
            </Txt>
          ) : null}
          <Button label={t('matter.paste')} variant="secondary" onPress={paste} />
          {typing ? null : (
            <Button label={t('matter.enter')} variant="secondary" onPress={() => setTyping(true)} />
          )}
          <Button label={t('matter.notNow')} variant="ghost" onPress={props.onSkip} />
        </Column>
      </Screen>
    );
  }

  const failed = phase.name === 'failed' ? phase.failedAt : null;
  return (
    <Screen title={t('matter.connectingTitle')} scroll>
      <Column gap={4}>
        <Txt color="ink2">{t('matter.connectingHint')}</Txt>
        {STEPS.map((s) => {
          const mark = phase.done.includes(s) ? '✓' : s === failed ? '✗' : '…';
          return (
            <Txt key={s} color={s === failed ? 'danger' : 'ink'}>
              {`${mark}  ${STEP_LABEL[s]}`}
            </Txt>
          );
        })}
        {phase.name === 'failed' ? (
          <>
            <Txt live color="danger">
              {phase.error}
            </Txt>
            <Button
              label={t('matter.retry')}
              onPress={() => {
                scanned.current = false;
                setPhase({ name: 'code' });
              }}
            />
            <Button label={t('matter.notNow')} variant="ghost" onPress={props.onSkip} />
          </>
        ) : null}
      </Column>
    </Screen>
  );
}

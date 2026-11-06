import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { MiraieError } from '@/core';
import type { MiraieErrorCode, MiraieSetup, MiraieStatus } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import {
  Banner,
  Box,
  Button,
  Column,
  ErrorLine,
  Field,
  Group,
  Row,
  Spacer,
  Toggle,
  Txt,
} from '@/ui';

/** The sign-in errors, worded. */
export const MIRAIE_ERROR_KEY: Record<MiraieErrorCode, string> = {
  badPhone: 'miraie.errBadPhone',
  badLogin: 'miraie.errBadLogin',
  notRegistered: 'miraie.errNotRegistered',
  offline: 'miraie.errOffline',
  signedOut: 'miraie.signedOut',
  off: 'miraie.errOff',
};

/** The MirAIe status, kept current. */
export function useMiraieStatus(): MiraieStatus {
  const { miraie } = useServices();
  // status() builds a new object per call, so the store snapshot is its text.
  const snap = useSyncExternalStore(
    (cb) => miraie.subscribe(cb),
    () => JSON.stringify(miraie.status()),
  );
  return useMemo(() => JSON.parse(snap) as MiraieStatus, [snap]);
}

type Stage = 'idle' | 'explain' | 'signin';

/**
 * Mock `cloudGroup`: the one opt-in cloud connection. Off by default; turning it on explains what it
 * means first, then asks for the MirAIe number and password. On: the masked account and Disconnect.
 */
export function MiraieSection(): ReactElement {
  const { miraie } = useServices();
  const status = useMiraieStatus();
  const [stage, setStage] = useState<Stage>('idle');
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const on = status.enabled;
  const hint = on
    ? t('miraie.onHint', { account: status.account ?? '' })
    : stage === 'idle'
      ? t('miraie.offHint')
      : t('miraie.offShort');

  const change = (v: boolean): void => {
    if (v) {
      setStage('explain');
      return;
    }
    setStage('idle');
    void miraie.disconnect();
  };

  let body: ReactElement | null = null;
  if (!on && stage === 'explain') {
    body = (
      <Column gap={3}>
        <Banner icon="globe" text={t('miraie.explain')} testID="miraie-explain" />
        <Row gap={2}>
          <Button label={t('miraie.continue')} size="small" onPress={() => setStage('signin')} />
          <Button
            label={t('miraie.notNow')}
            size="small"
            variant="ghost"
            onPress={() => setStage('idle')}
          />
        </Row>
      </Column>
    );
  } else if ((!on && stage === 'signin') || (on && status.needsSignIn && stage === 'signin')) {
    body = (
      <SignInForm
        miraie={miraie}
        onDone={() => {
          if (alive.current) setStage('idle');
        }}
        onCancel={() => setStage('idle')}
      />
    );
  } else if (on && status.needsSignIn) {
    body = (
      <Column gap={3}>
        <Banner tone="error" text={t('miraie.signedOut')} />
        <Row gap={2}>
          <Button label={t('miraie.signInAgain')} size="small" onPress={() => setStage('signin')} />
          <Button
            label={t('miraie.disconnect')}
            size="small"
            variant="danger"
            onPress={() => change(false)}
          />
        </Row>
      </Column>
    );
  } else if (on) {
    body = (
      <Column gap={3}>
        <Txt variant="caption" color="ink2">
          {t('miraie.disconnectNote')}
        </Txt>
        <Button
          label={t('miraie.disconnect')}
          size="small"
          variant="danger"
          alignSelf="flex-start"
          onPress={() => change(false)}
        />
      </Column>
    );
  }

  return (
    <Column gap={2}>
      <Box px={1}>
        <Txt variant="captionBold" color="ink2">
          {t('miraie.section')}
        </Txt>
      </Box>
      <Group>
        <Box px={4} py={2} minH={56} justify="center">
          <Column gap={0}>
            <Toggle label={t('miraie.rowTitle')} value={on} onChange={change} />
            <Txt variant="caption" color="ink2">
              {hint}
            </Txt>
          </Column>
        </Box>
        {body ? (
          <Box px={4}>
            <Spacer size={1} />
            {body}
            <Spacer size={4} />
          </Box>
        ) : null}
      </Group>
    </Column>
  );
}

function SignInForm(props: {
  miraie: MiraieSetup;
  onDone: () => void;
  onCancel: () => void;
}): ReactElement {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MiraieErrorCode | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    props.miraie.signIn(phone, password).then(
      () => {
        if (!alive.current) return;
        setBusy(false);
        setPassword('');
        props.onDone();
      },
      (e: unknown) => {
        if (!alive.current) return;
        setBusy(false);
        setError(e instanceof MiraieError ? e.code : 'offline');
      },
    );
  };

  return (
    <Column gap={3}>
      <Field
        label={t('miraie.phoneLabel')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={16}
        error={error === 'badPhone' ? t(MIRAIE_ERROR_KEY.badPhone) : null}
        testID="miraie-phone"
      />
      <Field
        label={t('miraie.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        onSubmitEditing={submit}
        error={
          error === 'badLogin' || error === 'notRegistered' ? t(MIRAIE_ERROR_KEY[error]) : null
        }
        testID="miraie-password"
      />
      {error === 'offline' || error === 'off' || error === 'signedOut' ? (
        <ErrorLine text={t(MIRAIE_ERROR_KEY[error])} />
      ) : null}
      <Txt variant="caption" color="ink2">
        {t('miraie.keptNote')}
      </Txt>
      <Row gap={2}>
        <Button
          label={t('miraie.signIn')}
          size="small"
          loading={busy}
          disabled={phone.trim().length === 0 || password.length === 0}
          onPress={submit}
        />
        <Button label={t('miraie.cancel')} size="small" variant="ghost" onPress={props.onCancel} />
      </Row>
    </Column>
  );
}

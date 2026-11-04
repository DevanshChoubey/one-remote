import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv } from '@/core';
import { DeviceError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Field, Screen } from '@/ui';

export interface ManualIpStepProps {
  onFound: (tv: FoundTv) => void;
  onBack: () => void;
}

/** A dotted-quad IPv4 address, each part 0 to 255. */
export function isIpv4(s: string): boolean {
  const parts = s.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
  );
}

export function ManualIpStep(props: ManualIpStepProps): ReactElement {
  const { tv } = useServices();
  const [host, setHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const fail = (text: string): void => {
    setError(text);
    setShake((n) => n + 1);
  };

  const find = (): void => {
    const address = host.trim();
    if (!isIpv4(address)) {
      fail(t('addTv.badIp'));
      return;
    }
    setError(null);
    setBusy(true);
    tv.probeHost(address).then(
      (hit) => {
        setBusy(false);
        if (hit) props.onFound(hit);
        else fail(t('addTv.noAnswer'));
      },
      (e: unknown) => {
        setBusy(false);
        fail(
          e instanceof DeviceError && e.code === 'notLocal'
            ? t('addTv.notLocal')
            : t('addTv.noAnswer'),
        );
      },
    );
  };

  return (
    <Screen
      title={t('addTv.manualTitle')}
      // The where-to-find-it hint sits under the title, above the field, and stays when an error
      // shows (mock: the paragraph 8 px under the head).
      subtitle={t('addTv.manualHint')}
      subtitleParagraph
      largeTitle
      onBack={props.onBack}
      scroll
      footer={<Button label={t('addTv.ipFind')} onPress={find} loading={busy} />}
    >
      <Column gap={4}>
        <Field
          label={t('addTv.ipLabel')}
          value={host}
          onChangeText={setHost}
          placeholder="192.168.1.23"
          keyboardType="decimal-pad"
          onSubmitEditing={find}
          error={error}
          shakeKey={shake}
          autoFocus
        />
      </Column>
    </Screen>
  );
}

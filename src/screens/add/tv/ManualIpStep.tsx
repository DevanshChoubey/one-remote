import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv } from '@/core';
import { DeviceError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Input, Screen, Txt } from '@/ui';

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

  const find = (): void => {
    const address = host.trim();
    if (!isIpv4(address)) {
      setError(t('addTv.badIp'));
      return;
    }
    setError(null);
    setBusy(true);
    tv.probeHost(address).then(
      (hit) => {
        setBusy(false);
        if (hit) props.onFound(hit);
        else setError(t('addTv.noAnswer'));
      },
      (e: unknown) => {
        setBusy(false);
        setError(
          e instanceof DeviceError && e.code === 'notLocal'
            ? t('addTv.notLocal')
            : t('addTv.noAnswer'),
        );
      },
    );
  };

  return (
    <Screen title={t('addTv.manualTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt color="ink2">{t('addTv.manualHint')}</Txt>
        <Input
          value={host}
          onChangeText={setHost}
          accessibilityLabel={t('addTv.ipLabel')}
          placeholder="192.168.1.23"
          onSubmitEditing={find}
        />
        {error ? (
          <Txt live color="danger">
            {error}
          </Txt>
        ) : null}
        <Button label={t('addTv.ipFind')} onPress={find} loading={busy} />
      </Column>
    </Screen>
  );
}

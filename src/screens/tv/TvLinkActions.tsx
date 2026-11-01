import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv, Link } from '@/core';
import { isTvLink, PairError, tvLinkOf } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Row, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';

/**
 * Connection actions for a TV's Wi-Fi link (any brand): its address, finding it again after the address
 * changed, and pairing again. Renders nothing for any other device or link.
 */
export function TvLinkActions(props: { deviceId: string; link?: Link }): ReactElement | null {
  const { tv } = useServices();
  const device = useKnownDevice(props.deviceId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link: Link | undefined = props.link ?? (device ? tvLinkOf(device) : undefined);
  if (!device || device.kind !== 'tv' || !link || !isTvLink(link)) return null;

  const run = (job: () => Promise<string>): void => {
    setBusy(true);
    setNote(null);
    job().then(
      (msg) => {
        setBusy(false);
        setNote(msg);
      },
      (e: unknown) => {
        setBusy(false);
        setNote(
          e instanceof PairError && e.code === 'denied'
            ? t('addTv.denied')
            : e instanceof PairError && e.code === 'timeout'
              ? t('addTv.timedOut')
              : t('addTv.unreachable'),
        );
      },
    );
  };

  const findAgain = (): void =>
    run(async () => {
      const host = await tv.findAgain(device);
      if (host === null) return t('addTv.notFound');
      return t('addTv.foundAt', { host });
    });

  const pairAgain = (): void =>
    run(async () => {
      const found: FoundTv = {
        kind: link.kind,
        host: link.host,
        name: device.name,
        secure: link.kind === 'webos' ? link.secure : true,
      };
      await tv.pair(
        found,
        { onAllow: () => setNote(t('addTv.pairAllow')), askCode: () => Promise.resolve(null) },
        link,
      );
      return t('addTv.paired');
    });

  return (
    <Column gap={2}>
      <Row justify="between" align="center">
        <Txt variant="caption" color="ink2">
          {t('addTv.address')}
        </Txt>
        <Txt variant="caption">{link.host}</Txt>
      </Row>
      <Row gap={2} wrap>
        <Button
          label={t('addTv.findAgain')}
          variant="secondary"
          onPress={findAgain}
          disabled={busy}
        />
        <Button
          label={t('addTv.pairAgain')}
          variant="secondary"
          onPress={pairAgain}
          disabled={busy}
        />
      </Row>
      {note ? (
        <Txt live variant="caption" color="ink2">
          {note}
        </Txt>
      ) : null}
    </Column>
  );
}

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Link } from '@/core';
import { PairError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Row, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';

type Webos = Extract<Link, { kind: 'webos' }>;

/**
 * Connection actions for a TV's Wi-Fi link: its address, finding it again after the address
 * changed, and pairing again. Renders nothing for any other device or link.
 */
export function TvLinkActions(props: { deviceId: string; link?: Link }): ReactElement | null {
  const { tv, store } = useServices();
  const device = useKnownDevice(props.deviceId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link: Link | undefined = props.link ?? device?.links.find((l) => l.kind === 'webos');
  if (!device || device.kind !== 'tv' || !link || link.kind !== 'webos') return null;
  const webos: Webos = link;

  /** Saves `change` onto the stored webos link, read fresh so a stale device cannot overwrite. */
  const saveLink = async (change: Partial<Webos>): Promise<void> => {
    const current = (await store.devices()).find((d) => d.id === device.id) ?? device;
    await store.upsertDevice({
      ...current,
      links: current.links.map((l) => (l.kind === 'webos' ? { ...l, ...change } : l)),
    });
  };

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
      if (host !== webos.host) await saveLink({ host });
      return t('addTv.foundAt', { host });
    });

  const pairAgain = (): void =>
    run(async () => {
      const found = { host: webos.host, name: device.name, secure: webos.secure };
      const paired = await tv.pair(found, () => setNote(t('addTv.pairAllow')), webos.clientKeyRef);
      await saveLink({ host: paired.link.host, secure: paired.link.secure });
      return t('addTv.paired');
    });

  return (
    <Column gap={2}>
      <Row justify="between" align="center">
        <Txt variant="caption" color="ink2">
          {t('addTv.address')}
        </Txt>
        <Txt variant="caption">{webos.host}</Txt>
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

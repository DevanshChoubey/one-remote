import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, ErrorLine, Field, OptionCard, Screen, Txt, useToast } from '@/ui';
import { offsetLabel, problemCopy, zoneLabel } from '../../aer/format';
import { phoneZone } from './phoneZone';
import { filterZones, listTimeZones, zonesFirst } from './zones';

export interface ZoneStepProps {
  /** Changing a saved air freshener's zone, instead of finishing the add. */
  edit?: boolean;
  deviceId: string;
  /** Add mode: saves the device with this zone; a rejection is shown as the reason. */
  onDone?(zone: string): Promise<void>;
  onBack?: () => void;
}

/** More rows than this are never useful on a phone: the search narrows the rest. */
const MAX_ROWS = 40;

/** The home time zone: the phone's zone first and picked, a search over all the others. */
export function ZoneStep(props: ZoneStepProps): ReactElement {
  const { aer, store } = useServices();
  const router = useRouter();
  const toast = useToast();
  const phone = phoneZone();
  const [zone, setZone] = useState<string | null>(props.edit ? null : phone);
  const [saved, setSaved] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const now = useMemo(() => new Date(), []);
  const all = useMemo(() => listTimeZones(), []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Edit: start on the zone the device keeps now.
  useEffect(() => {
    if (!props.edit) return;
    store.devices().then(
      (list) => {
        if (!alive.current) return;
        const link = list.find((d) => d.id === props.deviceId)?.links.find((l) => l.kind === 'aer');
        const current = link?.kind === 'aer' ? link.timeZone : phone;
        setSaved(current);
        setZone((z) => z ?? current);
      },
      () => {
        if (alive.current) setZone((z) => z ?? phone);
      },
    );
  }, [props.edit, props.deviceId, store, phone]);

  // The saved and phone zones lead; a picked zone is added on top only when it would not show.
  const rows = useMemo(() => {
    const shown = filterZones(zonesFirst(all, [saved ?? '', phone]), query).slice(0, MAX_ROWS);
    return zone !== null && !shown.includes(zone) && filterZones([zone], query).length > 0
      ? [zone, ...shown]
      : shown;
  }, [all, zone, saved, phone, query]);

  const finish = (): void => {
    if (zone === null || busy) return;
    setBusy(true);
    setFailure(null);
    const saving = props.edit ? aer.setTimeZone(props.deviceId, zone) : props.onDone?.(zone);
    Promise.resolve(saving).then(
      () => {
        if (!props.edit) return;
        if (alive.current) setBusy(false);
        toast.show(t('aer.saved'), { kind: 'ok' });
        router.back();
      },
      (e: unknown) => {
        if (!alive.current) return;
        setBusy(false);
        setFailure({ error: e });
      },
    );
  };

  const reason = failure ? problemCopy(failure.error).line : null;
  return (
    <Screen
      title={t('aer.zoneTitle')}
      subtitle={props.edit ? undefined : t('aer.zoneStep')}
      largeTitle={!props.edit}
      onBack={props.onBack ?? (() => router.back())}
      scroll
      footer={
        <Column gap={4}>
          {reason !== null ? (
            <ErrorLine text={props.edit ? reason : t('aer.zoneFailed', { problem: reason })} />
          ) : null}
          <Button
            label={props.edit ? t('aer.save') : t('aer.done')}
            onPress={finish}
            loading={busy}
            disabled={zone === null || busy}
          />
        </Column>
      }
    >
      <Txt color="ink2">{t('aer.zoneBody')}</Txt>
      <Field
        label={t('aer.zoneSearch')}
        placeholder={t('aer.zonePlaceholder')}
        value={query}
        onChangeText={setQuery}
      />
      <Column gap={3}>
        {rows.map((z) => (
          <OptionCard
            key={z}
            size="regular"
            icon="globe"
            title={zoneLabel(z)}
            subtitle={offsetLabel(z, now)}
            badge={z === phone ? { label: t('aer.thisPhone') } : undefined}
            selected={z === zone}
            onPress={() => setZone(z)}
            testID={`zone-${z}`}
          />
        ))}
      </Column>
    </Screen>
  );
}

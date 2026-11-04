import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, ListItem, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';

/** The one LG TV code set (NEC), so a TV needs no test. */
const LG_TV_REMOTE = 'lg-tv/nec';

/**
 * "Add IR backup" in the device sheet, after the "How it's connected" group. Hidden on a phone
 * without an IR blaster, and once the device has IR ("Redo IR backup" is then a row in the group,
 * `IrRedoRow`). An AC or fan runs the add flow's IR test; a TV just gets the LG code set.
 */
export function IrBackupAction(props: { deviceId: string }): ReactElement | null {
  const router = useRouter();
  const { ir, store } = useServices();
  const device = useKnownDevice(props.deviceId);
  const [failed, setFailed] = useState(false);
  if (!device || !ir.hasEmitter()) return null;

  const hasIr = device.links.some((l) => l.kind === 'ir');

  if (device.kind === 'tv') {
    if (hasIr) return null;
    const add = (): void => {
      setFailed(false);
      store
        .upsertDevice({
          ...device,
          links: [...device.links, { kind: 'ir', remoteId: LG_TV_REMOTE }],
        })
        .catch(() => setFailed(true));
    };
    return (
      <Column gap={2}>
        <Button label={t('irBackup.add')} variant="secondary" onPress={add} />
        {/* Mock "IR backup failed": one plain status sentence, not a red error line. */}
        {failed ? (
          <Txt color="ink2" live>
            {t('irBackup.failed')}
          </Txt>
        ) : null}
      </Column>
    );
  }

  if (hasIr) return null;
  return (
    <Button
      label={t('irBackup.add')}
      variant="secondary"
      onPress={() => router.push(`/add/ir-backup?id=${device.id}`)}
    />
  );
}

/** Mock `sheetSettings`: "Redo IR backup", a chevron row under an AC's or fan's IR link. */
export function IrRedoRow(props: { deviceId: string }): ReactElement {
  const router = useRouter();
  return (
    <ListItem
      title={t('irBackup.redo')}
      trailing="chevron"
      onPress={() => router.push(`/add/ir-backup?id=${props.deviceId}`)}
    />
  );
}

/** The entry for `DEVICE_ACTIONS` in the device sheet. */
export function irBackupAction(props: { device: { id: string } }): ReactElement {
  return <IrBackupAction deviceId={props.device.id} />;
}

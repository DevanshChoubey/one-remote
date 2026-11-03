import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, ErrorLine } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';

/** The one LG TV code set (NEC), so a TV needs no test. */
const LG_TV_REMOTE = 'lg-tv/nec';

/**
 * "Add IR backup" / "Redo IR backup" in the device sheet. Hidden on a phone without an IR blaster.
 * An AC or fan runs the add flow's IR test; a TV just gets the LG code set.
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
        {failed ? <ErrorLine text={t('irBackup.failed')} /> : null}
      </Column>
    );
  }

  return (
    <Button
      label={t(hasIr ? 'irBackup.redo' : 'irBackup.add')}
      variant="secondary"
      onPress={() => router.push(`/add/ir-backup?id=${device.id}`)}
    />
  );
}

/** The entry for `DEVICE_ACTIONS` in the device sheet. */
export function irBackupAction(props: { device: { id: string } }): ReactElement {
  return <IrBackupAction deviceId={props.device.id} />;
}

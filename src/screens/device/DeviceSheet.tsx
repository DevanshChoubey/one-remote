import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { isTvLink } from '@/core';
import type { Device, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Button, Chip, Column, Input, Row, Screen, Txt } from '@/ui';
import { useHomeData } from '../shared/useHomeData';
import { DEVICE_ACTIONS, LINK_ACTIONS } from './linkActions';
import type { DeviceActionRenderer, LinkActionRenderer } from './linkActions';

const LINK_LABEL: Record<Link['kind'], string> = {
  webos: 'device.linkWifi',
  androidtv: 'device.linkWifi',
  samsung: 'device.linkWifi',
  matter: 'device.linkMatter',
  ir: 'device.linkIr',
};

function linkDetail(link: Link): string | null {
  return isTvLink(link) ? link.host : null;
}

export interface DeviceSheetProps {
  deviceId: string;
  /** Lane actions per link; defaults to the registry in `linkActions.tsx`. */
  linkActions?: readonly LinkActionRenderer[];
  /** Actions for the device as a whole; defaults to `DEVICE_ACTIONS`. */
  deviceActions?: readonly DeviceActionRenderer[];
}

export function DeviceSheet(props: DeviceSheetProps): ReactElement {
  const { store, removeDevice } = useServices();
  const router = useRouter();
  const data = useHomeData();
  const device = data.devices.find((d) => d.id === props.deviceId);
  if (!data.loaded) return <Screen title={t('device.title')}>{null}</Screen>;
  if (!device) {
    return (
      <Screen title={t('device.title')} onBack={() => router.back()}>
        <Txt color="ink2">{t('home.notFound')}</Txt>
      </Screen>
    );
  }
  return (
    <Sheet
      key={device.id}
      device={device}
      rooms={data.rooms}
      siblings={data.devices.filter((d) => d.roomId === device.roomId)}
      actions={props.linkActions ?? LINK_ACTIONS}
      deviceActions={props.deviceActions ?? DEVICE_ACTIONS}
      store={store}
      removeDevice={removeDevice}
      onBack={() => router.back()}
      onRemoved={() => router.dismissAll()}
    />
  );
}

interface SheetProps {
  device: Device;
  rooms: ReturnType<typeof useHomeData>['rooms'];
  siblings: Device[];
  actions: readonly LinkActionRenderer[];
  deviceActions: readonly DeviceActionRenderer[];
  store: ReturnType<typeof useServices>['store'];
  removeDevice: ReturnType<typeof useServices>['removeDevice'];
  onBack: () => void;
  onRemoved: () => void;
}

function Sheet({
  device,
  rooms,
  siblings,
  actions,
  deviceActions,
  store,
  removeDevice,
  onBack,
  onRemoved,
}: SheetProps): ReactElement {
  const [name, setName] = useState(device.name);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = (job: Promise<unknown>, then?: () => void): void => {
    job.then(
      () => {
        setFailed(false);
        then?.();
      },
      () => setFailed(true),
    );
  };

  const ordered = [...siblings].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((d) => d.id === device.id);
  const move = (to: number): void => run(store.moveDevice(device.id, to));
  const changeRoom = (roomId: string): void => {
    if (roomId === device.roomId) return;
    // Joins the end of the destination room; read fresh so a stale list cannot clash.
    run(
      store.devices().then((all) => {
        const order = all
          .filter((d) => d.roomId === roomId)
          .reduce((m, d) => Math.max(m, d.order + 1), 0);
        return store.upsertDevice({ ...device, roomId, order });
      }),
    );
  };
  // Each link's driver forgets its data (pairing keys, fabric); that cleanup never blocks removal.
  const remove = (): Promise<void> => removeDevice(device.id);
  const trimmed = name.trim();

  return (
    <Screen title={t('device.title')} onBack={onBack} scroll>
      <Column gap={5}>
        <Column gap={2}>
          <Txt variant="bodyBold">{t('device.name')}</Txt>
          <Input value={name} onChangeText={setName} accessibilityLabel={t('device.name')} />
          <Button
            label={t('device.saveName')}
            variant="secondary"
            disabled={trimmed === '' || trimmed === device.name}
            onPress={() => run(store.upsertDevice({ ...device, name: trimmed }))}
          />
        </Column>

        <Column gap={2}>
          <Txt variant="bodyBold">{t('device.room')}</Txt>
          <Row gap={2} wrap>
            {rooms.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                state={r.id === device.roomId ? 'selected' : 'neutral'}
                onToggle={() => changeRoom(r.id)}
              />
            ))}
          </Row>
        </Column>

        <Column gap={2}>
          <Txt variant="bodyBold">{t('device.order')}</Txt>
          <Row gap={2}>
            <Button
              label={t('device.moveUp')}
              variant="secondary"
              disabled={index <= 0}
              onPress={() => move(index - 1)}
            />
            <Button
              label={t('device.moveDown')}
              variant="secondary"
              disabled={index < 0 || index >= ordered.length - 1}
              onPress={() => move(index + 1)}
            />
          </Row>
        </Column>

        <Column gap={2}>
          <Txt variant="bodyBold">{t('device.connected')}</Txt>
          {device.links.map((link, i) => (
            <Box key={`${link.kind}-${i}`} bg="surface" border="line" radius="md" p={4}>
              <Column gap={2}>
                <Row justify="between" align="center">
                  <Column>
                    <Txt variant="bodyBold">{t(LINK_LABEL[link.kind])}</Txt>
                    {linkDetail(link) ? (
                      <Txt variant="caption" color="ink2">
                        {linkDetail(link)}
                      </Txt>
                    ) : null}
                  </Column>
                  <Txt variant="caption" color="ink2">
                    {i === 0 ? t('device.main') : t('device.backup')}
                  </Txt>
                </Row>
                {actions.map((render, n) => {
                  const node = render({ device, link });
                  return node ? <Box key={n}>{node}</Box> : null;
                })}
              </Column>
            </Box>
          ))}
        </Column>

        {deviceActions.map((render, n) => {
          const node = render({ device });
          return node ? <Box key={n}>{node}</Box> : null;
        })}

        {failed ? (
          <Txt live color="ink2">
            {t('device.failed')}
          </Txt>
        ) : null}

        {confirming ? (
          <Column gap={2}>
            <Txt>{t('device.removeAsk', { name: device.name })}</Txt>
            <Row gap={2}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setConfirming(false)}
              />
              <Button label={t('device.confirmRemove')} onPress={() => run(remove(), onRemoved)} />
            </Row>
          </Column>
        ) : (
          <Button label={t('device.remove')} variant="ghost" onPress={() => setConfirming(true)} />
        )}
      </Column>
    </Screen>
  );
}

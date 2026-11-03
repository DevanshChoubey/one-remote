import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { isTvLink } from '@/core';
import type { Device, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import {
  Box,
  Button,
  Chip,
  Column,
  ErrorLine,
  Field,
  Group,
  ListItem,
  Row,
  Sheet,
  Skeleton,
  Txt,
  useToast,
} from '@/ui';
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
  // Closing plays the exit first; the route pops once the Sheet reports it has finished.
  const [open, setOpen] = useState(true);
  const close = (): void => setOpen(false);
  const closed = (): void => router.back();
  if (!data.loaded) {
    return (
      <Sheet
        open={open}
        title={t('device.title')}
        onClose={close}
        onClosed={closed}
        testID="device-sheet"
      >
        <Box gap={3} testID="device-skeleton">
          <Skeleton width="40%" height={14} />
          <Skeleton height={48} radius="md" />
          <Skeleton width="70%" height={48} radius="md" />
        </Box>
      </Sheet>
    );
  }
  if (!device) {
    return (
      <Sheet
        open={open}
        title={t('device.title')}
        onClose={close}
        onClosed={closed}
        testID="device-sheet"
      >
        <Txt color="ink2">{t('home.notFound')}</Txt>
      </Sheet>
    );
  }
  return (
    <Sheet
      open={open}
      title={t('device.title')}
      onClose={close}
      onClosed={closed}
      testID="device-sheet"
    >
      <Body
        key={device.id}
        device={device}
        rooms={data.rooms}
        siblings={data.devices.filter((d) => d.roomId === device.roomId)}
        actions={props.linkActions ?? LINK_ACTIONS}
        deviceActions={props.deviceActions ?? DEVICE_ACTIONS}
        store={store}
        removeDevice={removeDevice}
        onRemoved={() => router.dismissAll()}
      />
    </Sheet>
  );
}

interface BodyProps {
  device: Device;
  rooms: ReturnType<typeof useHomeData>['rooms'];
  siblings: Device[];
  actions: readonly LinkActionRenderer[];
  deviceActions: readonly DeviceActionRenderer[];
  store: ReturnType<typeof useServices>['store'];
  removeDevice: ReturnType<typeof useServices>['removeDevice'];
  onRemoved: () => void;
}

function Body({
  device,
  rooms,
  siblings,
  actions,
  deviceActions,
  store,
  removeDevice,
  onRemoved,
}: BodyProps): ReactElement {
  const [name, setName] = useState(device.name);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const toast = useToast();

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

  if (confirming) {
    return (
      <Column gap={4}>
        <Txt variant="heading">{t('device.removeAsk', { name: device.name })}</Txt>
        {failed ? <ErrorLine text={t('device.failed')} /> : null}
        <Button
          label={t('device.confirmRemove')}
          variant="danger"
          onPress={() =>
            run(remove(), () => {
              toast.show(t('device.removed'), { kind: 'ok' });
              onRemoved();
            })
          }
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => setConfirming(false)}
        />
      </Column>
    );
  }

  return (
    <Column gap={5}>
      <Field
        label={t('device.name')}
        value={name}
        onChangeText={setName}
        trailing={
          <Button
            label={t('device.saveName')}
            size="small"
            variant="secondary"
            disabled={trimmed === '' || trimmed === device.name}
            onPress={() =>
              run(store.upsertDevice({ ...device, name: trimmed }), () =>
                toast.show(t('common.saved'), { kind: 'ok' }),
              )
            }
          />
        }
      />

      <Column gap={2}>
        <Txt variant="label" color="ink2">
          {t('device.room')}
        </Txt>
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
        <Txt variant="label" color="ink2">
          {t('device.order')}
        </Txt>
        <Row gap={2}>
          <Button
            label={t('device.moveUp')}
            flex={1}
            icon="up"
            size="small"
            variant="secondary"
            disabled={index <= 0}
            onPress={() => move(index - 1)}
          />
          <Button
            label={t('device.moveDown')}
            flex={1}
            icon="down"
            size="small"
            variant="secondary"
            disabled={index < 0 || index >= ordered.length - 1}
            onPress={() => move(index + 1)}
          />
        </Row>
      </Column>

      <Group label={t('device.connected')}>
        {device.links.map((link, i) => (
          <Column key={`${link.kind}-${i}`}>
            <ListItem
              title={t(LINK_LABEL[link.kind])}
              subtitle={linkDetail(link) ?? undefined}
              badge={
                i === 0
                  ? { label: t('device.main'), tone: 'ok' }
                  : { label: t('device.backup'), tone: 'neutral' }
              }
            />
            {actions.map((render, n) => {
              const node = render({ device, link });
              return node ? (
                <Box key={n} px={4} py={2}>
                  {node}
                </Box>
              ) : null;
            })}
          </Column>
        ))}
      </Group>

      {deviceActions.map((render, n) => {
        const node = render({ device });
        return node ? <Box key={n}>{node}</Box> : null;
      })}

      {failed ? <ErrorLine text={t('device.failed')} /> : null}

      <Button
        label={t('device.remove')}
        variant="danger"
        icon="trash"
        onPress={() => setConfirming(true)}
      />
    </Column>
  );
}

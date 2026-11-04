import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { isTvLink } from '@/core';
import type { Device, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Button, Chip, Column, Field, Group, ListItem, Row, Sheet, Txt, useToast } from '@/ui';
import { useHomeData } from '../shared/useHomeData';
import { DEVICE_ACTIONS, LINK_ACTIONS, LINK_ROWS } from './linkActions';
import type {
  DeviceActionRenderer,
  LinkActionRenderer,
  LinkRequest,
  LinkRowRenderer,
} from './linkActions';

const LINK_LABEL: Record<Link['kind'], string> = {
  webos: 'device.linkWifi',
  androidtv: 'device.linkWifi',
  samsung: 'device.linkWifi',
  matter: 'device.linkMatter',
  ir: 'device.linkIr',
  aer: 'device.linkBluetooth',
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
  /** Chevron rows inside the "How it's connected" group; defaults to `LINK_ROWS`. */
  linkRows?: readonly LinkRowRenderer[];
  /** Opened from the TV's "Pair again" (trust lost): the group offers Pair again as a row. */
  repair?: boolean;
}

export function DeviceSheet(props: DeviceSheetProps): ReactElement {
  const services = useServices();
  const { store, removeDevice } = services;
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
        {/* Mock "Device settings, loading": the title and nothing else. */}
        {null}
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
        rows={props.linkRows ?? LINK_ROWS}
        repair={props.repair === true}
        services={services}
        store={store}
        removeDevice={removeDevice}
        onRemoved={() => router.dismissAll()}
      />
    </Sheet>
  );
}

/** Mock `.sect`: 13 px bold ink2, 4 px in, 4 px above what it names. */
function Section(props: { label: string }): ReactElement {
  return (
    <Box px={1}>
      <Txt variant="captionBold" color="ink2">
        {props.label}
      </Txt>
    </Box>
  );
}

/** Mock: a failed save is one plain status sentence, not a red error line. */
function Failed(): ReactElement {
  return (
    <Txt color="ink2" live>
      {t('device.failed')}
    </Txt>
  );
}

interface BodyProps {
  device: Device;
  rooms: ReturnType<typeof useHomeData>['rooms'];
  siblings: Device[];
  actions: readonly LinkActionRenderer[];
  deviceActions: readonly DeviceActionRenderer[];
  rows: readonly LinkRowRenderer[];
  repair: boolean;
  services: ReturnType<typeof useServices>;
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
  rows,
  repair,
  services,
  store,
  removeDevice,
  onRemoved,
}: BodyProps): ReactElement {
  // A press on a row in the link group, handed to that link's own block below the group.
  const [request, setRequest] = useState<LinkRequest | null>(null);
  const ask = (key: string): void => setRequest((r) => ({ key, n: (r?.n ?? 0) + 1 }));
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
        <Txt variant="heading">{t('device.removeTitle', { name: device.name })}</Txt>
        <Txt color="ink2">{t('device.removeAsk', { name: device.name })}</Txt>
        {failed ? <Failed /> : null}
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

      <Column gap={1}>
        <Section label={t('device.room')} />
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

      <Column gap={1}>
        <Section label={t('device.order')} />
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
        {device.links.flatMap((link, i) => [
          <ListItem
            key={`${link.kind}-${i}`}
            title={t(LINK_LABEL[link.kind])}
            subtitle={linkDetail(link) ?? undefined}
            badge={
              i === 0
                ? { label: t('device.main'), tone: 'ok' }
                : { label: t('device.backup'), tone: 'neutral' }
            }
          />,
          // Mock: "Pair again" and "Redo IR backup" are chevron rows right under their link.
          ...rows.map((render, n) => {
            const node = render({ device, link, repair, services, onRequest: ask });
            return node ? <Box key={`${link.kind}-${i}-row-${n}`}>{node}</Box> : null;
          }),
        ])}
      </Group>

      {/* Mock: a link's own block (the TV address, Find TV again, Pair again) is a section of its
          own after the group, not a card nested inside it. */}
      {device.links.flatMap((link, i) =>
        actions.map((render, n) => {
          const node = render({ device, link, repair, request });
          return node ? <Box key={`${link.kind}-${i}-${n}`}>{node}</Box> : null;
        }),
      )}

      {deviceActions.map((render, n) => {
        const node = render({ device });
        return node ? <Box key={n}>{node}</Box> : null;
      })}

      {failed ? <Failed /> : null}

      <Button
        label={t('device.remove')}
        variant="danger"
        icon="trash"
        onPress={() => setConfirming(true)}
      />
    </Column>
  );
}

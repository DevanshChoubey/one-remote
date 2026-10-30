import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Device } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Chip, Column, Input, Row, Screen, Txt } from '@/ui';
import { newId } from '../shared/newId';
import { useHomeData } from '../shared/useHomeData';

export interface NameRoomStepProps {
  draft: Omit<Device, 'id' | 'name' | 'roomId' | 'order'>;
  suggestedName: string;
  onDone(d: Device): void;
  onBack?: () => void;
}

/** The shared last step of every add flow: name the device and pick (or create) its room. */
export function NameRoomStep(props: NameRoomStepProps): ReactElement {
  const { store } = useServices();
  const data = useHomeData();
  const [name, setName] = useState(props.suggestedName);
  const [picked, setPicked] = useState<string | null>(null);
  const [wantsNew, setWantsNew] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Start on the first room; with no rooms yet the only choice is a new one.
  const roomId =
    picked !== null && data.rooms.some((r) => r.id === picked)
      ? picked
      : (data.rooms[0]?.id ?? null);
  const creating = wantsNew || (data.loaded && data.rooms.length === 0);
  const setRoomId = (id: string): void => {
    setPicked(id);
    setWantsNew(false);
  };

  const createRoom = (): void => {
    const trimmed = roomName.trim();
    if (trimmed === '') return;
    const order = data.rooms.reduce((m, r) => Math.max(m, r.order + 1), 0);
    const id = newId();
    store.upsertRoom({ id, name: trimmed, order }).then(
      () => {
        setRoomId(id);
        setRoomName('');
        setError(false);
      },
      () => setError(true),
    );
  };

  const canSave = name.trim() !== '' && roomId !== null && !busy;
  const save = (): void => {
    if (!canSave || roomId === null) return;
    setBusy(true);
    const order = data.devices
      .filter((d) => d.roomId === roomId)
      .reduce((m, d) => Math.max(m, d.order + 1), 0);
    const device: Device = { ...props.draft, id: newId(), name: name.trim(), roomId, order };
    store.upsertDevice(device).then(
      () => props.onDone(device),
      () => {
        setBusy(false);
        setError(true);
      },
    );
  };

  return (
    <Screen
      title={t('add.nameTitle')}
      onBack={props.onBack}
      scroll
      footer={<Button label={t('common.done')} onPress={save} disabled={!canSave} />}
    >
      <Column gap={4}>
        <Txt color="ink2">{t('add.nameStep')}</Txt>
        <Column gap={2}>
          <Txt variant="bodyBold">{t('add.name')}</Txt>
          <Input
            value={name}
            onChangeText={setName}
            accessibilityLabel={t('add.name')}
            onSubmitEditing={save}
          />
        </Column>
        <Column gap={2}>
          <Txt variant="bodyBold">{t('add.room')}</Txt>
          <Row gap={2} wrap>
            {data.rooms.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                state={r.id === roomId ? 'selected' : 'neutral'}
                onToggle={() => setRoomId(r.id)}
              />
            ))}
            <Chip
              label={t('add.newRoom')}
              state={creating ? 'selected' : 'neutral'}
              onToggle={() => setWantsNew(true)}
            />
          </Row>
          {creating ? (
            <Row gap={2} align="center">
              <Column flex={1}>
                <Input
                  value={roomName}
                  onChangeText={setRoomName}
                  accessibilityLabel={t('add.roomName')}
                  onSubmitEditing={createRoom}
                />
              </Column>
              <Button
                label={t('add.createRoom')}
                variant="secondary"
                onPress={createRoom}
                disabled={roomName.trim() === ''}
              />
            </Row>
          ) : null}
        </Column>
        {error ? <Txt color="ink2">{t('add.saveFailed')}</Txt> : null}
      </Column>
    </Screen>
  );
}

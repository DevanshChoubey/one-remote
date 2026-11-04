import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Device } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Button, Chip, Column, ErrorLine, Field, Row, Screen, Rise, Spacer, Txt } from '@/ui';
import { newId } from '../shared/newId';
import { useHomeData } from '../shared/useHomeData';

export interface NameRoomStepProps {
  draft: Omit<Device, 'id' | 'name' | 'roomId' | 'order'>;
  suggestedName: string;
  onDone(d: Device): void;
  /** Called as the device is written, with the write; a caller can tell the save is under way. */
  onSaving?: (saving: Promise<void>) => void;
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

  // While "New room" is chosen, Done creates the typed room and saves into it.
  const newRoomName = roomName.trim();
  const hasRoom = creating ? newRoomName !== '' : roomId !== null;
  const canSave = name.trim() !== '' && hasRoom && !busy;
  const save = (): void => {
    if (!canSave) return;
    setBusy(true);
    const target = creating ? newId() : roomId;
    if (target === null) return;
    const order = creating
      ? 0
      : data.devices
          .filter((d) => d.roomId === target)
          .reduce((m, d) => Math.max(m, d.order + 1), 0);
    const device: Device = {
      ...props.draft,
      id: newId(),
      name: name.trim(),
      roomId: target,
      order,
    };
    const roomFirst = creating
      ? store.upsertRoom({
          id: target,
          name: newRoomName,
          order: data.rooms.reduce((m, r) => Math.max(m, r.order + 1), 0),
        })
      : Promise.resolve();
    const saving = roomFirst.then(() => store.upsertDevice(device));
    props.onSaving?.(saving);
    saving.then(
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
      subtitle={t('add.nameStep')}
      largeTitle
      onBack={props.onBack}
      scroll
      footer={
        <Column gap={4}>
          {error ? <ErrorLine text={t('add.saveFailed')} /> : null}
          <Button label={t('common.done')} onPress={save} disabled={!canSave} />
        </Column>
      }
    >
      {/* The name is focused on entry, ready to change (mock: the focus ring on the name). */}
      <Field
        label={t('add.name')}
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        autoFocus
      />
      {/* The mock's `.sect` label: 13 px bold ink2, 4 px in, 8 px more air above, 4 px to the chips. */}
      <Column gap={1}>
        <Spacer size={1} />
        <Box px={1}>
          <Txt variant="captionBold" color="ink2">
            {t('add.room')}
          </Txt>
        </Box>
        <Row gap={2} wrap>
          {data.rooms.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              // While a new room is being made, only "New room" is lit.
              state={!creating && r.id === roomId ? 'selected' : 'neutral'}
              onToggle={() => setRoomId(r.id)}
            />
          ))}
          <Chip
            label={t('add.newRoom')}
            state={creating ? 'selected' : 'neutral'}
            onToggle={() => setWantsNew(true)}
          />
        </Row>
      </Column>
      {creating ? (
        <Rise>
          <Field
            label={t('add.roomName')}
            value={roomName}
            onChangeText={setRoomName}
            onSubmitEditing={createRoom}
            // Asked for with "New room": the typing starts there (mock: its focus ring).
            autoFocus={wantsNew}
            trailing={
              <Button
                label={t('add.createRoom')}
                size="small"
                onPress={createRoom}
                disabled={roomName.trim() === ''}
              />
            }
          />
        </Rise>
      ) : null}
    </Screen>
  );
}

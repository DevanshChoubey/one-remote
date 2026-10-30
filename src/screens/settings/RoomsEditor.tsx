import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Room } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Input, Row, Txt } from '@/ui';

const NOT_EMPTY = 'roomNotEmpty';

function RoomRow(props: {
  room: Room;
  index: number;
  rooms: Room[];
  onError: (key: string | null) => void;
}): ReactElement {
  const { store } = useServices();
  const { room, index, rooms } = props;
  const [draft, setDraft] = useState(room.name);
  const trimmed = draft.trim();

  const run = (job: Promise<unknown>): void => {
    job.then(
      () => props.onError(null),
      (e: unknown) => {
        const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
        props.onError(code === NOT_EMPTY ? 'settings.roomNotEmpty' : 'settings.failed');
      },
    );
  };
  const moveTo = (to: number): void => run(store.moveRoom(room.id, to));

  return (
    <Column gap={2}>
      <Input
        value={draft}
        onChangeText={setDraft}
        accessibilityLabel={t('settings.roomName', { name: room.name })}
      />
      <Row gap={2} wrap>
        <Button
          label={t('common.save')}
          accessibilityLabel={t('settings.saveRoom', { name: room.name })}
          variant="secondary"
          disabled={trimmed === '' || trimmed === room.name}
          onPress={() => run(store.upsertRoom({ ...room, name: trimmed }))}
        />
        <Button
          label="↑"
          accessibilityLabel={t('settings.roomUp', { name: room.name })}
          variant="secondary"
          disabled={index === 0}
          onPress={() => moveTo(index - 1)}
        />
        <Button
          label="↓"
          accessibilityLabel={t('settings.roomDown', { name: room.name })}
          variant="secondary"
          disabled={index === rooms.length - 1}
          onPress={() => moveTo(index + 1)}
        />
        <Button
          label={t('common.delete')}
          accessibilityLabel={t('settings.removeRoom', { name: room.name })}
          variant="ghost"
          onPress={() => run(store.removeRoom(room.id))}
        />
      </Row>
    </Column>
  );
}

/** Rename, reorder and remove rooms. Removing a room that still has devices explains why not. */
export function RoomsEditor(props: { rooms: Room[] }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  return (
    <Column gap={4}>
      {props.rooms.length === 0 ? <Txt color="ink2">{t('settings.noRooms')}</Txt> : null}
      {props.rooms.map((r, i) => (
        <RoomRow
          key={`${r.id}:${r.name}`}
          room={r}
          index={i}
          rooms={props.rooms}
          onError={setError}
        />
      ))}
      {error ? (
        <Txt live color="ink2">
          {t(error)}
        </Txt>
      ) : null}
    </Column>
  );
}

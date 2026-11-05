import type { Device, Room } from '@/core';
import { newId } from '../shared/newId';

/** The name and room a person picked for a new device; a room is an existing one or a new name. */
export type NamePick = { name: string; room: { id: string } | { newName: string } };

type Draft = Omit<Device, 'id' | 'name' | 'roomId' | 'order'>;

/** The device to save, and the room to create first when the pick asked for a new one. */
export function planNewDevice(
  data: { rooms: Room[]; devices: Device[] },
  draft: Draft,
  pick: NamePick,
  id: string,
): { device: Device; newRoom?: Room } {
  const newRoom: Room | undefined =
    'newName' in pick.room
      ? {
          id: newId(),
          name: pick.room.newName.trim(),
          order: data.rooms.reduce((m, r) => Math.max(m, r.order + 1), 0),
        }
      : undefined;
  const roomId = newRoom ? newRoom.id : 'id' in pick.room ? pick.room.id : '';
  const order = newRoom
    ? 0
    : data.devices.filter((d) => d.roomId === roomId).reduce((m, d) => Math.max(m, d.order + 1), 0);
  const device: Device = { ...draft, id, name: pick.name.trim(), roomId, order };
  return newRoom ? { device, newRoom } : { device };
}

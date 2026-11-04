import { planNewDevice } from '@/screens/add/newDevice';
import type { Device, Room } from '@/core';

const room = (id: string, name: string, order: number): Room => ({ id, name, order });
const device = (id: string, roomId: string, order: number): Device => ({
  id,
  kind: 'ac',
  name: id,
  roomId,
  order,
  links: [{ kind: 'ir', remoteId: 'x/y' }],
});

const draft = { kind: 'ac' as const, links: [{ kind: 'ir' as const, remoteId: 'p/q' }] };

describe('planNewDevice', () => {
  const rooms = [room('r1', 'Bedroom', 0), room('r2', 'Study', 3)];

  it('puts the first device in an empty room at 0', () => {
    const plan = planNewDevice(
      { rooms, devices: [] },
      draft,
      { name: ' AC ', room: { id: 'r1' } },
      'd1',
    );
    expect(plan.newRoom).toBeUndefined();
    expect(plan.device).toEqual({ ...draft, id: 'd1', name: 'AC', roomId: 'r1', order: 0 });
  });

  it('puts the next device at max + 1', () => {
    const devices = [device('a', 'r1', 0), device('b', 'r1', 4), device('c', 'r2', 9)];
    const plan = planNewDevice({ rooms, devices }, draft, { name: 'AC', room: { id: 'r1' } }, 'd1');
    expect(plan.device.order).toBe(5);
  });

  it('makes a new room at max + 1 and the device first in it', () => {
    const plan = planNewDevice(
      { rooms, devices: [device('a', 'r1', 0)] },
      draft,
      { name: 'AC', room: { newName: ' Guest ' } },
      'd1',
    );
    expect(plan.newRoom).toMatchObject({ name: 'Guest', order: 4 });
    expect(plan.device).toMatchObject({ roomId: plan.newRoom?.id, order: 0 });
  });

  it('starts a first room at order 0', () => {
    const plan = planNewDevice(
      { rooms: [], devices: [] },
      draft,
      { name: 'AC', room: { newName: 'A' } },
      'd1',
    );
    expect(plan.newRoom?.order).toBe(0);
  });
});

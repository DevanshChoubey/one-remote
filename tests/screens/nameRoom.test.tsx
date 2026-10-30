import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { t } from '@/i18n';
import { KindPicker } from '@/screens/add/KindPicker';
import { NameRoomStep } from '@/screens/add/NameRoomStep';
import type { NameRoomStepProps } from '@/screens/add/NameRoomStep';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { device, makeServices, renderWith, room } from './helpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

const draft: NameRoomStepProps['draft'] = { kind: 'ac', links: [{ kind: 'ir', remoteId: 'p/q' }] };

beforeEach(() => mockPush.mockClear());

describe('KindPicker', () => {
  it.each([
    ['add.kindTv', '/add/tv'],
    ['add.kindAc', '/add/ac'],
    ['add.kindFan', '/add/fan'],
  ])('opens %s at %s', async (key, href) => {
    await renderWith(makeServices(), <KindPicker />);
    await fireEvent.press(screen.getByLabelText(t(key)));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('lists every kind and notes the missing IR blaster', async () => {
    await renderWith(makeServices([createFakeDriver('ir', { available: false })]), <KindPicker />);
    expect(screen.getByText(t('add.kindTv'))).toBeTruthy();
    expect(screen.getByText(t('add.kindAc'))).toBeTruthy();
    expect(screen.getByText(t('add.kindFan'))).toBeTruthy();
    expect(screen.getByText(t('add.noIr'))).toBeTruthy();
  });

  it('has no IR note when the phone can send IR', async () => {
    await renderWith(makeServices([createFakeDriver('ir')]), <KindPicker />);
    expect(screen.queryByText(t('add.noIr'))).toBeNull();
  });
});

describe('NameRoomStep', () => {
  it('pre-fills the suggested name', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await renderWith(
      s,
      <NameRoomStep draft={draft} suggestedName="Panasonic AC" onDone={jest.fn()} />,
    );
    expect(await screen.findByDisplayValue('Panasonic AC')).toBeTruthy();
  });

  it('creates a room inline and selects it', async () => {
    const s = makeServices();
    await renderWith(s, <NameRoomStep draft={draft} suggestedName="AC" onDone={jest.fn()} />);
    await fireEvent.press(await screen.findByLabelText(t('add.newRoom')));
    await fireEvent.changeText(screen.getByLabelText(t('add.roomName')), 'Study');
    await fireEvent.press(screen.getByLabelText(t('add.createRoom')));
    await waitFor(async () =>
      expect((await s.store.rooms()).map((r) => r.name)).toEqual(['Study']),
    );
    const chip = await screen.findByLabelText('Study');
    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it('saves at the end of the room and calls onDone', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(device('a', 'r1', 0));
    await s.store.upsertDevice(device('b', 'r1', 1));
    const onDone = jest.fn();
    await renderWith(
      s,
      <NameRoomStep draft={draft} suggestedName="Panasonic AC" onDone={onDone} />,
    );
    await screen.findByLabelText('Bedroom');
    await fireEvent.press(screen.getByLabelText('Bedroom'));
    await fireEvent.changeText(screen.getByDisplayValue('Panasonic AC'), '  Night AC ');
    await fireEvent.press(screen.getByLabelText(t('common.done')));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const saved = (await s.store.devices()).find((d) => d.name === 'Night AC');
    expect(saved).toMatchObject({ kind: 'ac', roomId: 'r1', order: 2, links: draft.links });
    expect(onDone).toHaveBeenCalledWith(saved);
  });

  it('disables Done while the name is empty', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    const onDone = jest.fn();
    await renderWith(s, <NameRoomStep draft={draft} suggestedName="" onDone={onDone} />);
    const done = await screen.findByLabelText(t('common.done'));
    expect(done.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(done);
    expect(onDone).not.toHaveBeenCalled();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

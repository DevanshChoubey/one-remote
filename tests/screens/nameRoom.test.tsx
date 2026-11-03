import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { t } from '@/i18n';
import { NameRoomStep } from '@/screens/add/NameRoomStep';
import type { NameRoomStepProps } from '@/screens/add/NameRoomStep';
import { device, makeServices, renderWith, room } from './helpers';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const draft: NameRoomStepProps['draft'] = { kind: 'ac', links: [{ kind: 'ir', remoteId: 'p/q' }] };

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

  it('creates the typed new room when Done is pressed, and saves into it', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    const onDone = jest.fn();
    await renderWith(s, <NameRoomStep draft={draft} suggestedName="AC" onDone={onDone} />);
    await fireEvent.press(await screen.findByLabelText(t('add.newRoom')));
    await fireEvent.changeText(screen.getByLabelText(t('add.roomName')), 'Study');
    await fireEvent.press(screen.getByLabelText(t('common.done')));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const study = (await s.store.rooms()).find((r) => r.name === 'Study');
    expect(study).toBeDefined();
    expect(onDone.mock.calls[0][0]).toMatchObject({ roomId: study?.id, order: 0 });
  });

  it('keeps Done disabled while New room is chosen but unnamed', async () => {
    const s = makeServices();
    await renderWith(s, <NameRoomStep draft={draft} suggestedName="AC" onDone={jest.fn()} />);
    const done = await screen.findByLabelText(t('common.done'));
    expect(done.props.accessibilityState.disabled).toBe(true);
  });

  it('shows an announced error line when saving fails', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    const broken = { ...s.store, upsertDevice: () => Promise.reject(new Error('disk')) };
    await renderWith(
      { ...s, store: broken },
      <NameRoomStep draft={draft} suggestedName="AC" onDone={jest.fn()} />,
    );
    await screen.findByLabelText('Bedroom');
    await fireEvent.press(screen.getByLabelText(t('common.done')));
    expect(await screen.findByText(t('add.saveFailed'))).toBeTruthy();
    expect(screen.getByText(t('add.saveFailed')).props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows the new-room field only while New room is chosen, in dark and reduced motion', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await renderWith(s, <NameRoomStep draft={draft} suggestedName="AC" onDone={jest.fn()} />, {
      scheme: 'dark',
      reducedMotion: true,
    });
    await screen.findByLabelText('Bedroom');
    expect(screen.queryByLabelText(t('add.roomName'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(t('add.newRoom')));
    expect(screen.getByLabelText(t('add.roomName'))).toBeTruthy();
    expect(screen.getByLabelText(t('add.createRoom'))).toBeTruthy();
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

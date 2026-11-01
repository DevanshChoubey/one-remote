import { createNativeMic } from '@/voice/mic';

type Listener = (e: { base64: string }) => void;

const listeners = new Set<Listener>();
const mockNative = {
  requestPermission: jest.fn<Promise<boolean>, []>(),
  start: jest.fn<void, [number]>(),
  stop: jest.fn<void, []>(),
  addListener: jest.fn((_event: string, cb: Listener) => {
    listeners.add(cb);
    return { remove: () => listeners.delete(cb) };
  }),
};

jest.mock('../../modules/mic-pcm', () => ({ micPcm: () => mockNative }));

const emit = (base64: string): void => listeners.forEach((cb) => cb({ base64 }));

beforeEach(() => {
  listeners.clear();
  mockNative.requestPermission.mockReset().mockResolvedValue(true);
  mockNative.start.mockReset();
  mockNative.stop.mockReset();
});

describe('createNativeMic', () => {
  it('turns base64 chunk events into Uint8Array chunks', () => {
    const chunks: Uint8Array[] = [];
    createNativeMic().start(8000, (c) => chunks.push(c));
    expect(mockNative.start).toHaveBeenCalledWith(8000);
    emit('AQID'); // 1, 2, 3
    emit('');
    expect(chunks).toHaveLength(2);
    expect([...chunks[0]!]).toEqual([1, 2, 3]);
    expect(chunks[1]).toHaveLength(0);
  });

  it('stop removes the listener and calls mockNative stop once', () => {
    const chunks: Uint8Array[] = [];
    const session = createNativeMic().start(8000, (c) => chunks.push(c));
    session.stop();
    session.stop();
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    emit('AQID');
    expect(chunks).toHaveLength(0);
  });

  it('removes the listener and rethrows when mockNative start throws', () => {
    mockNative.start.mockImplementation(() => {
      throw new Error('busy');
    });
    expect(() => createNativeMic().start(8000, () => undefined)).toThrow('busy');
    expect(listeners.size).toBe(0);
  });

  it('resolves the permission answer, and false when the request fails', async () => {
    expect(await createNativeMic().requestPermission()).toBe(true);
    mockNative.requestPermission.mockResolvedValue(false);
    expect(await createNativeMic().requestPermission()).toBe(false);
    mockNative.requestPermission.mockRejectedValue(new Error('x'));
    expect(await createNativeMic().requestPermission()).toBe(false);
  });
});

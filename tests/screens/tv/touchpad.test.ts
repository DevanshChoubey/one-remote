import { createPadController, createTouchpad } from '@/screens/tv/touchpad';

describe('touchpad', () => {
  it('sends one key per 48 px along the dominant axis', () => {
    const p = createTouchpad();
    p.start(0, 0, 0);
    expect(p.move(100, 0, 50)).toEqual(['right', 'right']);
  });

  it('follows the dominant axis only', () => {
    const p = createTouchpad();
    p.start(100, 100, 0);
    expect(p.move(120, 40, 50)).toEqual(['up']);
  });

  it('treats a short quick touch as OK', () => {
    const p = createTouchpad();
    p.start(10, 10, 0);
    expect(p.move(14, 10, 50)).toEqual([]);
    expect(p.end(14, 10, 100)).toEqual(['ok']);
  });

  it('does not tap after a swipe', () => {
    const p = createTouchpad();
    p.start(0, 0, 0);
    p.move(60, 0, 50);
    expect(p.end(60, 0, 100)).toEqual([]);
  });

  it('repeats the last key while the finger holds still after a swipe', () => {
    const p = createTouchpad();
    p.start(0, 0, 0);
    expect(p.move(48, 0, 100)).toEqual(['right']);
    expect(p.tick(300)).toEqual([]);
    expect(p.tick(500)).toEqual([]);
    expect(p.tick(620)).toEqual(['right']);
    expect(p.tick(740)).toEqual(['right']);
  });

  it('does not repeat when nothing was swiped', () => {
    const p = createTouchpad();
    p.start(0, 0, 0);
    expect(p.tick(5000)).toEqual([]);
  });

  it('does not tap on a slow, tiny move', () => {
    const p = createTouchpad();
    p.start(0, 0, 0);
    expect(p.move(8, 0, 600)).toEqual([]);
    expect(p.end(8, 0, 600)).toEqual([]);
  });

  it('is reusable and ignores moves with no touch', () => {
    const p = createTouchpad();
    expect(p.move(100, 0, 0)).toEqual([]);
    p.start(0, 0, 0);
    p.end(0, 0, 10);
    expect(p.move(100, 0, 20)).toEqual([]);
    expect(p.end(100, 0, 30)).toEqual([]);
  });
});

describe('pad controller', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends a swipe, repeats while held, and stops on release', () => {
    let t = 0;
    const keys: string[] = [];
    const c = createPadController(() => t);
    c.setHandler((k) => keys.push(k));
    c.begin(0, 0);
    t = 100;
    c.update(48, 0);
    expect(keys).toEqual(['right']);
    t = 620;
    jest.advanceTimersByTime(40);
    expect(keys).toEqual(['right', 'right']);
    c.finish(48, 0);
    jest.advanceTimersByTime(1000);
    expect(keys.length).toBe(2);
  });

  it('sends OK for a tap', () => {
    let t = 0;
    const keys: string[] = [];
    const c = createPadController(() => t);
    c.setHandler((k) => keys.push(k));
    c.begin(5, 5);
    t = 80;
    c.finish(5, 5);
    expect(keys).toEqual(['ok']);
  });

  it('sends nothing when the gesture is cancelled', () => {
    let t = 0;
    const keys: string[] = [];
    const c = createPadController(() => t);
    c.setHandler((k) => keys.push(k));
    c.begin(5, 5);
    t = 50;
    c.cancel();
    c.finish(5, 5);
    expect(keys).toEqual([]);
  });
});

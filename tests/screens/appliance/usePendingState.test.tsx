import { act, renderHook } from '@testing-library/react-native';
import { usePendingState } from '@/screens/appliance/usePendingState';

/** A submit whose sends settle only when the test says so, in any order. */
function deferredSubmit(): {
  submit: (n: number) => Promise<unknown>;
  sent: number[];
  ok(i: number): Promise<void>;
  fail(i: number): Promise<void>;
} {
  const sent: number[] = [];
  const settle: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  return {
    sent,
    submit: (n) => {
      sent.push(n);
      return new Promise((resolve, reject) => settle.push({ resolve: () => resolve(n), reject }));
    },
    ok: async (i) => {
      await act(async () => settle[i]?.resolve());
    },
    fail: async (i) => {
      await act(async () => settle[i]?.reject(new Error('notSent')));
    },
  };
}

const up = (n: number): number => n + 1;

describe('usePendingState', () => {
  it('a failed send does not make the next tap of the burst build on the stale state', async () => {
    const d = deferredSubmit();
    const onError = jest.fn();
    const { result } = await renderHook(() => usePendingState<number>(24, d.submit, onError));
    await act(async () => result.current.press(up)); // 25
    await act(async () => result.current.press(up)); // 26, carries the first change too
    await d.fail(0);
    expect(onError).toHaveBeenCalledTimes(1);
    // The second send (26) is still going out: the dial stays on it, and a third tap adds to it.
    expect(result.current.state).toBe(26);
    await act(async () => result.current.press(up));
    expect(d.sent).toEqual([25, 26, 27]);
  });

  it('when the newest send fails, the next tap builds on the newest one still going out', async () => {
    const d = deferredSubmit();
    const { result } = await renderHook(() =>
      usePendingState<number>(24, d.submit, () => undefined),
    );
    await act(async () => result.current.press(up)); // 25
    await act(async () => result.current.press(up)); // 26
    await d.fail(1); // the newest fails first (a driver that does not queue)
    expect(result.current.state).toBe(25);
    await act(async () => result.current.press(up));
    expect(d.sent).toEqual([25, 26, 26]);
  });

  it('goes back to what the hub holds once nothing is in flight', async () => {
    const d = deferredSubmit();
    const { result } = await renderHook(() =>
      usePendingState<number>(24, d.submit, () => undefined),
    );
    await act(async () => result.current.press(up));
    await d.fail(0);
    expect(result.current.state).toBe(24);
    await act(async () => result.current.press(up));
    expect(d.sent).toEqual([25, 25]);
  });
});

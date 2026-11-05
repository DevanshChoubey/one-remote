import type { Device, FoundTv, PairedTv, PairPrompts, TvLink, TvSetup, Unsubscribe } from '@/core';

export type FakeTvSetup = jest.Mocked<TvSetup>;

/** A TvSetup whose calls are all recorded; `found` plays a discovery hit. */
export function fakeTvSetup(): {
  setup: FakeTvSetup;
  found: (tv: FoundTv) => void;
  stopped: jest.Mock;
} {
  let onFound: (tv: FoundTv) => void = () => undefined;
  const stopped = jest.fn();
  const setup: FakeTvSetup = {
    discover: jest.fn((cb: (tv: FoundTv) => void): Unsubscribe => {
      onFound = cb;
      return stopped;
    }),
    probeHost: jest.fn((_host: string) => Promise.resolve<FoundTv | null>(null)),
    pair: jest.fn((_tv: FoundTv, _prompts: PairPrompts, _reuse?: TvLink) =>
      Promise.reject<PairedTv>(new Error('pair not set up')),
    ),
    findAgain: jest.fn((_d: Device) => Promise.resolve<string | null>(null)),
  };
  return { setup, found: (tv) => onFound(tv), stopped };
}

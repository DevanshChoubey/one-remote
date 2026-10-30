import type { Unsubscribe } from '@/core';
import { MatterError } from '@/core/matterSetup';
import type { CommissionStep, MatterErrorCode } from '@/core/matterSetup';
import type { Prefix } from '@/transport/localOnly';
import type { MatterAcAttrs, MatterAcInfo, MatterController, MatterWrite } from '../controller';

export interface FakeControllerOptions {
  available?: boolean;
  info?: Partial<MatterAcInfo>;
  peer?: string;
  prefixes?: Prefix[];
  failAt?: CommissionStep;
  /** systemMode values the fake AC refuses to write (MatterError('rejected')). */
  rejectModes?: number[];
  /** Write keys the fake AC refuses (MatterError('rejected')). */
  rejectKeys?: (keyof MatterWrite)[];
}

export type FakeController = MatterController & {
  writes: MatterWrite[];
  setAttrs(a: Partial<MatterAcAttrs>): void;
  lose(): void;
  unreachable(on: boolean): void;
  /** Node ids passed to removeFabric that actually removed the fabric. */
  removed: string[];
  /** While on, removeFabric never settles (an AC that does not answer). */
  hangRemove(on: boolean): void;
};

const STEPS: CommissionStep[] = ['found', 'network', 'responds'];
const FAIL_CODE: Record<CommissionStep, MatterErrorCode> = {
  found: 'notFound',
  network: 'networkFailed',
  responds: 'noResponse',
};

export function createFakeController(opts: FakeControllerOptions = {}): FakeController {
  let attrs: MatterAcAttrs = {
    onOff: false,
    systemMode: 3,
    occupiedCoolingSetpoint: 2400,
    fanMode: 5,
    rockSetting: 0,
    localTemperature: 2700,
  };
  const info: MatterAcInfo = {
    hasOnOff: true,
    absMinCool: 1600,
    absMaxCool: 3000,
    fanModeSequence: 2,
    ...opts.info,
  };
  let down = false;
  const subs = new Set<{ onAttrs: (a: MatterAcAttrs) => void; onLost: () => void }>();
  const writes: MatterWrite[] = [];
  const removed: string[] = [];
  let hang = false;

  const guard = (): void => {
    if (down) throw new MatterError('unreachable');
  };

  return {
    writes,
    removed,
    available: (): boolean => opts.available ?? true,
    commission: async (_payload, onStep): Promise<{ nodeId: string }> => {
      for (const step of STEPS) {
        if (opts.failAt === step) throw new MatterError(FAIL_CODE[step], step);
        onStep(step);
      }
      return { nodeId: '1' };
    },
    info: async (): Promise<MatterAcInfo> => {
      guard();
      return info;
    },
    read: async (): Promise<MatterAcAttrs> => {
      guard();
      return { ...attrs };
    },
    write: async (_nodeId, w): Promise<void> => {
      guard();
      if (w.systemMode !== undefined && opts.rejectModes?.includes(w.systemMode)) {
        throw new MatterError('rejected');
      }
      if (opts.rejectKeys?.some((k) => k in w)) throw new MatterError('rejected');
      writes.push(w);
      attrs = { ...attrs, ...w };
    },
    subscribe: (_nodeId, onAttrs, onLost): Unsubscribe => {
      const sub = { onAttrs, onLost };
      subs.add(sub);
      return (): void => {
        subs.delete(sub);
      };
    },
    removeFabric: async (nodeId): Promise<void> => {
      if (hang) return new Promise<void>(() => undefined);
      guard();
      // An AC that already forgot this app has no fabric to remove.
      if (removed.includes(nodeId)) throw new MatterError('rejected');
      removed.push(nodeId);
    },
    hangRemove: (on): void => {
      hang = on;
    },
    peerAddress: async (): Promise<string | null> => opts.peer ?? '192.168.1.50',
    onLinkPrefixes: async (): Promise<Prefix[]> =>
      opts.prefixes ?? [{ address: '192.168.1.7', bits: 24 }],
    setAttrs: (a): void => {
      attrs = { ...attrs, ...a };
      for (const s of [...subs]) s.onAttrs({ ...attrs });
    },
    lose: (): void => {
      const lost = [...subs];
      subs.clear();
      for (const s of lost) s.onLost();
    },
    unreachable: (on): void => {
      down = on;
    },
  };
}

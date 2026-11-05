import { DeviceError, defaultAcState } from '@/core';
import type { AcState, BrandInfo, FanState, IrCandidate, IrSetup, TestPress } from '@/core';
import { acFrames, testPlan, type Catalogue, type Remote } from './catalogue';
import { defaultCatalogue } from './codes';
import type { IrEmitter, IrSignal } from './emitter';

const GAP_MS = 200;

const onCool24 = (): AcState => ({ ...defaultAcState(), power: true });

/**
 * The frames of a test press. The first press assumes the AC was off (so a power toggle goes
 * out); the confirming press assumes the first one worked.
 */
function signalsFor(r: Remote, press: TestPress): IrSignal[] {
  const missing = (): never => {
    throw new DeviceError('unsupported', `${r.id} has no ${press}`);
  };
  if (r.kind === 'ac') {
    if (press === 'acOnCool24') return acFrames(r, onCool24(), defaultAcState());
    if (press === 'acUp25') return acFrames(r, { ...onCool24(), setpoint: 25 }, onCool24());
    return missing();
  }
  if (r.kind === 'fan') {
    const key =
      press === 'fanSpeed3'
        ? 'speed3'
        : press === 'fanSpeed1'
          ? 'speed1'
          : press === 'fanLight'
            ? 'light'
            : undefined;
    const signal = key && r.keys[key];
    return signal ? [signal] : missing();
  }
  return missing();
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createIrSetup(o: {
  emitter: IrEmitter;
  catalogue?: Catalogue;
  seedFan?: (deviceId: string, state: FanState) => void;
  seedAc?: (deviceId: string, state: AcState) => void;
  gapMs?: number;
}): IrSetup {
  const cat = o.catalogue ?? defaultCatalogue;
  const find = (id: string): Remote => {
    const r = cat.remote(id);
    if (!r) throw new DeviceError('unsupported', `unknown remote ${id}`);
    return r;
  };
  const allBrands = (): BrandInfo[] => [...cat.brands('ac'), ...cat.brands('fan')];
  return {
    hasEmitter: () => o.emitter.hasEmitter(),
    brands: (kind) => cat.brands(kind),
    candidates: (brandId): IrCandidate[] =>
      cat.remotes(brandId).map((r) => ({ remoteId: r.id, label: r.label })),
    testPlan: (remoteId) => testPlan(find(remoteId)),
    sendTest: async (remoteId, press) => {
      const frames = signalsFor(find(remoteId), press);
      for (const [i, frame] of frames.entries()) {
        if (i > 0) await wait(o.gapMs ?? GAP_MS);
        await o.emitter.transmit(frame);
      }
    },
    seedFan: (deviceId, state) => o.seedFan?.(deviceId, state),
    seedAc: (deviceId, state) => o.seedAc?.(deviceId, state),
    brandOf: (remoteId) => {
      const r = cat.remote(remoteId);
      return r ? allBrands().find((b) => b.id === r.brandId) : undefined;
    },
  };
}

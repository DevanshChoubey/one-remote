import { DeviceError, defaultAcState } from '@/core';
import type { BrandInfo, IrCandidate, IrSetup, TestPress } from '@/core';
import { testPlan, type Catalogue, type Remote } from './catalogue';
import { defaultCatalogue } from './codes';
import type { IrEmitter, IrSignal } from './emitter';

function signalFor(r: Remote, press: TestPress): IrSignal {
  const missing = (): never => {
    throw new DeviceError('unsupported', `${r.id} has no ${press}`);
  };
  if (r.kind === 'ac') {
    if (press === 'acOnCool24') return r.encode({ ...defaultAcState(), power: true });
    if (press === 'acUp25') return r.encode({ ...defaultAcState(), power: true, setpoint: 25 });
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
    return (key && r.keys[key]) || missing();
  }
  return missing();
}

export function createIrSetup(o: { emitter: IrEmitter; catalogue?: Catalogue }): IrSetup {
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
      await o.emitter.transmit(signalFor(find(remoteId), press));
    },
    brandOf: (remoteId) => {
      const r = cat.remote(remoteId);
      return r ? allBrands().find((b) => b.id === r.brandId) : undefined;
    },
  };
}

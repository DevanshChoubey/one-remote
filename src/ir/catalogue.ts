import { DeviceError } from '@/core';
import type { AcState, BrandInfo, Capabilities, TestPress, TvKey } from '@/core';
import type { IrSignal } from './emitter';

export type FanKey =
  | 'off'
  | 'speed1'
  | 'speed2'
  | 'speed3'
  | 'speed4'
  | 'speed5'
  | 'boost'
  | 'sleep'
  | 'timer1'
  | 'timer2'
  | 'timer4'
  | 'timer8'
  | 'timerOff'
  | 'light';

export type Remote =
  | {
      id: string;
      kind: 'ac';
      brandId: string;
      label: string;
      caps: Capabilities;
      encode(s: AcState): IrSignal;
    }
  | {
      id: string;
      kind: 'fan';
      brandId: string;
      label: string;
      caps: Capabilities;
      keys: Partial<Record<FanKey, IrSignal>>;
    }
  | {
      id: string;
      kind: 'tv';
      brandId: string;
      label: string;
      keys: Partial<Record<TvKey | 'powerOn', IrSignal>>;
    };

export interface Catalogue {
  brands(kind: 'ac' | 'fan'): BrandInfo[];
  remotes(brandId: string): Remote[];
  remote(id: string): Remote | undefined;
}

export function createCatalogue(remotes: Remote[], brands: BrandInfo[]): Catalogue {
  return {
    brands: (kind) =>
      brands.filter((b) => b.kind === kind && remotes.some((r) => r.brandId === b.id)),
    remotes: (brandId) => remotes.filter((r) => r.brandId === brandId),
    remote: (id) => remotes.find((r) => r.id === id),
  };
}

export function testPlan(r: Remote): { first: TestPress; confirm: TestPress } {
  switch (r.kind) {
    case 'ac':
      return { first: 'acOnCool24', confirm: 'acUp25' };
    case 'fan':
      return { first: 'fanSpeed3', confirm: r.caps.fanLight ? 'fanLight' : 'fanSpeed1' };
    case 'tv':
      throw new DeviceError('unsupported', 'no test plan for TV remotes');
  }
}

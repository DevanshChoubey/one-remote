import type { AcState, FanState } from './model';

export type TestPress = 'acOnCool24' | 'acUp25' | 'fanSpeed3' | 'fanLight' | 'fanSpeed1';

export interface BrandInfo {
  id: string;
  name: string;
  kind: 'ac' | 'fan';
  matter: boolean;
}

export interface IrCandidate {
  remoteId: string;
  label: string;
}

export interface IrSetup {
  hasEmitter(): boolean;
  brands(kind: 'ac' | 'fan'): BrandInfo[];
  /** In test order. */
  candidates(brandId: string): IrCandidate[];
  testPlan(remoteId: string): { first: TestPress; confirm: TestPress };
  sendTest(remoteId: string, press: TestPress): Promise<void>;
  brandOf(remoteId: string): BrandInfo | undefined;
  /** Tells the IR driver what a fan was last doing (restored after an app restart). */
  seedFan(deviceId: string, state: FanState): void;
  /** Tells the IR driver what an AC was last sent (restored after an app restart). */
  seedAc(deviceId: string, state: AcState): void;
}

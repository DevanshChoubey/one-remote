import type { AcState, FanState } from './model';

export type TestPress = 'acOnCool24' | 'acUp25' | 'fanSpeed3' | 'fanLight' | 'fanSpeed1';

export type TestOutcome = { kind: 'ac'; state: AcState } | { kind: 'fan'; state: FanState };

export interface BrandInfo {
  id: string;
  name: string;
  kind: 'ac' | 'fan';
  matter: boolean;
  /** Also controllable over the home Wi-Fi: which local protocol. */
  wifi?: 'gree';
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
  /**
   * What the appliance holds once both test presses worked, as the presses assumed it (an AC on at
   * cool 25; a fan on at speed 3 with its light toggled on, or at speed 1). Remembered for the new
   * device, so the next toggle starts from what the test really sent.
   */
  testOutcome(remoteId: string): TestOutcome;
  brandOf(remoteId: string): BrandInfo | undefined;
  /** Tells the IR driver what a fan was last doing (restored after an app restart). */
  seedFan(deviceId: string, state: FanState): void;
  /** Tells the IR driver what an AC was last sent (restored after an app restart). */
  seedAc(deviceId: string, state: AcState): void;
}

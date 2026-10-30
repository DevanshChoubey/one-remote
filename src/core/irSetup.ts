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
}

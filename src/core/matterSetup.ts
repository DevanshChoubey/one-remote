import type { Link } from './model';
import type { MatterCode } from '../matter/codes';

export type CommissionStep = 'found' | 'network' | 'responds';

export type MatterErrorCode =
  | 'cancelled'
  | 'badCode'
  | 'notFound'
  | 'networkFailed'
  | 'noResponse'
  | 'unreachable'
  | 'rejected'
  | 'unavailable';

export class MatterError extends Error {
  readonly code: MatterErrorCode;
  readonly step?: CommissionStep;

  constructor(code: MatterErrorCode, step?: CommissionStep) {
    super(code);
    this.name = 'MatterError';
    this.code = code;
    if (step !== undefined) this.step = step;
    Object.setPrototypeOf(this, MatterError.prototype);
  }
}

/** What screens may import to add a Matter device. */
export interface MatterSetup {
  available(): boolean;
  parseCode(input: string): MatterCode | null;
  commission(
    code: MatterCode,
    onStep: (s: CommissionStep) => void,
  ): Promise<Extract<Link, { kind: 'matter' }>>;
}

export interface IrSignal {
  freqHz: number;
  /** Microseconds, mark first, even length. */
  pattern: number[];
}

export interface IrEmitter {
  hasEmitter(): boolean;
  transmit(s: IrSignal): Promise<void>;
}

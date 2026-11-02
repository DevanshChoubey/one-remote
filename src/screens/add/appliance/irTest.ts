export type IrTestState = {
  candidates: string[];
  index: number;
  phase: 'try' | 'confirm';
  pressed: boolean;
  result?: string | 'none';
};

export function initialIrTest(candidates: string[]): IrTestState {
  return {
    candidates,
    index: 0,
    phase: 'try',
    pressed: false,
    ...(candidates.length === 0 ? { result: 'none' } : {}),
  };
}

function nextCandidate(s: IrTestState): IrTestState {
  const index = s.index + 1;
  if (index >= s.candidates.length) return { ...s, pressed: false, phase: 'try', result: 'none' };
  return { ...s, index, phase: 'try', pressed: false };
}

/**
 * The IR test: each candidate remote gets a first press and a confirming press. "Yes" counts only
 * after Test was pressed. A "no" at either press moves on; the last "no" ends with 'none'.
 */
export function irTestReducer(s: IrTestState, e: 'pressed' | 'yes' | 'no'): IrTestState {
  if (s.result !== undefined) return s;
  if (e === 'pressed') return { ...s, pressed: true };
  if (e === 'no') return nextCandidate(s);
  if (!s.pressed) return s;
  if (s.phase === 'try') return { ...s, phase: 'confirm', pressed: false };
  const remote = s.candidates[s.index];
  return remote === undefined ? { ...s, result: 'none' } : { ...s, result: remote };
}

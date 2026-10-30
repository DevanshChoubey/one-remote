import { initialIrTest, irTestReducer } from '@/screens/add/appliance/irTest';
import type { IrTestState } from '@/screens/add/appliance/irTest';

const run = (s: IrTestState, ...events: ('pressed' | 'yes' | 'no')[]): IrTestState =>
  events.reduce(irTestReducer, s);

const start = initialIrTest(['a/1', 'a/2', 'a/3']);

describe('irTestReducer', () => {
  it('ignores yes before Test was pressed', () => {
    expect(run(start, 'yes')).toBe(start);
  });

  it('moves to the confirm press after pressed, yes', () => {
    expect(run(start, 'pressed', 'yes')).toMatchObject({ phase: 'confirm', pressed: false });
  });

  it('ignores yes at the confirm press until it was pressed', () => {
    const s = run(start, 'pressed', 'yes');
    expect(run(s, 'yes')).toBe(s);
  });

  it('gives the first candidate after pressed, yes, pressed, yes', () => {
    expect(run(start, 'pressed', 'yes', 'pressed', 'yes').result).toBe('a/1');
  });

  it('moves to the next candidate on no at the confirm press', () => {
    expect(run(start, 'pressed', 'yes', 'pressed', 'no')).toMatchObject({
      index: 1,
      phase: 'try',
      pressed: false,
    });
  });

  it('moves to the next candidate on no at the first press', () => {
    expect(run(start, 'pressed', 'no')).toMatchObject({ index: 1, phase: 'try', pressed: false });
  });

  it('ends with none after the last no', () => {
    expect(run(start, 'no', 'no', 'no').result).toBe('none');
  });

  it('ends with none when there are no candidates', () => {
    expect(initialIrTest([]).result).toBe('none');
  });

  it('is final once there is a result', () => {
    const done = run(start, 'pressed', 'yes', 'pressed', 'yes');
    expect(run(done, 'no')).toBe(done);
  });
});

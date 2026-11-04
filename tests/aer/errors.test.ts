import { AER_ERROR_CODES, AerError, aerProblem, type AerProblem } from '@/aer/errors';

describe('aerProblem', () => {
  const cases: [AerError | Error, AerProblem][] = [
    [new AerError('bluetoothOff'), 'btoff'],
    [new AerError('permissionDenied'), 'denied'],
    [new AerError('unreachable'), 'away'],
    [new AerError('noReply'), 'away'],
    [new AerError('disconnected'), 'away'],
    [new AerError('busy'), 'busy'],
    [new AerError('batteryTooLow'), 'flat'],
    [new AerError('rejected', 'batteryTooLow'), 'flat'],
    [new AerError('notDispenser'), 'notAer'],
    [new AerError('rejected', 'scheduleRunning'), 'scheduleRunning'],
    [new AerError('timeZone'), 'timeZone'],
    [new AerError('rejected', 'something else'), 'failed'],
    [new AerError('rejected'), 'failed'],
    [new Error('x'), 'failed'],
  ];

  it.each(cases)('maps %p to %s', (error, problem) => {
    expect(aerProblem(error)).toBe(problem);
  });

  it('maps a non-error to failed', () => {
    expect(aerProblem('boom')).toBe('failed');
  });

  it('keeps the code and name on AerError', () => {
    const e = new AerError('busy');
    expect(e.code).toBe('busy');
    expect(e.name).toBe('AerError');
    expect(e).toBeInstanceOf(Error);
    expect(AER_ERROR_CODES).toContain('busy');
  });
});

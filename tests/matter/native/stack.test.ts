import { MatterError } from '@/core/matterSetup';
import { decodePairingCode, hostOfOperationalAddress, mapError } from '@/matter/native/stack';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ createSocket: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n) }));

describe('decodePairingCode', () => {
  it('reads the passcode and short discriminator of a manual code', () => {
    // The Matter specification's example manual code.
    expect(decodePairingCode('34970112332')).toMatchObject({
      passcode: 20202021,
      shortDiscriminator: 15,
    });
  });

  it('reads a QR payload', () => {
    expect(decodePairingCode('MT:-24J0AFN00KA0648G00')).toMatchObject({
      passcode: 20202021,
      longDiscriminator: 3840,
    });
  });

  it('refuses nonsense as a bad code', () => {
    expect(() => decodePairingCode('12345')).toThrow(MatterError);
    expect(() => decodePairingCode('MT:???')).toThrow(MatterError);
  });
});

describe('hostOfOperationalAddress', () => {
  it('takes the host out of a matter.js address', () => {
    expect(hostOfOperationalAddress('udp://192.168.1.40:5540')).toBe('192.168.1.40');
    expect(hostOfOperationalAddress('udp://[fd12:3456::1]:5540')).toBe('fd12:3456::1');
    expect(hostOfOperationalAddress('udp://[fe80::1%wlan0]:5540')).toBe('fe80::1%wlan0');
    expect(hostOfOperationalAddress(undefined)).toBeNull();
    expect(hostOfOperationalAddress('nonsense')).toBeNull();
  });
});

describe('mapError', () => {
  it('keeps a MatterError', () => {
    const e = new MatterError('badCode');
    expect(mapError(e)).toBe(e);
  });

  it('turns an interaction-model refusal into rejected', () => {
    expect(mapError({ code: 0x86 }).code).toBe('rejected');
    expect(mapError({ code: 0x87 }).code).toBe('rejected');
  });

  it('turns anything else into the fallback', () => {
    expect(mapError(new Error('timeout')).code).toBe('unreachable');
    expect(mapError(new Error('x'), 'notFound').code).toBe('notFound');
  });
});

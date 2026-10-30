import { DeviceError } from '@/core';
import {
  assertLocal,
  isAllowedMulticast,
  isLocalAddress,
  isSubnetBroadcast,
  type Prefix,
} from '@/transport/localOnly';

const lan: Prefix[] = [
  { address: '192.168.1.7', bits: 24 },
  { address: '2401:4900:1c3a:5e10::7', bits: 64 },
];

describe('isLocalAddress', () => {
  it.each([
    '192.168.1.23',
    '10.0.0.5',
    '172.20.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.3.3',
    '127.0.0.1',
    'fd12::1',
    'fc00::1',
    'fe80::1',
    'febf::1',
    '::1',
    '2401:4900:1c3a:5e10::abcd',
    'fe80::1%wlan0',
    '::ffff:192.168.1.5',
    '::ffff:c0a8:0105',
    '::FFFF:10.0.0.1',
  ])('accepts %s', (ip) => {
    expect(isLocalAddress(ip, lan)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '172.15.255.255',
    '::ffff:8.8.8.8',
    '::ffff:0808:0808',
    '0.0.0.0',
    '0.1.2.3',
    '255.255.255.255',
    '224.0.0.251',
    '239.255.255.250',
    '::',
    'ff02::fb',
    'ff02::1',
    'fec0::1',
    '2401:4900:1c3a:5e11::1',
    '2001:db8::1',
    'not-an-ip',
    '',
    '192.168.01.1',
    '192.168.1.256',
    '192.168.1',
    '192.168.1.1.1',
    '192.168.1.1:80',
    '[fd12::1]',
    '[fd12::1]:80',
    'fd12::1::2',
    'fd12:0:0:0:0:0:0:0:1',
    'fd12::g',
    'fd12::12345',
    'fe80::1%',
    'fe80::1%@evil.com',
    'fe80::1%a/b',
    'fe80::1%a]',
    'fe80::1%a:b',
    'fe80::1%a#b',
    `fe80::1%${'a'.repeat(65)}`,
    '::ffff:192.168.01.1',
    '::ffff:1.2.3',
    '192.168.1.5%eth0',
    ' 192.168.1.5',
    '192.168.1.5 ',
    '192.168.-1.5',
    '1e2.0.0.1',
  ])('rejects %s', (ip) => {
    expect(isLocalAddress(ip, lan)).toBe(false);
  });

  it('treats a public on-link prefix as local, but never reserved ranges', () => {
    const wide: Prefix[] = [{ address: '100.64.0.9', bits: 10 }];
    expect(isLocalAddress('100.64.3.4', wide)).toBe(true);
    expect(isLocalAddress('100.128.0.1', wide)).toBe(false);
    expect(isLocalAddress('255.255.255.255', [{ address: '255.255.255.0', bits: 24 }])).toBe(false);
    expect(isLocalAddress('0.0.0.5', [{ address: '0.0.0.1', bits: 8 }])).toBe(false);
  });

  it('ignores malformed on-link prefixes', () => {
    expect(isLocalAddress('8.8.8.8', [{ address: '8.8.8.8', bits: 0 }])).toBe(false);
    expect(isLocalAddress('8.8.8.8', [{ address: '8.8.8.8', bits: 33 }])).toBe(false);
    expect(isLocalAddress('8.8.8.8', [{ address: 'junk', bits: 8 }])).toBe(false);
    expect(isLocalAddress('8.8.8.8', [{ address: '8.8.8.8', bits: 1.5 }])).toBe(false);
    expect(isLocalAddress('2001:db8::1', [{ address: '2001:db8::', bits: 129 }])).toBe(false);
    expect(isLocalAddress('2001:db8::1', [{ address: '2001:db8::', bits: 0 }])).toBe(false);
  });

  it('accepts zone ids made of letters, digits, dot, dash and underscore', () => {
    expect(isLocalAddress('fe80::1%wlan0.1_a-b', lan)).toBe(true);
    expect(isLocalAddress(`fe80::1%${'a'.repeat(64)}`, lan)).toBe(true);
  });

  it('ignores on-link prefixes shorter than /8 (v4) or /16 (v6)', () => {
    expect(isLocalAddress('8.8.8.8', [{ address: '8.1.1.1', bits: 7 }])).toBe(false);
    expect(isLocalAddress('8.8.8.8', [{ address: '8.1.1.1', bits: 8 }])).toBe(true);
    expect(isLocalAddress('2001:db8::1', [{ address: '2001::', bits: 15 }])).toBe(false);
    expect(isLocalAddress('2001:db8::1', [{ address: '2001::', bits: 16 }])).toBe(true);
    expect(isSubnetBroadcast('9.255.255.255', [{ address: '8.1.1.1', bits: 7 }])).toBe(false);
  });

  it('does not match a v4 prefix against a v6 address or vice versa', () => {
    expect(isLocalAddress('2001:db8::1', [{ address: '8.8.8.8', bits: 8 }])).toBe(false);
    expect(isLocalAddress('8.8.8.8', [{ address: '2001:db8::', bits: 32 }])).toBe(false);
  });

  it('matches mapped addresses against v4 on-link prefixes', () => {
    const p: Prefix[] = [{ address: '100.64.0.9', bits: 10 }];
    expect(isLocalAddress('::ffff:100.64.3.4', p)).toBe(true);
  });

  it('matches IPv6 prefixes that are not byte aligned', () => {
    const p: Prefix[] = [{ address: '2001:db8:0:8000::', bits: 65 }];
    expect(isLocalAddress('2001:db8:0:8000::5', p)).toBe(true);
    expect(isLocalAddress('2001:db8:0:7fff::5', p)).toBe(false);
  });
});

describe('isAllowedMulticast', () => {
  it.each(['239.255.255.250', '224.0.0.251', 'ff02::fb', 'ff02::1', 'FF02::FB%wlan0'])(
    'allows %s',
    (ip) => {
      expect(isAllowedMulticast(ip)).toBe(true);
    },
  );

  it.each([
    '239.1.1.1',
    '224.0.0.1',
    'ff0e::1',
    'ff05::fb',
    'ff12::1',
    '8.8.8.8',
    '192.168.1.1',
    'fe80::1',
    'nope',
    '',
    '239.255.255.250:1900',
  ])('rejects %s', (ip) => {
    expect(isAllowedMulticast(ip)).toBe(false);
  });
});

describe('isSubnetBroadcast', () => {
  it('accepts the directed broadcast of an on-link v4 prefix', () => {
    expect(isSubnetBroadcast('192.168.1.255', lan)).toBe(true);
    expect(isSubnetBroadcast('10.1.255.255', [{ address: '10.1.4.4', bits: 16 }])).toBe(true);
    expect(isSubnetBroadcast('192.168.1.3', [{ address: '192.168.1.1', bits: 30 }])).toBe(true);
  });

  it.each(['255.255.255.255', '192.168.1.254', '192.168.2.255', '192.168.1.0', 'x', '::1'])(
    'rejects %s',
    (ip) => {
      expect(isSubnetBroadcast(ip, lan)).toBe(false);
    },
  );

  it('rejects prefixes longer than /30 or invalid', () => {
    expect(isSubnetBroadcast('192.168.1.1', [{ address: '192.168.1.0', bits: 31 }])).toBe(false);
    expect(isSubnetBroadcast('192.168.1.7', [{ address: '192.168.1.7', bits: 32 }])).toBe(false);
    expect(isSubnetBroadcast('255.255.255.255', [{ address: '0.0.0.0', bits: 0 }])).toBe(false);
    expect(isSubnetBroadcast('192.168.1.255', [{ address: 'bad', bits: 24 }])).toBe(false);
    expect(isSubnetBroadcast('192.168.1.255', [{ address: '2401::', bits: 24 }])).toBe(false);
  });
});

describe('assertLocal', () => {
  it('throws notLocal for a public address', () => {
    expect(() => assertLocal('8.8.8.8', lan)).toThrow(
      expect.objectContaining({ code: 'notLocal' }),
    );
    expect(() => assertLocal('8.8.8.8', lan)).toThrow(DeviceError);
  });

  it('does not throw for a local address', () => {
    expect(() => assertLocal('192.168.1.23', lan)).not.toThrow();
  });
});

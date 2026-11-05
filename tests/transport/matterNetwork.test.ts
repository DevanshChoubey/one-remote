import { isMatterDestination } from '@/transport/matterNetwork';

jest.mock('react-native-udp', () => ({}));
jest.mock('@/transport/netInfo', () => ({ getOnLinkPrefixes: () => Promise.resolve([]) }));

describe('isMatterDestination', () => {
  it.each(['192.168.1.20', '10.0.0.5', 'fe80::1%wlan0', 'fd12:3456::1', '224.0.0.251', 'ff02::fb'])(
    'allows the local address %s',
    (host) => expect(isMatterDestination(host)).toBe(true),
  );

  it.each(['203.0.113.7', '8.8.8.8', '2001:db8::1', 'evil.example.com', '255.255.255.255', ''])(
    'refuses %s',
    (host) => expect(isMatterDestination(host)).toBe(false),
  );
});

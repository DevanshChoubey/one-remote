import * as Network from 'expo-network';
import { getOnLinkPrefixes, subnetBroadcast, subnetHosts } from '@/transport/netInfo';

jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR' },
  getNetworkStateAsync: jest.fn(),
  getIpAddressAsync: jest.fn(),
}));

const state = Network.getNetworkStateAsync as jest.Mock;
const ip = Network.getIpAddressAsync as jest.Mock;

describe('getOnLinkPrefixes', () => {
  it('is the Wi-Fi address with /24', async () => {
    state.mockResolvedValue({ type: 'WIFI' });
    ip.mockResolvedValue('192.168.1.7');
    await expect(getOnLinkPrefixes()).resolves.toEqual([{ address: '192.168.1.7', bits: 24 }]);
  });

  it('is empty off Wi-Fi, with no address, or on an error', async () => {
    state.mockResolvedValue({ type: 'CELLULAR' });
    ip.mockResolvedValue('10.1.2.3');
    await expect(getOnLinkPrefixes()).resolves.toEqual([]);
    state.mockResolvedValue({ type: 'WIFI' });
    ip.mockResolvedValue('0.0.0.0');
    await expect(getOnLinkPrefixes()).resolves.toEqual([]);
    ip.mockResolvedValue('fe80::1');
    await expect(getOnLinkPrefixes()).resolves.toEqual([]);
    ip.mockResolvedValue('999.1.1.1');
    await expect(getOnLinkPrefixes()).resolves.toEqual([]);
    state.mockRejectedValue(new Error('no'));
    await expect(getOnLinkPrefixes()).resolves.toEqual([]);
  });
});

describe('subnetHosts', () => {
  it('lists the 253 other hosts of a /24', () => {
    const hosts = subnetHosts({ address: '192.168.1.7', bits: 24 });
    expect(hosts).toHaveLength(253);
    expect(hosts).not.toContain('192.168.1.0');
    expect(hosts).not.toContain('192.168.1.7');
    expect(hosts).not.toContain('192.168.1.255');
    expect(hosts).toContain('192.168.1.1');
    expect(hosts).toContain('192.168.1.254');
  });

  it('is empty for anything but an IPv4 /24', () => {
    expect(subnetHosts({ address: '192.168.1.7', bits: 16 })).toEqual([]);
    expect(subnetHosts({ address: 'fe80::1', bits: 64 })).toEqual([]);
  });
});

describe('subnetBroadcast', () => {
  it('ends in .255', () => {
    expect(subnetBroadcast({ address: '192.168.1.7', bits: 24 })).toBe('192.168.1.255');
  });

  it('throws on a non-IPv4 address', () => {
    expect(() => subnetBroadcast({ address: 'fe80::1', bits: 64 })).toThrow(RangeError);
  });
});

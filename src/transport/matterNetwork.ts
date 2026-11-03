import {
  InterfaceType,
  Network,
  NetworkError,
  NoAddressAvailableError,
  isIPv4,
  isIPv6,
  onSameNetwork,
  repackErrorAs,
  ChannelType,
  MAX_UDP_MESSAGE_SIZE,
} from '@matter/general';
import type {
  NetworkInterface,
  NetworkInterfaceDetails,
  UdpSocket,
  UdpSocketOptions,
} from '@matter/general';
import dgram from 'react-native-udp';
import { getOnLinkPrefixes } from './netInfo';

/**
 * The network matter.js runs on: UDP over `react-native-udp`, on the phone's Wi-Fi only. Adapted from
 * `@matter/react-native` (Apache-2.0, Matter.js Authors) with the Bluetooth, TCP and NetInfo parts
 * removed. Matter here is on-network only, so a TCP transport is not offered, and every packet goes
 * to the home network because the AC is found by multicast and then reached by its local address.
 */

const WIFI = 'wifi';

interface Rinfo {
  address: string;
  port: number;
}

interface RnSocket {
  on(event: 'message', cb: (msg: Uint8Array, r: Rinfo) => void): void;
  on(event: 'error', cb: (e: Error) => void): void;
  removeListener(event: 'message' | 'error', cb: (...a: never[]) => void): void;
  bind(port: number | undefined, host: string | undefined, cb: (e?: Error) => void): void;
  send(
    msg: Uint8Array,
    offset: number,
    length: number,
    port: number,
    address: string,
    cb: (e: Error | null) => void,
  ): void;
  addMembership(group: string, iface?: string): void;
  dropMembership(group: string, iface?: string): void;
  address(): { address: string; port: number };
  close(): void;
}

/** The phone's current Wi-Fi IPv4 address and `/24` mask; undefined off Wi-Fi. */
async function wifiAddress(): Promise<{ address: string; netmask: string } | undefined> {
  const [prefix] = await getOnLinkPrefixes();
  return prefix ? { address: prefix.address, netmask: '255.255.255.0' } : undefined;
}

function openSocket(
  host: string | undefined,
  port: number | undefined,
  options: { type: 'udp4' | 'udp6'; ipv6Only?: boolean },
): Promise<RnSocket> {
  const socket = (dgram as unknown as { createSocket(o: object): RnSocket }).createSocket({
    ...options,
    reuseAddr: true,
    reusePort: true,
  });
  return new Promise((resolve, reject) => {
    const failed = (e: Error): void => {
      try {
        socket.close();
      } catch {
        // already closed
      }
      reject(e);
    };
    socket.on('error', failed);
    socket.bind(port, host, (e) => {
      if (e) return;
      socket.removeListener('error', failed as never);
      socket.on('error', () => undefined);
      resolve(socket);
    });
  });
}

class RnUdpSocket implements UdpSocket {
  readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

  constructor(
    private readonly type: 'udp4' | 'udp6',
    private readonly socket: RnSocket,
  ) {}

  addMembership(group: string): void {
    try {
      this.socket.addMembership(group, this.type === 'udp4' ? undefined : '::');
    } catch {
      // A group the OS refuses (IPv6 on some phones): discovery continues over IPv4.
    }
  }

  dropMembership(group: string): void {
    try {
      this.socket.dropMembership(group, this.type === 'udp4' ? undefined : '::');
    } catch {
      // not a member any more
    }
  }

  onData(
    listener: (
      netInterface: string | undefined,
      peerAddress: string,
      peerPort: number,
      data: Uint8Array,
    ) => void,
  ): { close(): Promise<void> } {
    const handler = (data: Uint8Array, r: Rinfo): void => listener(WIFI, r.address, r.port, data);
    this.socket.on('message', handler);
    return {
      close: () => {
        this.socket.removeListener('message', handler as never);
        return Promise.resolve();
      },
    };
  }

  send(host: string, port: number, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.send(data, 0, data.byteLength, port, host, (e) =>
        e ? reject(repackErrorAs(e, NetworkError)) : resolve(),
      );
    });
  }

  close(): Promise<void> {
    try {
      this.socket.close();
    } catch {
      // already closed
    }
    return Promise.resolve();
  }

  get port(): number {
    return this.socket.address().port;
  }

  supports(type: ChannelType, address?: string): boolean {
    if (type !== ChannelType.UDP) return false;
    if (address === undefined) return true;
    return this.type === 'udp4' ? isIPv4(address) : isIPv6(address);
  }
}

export class MatterNetwork extends Network {
  async getNetInterfaces(): Promise<NetworkInterface[]> {
    return (await wifiAddress()) ? [{ name: WIFI, type: InterfaceType.WiFi }] : [];
  }

  async getIpMac(netInterface: string): Promise<NetworkInterfaceDetails | undefined> {
    const wifi = await wifiAddress();
    if (netInterface !== WIFI || !wifi) return undefined;
    return { mac: '00:00:00:00:00:00', ipV4: [wifi.address], ipV6: [] };
  }

  async createUdpSocket(options: UdpSocketOptions): Promise<UdpSocket> {
    const type = options.type === 'udp6' ? 'udp6' : 'udp4';
    if (type === 'udp4' && !(await wifiAddress()))
      throw new NoAddressAvailableError('Not on Wi-Fi');
    const socket = await openSocket(options.listeningAddress, options.listeningPort, {
      type,
      ...(type === 'udp6' ? { ipv6Only: true } : {}),
    });
    return new RnUdpSocket(type, socket);
  }

  /** Used by matter.js to pick the interface of an address; there is only Wi-Fi. */
  static async interfaceFor(ip: string): Promise<string | undefined> {
    if (ip.includes('%')) return ip.split('%')[1];
    const wifi = await wifiAddress();
    if (wifi && isIPv4(ip) && onSameNetwork(ip, wifi.address, wifi.netmask)) return WIFI;
    return isIPv6(ip) ? WIFI : undefined;
  }
}

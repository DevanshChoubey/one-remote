/**
 * The network the Gree code needs: UDP datagrams to port 7000 on the home network. Implemented by
 * `src/transport/greeUdp.ts` (react-native-udp, every address checked by assertLocal) and faked by
 * `src/gree/testing/fakeGree.ts`.
 */
export interface GreeUdp {
  /** True when the phone is on a local network it can scan. */
  onWifi(): Promise<boolean>;
  /**
   * Sends `text` to port 7000 of every unit on the phone's subnet (the subnet broadcast, or each
   * host in turn where the platform blocks broadcast) and reports each reply from a local host
   * until `windowMs` has passed. Rejects DeviceError('notSent') off Wi-Fi or when nothing went out.
   */
  scan(
    text: string,
    windowMs: number,
    onReply: (text: string, host: string) => void,
  ): Promise<void>;
  /**
   * Sends `text` to `host`:7000 and resolves with the first reply from that host. Rejects
   * DeviceError 'notLocal' for a host off the home network, 'notSent' when it did not go out, and
   * 'timeout' when no reply came within `timeoutMs` (it may have arrived).
   */
  request(host: string, text: string, timeoutMs: number): Promise<string>;
}

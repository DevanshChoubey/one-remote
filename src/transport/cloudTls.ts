import type TcpSocketModule from 'react-native-tcp-socket';
import type { RawTls, TlsDialer } from './cloud';

/**
 * Loaded on the first MirAIe connect, not at app start: nothing of this library runs (it sets up a
 * native event emitter on import) unless the user turned the cloud connection on.
 */
function tcpSocket(): typeof TcpSocketModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('react-native-tcp-socket') as { default: typeof TcpSocketModule };
  return m.default;
}

/**
 * TLS over `react-native-tcp-socket`, for the MirAIe broker only (`cloud.ts` checks the host,
 * port and opt-in before calling this). The default trust is used: the system CAs, never
 * `rejectUnauthorized: false`. That library does not check the host name on Android, so it hands
 * the leaf certificate's CN back and `cloud.ts` checks it before anything is written.
 */
export const dialTls: TlsDialer = (host, port, timeoutMs) =>
  new Promise<RawTls>((resolve, reject) => {
    let settled = false;
    const socket = tcpSocket().connectTLS({ host, port, connectTimeout: timeoutMs });
    const timer = setTimeout(() => fail(new Error('TLS connect timed out')), timeoutMs);
    function fail(e: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(e);
    }
    socket.once('error', (e: Error) => fail(e));
    socket.once('secureConnect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        async peerCommonName() {
          const cert = (await socket.getPeerCertificate()) as {
            subject?: Record<string, unknown>;
          } | null;
          const cn = cert?.subject?.CN;
          return typeof cn === 'string' ? cn : null;
        },
        write(bytes) {
          socket.write(bytes);
        },
        close() {
          socket.destroy();
        },
        onData(cb) {
          socket.on('data', (d: string | Uint8Array) => {
            if (typeof d !== 'string') cb(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
          });
        },
        onClose(cb) {
          socket.on('close', () => cb());
        },
      });
    });
  });

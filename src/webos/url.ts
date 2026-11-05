const SOCKET_URL =
  /^wss?:\/\/((?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:.]+(?:%[0-9A-Za-z._~-]+)?\])(?::(\d{1,5}))?(\/[^\s\\@]*)?$/;

/** Strict parse of a TV socket URL: `ws(s)://<ip>[:port][/path]`. Null for anything else, including
 *  userinfo (`@`), backslashes, whitespace and host names, so the host that is checked is the host
 *  that is connected to. IPv6 hosts come back without brackets. */
export function parseSocketUrl(url: string): { host: string; port?: number } | null {
  const m = SOCKET_URL.exec(url);
  if (!m?.[1]) return null;
  const host = m[1].replace(/^\[|\]$/g, '');
  return m[2] === undefined ? { host } : { host, port: Number(m[2]) };
}

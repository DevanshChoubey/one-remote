import { isTvLink, tvLinkOf, withTvHost } from '@/core';
import type { Device, Link } from '@/core';

const webos: Link = { kind: 'webos', host: '192.168.1.23', secure: true, clientKeyRef: 'k' };
const ir: Link = { kind: 'ir', remoteId: 'lg-tv/default' };
const device = (links: Link[]): Device => ({
  id: 'd1',
  kind: 'tv',
  name: 'TV',
  roomId: 'r1',
  order: 0,
  links,
});

describe('tvLink', () => {
  it('knows the network TV links', () => {
    expect(isTvLink(webos)).toBe(true);
    expect(isTvLink({ kind: 'androidtv', host: 'h', certRef: 'c', pinSha256: 'p' })).toBe(true);
    expect(isTvLink({ kind: 'samsung', host: 'h', tokenRef: 't', pinSha256: 'p' })).toBe(true);
    expect(isTvLink(ir)).toBe(false);
    expect(isTvLink({ kind: 'matter', nodeId: 'n' })).toBe(false);
  });

  it('returns the first TV link of the device', () => {
    expect(tvLinkOf(device([ir, webos]))).toBe(webos);
    expect(tvLinkOf(device([ir]))).toBeUndefined();
  });

  it('replaces only the TV link host', () => {
    const d = device([ir, webos]);
    const next = withTvHost(d, '192.168.1.99');
    expect(next.links[0]).toBe(ir);
    expect(next.links[1]).toEqual({ ...webos, host: '192.168.1.99' });
    expect(d.links[1]).toBe(webos);
  });

  it('accepts a device whose only link is a stored webOS link', () => {
    const only = device([{ kind: 'webos', host: 'h', secure: false, clientKeyRef: 'r' }]);
    expect(only.links.every(isTvLink)).toBe(true);
    expect(tvLinkOf(only)?.kind).toBe('webos');
  });
});

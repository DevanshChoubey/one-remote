import { parseSocketUrl } from '@/webos/url';

describe('parseSocketUrl', () => {
  it('reads plain ws and wss addresses', () => {
    expect(parseSocketUrl('ws://192.168.1.23:3000')).toEqual({ host: '192.168.1.23', port: 3000 });
    expect(parseSocketUrl('wss://192.168.1.23:3001/a/b.sock')).toEqual({
      host: '192.168.1.23',
      port: 3001,
    });
    expect(parseSocketUrl('ws://192.168.1.23')).toEqual({ host: '192.168.1.23' });
    expect(parseSocketUrl('wss://[fe80::1]:3001')).toEqual({ host: 'fe80::1', port: 3001 });
  });

  it.each([
    'ws://192.168.1.5:1@8.8.8.8:3000/',
    'ws://user@192.168.1.5:3000',
    'ws://192.168.1.5\\@8.8.8.8:3000',
    'ws://192.168.1.5:3000/a b',
    'ws://192.168.1.5:3000/a\\b',
    'ws://tv.local:3000',
    'http://192.168.1.5:3000',
    'ws://192.168.1.5:3000/x@y',
    '',
  ])('rejects %s', (url) => {
    expect(parseSocketUrl(url)).toBeNull();
  });
});

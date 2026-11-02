import { t } from '@/i18n';
import type { DeviceView } from '@/services';
import { statusLine } from '@/screens/appliance/statusLine';
import { device } from '../helpers';

const matterIr = device('d', 'r', 0, {
  links: [
    { kind: 'matter', nodeId: '1' },
    { kind: 'ir', remoteId: 'panasonic-ac/dke' },
  ],
});

const view = (over: Partial<DeviceView>): DeviceView => ({
  device: matterIr,
  usable: true,
  status: { via: null, fellBack: false },
  capabilities: {},
  ...over,
});

const text = (v: DeviceView): string => {
  const s = statusLine(v);
  return t(s.key, s.params);
};

describe('statusLine', () => {
  it('says connected when the first link worked', () => {
    const v = view({ status: { via: 'matter', fellBack: false } });
    expect(statusLine(v).key).toBe('ac.status.connected');
    expect(statusLine(v).kind).toBe('connected');
    expect(text(v)).toBe("● Connected · how it's connected");
  });

  it('says sent over IR when IR is the main link', () => {
    const v = view({
      device: device('d', 'r', 0),
      status: { via: 'ir', fellBack: false },
    });
    expect(statusLine(v).key).toBe('ac.status.irOnly');
    expect(text(v)).toBe('Sent over IR · point the phone at the AC');
  });

  it('names the link it fell back from', () => {
    const v = view({ status: { via: 'ir', fellBack: true } });
    expect(statusLine(v).key).toBe('ac.status.fellBack');
    expect(text(v)).toBe('Matter not reachable · sent over IR · point at the AC');
  });

  it('says a phone with IR is needed when the device is not usable', () => {
    const v = view({ usable: false, device: device('d', 'r', 0) });
    expect(text(v)).toBe('Needs a phone with IR');
  });

  it('uses the fan copy for a fan', () => {
    const v = view({
      device: device('d', 'r', 0, { kind: 'fan' }),
      status: { via: 'ir', fellBack: false },
    });
    expect(text(v)).toBe('Sent over IR · point the phone at the fan');
  });

  it('before any press, an IR-first device says IR, others say connected', () => {
    expect(statusLine(view({ device: device('d', 'r', 0) })).key).toBe('ac.status.irOnly');
    expect(statusLine(view({})).key).toBe('ac.status.connected');
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

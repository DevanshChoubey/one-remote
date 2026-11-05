import { createServices } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';

const mockHas = jest.fn(() => true);
const mockTransmit = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../../modules/ir-emitter', () => ({
  IrEmitterModule: { hasIrEmitter: (): boolean => mockHas(), transmit: mockTransmit },
}));

describe('createServices ir wiring', () => {
  const deps = {
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
  };

  it('holds an ir driver and services.ir, and makes no native call while constructing', () => {
    const services = createServices(deps);
    expect(services.drivers.map((d) => d.kind)).toContain('ir');
    expect(services.ir.brands('ac').map((b) => b.id)).toEqual(['panasonic']);
    expect(mockHas).not.toHaveBeenCalled();
    expect(mockTransmit).not.toHaveBeenCalled();
  });

  it('uses the replacement ir and drivers when given', () => {
    const ir = createServices(deps).ir;
    const services = createServices({ ...deps, ir, drivers: [] });
    expect(services.ir).toBe(ir);
    expect(services.drivers).toEqual([]);
  });
});

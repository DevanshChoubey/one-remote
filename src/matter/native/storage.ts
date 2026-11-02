import { WebStorageDriver } from '@matter/general';
import type { DataNamespace, WebStorageProvider } from '@matter/general';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Everything matter.js stores (the fabric, its keys, what it learnt about the AC) starts with this. */
const PREFIX = 'matter:';

/**
 * A `WebStorageProvider` over the app's AsyncStorage (v2). Keys are namespaced so they cannot
 * collide with the home store; `clear` only clears Matter's own keys.
 */
export function createMatterStorageProvider(namespace: string): WebStorageProvider {
  const prefix = `${PREFIX}${namespace}#`;
  const own = (key: string): string => `${prefix}${key}`;
  const ownKeys = async (): Promise<string[]> =>
    (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));

  return {
    getItem: (key) => AsyncStorage.getItem(own(key)),
    setItem: (key, value) => AsyncStorage.setItem(own(key), value),
    removeItem: (key) => AsyncStorage.removeItem(own(key)),
    async getAllKeys() {
      return (await ownKeys()).map((k) => k.slice(prefix.length));
    },
    async getMany(keys) {
      const pairs = await AsyncStorage.multiGet(keys.map(own));
      const out: Record<string, string | null> = {};
      keys.forEach((key, i) => {
        out[key] = pairs[i]?.[1] ?? null;
      });
      return out;
    },
    async setMany(entries) {
      await AsyncStorage.multiSet(Object.entries(entries).map(([k, v]) => [own(k), v]));
    },
    async removeMany(keys) {
      await AsyncStorage.multiRemove(keys.map(own));
    },
    async clear() {
      await AsyncStorage.multiRemove(await ownKeys());
    },
  };
}

/** The storage driver matter.js is told to use. */
export class MatterStorageDriver extends WebStorageDriver {
  static readonly id = 'one-remote-async-storage';

  static create(namespace: DataNamespace): MatterStorageDriver {
    const driver = new MatterStorageDriver(namespace.namespace);
    driver.initialize();
    return driver;
  }

  constructor(namespace: string) {
    super(createMatterStorageProvider(namespace));
  }
}

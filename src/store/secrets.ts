import * as SecureStore from 'expo-secure-store';
import type { SecretStore } from './types';

const SAFE = /^[A-Za-z0-9.-]$/;
const NOT_ESCAPED_BY_URI = new Set(['_', '!', '~', '*', "'", '(', ')']);
const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * SecureStore only accepts [A-Za-z0-9._-]. Every other UTF-8 byte becomes `_` + two hex digits
 * (so `_` itself is escaped too), which keeps the mapping injective.
 */
export function secureKey(ref: string): string {
  let out = '';
  for (const ch of ref) {
    if (SAFE.test(ch)) {
      out += ch;
    } else if (NOT_ESCAPED_BY_URI.has(ch)) {
      out += `_${hex2(ch.charCodeAt(0))}`;
    } else {
      out += encodeURIComponent(ch).replace(
        /%([0-9A-F]{2})/g,
        (_m, h: string) => `_${h.toLowerCase()}`,
      );
    }
  }
  return `or.${out}`;
}

export function createSecureSecretStore(): SecretStore {
  return {
    get: (ref) => SecureStore.getItemAsync(secureKey(ref)),
    set: (ref, v) => SecureStore.setItemAsync(secureKey(ref), v),
    delete: (ref) => SecureStore.deleteItemAsync(secureKey(ref)),
  };
}

export function createMemorySecretStore(): SecretStore {
  const m = new Map<string, string>();
  return {
    get: async (ref) => m.get(ref) ?? null,
    set: async (ref, v) => {
      m.set(ref, v);
    },
    delete: async (ref) => {
      m.delete(ref);
    },
  };
}

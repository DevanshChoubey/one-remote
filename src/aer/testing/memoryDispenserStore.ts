// From aer-remote src/store/memoryStore.ts (2026-11-04). Adapted: createMemoryStore renamed createMemoryDispenserStore, types from ../types.
import type { DispenserStore, SavedDispenser } from '../types';

export function createMemoryDispenserStore(): DispenserStore {
  const items = new Map<string, SavedDispenser>();
  const subs = new Set<() => void>();
  const notify = (): void => {
    for (const cb of [...subs]) {
      try {
        cb();
      } catch {
        // A faulty subscriber must not fail the write or starve the others.
      }
    }
  };
  return {
    async list() {
      return [...items.values()].map((d) => structuredClone(d));
    },
    async get(id) {
      const d = items.get(id);
      return d ? structuredClone(d) : null;
    },
    async upsert(d) {
      items.set(d.id, structuredClone(d));
      notify();
    },
    async remove(id) {
      items.delete(id);
      notify();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}

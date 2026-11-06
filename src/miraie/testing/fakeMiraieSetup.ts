import { MiraieError, maskMiraiePhone, normalizeMiraiePhone } from '@/core';
import type { MiraieAc, MiraieSetup, MiraieStatus } from '@/core';

export interface FakeMiraieSetup extends MiraieSetup {
  /** The ACs `listAcs` answers with. */
  acs: MiraieAc[];
  /** When set, `signIn` rejects with this code. */
  signInError: MiraieError['code'] | null;
  /** When set, `listAcs` rejects with this code. */
  listError: MiraieError['code'] | null;
  readonly signIns: { phone: string; password: string }[];
  disconnects: number;
  /** Turns it on as if signed in (`needsSignIn` to show the signed-out state). */
  set(s: Partial<MiraieStatus>): void;
}

/** A MirAIe setup for screen tests: no network, everything in memory. */
export function createFakeMiraieSetup(): FakeMiraieSetup {
  let status: MiraieStatus = { enabled: false, needsSignIn: false };
  const subs = new Set<() => void>();
  const notify = (): void => subs.forEach((cb) => cb());
  const fake: FakeMiraieSetup = {
    acs: [],
    signInError: null,
    listError: null,
    signIns: [],
    disconnects: 0,
    status: () => status,
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    async signIn(phone, password) {
      const p = normalizeMiraiePhone(phone);
      if (!p) throw new MiraieError('badPhone');
      fake.signIns.push({ phone: p, password });
      if (fake.signInError) throw new MiraieError(fake.signInError);
      status = { enabled: true, account: maskMiraiePhone(p), needsSignIn: false };
      notify();
    },
    async disconnect() {
      fake.disconnects++;
      status = { enabled: false, needsSignIn: false };
      notify();
    },
    async listAcs() {
      if (!status.enabled) throw new MiraieError('off');
      if (fake.listError) throw new MiraieError(fake.listError);
      return fake.acs.map((a) => ({ ...a }));
    },
    set(s) {
      status = { ...status, ...s };
      notify();
    },
  };
  return fake;
}

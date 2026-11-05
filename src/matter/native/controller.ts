import { Platform } from 'react-native';
import type { Unsubscribe } from '@/core';
import { MatterError } from '@/core/matterSetup';
import { getOnLinkPrefixes } from '@/transport/netInfo';
import type { Prefix } from '@/transport/localOnly';
import { MulticastLockModule } from '../../../modules/multicast-lock';
import type { MatterController } from '../controller';
import type { MatterStack } from './stack';

export interface MulticastLock {
  acquire(): void;
  release(): void;
}

export interface NativeControllerDeps {
  /** Builds the matter.js stack. Default: loads `./stack` on first use. */
  load?: () => Promise<MatterStack>;
  /** Lets Android receive mDNS while Matter works; null where there is none. */
  multicast?: MulticastLock | null;
  prefixes?: () => Promise<Prefix[]>;
  /** Whether this phone can run Matter. Default: Android with the multicast module. */
  supported?: () => boolean;
}

/**
 * The `MatterController` over matter.js. The stack is heavy, so it is built on first use and kept
 * for the life of the app. The multicast lock is held only while a commission or a subscription is
 * running, so an idle app does not keep the Wi-Fi radio awake.
 */
export function createNativeMatterController(deps: NativeControllerDeps = {}): MatterController {
  const load = deps.load ?? (async () => (await import('./stack')).createMatterStack());
  const multicast = deps.multicast === undefined ? MulticastLockModule : deps.multicast;
  const prefixes = deps.prefixes ?? getOnLinkPrefixes;
  const supported = deps.supported ?? (() => Platform.OS === 'android' && multicast !== null);

  let stack: Promise<MatterStack> | undefined;
  const stackOf = (): Promise<MatterStack> => {
    if (!stack) {
      stack = load().catch((e: unknown) => {
        // A failed load is tried again next time.
        stack = undefined;
        throw e instanceof MatterError ? e : new MatterError('unavailable');
      });
    }
    return stack;
  };

  let holders = 0;
  const hold = (): (() => void) => {
    if (holders++ === 0) multicast?.acquire();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (--holders === 0) multicast?.release();
    };
  };

  return {
    available: supported,

    async commission(payload, onStep) {
      const release = hold();
      try {
        const nodeId = await (await stackOf()).commission(payload, onStep);
        return { nodeId };
      } finally {
        release();
      }
    },

    async info(nodeId) {
      return (await stackOf()).info(nodeId);
    },

    async read(nodeId) {
      const release = hold();
      try {
        return await (await stackOf()).read(nodeId);
      } finally {
        release();
      }
    },

    async write(nodeId, w) {
      const release = hold();
      try {
        await (await stackOf()).write(nodeId, w);
      } finally {
        release();
      }
    },

    subscribe(nodeId, onAttrs, onLost): Unsubscribe {
      const release = hold();
      let unsub: Unsubscribe | undefined;
      let closed = false;
      stackOf().then(
        (s) => {
          if (closed) return;
          unsub = s.subscribe(nodeId, onAttrs, onLost);
        },
        () => {
          if (!closed) onLost();
        },
      );
      return () => {
        closed = true;
        unsub?.();
        release();
      };
    },

    async removeFabric(nodeId) {
      const release = hold();
      try {
        await (await stackOf()).removeFabric(nodeId);
      } finally {
        release();
      }
    },

    async peerAddress(nodeId) {
      return (await stackOf()).peerAddress(nodeId);
    },

    onLinkPrefixes: prefixes,
  };
}

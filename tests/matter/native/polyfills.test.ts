import { installMatterPolyfills } from '@/matter/native/polyfills';

describe('matter polyfills', () => {
  it('aborts a combined signal when any source aborts', () => {
    const g = globalThis as unknown as { AbortSignal: { any?: unknown } };
    const original = g.AbortSignal.any;
    delete g.AbortSignal.any;
    try {
      installMatterPolyfills();
      const a = new AbortController();
      const b = new AbortController();
      const any = (g.AbortSignal.any as (s: AbortSignal[]) => AbortSignal)([a.signal, b.signal]);
      expect(any.aborted).toBe(false);
      b.abort();
      expect(any.aborted).toBe(true);
    } finally {
      g.AbortSignal.any = original;
    }
  });

  it('is already aborted when a source already is', () => {
    const g = globalThis as unknown as { AbortSignal: { any?: unknown } };
    const original = g.AbortSignal.any;
    delete g.AbortSignal.any;
    try {
      installMatterPolyfills();
      const a = new AbortController();
      a.abort();
      expect((g.AbortSignal.any as (s: AbortSignal[]) => AbortSignal)([a.signal]).aborted).toBe(
        true,
      );
    } finally {
      g.AbortSignal.any = original;
    }
  });

  it('encodes and decodes UTF-8 when the runtime has no codec', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const enc = g.TextEncoder;
    const dec = g.TextDecoder;
    delete g.TextEncoder;
    delete g.TextDecoder;
    try {
      installMatterPolyfills();
      const E = g.TextEncoder as new () => { encode(s: string): Uint8Array };
      const D = g.TextDecoder as new () => { decode(b: Uint8Array): string };
      const text = 'One Remote ✓ 😀 é';
      const bytes = new E().encode(text);
      expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(Buffer.from(text, 'utf8'))));
      expect(new D().decode(bytes)).toBe(text);
    } finally {
      g.TextEncoder = enc;
      g.TextDecoder = dec;
    }
  });
});

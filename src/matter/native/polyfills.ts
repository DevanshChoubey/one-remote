/**
 * What matter.js expects from the runtime and Hermes lacks. Each is added only when missing.
 */

/** UTF-8 only, which is all matter.js uses. */
class Utf8Encoder {
  readonly encoding = 'utf-8';

  encode(input = ''): Uint8Array {
    const out: number[] = [];
    for (const ch of input) {
      const c = ch.codePointAt(0) ?? 0;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        out.push(
          0xf0 | (c >> 18),
          0x80 | ((c >> 12) & 63),
          0x80 | ((c >> 6) & 63),
          0x80 | (c & 63),
        );
      }
    }
    return Uint8Array.from(out);
  }
}

class Utf8Decoder {
  readonly encoding = 'utf-8';

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return '';
    const b =
      input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let out = '';
    for (let i = 0; i < b.length;) {
      const b0 = b[i++] ?? 0;
      let c = b0;
      if (b0 >= 0xf0)
        c =
          ((b0 & 7) << 18) |
          (((b[i++] ?? 0) & 63) << 12) |
          (((b[i++] ?? 0) & 63) << 6) |
          ((b[i++] ?? 0) & 63);
      else if (b0 >= 0xe0)
        c = ((b0 & 15) << 12) | (((b[i++] ?? 0) & 63) << 6) | ((b[i++] ?? 0) & 63);
      else if (b0 >= 0xc0) c = ((b0 & 31) << 6) | ((b[i++] ?? 0) & 63);
      out += String.fromCodePoint(c);
    }
    return out;
  }
}

type SignalCtor = { any?: (signals: AbortSignal[]) => AbortSignal };

/** Aborts when any of `signals` does. */
function abortAny(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort((s as { reason?: unknown }).reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort((s as { reason?: unknown }).reason), {
      once: true,
    });
  }
  return controller.signal;
}

export function installMatterPolyfills(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.TextEncoder !== 'function') g.TextEncoder = Utf8Encoder;
  if (typeof g.TextDecoder !== 'function') g.TextDecoder = Utf8Decoder;
  const signal = g.AbortSignal as SignalCtor | undefined;
  if (signal && typeof signal.any !== 'function') signal.any = abortAny;
}

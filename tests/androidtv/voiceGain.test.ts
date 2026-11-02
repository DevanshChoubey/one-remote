import { createVoiceGain } from '@/androidtv/voiceGain';

function pcm(...samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  return out;
}

function samplesOf(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2));
  return Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) => view.getInt16(i * 2, true));
}

describe('createVoiceGain', () => {
  it('lifts quiet speech (peak 1300, as on the RMX1901) to about half of full scale', () => {
    const gain = createVoiceGain();
    const out = samplesOf(gain(pcm(1300, -1300, 100)));
    // The floor is 1500, so the gain is 16000 / 1500.
    expect(out[0]).toBe(Math.round((1300 * 16000) / 1500));
    expect(out[1]).toBe(-Math.round((1300 * 16000) / 1500));
    expect(out[2]).toBe(Math.round((100 * 16000) / 1500));
  });

  it('never boosts silence or noise by more than the floor allows', () => {
    const out = samplesOf(createVoiceGain()(pcm(80, -60)));
    expect(Math.abs(out[0]!)).toBeLessThan(1000);
  });

  it('lowers the gain for the rest of the session once a louder peak is heard', () => {
    const gain = createVoiceGain();
    gain(pcm(8000));
    expect(samplesOf(gain(pcm(1000)))).toEqual([2000]);
  });

  it('leaves loud audio alone and clips instead of wrapping around', () => {
    const gain = createVoiceGain();
    expect(samplesOf(gain(pcm(32767, -32768, 16000)))).toEqual([16000, -16000, 7813]);
  });

  it('starts each session afresh', () => {
    createVoiceGain()(pcm(30000));
    expect(samplesOf(createVoiceGain()(pcm(1500)))).toEqual([16000]);
  });

  it('passes a trailing odd byte through and reads a view inside a larger buffer', () => {
    const big = new Uint8Array(7);
    big.set(pcm(150), 2);
    big[4] = 9;
    const out = createVoiceGain()(big.subarray(2, 5));
    expect(out).toHaveLength(3);
    expect(samplesOf(out)).toEqual([1600]);
    expect(out[2]).toBe(9);
  });
});

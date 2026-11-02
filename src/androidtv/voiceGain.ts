/** The peak a boosted voice should reach (about half of full scale, leaving room for loud words). */
const TARGET_PEAK = 16000;
/** The loudest peak assumed: below it, background noise would be boosted to full volume. */
const PEAK_FLOOR = 1500;
const MAX_GAIN = 16;

/**
 * A gain for one voice session's PCM16 LE audio. Phone mics on the speech-recognition source give
 * raw, quiet audio (speech peaked near 1300 of 32767 on the RMX1901), which the TV's assistant
 * took for silence. The gain follows the loudest peak heard so far, so it only ever goes down
 * within a session and never pumps between words. A trailing odd byte is passed through.
 */
export function createVoiceGain(): (pcm: Uint8Array) => Uint8Array {
  let loudest = PEAK_FLOOR;
  return (pcm) => {
    const samples = Math.floor(pcm.length / 2);
    const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
    for (let i = 0; i < samples; i++)
      loudest = Math.max(loudest, Math.abs(view.getInt16(i * 2, true)));
    const gain = Math.min(MAX_GAIN, TARGET_PEAK / loudest);
    const out = new Uint8Array(pcm.length);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < samples; i++) {
      const v = Math.round(view.getInt16(i * 2, true) * gain);
      outView.setInt16(i * 2, Math.max(-32768, Math.min(32767, v)), true);
    }
    out.set(pcm.subarray(samples * 2), samples * 2);
    return out;
  };
}

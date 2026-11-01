import {
  FrameReader,
  MAX_FRAME,
  ProtoWriter,
  frame,
  int32,
  readFields,
  str,
  uint,
} from '@/androidtv/proto';

describe('frame', () => {
  it('varint 300 frames as AC 02', () => {
    expect([...frame(new Uint8Array(300)).slice(0, 2)]).toEqual([0xac, 0x02]);
  });
});

describe('FrameReader', () => {
  it('a frame split across chunks comes out whole', () => {
    const r = new FrameReader();
    expect(r.push(Uint8Array.of(0x04, 0x4a))).toEqual([]);
    expect(r.push(Uint8Array.of(0x02, 0x08, 0x05, 0x01, 0x00)).map((f) => [...f])).toEqual([
      [0x4a, 0x02, 0x08, 0x05],
      [0x00],
    ]);
  });

  it('two frames in one chunk come out in order', () => {
    const r = new FrameReader();
    const out = r.push(Uint8Array.of(0x02, 0x0a, 0x0b, 0x01, 0x07));
    expect(out.map((f) => [...f])).toEqual([[0x0a, 0x0b], [0x07]]);
  });

  it('a length over 65536 throws frameTooLarge', () => {
    expect(() => new FrameReader().push(Uint8Array.of(0x81, 0x80, 0x04))).toThrow('frameTooLarge');
  });

  it('a length of exactly MAX_FRAME is accepted', () => {
    const r = new FrameReader();
    expect(MAX_FRAME).toBe(65536);
    const head = Uint8Array.of(0x80, 0x80, 0x04);
    const body = new Uint8Array(MAX_FRAME);
    const out = r.push(new Uint8Array([...head, ...body]));
    expect(out).toHaveLength(1);
    expect(out[0]?.length).toBe(MAX_FRAME);
  });
});

describe('ProtoWriter and readFields', () => {
  it('readFields skips fixed-width fields and reads the rest', () => {
    // field 1 fixed64 (8 bytes), field 2 fixed32 (4 bytes), field 3 varint 7
    const b = Uint8Array.of(0x09, 1, 2, 3, 4, 5, 6, 7, 8, 0x15, 1, 2, 3, 4, 0x18, 0x07);
    const f = readFields(b);
    expect(uint(f, 3)).toBe(7);
    expect(f.has(1)).toBe(false);
    expect(f.has(2)).toBe(false);
  });

  it('readFields throws malformed on a truncated length-delimited field', () => {
    expect(() => readFields(Uint8Array.of(0x0a, 0x05, 0x01))).toThrow('malformed');
  });

  it('readFields throws on group wire types', () => {
    expect(() => readFields(Uint8Array.of(0x0b))).toThrow('malformed');
  });

  it('int32 -1 writes ten bytes and reads back -1', () => {
    const b = new ProtoWriter().varint(1, -1).finish();
    expect([...b]).toEqual([0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
    expect(int32(readFields(b), 1)).toBe(-1);
  });

  it('strings are written and read as UTF-8', () => {
    // 'é📺' is C3 A9 then F0 9F 93 BA
    const b = new ProtoWriter().string(2, 'é📺').finish();
    expect([...b]).toEqual([0x12, 0x06, 0xc3, 0xa9, 0xf0, 0x9f, 0x93, 0xba]);
    expect(str(readFields(b), 2)).toBe('é📺');
  });
});

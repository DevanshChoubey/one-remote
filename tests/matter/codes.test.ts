import { parseMatterCode } from '@/matter/codes';

describe('parseMatterCode', () => {
  it('accepts a manual code, with spaces or dashes', () => {
    expect(parseMatterCode('34970112332')).toEqual({ kind: 'manual', digits: '34970112332' });
    expect(parseMatterCode('3497-011-2332')).toEqual({ kind: 'manual', digits: '34970112332' });
    expect(parseMatterCode(' 3497 011 2332 ')).toEqual({ kind: 'manual', digits: '34970112332' });
  });

  it('refuses a wrong check digit', () => {
    expect(parseMatterCode('34970112331')).toBeNull();
  });

  it('accepts a 21-digit manual code with a valid check digit', () => {
    // Vendor/product form: 20 digits plus a Verhoeff check digit.
    const body = '64970112332123456789';
    const digit = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].find(
      (d) => parseMatterCode(body + d) !== null,
    );
    expect(digit).toBeDefined();
    expect(parseMatterCode(body + String(digit))).toEqual({
      kind: 'manual',
      digits: body + String(digit),
    });
  });

  it('accepts a QR payload', () => {
    expect(parseMatterCode('MT:Y.K9042C00KA0648G00')).toEqual({
      kind: 'qr',
      payload: 'MT:Y.K9042C00KA0648G00',
    });
  });

  it('refuses a short or malformed QR payload', () => {
    expect(parseMatterCode('MT:Y.K9042C00')).toBeNull();
    expect(parseMatterCode('MT:y.k9042c00ka0648g00')).toBeNull();
  });

  it('refuses anything else', () => {
    expect(parseMatterCode('hello')).toBeNull();
    expect(parseMatterCode('1234')).toBeNull();
    expect(parseMatterCode('')).toBeNull();
    expect(parseMatterCode('3497011233')).toBeNull();
  });
});

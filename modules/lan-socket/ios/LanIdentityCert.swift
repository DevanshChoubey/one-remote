import Foundation
import Security

/// A minimal DER writer, only what a self-signed X.509 v3 client certificate needs. Pure
/// Foundation (no Security calls), so it can be reasoned about on its own.
enum Der {
  static func length(_ n: Int) -> [UInt8] {
    if n < 0x80 { return [UInt8(n)] }
    var bytes: [UInt8] = []
    var v = n
    while v > 0 {
      bytes.insert(UInt8(v & 0xff), at: 0)
      v >>= 8
    }
    return [0x80 | UInt8(bytes.count)] + bytes
  }

  static func tlv(_ tag: UInt8, _ content: [UInt8]) -> [UInt8] {
    [tag] + length(content.count) + content
  }

  static func sequence(_ parts: [UInt8]...) -> [UInt8] { tlv(0x30, parts.flatMap { $0 }) }
  static func set(_ parts: [UInt8]...) -> [UInt8] { tlv(0x31, parts.flatMap { $0 }) }
  static let null: [UInt8] = [0x05, 0x00]

  /// A non-negative INTEGER from big-endian magnitude bytes: leading zero bytes are dropped, and
  /// one 0x00 is added when the top bit is set (so the value is not read as negative).
  static func integer(unsigned magnitude: [UInt8]) -> [UInt8] {
    var bytes = Array(magnitude.drop(while: { $0 == 0 }))
    if bytes.isEmpty { bytes = [0] }
    if bytes[0] & 0x80 != 0 { bytes.insert(0, at: 0) }
    return tlv(0x02, bytes)
  }

  static func integer(_ value: UInt64) -> [UInt8] {
    var bytes: [UInt8] = []
    var v = value
    repeat {
      bytes.insert(UInt8(v & 0xff), at: 0)
      v >>= 8
    } while v > 0
    return integer(unsigned: bytes)
  }

  /// An OBJECT IDENTIFIER from its arcs, e.g. [1, 2, 840, 113549, 1, 1, 11].
  static func oid(_ arcs: [UInt]) -> [UInt8] {
    precondition(arcs.count >= 2)
    var out: [UInt8] = [UInt8(arcs[0] * 40 + arcs[1])]
    for arc in arcs.dropFirst(2) {
      var chunk: [UInt8] = [UInt8(arc & 0x7f)]
      var v = arc >> 7
      while v > 0 {
        chunk.insert(UInt8(v & 0x7f) | 0x80, at: 0)
        v >>= 7
      }
      out += chunk
    }
    return tlv(0x06, out)
  }

  /// A BIT STRING with no unused bits.
  static func bitString(_ bytes: [UInt8]) -> [UInt8] { tlv(0x03, [0x00] + bytes) }

  /// PrintableString when every character allows it, else UTF8String.
  static func string(_ text: String) -> [UInt8] {
    let printable = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '()+,-./:=?")
    let tag: UInt8 = text.allSatisfy({ printable.contains($0) }) ? 0x13 : 0x0c
    return tlv(tag, Array(text.utf8))
  }

  /// UTCTime (`YYMMDDHHMMSSZ`) up to the year 2049, GeneralizedTime (`YYYYMMDDHHMMSSZ`) from 2050.
  static func time(_ date: Date) -> [UInt8] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    let year = c.year!
    let rest = String(
      format: "%02d%02d%02d%02d%02dZ", c.month!, c.day!, c.hour!, c.minute!, c.second!)
    if year < 2050 {
      return tlv(0x17, Array((String(format: "%02d", year % 100) + rest).utf8))
    }
    return tlv(0x18, Array((String(format: "%04d", year) + rest).utf8))
  }
}

enum LanIdentityCert {
  private static let rsaEncryption: [UInt] = [1, 2, 840, 113549, 1, 1, 1]
  private static let sha256WithRSA: [UInt] = [1, 2, 840, 113549, 1, 1, 11]
  private static let commonNameOid: [UInt] = [2, 5, 4, 3]

  /// Reads a PKCS#1 `RSAPublicKey` (`SEQUENCE { INTEGER n, INTEGER e }`) as big-endian bytes with
  /// no leading zeros, or nil if it is malformed.
  static func parseRsaPublicKey(_ der: [UInt8]) -> (modulus: [UInt8], exponent: [UInt8])? {
    var i = 0
    func readLength() -> Int? {
      guard i < der.count else { return nil }
      let first = der[i]
      i += 1
      if first < 0x80 { return Int(first) }
      let count = Int(first & 0x7f)
      guard count >= 1, count <= 4, i + count <= der.count else { return nil }
      var n = 0
      for _ in 0..<count {
        n = (n << 8) | Int(der[i])
        i += 1
      }
      return n
    }
    func readInteger() -> [UInt8]? {
      guard i < der.count, der[i] == 0x02 else { return nil }
      i += 1
      guard let n = readLength(), n > 0, i + n <= der.count else { return nil }
      let value = Array(der[i..<(i + n)].drop(while: { $0 == 0 }))
      i += n
      return value
    }
    guard i < der.count, der[i] == 0x30 else { return nil }
    i += 1
    guard readLength() != nil, let modulus = readInteger(), let exponent = readInteger()
    else { return nil }
    return (modulus, exponent)
  }

  /// The DER `Name` `CN=<commonName>`.
  private static func name(_ commonName: String) -> [UInt8] {
    Der.sequence(Der.set(Der.sequence(Der.oid(commonNameOid), Der.string(commonName))))
  }

  private static var signatureAlgorithm: [UInt8] {
    Der.sequence(Der.oid(sha256WithRSA), Der.null)
  }

  /// The `TBSCertificate` of a self-signed v3 certificate (issuer = subject, no extensions).
  static func tbsCertificate(
    publicKeyPkcs1: [UInt8], commonName: String, serial: UInt64, notBefore: Date, notAfter: Date
  ) -> [UInt8] {
    let subjectPublicKeyInfo = Der.sequence(
      Der.sequence(Der.oid(rsaEncryption), Der.null), Der.bitString(publicKeyPkcs1))
    return Der.sequence(
      Der.tlv(0xa0, Der.integer(2)),  // [0] EXPLICIT version: v3
      Der.integer(serial),
      signatureAlgorithm,
      name(commonName),  // issuer
      Der.sequence(Der.time(notBefore), Der.time(notAfter)),
      name(commonName),  // subject
      subjectPublicKeyInfo)
  }

  /// A complete certificate; `sign` signs the TBS bytes with SHA256withRSA (PKCS#1 v1.5).
  static func certificate(
    publicKeyPkcs1: [UInt8], commonName: String, serial: UInt64, notBefore: Date, notAfter: Date,
    sign: ([UInt8]) -> [UInt8]?
  ) -> [UInt8]? {
    let tbs = tbsCertificate(
      publicKeyPkcs1: publicKeyPkcs1, commonName: commonName, serial: serial,
      notBefore: notBefore, notAfter: notAfter)
    guard let signature = sign(tbs) else { return nil }
    return Der.sequence(tbs, signatureAlgorithm, Der.bitString(signature))
  }
}

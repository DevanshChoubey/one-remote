import Foundation
import Security

/// The phone's TLS client identities in the Keychain, one per ref.
///
/// Storage for ref `r` (tag `lan-identity:r`):
///  - the RSA-2048 private key, `kSecClassKey` with `kSecAttrApplicationTag` = tag and
///    `kSecAttrLabel` = tag;
///  - its self-signed certificate, `kSecClassCertificate` with `kSecAttrLabel` = tag.
/// Both are `AfterFirstUnlockThisDeviceOnly` and not synchronised (no iCloud). The Keychain pairs
/// them into a `SecIdentity` because the certificate's public key hash equals the key's
/// `kSecAttrApplicationLabel`. The lookup is a `kSecClassIdentity` query on the label, which is set
/// on both items. (`SecIdentityCreateWithCertificate` is macOS-only and is not used.)
enum LanIdentityStore {
  private static let lock = NSLock()
  private static let serial: UInt64 = 1000
  private static let accessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

  static func tag(_ ref: String) -> String { "lan-identity:\(ref)" }

  /// The identity for [ref], or nil when it is missing or incomplete. A `kSecClassIdentity` query
  /// only returns a pair whose certificate and private key are both in the Keychain, so a half-made
  /// pair is nil. The label is set on both items, so it matches whichever one iOS reads it from.
  static func identity(ref: String) -> SecIdentity? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecAttrLabel as String: tag(ref),
      kSecReturnRef as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item,
      CFGetTypeID(item) == SecIdentityGetTypeID()
    else { return nil }
    // swiftlint:disable:next force_cast
    return (item as! SecIdentity)
  }

  /// Makes the identity once, then returns the same public key until [delete]. Throws a message
  /// fit for `ERR_LAN_OPEN_FAILED`.
  static func ensure(ref: String, commonName: String) throws -> [String: String] {
    lock.lock()
    defer { lock.unlock() }
    if ref.isEmpty { throw IdentityFailure("An identity needs a ref") }
    if commonName.isEmpty { throw IdentityFailure("An identity needs a common name") }
    if let existing = identity(ref: ref), let pkcs1 = publicKeyBytes(of: existing) {
      return try describe(pkcs1)
    }
    // Nothing, or a half-made pair (a crash between the two adds): start clean.
    try remove(ref: ref)
    return try describe(try make(ref: ref, commonName: commonName))
  }

  /// Idempotent.
  static func delete(ref: String) throws {
    lock.lock()
    defer { lock.unlock() }
    try remove(ref: ref)
  }

  private struct IdentityFailure: Error {
    let message: String
    init(_ message: String) { self.message = message }
  }

  private static func describe(_ pkcs1: [UInt8]) throws -> [String: String] {
    guard let key = LanIdentityCert.parseRsaPublicKey(pkcs1) else {
      throw IdentityFailure("The stored public key is not an RSA key")
    }
    func hex(_ bytes: [UInt8]) -> String {
      let s = bytes.map { String(format: "%02X", $0) }.joined()
      return String(s.drop(while: { $0 == "0" }))
    }
    return ["modulusHex": hex(key.modulus), "exponentHex": hex(key.exponent)]
  }

  private static func publicKeyBytes(of identity: SecIdentity) -> [UInt8]? {
    var privateKey: SecKey?
    guard SecIdentityCopyPrivateKey(identity, &privateKey) == errSecSuccess, let privateKey,
      let publicKey = SecKeyCopyPublicKey(privateKey),
      let data = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
    else { return nil }
    return [UInt8](data)
  }

  private static func make(ref: String, commonName: String) throws -> [UInt8] {
    let tag = tag(ref)
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: Data(tag.utf8),
        kSecAttrLabel as String: tag,
        kSecAttrAccessible as String: accessible,
      ] as [String: Any],
    ]
    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      throw IdentityFailure(
        "Cannot make the client key: \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
    }
    do {
      guard let publicKey = SecKeyCopyPublicKey(privateKey),
        let pkcs1 = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
      else { throw IdentityFailure("Cannot read the client public key") }
      let now = Date()
      let day: TimeInterval = 86_400
      guard
        let der = LanIdentityCert.certificate(
          publicKeyPkcs1: [UInt8](pkcs1), commonName: commonName, serial: serial,
          notBefore: now.addingTimeInterval(-day),
          notAfter: now.addingTimeInterval(-day + 3653 * day),
          sign: { tbs in
            SecKeyCreateSignature(
              privateKey, .rsaSignatureMessagePKCS1v15SHA256, Data(tbs) as CFData, nil)
              .map { [UInt8]($0 as Data) }
          }),
        let certificate = SecCertificateCreateWithData(nil, Data(der) as CFData)
      else { throw IdentityFailure("Cannot build the client certificate") }
      let add: [String: Any] = [
        kSecClass as String: kSecClassCertificate,
        kSecValueRef as String: certificate,
        kSecAttrLabel as String: tag,
        kSecAttrAccessible as String: accessible,
        kSecAttrSynchronizable as String: false,
      ]
      let status = SecItemAdd(add as CFDictionary, nil)
      guard status == errSecSuccess else {
        throw IdentityFailure("Cannot store the client certificate (status \(status))")
      }
      return [UInt8](pkcs1)
    } catch {
      // Do not leave a key without its certificate.
      try? remove(ref: ref)
      throw error
    }
  }

  private static func remove(ref: String) throws {
    let tag = tag(ref)
    let queries: [[String: Any]] = [
      [
        kSecClass as String: kSecClassCertificate,
        kSecAttrLabel as String: tag,
      ],
      [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: Data(tag.utf8),
      ],
    ]
    for query in queries {
      let status = SecItemDelete(query as CFDictionary)
      if status != errSecSuccess && status != errSecItemNotFound {
        throw IdentityFailure("Cannot delete the client identity (status \(status))")
      }
    }
  }

  /// The message of a thrown failure, for `ERR_LAN_OPEN_FAILED`.
  static func message(_ error: Error) -> String {
    (error as? IdentityFailure)?.message ?? error.localizedDescription
  }
}

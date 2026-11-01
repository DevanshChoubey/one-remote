package expo.modules.lansocket

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.interfaces.RSAPublicKey
import java.security.spec.RSAKeyGenParameterSpec
import java.util.Date
import javax.security.auth.x500.X500Principal

/** The public half of a client identity: upper-case hex, no leading zeros (exponent `10001`). */
internal data class LanIdentity(val modulusHex: String, val exponentHex: String)

/**
 * Where the key pairs live. The private key never leaves it. Only the Android Keystore
 * implementation ([AndroidKeyStoreIdentityStore]) is used in the app; unit tests use a fake because
 * the JVM has no Android Keystore.
 */
internal interface IdentityKeyStore {
  /** The public key under [alias], or null when there is no complete entry (key and certificate). */
  fun publicKey(alias: String): RSAPublicKey?

  /** Makes (replacing any entry) an RSA-2048, e = 65537 key pair with a self-signed certificate. */
  fun generate(
    alias: String,
    subject: X500Principal,
    serial: BigInteger,
    notBefore: Date,
    notAfter: Date,
  ): RSAPublicKey

  /** Removes the entry; an unknown alias is fine. */
  fun delete(alias: String)
}

/**
 * The phone's TLS client identities, one per ref, as `lan-identity:<ref>` entries (the alias
 * `androidKeyStoreIdentity` looks up when a stream is opened with that `identity`). Made once and
 * then returned unchanged until deleted.
 */
internal class LanIdentities(
  private val store: IdentityKeyStore,
  private val now: () -> Long = System::currentTimeMillis,
) {
  @Synchronized
  fun ensure(ref: String, commonName: String): LanIdentity {
    if (ref.isEmpty()) throw LanOpenError(ERR_OPEN_FAILED, "An identity needs a ref")
    if (commonName.isEmpty()) throw LanOpenError(ERR_OPEN_FAILED, "An identity needs a common name")
    val alias = IDENTITY_PREFIX + ref
    val key =
      try {
        store.publicKey(alias)
          ?: store.generate(
            alias,
            X500Principal("CN=" + escapeRdnValue(commonName)),
            SERIAL,
            Date(now() - DAY_MS),
            Date(now() - DAY_MS + TEN_YEARS_MS),
          )
      } catch (e: LanOpenError) {
        throw e
      } catch (e: Exception) {
        throw LanOpenError(
          ERR_OPEN_FAILED,
          "Cannot make the client identity '$ref': ${LanConnector.describe(e, null)}",
        )
      }
    return LanIdentity(hex(key.modulus), hex(key.publicExponent))
  }

  @Synchronized
  fun delete(ref: String) {
    try {
      store.delete(IDENTITY_PREFIX + ref)
    } catch (e: Exception) {
      throw LanOpenError(
        ERR_OPEN_FAILED,
        "Cannot delete the client identity '$ref': ${LanConnector.describe(e, null)}",
      )
    }
  }

  companion object {
    private val SERIAL = BigInteger.valueOf(1000)
    private const val DAY_MS = 24L * 60 * 60 * 1000
    /** 10 years of 365 days plus the 2 or 3 leap days, near enough. */
    private const val TEN_YEARS_MS = 3653L * DAY_MS

    /** Upper-case hex of a positive number, no leading zeros. */
    fun hex(n: BigInteger): String = n.toString(16).uppercase()

    /** Escapes an RFC 2253 attribute value so any text is one CN and cannot add RDNs. */
    fun escapeRdnValue(value: String): String {
      val out = StringBuilder()
      value.forEachIndexed { i, c ->
        val special = c in ",+\"\\<>;=#" && (c != '#' || i == 0)
        val edgeSpace = c == ' ' && (i == 0 || i == value.length - 1)
        if (special || edgeSpace) out.append('\\')
        out.append(c)
      }
      return out.toString()
    }
  }
}

/**
 * The Android Keystore implementation. Key choices:
 *  - RSA-2048, e = 65537, hardware-backed where the phone can.
 *  - PURPOSE_SIGN and PURPOSE_DECRYPT; the key can never be exported.
 *  - Digests NONE + SHA-256/384/512: TLS 1.2 client auth makes Conscrypt sign through
 *    `NONEwithRSA` (needs DIGEST_NONE), and the self-signed certificate is `SHA256withRSA`.
 *  - Signature padding PKCS1 (TLS 1.2 `rsa_pkcs1_*` and the certificate) and PSS (TLS 1.3 only
 *    allows `rsa_pss_*` for RSA); encryption padding RSA_PKCS1 because Conscrypt's raw PKCS#1
 *    signing path drives the key as an `RSA/ECB/PKCS1Padding` cipher.
 *  - Encryption padding NONE with PURPOSE_DECRYPT: Conscrypt pads TLS 1.3 PSS itself and then
 *    drives the key as an `RSA/ECB/NoPadding` decrypt. Without it the Airtel box's TLS 1.3
 *    client auth failed "Incompatible padding mode" (2026-11-01).
 * Not unit-tested on the JVM (no Android Keystore): covered by the device build only.
 */
internal class AndroidKeyStoreIdentityStore : IdentityKeyStore {
  private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

  override fun publicKey(alias: String): RSAPublicKey? {
    val ks = keyStore()
    if (!ks.isKeyEntry(alias)) return null
    if (!supportsTls13(ks.getKey(alias, null) as? PrivateKey)) return null
    return ks.getCertificate(alias)?.publicKey as? RSAPublicKey
  }

  /** Keys made before the NONE padding was added fail TLS 1.3 client auth; null makes [generate]
   *  replace them. */
  private fun supportsTls13(key: PrivateKey?): Boolean {
    if (key == null) return false
    val info = KeyFactory.getInstance(key.algorithm, PROVIDER).getKeySpec(key, KeyInfo::class.java)
    return info.purposes and KeyProperties.PURPOSE_DECRYPT != 0 &&
      KeyProperties.ENCRYPTION_PADDING_NONE in info.encryptionPaddings
  }

  override fun generate(
    alias: String,
    subject: X500Principal,
    serial: BigInteger,
    notBefore: Date,
    notAfter: Date,
  ): RSAPublicKey {
    val spec =
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(2048)
        .setAlgorithmParameterSpec(RSAKeyGenParameterSpec(2048, RSAKeyGenParameterSpec.F4))
        .setDigests(
          KeyProperties.DIGEST_NONE,
          KeyProperties.DIGEST_SHA256,
          KeyProperties.DIGEST_SHA384,
          KeyProperties.DIGEST_SHA512,
        )
        .setSignaturePaddings(
          KeyProperties.SIGNATURE_PADDING_RSA_PKCS1,
          KeyProperties.SIGNATURE_PADDING_RSA_PSS,
        )
        .setEncryptionPaddings(
          KeyProperties.ENCRYPTION_PADDING_RSA_PKCS1,
          KeyProperties.ENCRYPTION_PADDING_NONE,
        )
        .setCertificateSubject(subject)
        .setCertificateSerialNumber(serial)
        .setCertificateNotBefore(notBefore)
        .setCertificateNotAfter(notAfter)
        .build()
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, PROVIDER)
    generator.initialize(spec)
    return generator.generateKeyPair().public as RSAPublicKey
  }

  override fun delete(alias: String) {
    val ks = keyStore()
    if (ks.containsAlias(alias)) ks.deleteEntry(alias)
  }

  private companion object {
    const val PROVIDER = "AndroidKeyStore"
  }
}

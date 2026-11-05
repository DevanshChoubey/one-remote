package expo.modules.lansocket

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

/**
 * Trust for ONE socket, never installed globally. With `pin == null` (pairing) any leaf certificate
 * is accepted and its SHA-256 recorded (trust on first use). With a pin, only a leaf whose SHA-256
 * equals the pin is accepted. The chain, validity dates and host name are not checked: the TV's
 * certificate is self-signed and the TV is reached by IP, so the pin is the identity.
 */
internal class LeafPinTrust(private val pin: String?) : X509TrustManager {
  @Volatile var seenSha256: String? = null
    private set

  @Volatile var mismatch: Boolean = false
    private set

  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    val leaf = chain?.firstOrNull() ?: throw CertificateException("The server sent no certificate")
    val sha = sha256Hex(leaf.encoded)
    seenSha256 = sha
    if (pin != null && !MessageDigest.isEqual(sha.toByteArray(), pin.toByteArray())) {
      mismatch = true
      throw CertificateException("The TV's certificate does not match the one seen at pairing")
    }
  }

  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    throw CertificateException("Client certificates are not used")
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

  companion object {
    fun sha256Hex(bytes: ByteArray): String =
      MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  }
}

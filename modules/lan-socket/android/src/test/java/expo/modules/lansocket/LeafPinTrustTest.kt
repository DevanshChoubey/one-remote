package expo.modules.lansocket

import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LeafPinTrustTest {
  private val leaf: X509Certificate = HeldCertificate.Builder().build().certificate
  private val other: X509Certificate = HeldCertificate.Builder().build().certificate
  private val leafSha = LeafPinTrust.sha256Hex(leaf.encoded)

  @Test
  fun hashesAsLowerCaseHex() {
    assertEquals(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      LeafPinTrust.sha256Hex("abc".toByteArray()),
    )
    assertTrue(leafSha.matches(Regex("^[0-9a-f]{64}$")))
  }

  @Test
  fun pairingAcceptsAnyLeafAndRecordsItsHash() {
    val t = LeafPinTrust(null)
    t.checkServerTrusted(arrayOf(leaf, other), "ECDHE_ECDSA")
    assertEquals(leafSha, t.seenSha256)
    assertFalse(t.mismatch)
  }

  @Test
  fun pinnedAcceptsOnlyTheMatchingLeaf() {
    val ok = LeafPinTrust(leafSha)
    ok.checkServerTrusted(arrayOf(leaf), "RSA")
    assertFalse(ok.mismatch)

    val bad = LeafPinTrust(leafSha)
    assertThrows(CertificateException::class.java) {
      bad.checkServerTrusted(arrayOf(other, leaf), "RSA") // the leaf is chain[0], not any member
    }
    assertTrue(bad.mismatch)
    assertEquals(LeafPinTrust.sha256Hex(other.encoded), bad.seenSha256)
  }

  @Test
  fun anEmptyChainOrAClientCheckIsRefused() {
    val t = LeafPinTrust(null)
    assertThrows(CertificateException::class.java) { t.checkServerTrusted(arrayOf(), "RSA") }
    assertThrows(CertificateException::class.java) { t.checkServerTrusted(null, "RSA") }
    assertNull(t.seenSha256)
    assertThrows(CertificateException::class.java) { t.checkClientTrusted(arrayOf(leaf), "RSA") }
    assertEquals(0, t.acceptedIssuers.size)
  }
}

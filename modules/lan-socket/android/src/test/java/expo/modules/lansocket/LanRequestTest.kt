package expo.modules.lansocket

import java.net.InetAddress
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class LanRequestTest {
  private val cert: HeldCertificate = HeldCertificate.Builder().commonName("TV").build()
  private lateinit var server: MockWebServer
  private val client = LanRequestClient()

  @Before
  fun setUp() {
    server = MockWebServer()
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun start(https: Boolean = false) {
    if (https) {
      val handshake = HandshakeCertificates.Builder().heldCertificate(cert).build()
      server.useHttps(handshake.sslSocketFactory(), false)
    }
    server.start(InetAddress.getByName("127.0.0.1"), 0)
  }

  private fun url(scheme: String = "http", path: String = "/") =
    "$scheme://127.0.0.1:${server.port}$path"

  private fun get(
    url: String,
    pin: String? = null,
    pairing: Boolean = false,
    maxBytes: Long = 262_144,
  ) = client.execute("GET", url, emptyMap(), null, pin, pairing, 3000, maxBytes)

  private fun certSha() = LeafPinTrust.sha256Hex(cert.certificate.encoded)

  @Test
  fun getReturnsStatusHeadersAndBody() {
    start()
    server.enqueue(MockResponse().setBody("hello").addHeader("X-Thing", "a"))
    val r = get(url())
    assertEquals(200, r.status)
    assertEquals("hello", r.body)
    assertEquals("a", r.headers["x-thing"])
    assertNull(r.certSha256)
  }

  @Test
  fun postSendsMethodHeadersAndBody() {
    start()
    server.enqueue(MockResponse().setResponseCode(201))
    val r =
      client.execute("POST", url(), mapOf("Content-Type" to "text/plain"), "abc", null, false, 3000, 1000)
    assertEquals(201, r.status)
    val seen = server.takeRequest()
    assertEquals("POST", seen.method)
    assertEquals("abc", seen.body.readUtf8())
    assertEquals("text/plain; charset=utf-8", seen.getHeader("Content-Type")?.lowercase())
  }

  @Test
  fun redirectIsReturnedNotFollowed() {
    start()
    server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", "http://8.8.8.8/x"))
    val r = get(url())
    assertEquals(302, r.status)
    assertEquals("http://8.8.8.8/x", r.headers["location"])
    assertEquals(1, server.requestCount)
  }

  @Test
  fun httpsWithoutPinOrPairingIsRefused() {
    start(https = true)
    val e = assertThrows(LanOpenError::class.java) { get(url("https")) }
    assertEquals(ERR_NO_TRUST, e.code)
    assertEquals(0, server.requestCount)
  }

  @Test
  fun nonLocalAddressIsRefusedBeforeAnyNetworkUse() {
    val e = assertThrows(LanOpenError::class.java) { get("http://8.8.8.8/") }
    assertEquals(ERR_NOT_LOCAL, e.code)
    val e2 = assertThrows(LanOpenError::class.java) { get("ftp://127.0.0.1/") }
    assertEquals(ERR_NOT_LOCAL, e2.code)
    val e3 = assertThrows(LanOpenError::class.java) { get("http://localhost/") }
    assertEquals(ERR_NOT_LOCAL, e3.code)
  }

  @Test
  fun pairingAcceptsAndReportsTheLeaf() {
    start(https = true)
    server.enqueue(MockResponse().setBody("ok"))
    val r = get(url("https"), pairing = true)
    assertEquals("ok", r.body)
    assertEquals(certSha(), r.certSha256)
  }

  @Test
  fun matchingPinIsAccepted() {
    start(https = true)
    server.enqueue(MockResponse().setBody("ok"))
    assertEquals(certSha(), get(url("https"), pin = certSha().uppercase()).certSha256)
  }

  @Test
  fun wrongPinIsAMismatch() {
    start(https = true)
    server.enqueue(MockResponse().setBody("ok"))
    val e = assertThrows(LanOpenError::class.java) { get(url("https"), pin = "00".repeat(32)) }
    assertEquals(ERR_PIN_MISMATCH, e.code)
  }

  @Test
  fun bodyOverMaxBytesFails() {
    start()
    server.enqueue(MockResponse().setBody("x".repeat(101)))
    val e = assertThrows(LanOpenError::class.java) { get(url(), maxBytes = 100) }
    assertEquals(ERR_OPEN_FAILED, e.code)
    server.enqueue(MockResponse().setBody("x".repeat(100)))
    assertEquals(100, get(url(), maxBytes = 100).body.length)
  }

  @Test
  fun refusedConnectionIsOpenFailed() {
    start()
    val u = url()
    server.shutdown()
    val e = assertThrows(LanOpenError::class.java) { get(u) }
    assertEquals(ERR_OPEN_FAILED, e.code)
  }
}

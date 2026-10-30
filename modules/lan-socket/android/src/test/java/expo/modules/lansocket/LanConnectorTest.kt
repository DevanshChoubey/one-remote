package expo.modules.lansocket

import java.net.InetAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class LanConnectorTest {
  private lateinit var server: MockWebServer
  private val connector = LanConnector()
  private val cert: HeldCertificate = HeldCertificate.Builder().commonName("LG TV").build()
  private val certSha = LeafPinTrust.sha256Hex(cert.certificate.encoded)

  private class Recorder : LanCallbacks {
    val settled = CountDownLatch(1)
    val gotMessage = CountDownLatch(1)
    val closed = CountDownLatch(1)
    @Volatile var opened = false
    @Volatile var cert: String? = null
    @Volatile var error: LanOpenError? = null
    @Volatile var message: String? = null
    @Volatile var closeError: String? = null

    override fun onOpen(certSha256: String?) {
      opened = true
      cert = certSha256
      settled.countDown()
    }

    override fun onOpenFailed(error: LanOpenError) {
      this.error = error
      settled.countDown()
    }

    override fun onMessage(text: String) {
      message = text
      gotMessage.countDown()
    }

    override fun onClosed(code: Int?, reason: String?, error: String?) {
      closeError = error
      closed.countDown()
    }

    fun await(): Recorder {
      assertTrue("open did not settle", settled.await(5, TimeUnit.SECONDS))
      return this
    }
  }

  /** Answers the upgrade and says hello. */
  private fun upgrade(): MockResponse =
    MockResponse()
      .withWebSocketUpgrade(
        object : WebSocketListener() {
          override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("hello")
          }
        }
      )

  @Before
  fun setUp() {
    server = MockWebServer()
  }

  @After
  fun tearDown() {
    try {
      server.shutdown()
    } catch (e: java.io.IOException) {
      // MockWebServer can time out draining a TLS WebSocket after a graceful close; the test
      // itself has already passed or failed by then.
    }
  }

  private fun startTls() {
    val handshake = HandshakeCertificates.Builder().heldCertificate(cert).build()
    server.useHttps(handshake.sslSocketFactory(), false)
    server.start(InetAddress.getByName("127.0.0.1"), 0)
  }

  private fun open(
    url: String,
    pin: String? = null,
    pairing: Boolean = false,
    probe: Boolean = false,
  ): Pair<LanHandle, Recorder> {
    val r = Recorder()
    return connector.open(url, pin, pairing, 3000, probe, r) to r
  }

  @Test
  fun plainWsOpensAndRelaysMessages() {
    server.enqueue(upgrade())
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    val (handle, r) = open("ws://127.0.0.1:${server.port}/")
    r.await()
    assertTrue(r.opened)
    assertNull(r.cert)
    assertTrue(r.gotMessage.await(5, TimeUnit.SECONDS))
    assertEquals("hello", r.message)
    assertTrue(handle.send("hi"))
    handle.close()
    assertFalse(handle.send("after close"))
  }

  @Test
  fun pairingAcceptsTheSelfSignedCertificateAndReportsTheLeafSha256() {
    startTls()
    server.enqueue(upgrade())
    val (handle, r) = open("wss://127.0.0.1:${server.port}/", pairing = true)
    r.await()
    assertNull(r.error?.message, r.error)
    assertTrue(r.opened)
    assertEquals(certSha, r.cert)
    handle.close()
  }

  @Test
  fun aMatchingPinIsAccepted() {
    startTls()
    server.enqueue(upgrade())
    val (handle, r) = open("wss://127.0.0.1:${server.port}/", pin = certSha.uppercase())
    r.await()
    assertTrue(r.error?.message ?: "", r.opened)
    assertEquals(certSha, r.cert)
    handle.close()
  }

  @Test
  fun aMismatchedPinIsRefusedBeforeTheUpgradeIsSent() {
    startTls()
    server.enqueue(upgrade())
    val (_, r) = open("wss://127.0.0.1:${server.port}/", pin = "00".repeat(32))
    r.await()
    assertFalse(r.opened)
    assertEquals(ERR_PIN_MISMATCH, r.error?.code)
    assertTrue(r.error?.message ?: "", r.error?.message?.contains("does not match") == true)
    assertEquals(0, server.requestCount)
  }

  @Test
  fun aRedirectOnTheUpgradeIsNotFollowed() {
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    server.enqueue(
      MockResponse().setResponseCode(302).setHeader("Location", "http://127.0.0.1:${server.port}/x")
    )
    server.enqueue(upgrade())
    val (_, r) = open("ws://127.0.0.1:${server.port}/")
    r.await()
    assertFalse(r.opened)
    assertEquals(ERR_OPEN_FAILED, r.error?.code)
    assertTrue(r.error?.message ?: "", r.error?.message?.contains("302") == true)
    assertEquals(1, server.requestCount)
  }

  @Test
  fun aRedirectIsNotFollowedInPairingModeEither() {
    startTls()
    server.enqueue(
      MockResponse()
        .setResponseCode(307)
        .setHeader("Location", "https://127.0.0.1:${server.port}/x")
    )
    server.enqueue(upgrade())
    val (_, r) = open("wss://127.0.0.1:${server.port}/", pairing = true)
    r.await()
    assertFalse(r.opened)
    assertEquals(1, server.requestCount)
  }

  @Test
  fun nonLocalHostsAndNamesAreRefusedWithoutAnyNetworkUse() {
    for (url in listOf(
      "ws://8.8.8.8:3000",
      "wss://[2001:4860::1]:3001",
      "ws://localhost:3000",
      "ws://example.com:3000",
      "ws://010.0.0.1:3000",
      "ws://192.168.1.5@8.8.8.8:3000",
      "http://192.168.1.5:3000",
      "not a url",
    )) {
      val e = assertThrows(url, LanOpenError::class.java) { open(url, pairing = true) }
      assertEquals(url, ERR_NOT_LOCAL, e.code)
    }
  }

  @Test
  fun wssWithNeitherPinNorPairingIsRefused() {
    val e = assertThrows(LanOpenError::class.java) { open("wss://192.168.1.5:3001") }
    assertEquals(ERR_NO_TRUST, e.code)
  }

  @Test
  fun aProbeOpensTheSameWay() {
    server.enqueue(upgrade())
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    val (handle, r) = open("ws://127.0.0.1:${server.port}/", probe = true)
    r.await()
    assertTrue(r.opened)
    handle.close()
  }

  @Test
  fun closingAPendingOpenCancelsIt() {
    // A listening socket that never answers the upgrade.
    server.enqueue(MockResponse().setHeadersDelay(10, TimeUnit.SECONDS))
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    val (handle, r) = open("ws://127.0.0.1:${server.port}/")
    handle.close()
    r.await()
    assertFalse(r.opened)
    assertEquals("Cancelled", r.error?.message)
  }

  @Test
  fun aRemoteCloseIsReported() {
    server.enqueue(
      MockResponse()
        .withWebSocketUpgrade(
          object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
              webSocket.close(1001, "bye")
            }
          }
        )
    )
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    val (_, r) = open("ws://127.0.0.1:${server.port}/")
    r.await()
    assertTrue(r.opened)
    assertTrue(r.closed.await(5, TimeUnit.SECONDS))
  }

  @Test
  fun theHostVerifierChecksTheHostAndThePin() {
    val target = InetAddress.getByName("192.168.1.5")
    val pairing = LanConnector.PinnedHostVerifier(target, null)
    assertTrue(pairing.verify("192.168.1.5", null))
    assertFalse(pairing.verify("192.168.1.6", null))
    assertFalse(pairing.verify("tv.local", null))
    assertFalse(pairing.verify(null, null))
    // Pinned with no session to read a leaf from: refused.
    val pinned = LanConnector.PinnedHostVerifier(target, certSha)
    assertFalse(pinned.verify("192.168.1.5", null))
    assertNotNull(pinned)
  }

  @Test
  fun neverConnectsToAnythingButTheCheckedLiteral() {
    // Nothing listens on this local port: the failure must come from the socket, not from a lookup.
    val (_, r) = open("ws://127.0.0.1:1/")
    r.await()
    assertFalse(r.opened)
    assertEquals(ERR_OPEN_FAILED, r.error?.code)
    if (r.error?.message?.contains("UnknownHost") == true) fail(r.error?.message)
  }
}

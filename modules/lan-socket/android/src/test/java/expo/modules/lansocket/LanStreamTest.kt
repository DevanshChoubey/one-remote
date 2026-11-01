package expo.modules.lansocket

import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.security.interfaces.RSAPublicKey
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LanStreamTest {
  private val cert: HeldCertificate =
    HeldCertificate.Builder().rsa2048().commonName("atvremote/AA:BB:CC:00:11:22").build()
  private val certSha = LeafPinTrust.sha256Hex(cert.certificate.encoded)
  private val connector = LanStreamConnector()
  private var server: SSLServerSocket? = null

  @After
  fun tearDown() {
    server?.close()
  }

  private class Recorder : LanStreamCallbacks {
    val settled = CountDownLatch(1)
    val closed = CountDownLatch(1)
    val closes = AtomicInteger(0)
    @Volatile var info: LanStreamInfo? = null
    @Volatile var error: LanOpenError? = null
    val data = ByteArrayOutputStream()

    override fun onOpen(info: LanStreamInfo) {
      this.info = info
      settled.countDown()
    }

    override fun onOpenFailed(error: LanOpenError) {
      this.error = error
      settled.countDown()
    }

    override fun onData(bytes: ByteArray) {
      synchronized(data) { data.write(bytes) }
    }

    override fun onClosed(error: String?) {
      closes.incrementAndGet()
      closed.countDown()
    }

    fun await(): Recorder {
      assertTrue("open did not settle", settled.await(5, TimeUnit.SECONDS))
      return this
    }

    fun received(): ByteArray = synchronized(data) { data.toByteArray() }
  }

  /** A TLS server on 127.0.0.1 with the self-signed [cert]; `serve` runs on each accepted socket. */
  private fun startServer(serve: (SSLSocket) -> Unit): Int {
    val handshake = HandshakeCertificates.Builder().heldCertificate(cert).build()
    val s =
      handshake.sslContext().serverSocketFactory.createServerSocket(
        0,
        8,
        InetAddress.getByName("127.0.0.1"),
      ) as SSLServerSocket
    server = s
    Thread {
        try {
          while (!s.isClosed) {
            val c = s.accept() as SSLSocket
            Thread {
                try {
                  serve(c)
                } catch (e: Exception) {
                  // the client went away
                }
              }
              .apply { isDaemon = true }
              .start()
          }
        } catch (e: Exception) {
          // server closed
        }
      }
      .apply { isDaemon = true }
      .start()
    return s.localPort
  }

  private fun open(
    port: Int,
    pin: String? = null,
    pairing: Boolean = false,
    identity: String? = null,
    host: String = "127.0.0.1",
    c: LanStreamConnector = connector,
  ): Pair<LanStreamHandle, Recorder> {
    val r = Recorder()
    return c.open(host, port, pin, pairing, identity, 3000, r) to r
  }

  /** Echoes every byte back until the client closes. */
  private val echo: (SSLSocket) -> Unit = { c ->
    c.startHandshake()
    val buf = ByteArray(4096)
    while (true) {
      val n = c.inputStream.read(buf)
      if (n < 0) break
      c.outputStream.write(buf, 0, n)
      c.outputStream.flush()
    }
    c.close()
  }

  @Test
  fun pairingReportsTheLeafSha256AndItsRsaKeyAndSubject() {
    val port = startServer(echo)
    val (handle, r) = open(port, pairing = true)
    r.await()
    assertNull(r.error?.message, r.error)
    val info = r.info!!
    val key = cert.certificate.publicKey as RSAPublicKey
    assertEquals(certSha, info.certSha256)
    assertEquals(key.modulus.toString(16).uppercase(), info.serverModulusHex)
    assertEquals("10001", info.serverExponentHex)
    assertFalse(info.serverModulusHex.startsWith("0"))
    assertEquals("CN=atvremote/AA:BB:CC:00:11:22", info.serverSubject)
    handle.close()
  }

  @Test
  fun aMatchingPinIsAccepted() {
    val port = startServer(echo)
    val (handle, r) = open(port, pin = certSha.uppercase())
    r.await()
    assertEquals(certSha, r.info?.certSha256)
    handle.close()
  }

  @Test
  fun aWrongPinIsRefusedWithPinMismatch() {
    val port = startServer(echo)
    val (_, r) = open(port, pin = "00".repeat(32))
    r.await()
    assertNull(r.info)
    assertEquals(ERR_PIN_MISMATCH, r.error?.code)
  }

  @Test
  fun bytesRoundTripInOrder() {
    val port = startServer(echo)
    val (handle, r) = open(port, pairing = true)
    r.await()
    val sent = ByteArray(50_000) { (it % 251).toByte() }
    for (i in sent.indices step 1000) {
      assertTrue(handle.write(sent.copyOfRange(i, minOf(i + 1000, sent.size))))
    }
    val deadline = System.currentTimeMillis() + 5000
    while (r.received().size < sent.size && System.currentTimeMillis() < deadline) {
      Thread.sleep(10)
    }
    assertArrayEquals(sent, r.received())
    handle.close()
    assertFalse(handle.write(byteArrayOf(1)))
    Thread.sleep(100)
    assertEquals("no close callback after our own close", 0, r.closes.get())
  }

  @Test
  fun theServerClosingMidWriteGivesExactlyOneCloseAndLaterWritesFail() {
    val port =
      startServer { c ->
        c.startHandshake()
        c.inputStream.read(ByteArray(10))
        c.close()
      }
    val (handle, r) = open(port, pairing = true)
    r.await()
    val chunk = ByteArray(64 * 1024)
    val deadline = System.currentTimeMillis() + 5000
    while (r.closed.count > 0 && System.currentTimeMillis() < deadline) {
      handle.write(chunk)
      Thread.sleep(5)
    }
    assertTrue("the close was not reported", r.closed.await(1, TimeUnit.SECONDS))
    Thread.sleep(200)
    assertEquals(1, r.closes.get())
    assertFalse(handle.write(chunk))
    handle.close()
    assertEquals(1, r.closes.get())
  }

  @Test
  fun nonLocalHostsAreRefusedBeforeDialling() {
    for (host in listOf("8.8.8.8", "2001:4860::1", "localhost", "tv.local", "010.0.0.1", "")) {
      val e = assertThrows(host, LanOpenError::class.java) { open(1, pairing = true, host = host) }
      assertEquals(host, ERR_NOT_LOCAL, e.code)
    }
  }

  @Test
  fun neitherPinNorPairingIsRefused() {
    val e = assertThrows(LanOpenError::class.java) { open(6467) }
    assertEquals(ERR_NO_TRUST, e.code)
  }

  @Test
  fun aMissingIdentityFailsCleanlyBeforeDialling() {
    val accepted = AtomicInteger(0)
    val port = startServer { accepted.incrementAndGet() }
    val none = LanStreamConnector(identities = { null })
    val e =
      assertThrows(LanOpenError::class.java) {
        open(port, pairing = true, identity = "androidtv:x", c = none)
      }
    assertEquals(ERR_OPEN_FAILED, e.code)
    assertTrue(e.message ?: "", e.message?.contains("androidtv:x") == true)
    // The real lookup (no AndroidKeyStore on the JVM) also fails cleanly.
    val real = assertThrows(LanOpenError::class.java) { open(port, pairing = true, identity = "x") }
    assertEquals(ERR_OPEN_FAILED, real.code)
    Thread.sleep(100)
    assertEquals(0, accepted.get())
  }

  @Test
  fun closingAPendingOpenCancelsIt() {
    // A TCP listener that never answers the TLS handshake.
    val silent = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    try {
      val (handle, r) = open(silent.localPort, pairing = true)
      handle.close()
      r.await()
      assertNull(r.info)
      assertEquals(ERR_OPEN_FAILED, r.error?.code)
      assertEquals("Cancelled", r.error?.message)
    } finally {
      silent.close()
    }
  }

  @Test
  fun aSilentServerTimesOut() {
    val silent = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    try {
      val r = Recorder()
      connector.open("127.0.0.1", silent.localPort, null, true, null, 300, r)
      r.await()
      assertEquals(ERR_OPEN_FAILED, r.error?.code)
    } finally {
      silent.close()
    }
  }

  @Test
  fun nothingListeningFailsWithOpenFailed() {
    val (_, r) = open(1, pairing = true)
    r.await()
    assertEquals(ERR_OPEN_FAILED, r.error?.code)
  }
}

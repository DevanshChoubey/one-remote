package expo.modules.lansocket

import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.KeyManager
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509KeyManager
import javax.security.auth.x500.X500Principal

/** What the open of a stream reports: the server's leaf certificate. */
internal data class LanStreamInfo(
  /** Lower-case hex. */
  val certSha256: String,
  /** RSA public key, upper-case hex without leading zeros; empty for a non-RSA key. */
  val serverModulusHex: String,
  val serverExponentHex: String,
  /** RFC 2253. */
  val serverSubject: String,
)

/** What one stream reports, on its own background thread. Exactly one of `onOpen` /
 *  `onOpenFailed`; after `onOpen`, `onData` in order and at most one `onClosed` (never after our own
 *  `close()`). */
internal interface LanStreamCallbacks {
  fun onOpen(info: LanStreamInfo)

  fun onOpenFailed(error: LanOpenError)

  fun onData(bytes: ByteArray)

  /** `error` is null for an orderly end of stream from the server. */
  fun onClosed(error: String?)
}

internal interface LanStreamHandle {
  /** Queues the bytes. False when the stream is not open (or has ended). */
  fun write(bytes: ByteArray): Boolean

  /** Closes, or cancels a pending open (which then fails with "Cancelled"). Idempotent. */
  fun close()
}

/** The prefix of the `AndroidKeyStore` alias (and iOS Keychain tag) of a client identity. */
internal const val IDENTITY_PREFIX = "lan-identity:"

/**
 * Pinned TLS byte streams to literal local IPs (see `modules/lan-socket/index.ts`). TLS only: the
 * server is trusted by [LeafPinTrust] (pairing or pin, never the system trust), the host name is
 * never verified (the TV is reached by IP), no proxy is used and only the checked literal is ever
 * dialled. With an `identity`, the client certificate held under `lan-identity:<ref>` is presented.
 * Kept free of Expo so it can be unit tested on the JVM.
 *
 * [identities] turns an identity ref into key managers, or null when there is no such identity.
 */
internal class LanStreamConnector(
  private val identities: (String) -> Array<KeyManager>? = ::androidKeyStoreIdentity,
) {
  private val readers: ExecutorService =
    Executors.newCachedThreadPool { r -> Thread(r, "lan-stream-read").apply { isDaemon = true } }

  /** Throws [LanOpenError] for a refused address, trust or identity; network failures go to `cb`. */
  fun open(
    host: String,
    port: Int,
    pinSha256: String?,
    pairing: Boolean,
    identity: String?,
    timeoutMs: Long,
    cb: LanStreamCallbacks,
  ): LanStreamHandle {
    val target =
      LocalHost.parseLocalLiteral(host)
        ?: throw LanOpenError(ERR_NOT_LOCAL, "Address is not a local IP literal")
    if (port !in 1..65535) throw LanOpenError(ERR_OPEN_FAILED, "Not a valid port: $port")
    val pin = pinSha256?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
    if (pin == null && !pairing) {
      throw LanOpenError(ERR_NO_TRUST, "A TLS stream needs a pinned certificate outside pairing")
    }
    val keys =
      identity?.let { ref ->
        val found =
          try {
            identities(ref)
          } catch (e: Exception) {
            throw LanOpenError(
              ERR_OPEN_FAILED,
              "Cannot read the client identity '$ref': ${LanConnector.describe(e, null)}",
            )
          }
        found ?: throw LanOpenError(ERR_OPEN_FAILED, "No client identity '$ref'")
      }
    val trust = LeafPinTrust(pin)
    val ctx = SSLContext.getInstance("TLS")
    ctx.init(keys, arrayOf(trust), null)
    val stream = Stream(ctx, trust, pin, target, port, timeoutMs.coerceIn(1L, 60_000L).toInt(), cb)
    try {
      readers.execute { stream.run() }
    } catch (e: RejectedExecutionException) {
      throw LanOpenError(ERR_OPEN_FAILED, "Cannot start the stream")
    }
    return stream
  }

  private class Stream(
    private val ctx: SSLContext,
    private val trust: LeafPinTrust,
    private val pin: String?,
    private val target: InetAddress,
    private val port: Int,
    private val timeoutMs: Int,
    private val cb: LanStreamCallbacks,
  ) : LanStreamHandle {
    @Volatile private var raw: Socket? = null
    @Volatile private var ssl: SSLSocket? = null
    @Volatile private var opened = false
    private val settled = AtomicBoolean(false)
    private val ended = AtomicBoolean(false)

    /** Writes run here, in order, so a slow TV never blocks the caller. */
    private val writer: ExecutorService =
      Executors.newSingleThreadExecutor { r ->
        Thread(r, "lan-stream-write").apply { isDaemon = true }
      }

    /** On a reader thread: dial, handshake, then read until the end. */
    fun run() {
      val tls: SSLSocket
      try {
        val s = Socket(Proxy.NO_PROXY)
        raw = s
        if (ended.get()) {
          // close() came first and has already failed the open.
          cleanup()
          return
        }
        s.connect(InetSocketAddress(target, port), timeoutMs)
        tls = ctx.socketFactory.createSocket(s, target.hostAddress, port, true) as SSLSocket
        ssl = tls
        tls.useClientMode = true
        tls.soTimeout = timeoutMs
        tls.startHandshake()
        val info = inspect(tls)
        tls.soTimeout = 0
        if (ended.get() || !settled.compareAndSet(false, true)) {
          cleanup()
          return
        }
        opened = true
        cb.onOpen(info)
      } catch (e: LanOpenError) {
        failOpen(e.code, e.message ?: e.code)
        return
      } catch (e: Exception) {
        val code = if (trust.mismatch) ERR_PIN_MISMATCH else ERR_OPEN_FAILED
        failOpen(code, LanConnector.describe(e, null))
        return
      }
      read(tls)
    }

    /** The leaf the session ended up with. With a pin it is checked again here, independently of
     *  [trust]. */
    private fun inspect(tls: SSLSocket): LanStreamInfo {
      val leaf =
        tls.session.peerCertificates.firstOrNull() as? X509Certificate
          ?: throw IllegalStateException("The server sent no certificate")
      val sha = LeafPinTrust.sha256Hex(leaf.encoded)
      if (pin != null && !MessageDigest.isEqual(sha.toByteArray(), pin.toByteArray())) {
        throw LanOpenError(
          ERR_PIN_MISMATCH,
          "The TV's certificate does not match the one seen at pairing",
        )
      }
      val rsa = leaf.publicKey as? RSAPublicKey
      return LanStreamInfo(
        certSha256 = sha,
        serverModulusHex = rsa?.modulus?.toString(16)?.uppercase() ?: "",
        serverExponentHex = rsa?.publicExponent?.toString(16)?.uppercase() ?: "",
        serverSubject = leaf.subjectX500Principal.getName(X500Principal.RFC2253),
      )
    }

    private fun read(tls: SSLSocket) {
      try {
        val input = tls.inputStream
        val buf = ByteArray(16 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          if (n > 0 && !ended.get()) cb.onData(buf.copyOf(n))
        }
        end(null)
      } catch (e: Exception) {
        end(LanConnector.describe(e, null))
      }
    }

    override fun write(bytes: ByteArray): Boolean {
      val tls = ssl
      if (!opened || ended.get() || tls == null) return false
      return try {
        writer.execute {
          if (ended.get()) return@execute
          try {
            tls.outputStream.write(bytes)
            tls.outputStream.flush()
          } catch (e: Exception) {
            end(LanConnector.describe(e, null))
          }
        }
        true
      } catch (e: RejectedExecutionException) {
        false
      }
    }

    override fun close() {
      if (!ended.compareAndSet(false, true)) return
      if (settled.compareAndSet(false, true)) {
        cb.onOpenFailed(LanOpenError(ERR_OPEN_FAILED, "Cancelled"))
      }
      cleanup()
    }

    private fun failOpen(code: String, why: String) {
      if (settled.compareAndSet(false, true)) {
        ended.set(true)
        cb.onOpenFailed(LanOpenError(code, why))
      }
      cleanup()
    }

    /** The end of an open stream: reported once, and never after our own close(). */
    private fun end(error: String?) {
      if (ended.compareAndSet(false, true)) cb.onClosed(error)
      cleanup()
    }

    private fun cleanup() {
      writer.shutdown()
      try {
        ssl?.close()
      } catch (e: Exception) {
        // already closed
      }
      try {
        raw?.close()
      } catch (e: Exception) {
        // already closed
      }
    }
  }
}

/** The key manager of the `AndroidKeyStore` entry `lan-identity:<ref>`, or null when absent. */
internal fun androidKeyStoreIdentity(ref: String): Array<KeyManager>? {
  val alias = IDENTITY_PREFIX + ref
  val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  val entry = store.getEntry(alias, null) as? KeyStore.PrivateKeyEntry ?: return null
  val chain = entry.certificateChain.map { it as X509Certificate }.toTypedArray()
  if (chain.isEmpty()) return null
  return arrayOf(SingleIdentity(alias, entry.privateKey, chain))
}

/** Presents one client identity, whatever the server asks for. */
internal class SingleIdentity(
  private val alias: String,
  private val key: PrivateKey,
  private val chain: Array<X509Certificate>,
) : X509KeyManager {
  override fun chooseClientAlias(
    keyType: Array<out String>?,
    issuers: Array<out Principal>?,
    socket: Socket?,
  ): String = alias

  override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?): Array<String> =
    arrayOf(alias)

  override fun getCertificateChain(alias: String?): Array<X509Certificate>? =
    if (alias == this.alias) chain else null

  override fun getPrivateKey(alias: String?): PrivateKey? = if (alias == this.alias) key else null

  override fun chooseServerAlias(
    keyType: String?,
    issuers: Array<out Principal>?,
    socket: Socket?,
  ): String? = null

  override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? =
    null
}

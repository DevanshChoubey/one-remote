package expo.modules.lansocket

import java.net.InetAddress
import java.net.Proxy
import java.net.URI
import java.net.UnknownHostException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSession
import okhttp3.Dispatcher
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

internal const val ERR_NOT_LOCAL = "ERR_LAN_NOT_LOCAL"
internal const val ERR_NO_TRUST = "ERR_LAN_NO_TRUST"
internal const val ERR_PIN_MISMATCH = "ERR_LAN_PIN_MISMATCH"
internal const val ERR_OPEN_FAILED = "ERR_LAN_OPEN_FAILED"

/** An open refused before any network use, or a failed open. */
internal class LanOpenError(val code: String, message: String) : Exception(message)

/** What one socket reports. Called on OkHttp threads. Exactly one of `onOpen` / `onOpenFailed`;
 *  after `onOpen`, at most one `onClosed` (never after our own `close()`). */
internal interface LanCallbacks {
  fun onOpen(certSha256: String?)

  fun onOpenFailed(error: LanOpenError)

  fun onMessage(text: String)

  fun onClosed(code: Int?, reason: String?, error: String?)
}

internal interface LanHandle {
  /** False when the socket is not open (or the write was refused). */
  fun send(text: String): Boolean

  /** Closes, or cancels a pending open (which then fails with "Cancelled"). Idempotent. */
  fun close()
}

/**
 * Opens WebSockets to literal local IPs (see `modules/lan-socket/index.ts` for the contract). Kept
 * free of Expo so it can be unit tested on the JVM. Every socket gets its own client from [base]
 * with: no redirects, no proxy, a DNS that only ever returns the checked literal, and, for wss, a
 * per-socket trust manager and host-name verifier. The app's default TLS trust is never changed.
 */
internal class LanConnector(base: OkHttpClient = OkHttpClient()) {
  /** Real connects. Probes have their own, so a subnet sweep cannot queue them behind it. */
  private val main: OkHttpClient =
    base.newBuilder().dispatcher(Dispatcher().apply { maxRequests = 64; maxRequestsPerHost = 8 }).build()
  private val probes: OkHttpClient =
    base.newBuilder().dispatcher(Dispatcher().apply { maxRequests = 64; maxRequestsPerHost = 2 }).build()

  /** Throws [LanOpenError] for a refused address or trust; network failures go to `cb`. */
  fun open(
    url: String,
    pinSha256: String?,
    pairing: Boolean,
    timeoutMs: Long,
    probe: Boolean,
    cb: LanCallbacks,
  ): LanHandle {
    val uri =
      try {
        URI(url)
      } catch (e: Exception) {
        throw LanOpenError(ERR_NOT_LOCAL, "Not a valid address: ${e.message}")
      }
    val scheme = uri.scheme?.lowercase()
    val host = uri.host
    if ((scheme != "ws" && scheme != "wss") || host == null || uri.rawUserInfo != null) {
      throw LanOpenError(ERR_NOT_LOCAL, "Not a plain ws:// or wss:// address")
    }
    val target =
      LocalHost.parseLocalLiteral(host)
        ?: throw LanOpenError(ERR_NOT_LOCAL, "Address is not a local IP literal")
    val secure = scheme == "wss"
    val pin = pinSha256?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
    if (secure && pin == null && !pairing) {
      throw LanOpenError(ERR_NO_TRUST, "wss needs a pinned certificate outside pairing")
    }
    val request =
      try {
        Request.Builder().url(url).build()
      } catch (e: Exception) {
        throw LanOpenError(ERR_NOT_LOCAL, "Not a valid address: ${e.message}")
      }

    val ms = timeoutMs.coerceIn(1L, 60_000L)
    val builder =
      (if (probe) probes else main)
        .newBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .proxy(Proxy.NO_PROXY)
        .dns(OnlyAddress(target))
        .connectTimeout(ms, TimeUnit.MILLISECONDS)
        // Covers connect, TLS and the upgrade; OkHttp lifts it once the socket is open.
        .callTimeout(ms, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
    var trust: LeafPinTrust? = null
    if (secure) {
      val t = LeafPinTrust(pin)
      val ctx = SSLContext.getInstance("TLS")
      ctx.init(null, arrayOf(t), null)
      builder.sslSocketFactory(ctx.socketFactory, t).hostnameVerifier(PinnedHostVerifier(target, pin))
      trust = t
    }
    val socket = Socket(trust, cb)
    socket.ws = builder.build().newWebSocket(request, socket)
    return socket
  }

  private class Socket(private val trust: LeafPinTrust?, private val cb: LanCallbacks) :
    WebSocketListener(), LanHandle {
    @Volatile var ws: WebSocket? = null
    @Volatile private var opened = false
    private val settled = AtomicBoolean(false)
    private val ended = AtomicBoolean(false)

    override fun send(text: String): Boolean {
      val w = ws
      return opened && !ended.get() && w != null && w.send(text)
    }

    override fun close() {
      if (!ended.compareAndSet(false, true)) return
      if (opened) {
        ws?.close(1000, null)
      } else {
        ws?.cancel()
        if (settled.compareAndSet(false, true)) {
          cb.onOpenFailed(LanOpenError(ERR_OPEN_FAILED, "Cancelled"))
        }
      }
    }

    override fun onOpen(webSocket: WebSocket, response: Response) {
      if (ended.get() || !settled.compareAndSet(false, true)) {
        webSocket.cancel()
        return
      }
      opened = true
      cb.onOpen(trust?.seenSha256)
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (!ended.get()) cb.onMessage(text)
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(1000, null)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      end(code, reason, null, "Closed by the TV ($code)")
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      val why = describe(t, response)
      end(null, null, why, why)
    }

    private fun end(code: Int?, reason: String?, error: String?, why: String) {
      if (settled.compareAndSet(false, true)) {
        ended.set(true)
        val c = if (trust?.mismatch == true) ERR_PIN_MISMATCH else ERR_OPEN_FAILED
        cb.onOpenFailed(LanOpenError(c, why))
        return
      }
      if (ended.compareAndSet(false, true)) cb.onClosed(code, reason, error)
    }
  }

  /** DNS that can only answer with the address that passed the local check. */
  internal class OnlyAddress(private val target: InetAddress) : Dns {
    override fun lookup(hostname: String): List<InetAddress> {
      val asked = LocalHost.parseLiteral(hostname)
      if (asked == target) return listOf(target)
      throw UnknownHostException("Only $target may be reached by this socket")
    }
  }

  /**
   * The host must be the literal the socket was opened for; with a pin, the peer's leaf must also
   * hash to it (a second check, independent of the trust manager). Pairing: host check only.
   */
  internal class PinnedHostVerifier(private val target: InetAddress, private val pin: String?) :
    HostnameVerifier {
    override fun verify(hostname: String?, session: SSLSession?): Boolean {
      if (hostname == null || LocalHost.parseLiteral(hostname) != target) return false
      if (pin == null) return true
      val leaf =
        try {
          session?.peerCertificates?.firstOrNull()
        } catch (e: Exception) {
          null
        } ?: return false
      return MessageDigest.isEqual(
        LeafPinTrust.sha256Hex(leaf.encoded).toByteArray(),
        pin.toByteArray(),
      )
    }
  }

  companion object {
    fun describe(t: Throwable, response: Response?): String {
      val parts = mutableListOf<String>()
      if (response != null) parts.add("HTTP ${response.code} ${response.message}".trim())
      var cur: Throwable? = t
      var depth = 0
      while (cur != null && depth < 4) {
        parts.add("${cur.javaClass.simpleName}: ${cur.message ?: "no message"}")
        cur = cur.cause.takeIf { it !== cur }
        depth += 1
      }
      return parts.joinToString(" <- ")
    }
  }
}

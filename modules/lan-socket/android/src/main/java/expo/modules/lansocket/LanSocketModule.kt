package expo.modules.lansocket

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class OpenOptions : Record {
  @Field var pinSha256: String? = null
  @Field var pairing: Boolean = false
  @Field var timeoutMs: Double = 3000.0
}

private const val ERR_NOT_LOCAL = "ERR_LAN_NOT_LOCAL"
private const val ERR_NO_TRUST = "ERR_LAN_NO_TRUST"
private const val ERR_PIN_MISMATCH = "ERR_LAN_PIN_MISMATCH"
private const val ERR_OPEN_FAILED = "ERR_LAN_OPEN_FAILED"

private class LanException(code: String, message: String) : CodedException(code, message, null)

private class Entry(val promise: Promise, val trust: LeafPinTrust?) {
  @Volatile var socket: WebSocket? = null
  @Volatile var opened = false
  val settled = AtomicBoolean(false)
  val ended = AtomicBoolean(false)
}

/** WebSockets to literal local IPs; see modules/lan-socket/index.ts for the contract. */
class LanSocketModule : Module() {
  private val sockets = ConcurrentHashMap<String, Entry>()

  /** Our own client: React Native's shared client and the default TLS trust stay untouched. */
  private val base: OkHttpClient by lazy { OkHttpClient() }

  override fun definition() = ModuleDefinition {
    Name("LanSocket")

    Events("message", "close")

    AsyncFunction("open") { id: String, url: String, opts: OpenOptions, promise: Promise ->
      open(id, url, opts, promise)
    }

    Function("send") { id: String, text: String ->
      val entry = sockets[id]
      val ws = entry?.socket
      if (entry == null || ws == null || !entry.opened || !ws.send(text)) {
        throw LanException(ERR_OPEN_FAILED, "The socket is not open")
      }
    }

    Function("close") { id: String -> closeByUs(id) }

    OnDestroy { sockets.keys.toList().forEach { closeByUs(it) } }
  }

  private fun open(id: String, url: String, opts: OpenOptions, promise: Promise) {
    val uri =
      try {
        URI(url)
      } catch (e: Exception) {
        promise.reject(LanException(ERR_NOT_LOCAL, "Not a valid address: ${e.message}"))
        return
      }
    val scheme = uri.scheme?.lowercase()
    val host = uri.host
    if ((scheme != "ws" && scheme != "wss") || host == null || uri.rawUserInfo != null) {
      promise.reject(LanException(ERR_NOT_LOCAL, "Not a plain ws:// or wss:// address"))
      return
    }
    if (!LocalHost.isLocalLiteral(host)) {
      promise.reject(LanException(ERR_NOT_LOCAL, "Address is not a local IP"))
      return
    }
    val secure = scheme == "wss"
    val pin = opts.pinSha256?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
    if (secure && pin == null && !opts.pairing) {
      promise.reject(LanException(ERR_NO_TRUST, "wss needs a pinned certificate outside pairing"))
      return
    }
    if (sockets.containsKey(id)) {
      promise.reject(LanException(ERR_OPEN_FAILED, "Socket id already in use"))
      return
    }

    val timeoutMs = opts.timeoutMs.toLong().coerceIn(1L, 60_000L)
    val builder =
      base
        .newBuilder()
        .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
        // Covers connect, TLS and the upgrade; OkHttp lifts it once the socket is open.
        .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
    var trust: LeafPinTrust? = null
    if (secure) {
      val t = LeafPinTrust(pin)
      val ctx = SSLContext.getInstance("TLS")
      ctx.init(null, arrayOf(t), null)
      // Host name checks are off only here: this socket's identity is the pinned certificate.
      builder.sslSocketFactory(ctx.socketFactory, t).hostnameVerifier { _, _ -> true }
      trust = t
    }
    val entry = Entry(promise, trust)
    sockets[id] = entry
    val request =
      try {
        Request.Builder().url(url).build()
      } catch (e: Exception) {
        sockets.remove(id)
        promise.reject(LanException(ERR_NOT_LOCAL, "Not a valid address: ${e.message}"))
        return
      }
    entry.socket = builder.build().newWebSocket(request, Listener(id, entry))
  }

  private fun closeByUs(id: String) {
    val entry = sockets.remove(id) ?: return
    entry.ended.set(true)
    if (entry.opened) {
      entry.socket?.close(1000, null)
    } else {
      entry.socket?.cancel()
      if (entry.settled.compareAndSet(false, true)) {
        entry.promise.reject(LanException(ERR_OPEN_FAILED, "Cancelled"))
      }
    }
  }

  private inner class Listener(private val id: String, private val entry: Entry) :
    WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      if (!entry.settled.compareAndSet(false, true)) {
        webSocket.cancel()
        return
      }
      entry.opened = true
      val result = mutableMapOf<String, Any?>()
      entry.trust?.seenSha256?.let { result["certSha256"] = it }
      entry.promise.resolve(result)
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (entry.ended.get()) return
      sendEvent("message", mapOf("id" to id, "data" to text))
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(1000, null)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      end(mapOf("id" to id, "code" to code, "reason" to reason), "Closed by the TV ($code)")
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      val why = describe(t, response)
      end(mapOf("id" to id, "error" to why), why)
    }

    private fun end(event: Map<String, Any?>, why: String) {
      sockets.remove(id, entry)
      if (entry.settled.compareAndSet(false, true)) {
        val code = if (entry.trust?.mismatch == true) ERR_PIN_MISMATCH else ERR_OPEN_FAILED
        entry.promise.reject(LanException(code, why))
        return
      }
      if (entry.ended.compareAndSet(false, true)) sendEvent("close", event)
    }
  }

  private fun describe(t: Throwable, response: Response?): String {
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

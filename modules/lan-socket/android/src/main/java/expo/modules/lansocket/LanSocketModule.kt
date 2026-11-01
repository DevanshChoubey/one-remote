package expo.modules.lansocket

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class OpenOptions : Record {
  @Field var pinSha256: String? = null
  @Field var pairing: Boolean = false
  @Field var probe: Boolean = false
  @Field var timeoutMs: Double = 3000.0
}

private class LanException(code: String, message: String) : CodedException(code, message, null)

/** WebSockets to literal local IPs; see modules/lan-socket/index.ts for the contract. The network
 *  work is in [LanConnector]; this class only bridges it to JS. */
class LanSocketModule : Module() {
  private val sockets = ConcurrentHashMap<String, LanHandle>()

  /** Our own clients: React Native's shared client and the default TLS trust stay untouched. */
  private val connector: LanConnector by lazy { LanConnector() }

  override fun definition() = ModuleDefinition {
    Name("LanSocket")

    Events("message", "close")

    AsyncFunction("open") { id: String, url: String, opts: OpenOptions, promise: Promise ->
      open(id, url, opts, promise)
    }

    Function("send") { id: String, text: String ->
      if (sockets[id]?.send(text) != true) {
        throw LanException(ERR_OPEN_FAILED, "The socket is not open")
      }
    }

    Function("close") { id: String -> sockets.remove(id)?.close() }

    OnDestroy { sockets.keys.toList().forEach { sockets.remove(it)?.close() } }
  }

  private fun open(id: String, url: String, opts: OpenOptions, promise: Promise) {
    if (sockets.containsKey(id)) {
      promise.reject(LanException(ERR_OPEN_FAILED, "Socket id already in use"))
      return
    }
    // A failure can arrive (on an OkHttp thread) before the handle is stored below.
    val finished = AtomicBoolean(false)
    val cb =
      object : LanCallbacks {
        override fun onOpen(certSha256: String?) {
          val result = mutableMapOf<String, Any?>()
          certSha256?.let { result["certSha256"] = it }
          promise.resolve(result)
        }

        override fun onOpenFailed(error: LanOpenError) {
          finished.set(true)
          sockets.remove(id)
          promise.reject(LanException(error.code, error.message ?: error.code))
        }

        override fun onMessage(text: String) {
          sendEvent("message", mapOf("id" to id, "data" to text))
        }

        override fun onClosed(code: Int?, reason: String?, error: String?) {
          finished.set(true)
          sockets.remove(id)
          val event = mutableMapOf<String, Any?>("id" to id)
          code?.let { event["code"] = it }
          reason?.let { event["reason"] = it }
          error?.let { event["error"] = it }
          sendEvent("close", event)
        }
      }
    try {
      sockets[id] =
        connector.open(
          url,
          opts.pinSha256,
          opts.pairing,
          opts.timeoutMs.toLong(),
          opts.probe,
          cb,
        )
      if (finished.get()) sockets.remove(id)
    } catch (e: LanOpenError) {
      promise.reject(LanException(e.code, e.message ?: e.code))
    }
  }
}

package expo.modules.lansocket

import android.content.Context
import android.net.nsd.NsdManager
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class OpenOptions : Record {
  @Field var pinSha256: String? = null
  @Field var pairing: Boolean = false
  @Field var probe: Boolean = false
  @Field var timeoutMs: Double = 3000.0
}

class StreamOptions : Record {
  @Field var pinSha256: String? = null
  @Field var pairing: Boolean = false
  @Field var identity: String? = null
  @Field var timeoutMs: Double = 3000.0
}

class RequestOptions : Record {
  @Field var method: String = "GET"
  @Field var url: String = ""
  @Field var headers: Map<String, String>? = null
  @Field var body: String? = null
  @Field var pinSha256: String? = null
  @Field var pairing: Boolean = false
  @Field var timeoutMs: Double = 3000.0
  @Field var maxBytes: Double = 262144.0
}

private class LanException(code: String, message: String) : CodedException(code, message, null)

/** WebSockets and TLS byte streams to literal local IPs; see modules/lan-socket/index.ts for the
 *  contract. The network work is in [LanConnector] and [LanStreamConnector]; this class only bridges
 *  them to JS. Sockets and streams share one id space and `close(id)`. */
class LanSocketModule : Module() {
  private val sockets = ConcurrentHashMap<String, LanHandle>()
  private val streams = ConcurrentHashMap<String, LanStreamHandle>()
  private val browses = ConcurrentHashMap<String, LanBrowse>()

  /** Our own clients: React Native's shared client and the default TLS trust stay untouched. */
  private val connector: LanConnector by lazy { LanConnector() }
  private val streamConnector: LanStreamConnector by lazy { LanStreamConnector() }
  private val requestClient: LanRequestClient by lazy { LanRequestClient() }
  private val identities: LanIdentities by lazy { LanIdentities(AndroidKeyStoreIdentityStore()) }

  /** One-shot requests block until the response is read, so they run off the module thread. */
  private val requestPool by lazy { Executors.newCachedThreadPool() }

  override fun definition() = ModuleDefinition {
    Name("LanSocket")

    Events("message", "data", "close", "service")

    AsyncFunction("open") { id: String, url: String, opts: OpenOptions, promise: Promise ->
      open(id, url, opts, promise)
    }

    Function("send") { id: String, text: String ->
      if (sockets[id]?.send(text) != true) {
        throw LanException(ERR_OPEN_FAILED, "The socket is not open")
      }
    }

    AsyncFunction("openStream") {
      id: String,
      host: String,
      port: Int,
      opts: StreamOptions,
      promise: Promise ->
      openStream(id, host, port, opts, promise)
    }

    Function("write") { id: String, base64: String ->
      val bytes =
        try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          throw LanException(ERR_OPEN_FAILED, "Not valid base64")
        }
      if (streams[id]?.write(bytes) != true) {
        throw LanException(ERR_OPEN_FAILED, "The stream is not open")
      }
    }

    // Key generation can take seconds; AsyncFunction bodies run off the main thread.
    AsyncFunction("ensureIdentity") { ref: String, commonName: String ->
      try {
        val id = identities.ensure(ref, commonName)
        mapOf("modulusHex" to id.modulusHex, "exponentHex" to id.exponentHex)
      } catch (e: LanOpenError) {
        throw LanException(e.code, e.message ?: e.code)
      }
    }

    AsyncFunction("deleteIdentity") { ref: String ->
      try {
        identities.delete(ref)
      } catch (e: LanOpenError) {
        throw LanException(e.code, e.message ?: e.code)
      }
    }

    AsyncFunction("request") { opts: RequestOptions, promise: Promise ->
      request(opts, promise)
    }

    AsyncFunction("probeTcp") { host: String, port: Int, timeoutMs: Double, promise: Promise ->
      probeTcp(host, port, timeoutMs, promise)
    }

    Function("browse") { id: String, serviceType: String -> browse(id, serviceType) }

    Function("stopBrowse") { id: String -> browses.remove(id)?.stop() }

    Function("close") { id: String ->
      sockets.remove(id)?.close()
      streams.remove(id)?.close()
    }

    OnDestroy {
      sockets.keys.toList().forEach { sockets.remove(it)?.close() }
      streams.keys.toList().forEach { streams.remove(it)?.close() }
      browses.keys.toList().forEach { browses.remove(it)?.stop() }
      requestPool.shutdownNow()
    }
  }

  /** Never throws: with no NsdManager or a failing platform the browse just finds nothing. */
  private fun browse(id: String, serviceType: String) {
    val nsd =
      appContext.reactContext?.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return
    val browse =
      LanBrowse(nsd, serviceType) { s ->
        sendEvent(
          "service",
          mapOf("id" to id, "name" to s.name, "host" to s.host, "port" to s.port, "txt" to s.txt),
        )
      }
    browses.put(id, browse)?.stop()
    browse.start()
  }

  /** Blocks on the connect, so it runs off the module thread like [request]. */
  private fun probeTcp(host: String, port: Int, timeoutMs: Double, promise: Promise) {
    try {
      requestPool.execute {
        try {
          promise.resolve(LanTcpProbe.probe(host, port, timeoutMs.toLong()))
        } catch (e: LanOpenError) {
          promise.reject(LanException(e.code, e.message ?: e.code))
        } catch (e: Exception) {
          promise.reject(LanException(ERR_OPEN_FAILED, e.message ?: "Probe failed"))
        }
      }
    } catch (e: java.util.concurrent.RejectedExecutionException) {
      promise.reject(LanException(ERR_OPEN_FAILED, "The module is shutting down"))
    }
  }

  private fun request(opts: RequestOptions, promise: Promise) {
    try {
      requestPool.execute {
        try {
          val r =
            requestClient.execute(
              opts.method,
              opts.url,
              opts.headers ?: emptyMap(),
              opts.body,
              opts.pinSha256,
              opts.pairing,
              opts.timeoutMs.toLong(),
              opts.maxBytes.toLong(),
            )
          val result = mutableMapOf<String, Any?>(
            "status" to r.status,
            "headers" to r.headers,
            "body" to r.body,
          )
          r.certSha256?.let { result["certSha256"] = it }
          promise.resolve(result)
        } catch (e: LanOpenError) {
          promise.reject(LanException(e.code, e.message ?: e.code))
        } catch (e: Exception) {
          promise.reject(LanException(ERR_OPEN_FAILED, e.message ?: "Request failed"))
        }
      }
    } catch (e: java.util.concurrent.RejectedExecutionException) {
      promise.reject(LanException(ERR_OPEN_FAILED, "The module is shutting down"))
    }
  }

  private fun idInUse(id: String): Boolean = sockets.containsKey(id) || streams.containsKey(id)

  private fun openStream(
    id: String,
    host: String,
    port: Int,
    opts: StreamOptions,
    promise: Promise,
  ) {
    if (idInUse(id)) {
      promise.reject(LanException(ERR_OPEN_FAILED, "Socket id already in use"))
      return
    }
    // A failure can arrive (on a reader thread) before the handle is stored below.
    val finished = AtomicBoolean(false)
    val cb =
      object : LanStreamCallbacks {
        override fun onOpen(info: LanStreamInfo) {
          promise.resolve(
            mapOf(
              "certSha256" to info.certSha256,
              "serverModulusHex" to info.serverModulusHex,
              "serverExponentHex" to info.serverExponentHex,
              "serverSubject" to info.serverSubject,
            )
          )
        }

        override fun onOpenFailed(error: LanOpenError) {
          finished.set(true)
          streams.remove(id)
          promise.reject(LanException(error.code, error.message ?: error.code))
        }

        override fun onData(bytes: ByteArray) {
          val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
          sendEvent("data", mapOf("id" to id, "base64" to base64))
        }

        override fun onClosed(error: String?) {
          finished.set(true)
          streams.remove(id)
          val event = mutableMapOf<String, Any?>("id" to id)
          if (error != null) event["error"] = error else event["reason"] = "Closed by the TV"
          sendEvent("close", event)
        }
      }
    try {
      streams[id] =
        streamConnector.open(
          host,
          port,
          opts.pinSha256,
          opts.pairing,
          opts.identity,
          opts.timeoutMs.toLong(),
          cb,
        )
      if (finished.get()) streams.remove(id)
    } catch (e: LanOpenError) {
      promise.reject(LanException(e.code, e.message ?: e.code))
    }
  }

  private fun open(id: String, url: String, opts: OpenOptions, promise: Promise) {
    if (idInUse(id)) {
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

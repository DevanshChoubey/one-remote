package expo.modules.lansocket

import java.net.Proxy
import java.net.URI
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

internal class LanResponseData(
  val status: Int,
  /** Lower-case names; repeated headers are joined with ", ". */
  val headers: Map<String, String>,
  val body: String,
  val certSha256: String?,
)

/**
 * One-shot HTTP(S) requests to literal local IPs (see `modules/lan-socket/index.ts`). Free of Expo
 * so it can be unit tested on the JVM. Every request gets its own client with: no redirects, no
 * proxy, no cookies, no connection reuse, a DNS that only ever returns the checked literal, and,
 * for https, the same per-request leaf-pin trust and host check as [LanConnector].
 */
internal class LanRequestClient(private val base: OkHttpClient = OkHttpClient()) {
  /** Blocks until the response is read. Throws [LanOpenError] for a refusal or any failure. */
  fun execute(
    method: String,
    url: String,
    headers: Map<String, String>,
    body: String?,
    pinSha256: String?,
    pairing: Boolean,
    timeoutMs: Long,
    maxBytes: Long,
  ): LanResponseData {
    val uri =
      try {
        URI(url)
      } catch (e: Exception) {
        throw LanOpenError(ERR_NOT_LOCAL, "Not a valid address: ${e.message}")
      }
    val scheme = uri.scheme?.lowercase()
    val host = uri.host
    if ((scheme != "http" && scheme != "https") || host == null || uri.rawUserInfo != null) {
      throw LanOpenError(ERR_NOT_LOCAL, "Not a plain http:// or https:// address")
    }
    val target =
      LocalHost.parseLocalLiteral(host)
        ?: throw LanOpenError(ERR_NOT_LOCAL, "Address is not a local IP literal")
    val secure = scheme == "https"
    val pin = pinSha256?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
    if (secure && pin == null && !pairing) {
      throw LanOpenError(ERR_NO_TRUST, "https needs a pinned certificate outside pairing")
    }
    if (method != "GET" && method != "POST" && method != "PUT") {
      throw LanOpenError(ERR_OPEN_FAILED, "Unsupported method $method")
    }
    val request =
      try {
        val b = Request.Builder().url(url)
        headers.forEach { (k, v) -> b.header(k, v) }
        val type = headers.entries.firstOrNull { it.key.equals("content-type", true) }?.value
        val payload = body?.toRequestBody(type?.toMediaTypeOrNull())
        b.method(method, payload ?: if (method == "GET") null else "".toRequestBody(null))
        b.build()
      } catch (e: Exception) {
        throw LanOpenError(ERR_OPEN_FAILED, "Not a valid request: ${e.message}")
      }

    val limit = maxBytes.coerceIn(0L, MAX_BODY_BYTES)
    val ms = timeoutMs.coerceIn(1L, 60_000L)
    val builder =
      base
        .newBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .proxy(Proxy.NO_PROXY)
        .dns(LanConnector.OnlyAddress(target))
        .connectionPool(ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(ms, TimeUnit.MILLISECONDS)
        .readTimeout(ms, TimeUnit.MILLISECONDS)
        .writeTimeout(ms, TimeUnit.MILLISECONDS)
        .callTimeout(ms, TimeUnit.MILLISECONDS)
    var trust: LeafPinTrust? = null
    if (secure) {
      val t = LeafPinTrust(pin)
      val ctx = SSLContext.getInstance("TLS")
      ctx.init(null, arrayOf(t), null)
      builder
        .sslSocketFactory(ctx.socketFactory, t)
        .hostnameVerifier(LanConnector.PinnedHostVerifier(target, pin))
      trust = t
    }
    try {
      builder.build().newCall(request).execute().use { response ->
        val source = response.body!!.source()
        // Read one byte past the limit to tell "exactly maxBytes" from "too large".
        if (source.request(limit + 1)) throw LanOpenError(ERR_OPEN_FAILED, "The response is larger than $limit bytes")
        val text = source.readUtf8()
        val out = linkedMapOf<String, String>()
        for (name in response.headers.names()) {
          out[name.lowercase()] = response.headers.values(name).joinToString(", ")
        }
        return LanResponseData(response.code, out, text, trust?.seenSha256)
      }
    } catch (e: LanOpenError) {
      throw e
    } catch (e: Exception) {
      val code = if (trust?.mismatch == true) ERR_PIN_MISMATCH else ERR_OPEN_FAILED
      throw LanOpenError(code, LanConnector.describe(e, null))
    }
  }
}

/** The most `maxBytes` may ask for; the same limit as iOS and the JS check. */
internal const val MAX_BODY_BYTES = 64L * 1024 * 1024

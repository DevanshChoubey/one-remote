package expo.modules.lansocket

import java.net.InetSocketAddress
import java.net.Proxy
import java.net.Socket

/**
 * A plain TCP connect to a literal local IP, for discovery sweeps: true when the port accepts the
 * connection, false when it is refused, closed or silent. Nothing is sent. The address is checked
 * with [LocalHost.parseLocalLiteral] first and no proxy is used.
 */
internal object LanTcpProbe {
  /** Blocks for up to [timeoutMs]. Throws [LanOpenError] `ERR_LAN_NOT_LOCAL` before connecting. */
  fun probe(host: String, port: Int, timeoutMs: Long): Boolean {
    val address =
      LocalHost.parseLocalLiteral(host)
        ?: throw LanOpenError(ERR_NOT_LOCAL, "Address is not a local IP")
    if (port !in 1..65535) return false
    val socket = Socket(Proxy.NO_PROXY)
    return try {
      socket.connect(InetSocketAddress(address, port), timeoutMs.coerceIn(1, 60_000).toInt())
      true
    } catch (e: Exception) {
      false
    } finally {
      try {
        socket.close()
      } catch (e: Exception) {
        // already closed
      }
    }
  }
}

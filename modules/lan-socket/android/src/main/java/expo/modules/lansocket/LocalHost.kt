package expo.modules.lansocket

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/**
 * Defence in depth behind the JS `assertLocal()`: only a literal private, link-local or loopback
 * IP is accepted (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, fe80::/10, fc00::/7, ::1).
 * Host names are refused without a lookup.
 */
internal object LocalHost {
  private val V4 = Regex("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$")
  private val V6 = Regex("^[0-9A-Fa-f:.]+$")

  fun isLocalLiteral(host: String): Boolean {
    val bare = host.removePrefix("[").removeSuffix("]")
    val address: InetAddress = when {
      V4.matches(bare) -> {
        val octets = bare.split('.').map { it.toInt() }
        if (octets.any { it > 255 }) return false
        InetAddress.getByAddress(octets.map { it.toByte() }.toByteArray())
      }
      // Only hex digits, colons and dots: InetAddress parses it as a literal, never a DNS name.
      bare.contains(':') && V6.matches(bare) ->
        try {
          InetAddress.getByName(bare)
        } catch (e: Exception) {
          return false
        }
      else -> return false
    }
    return isLocal(address)
  }

  private fun isLocal(a: InetAddress): Boolean {
    val b = a.address.map { it.toInt() and 0xff }
    return when (a) {
      // An IPv4-mapped IPv6 literal comes back as an Inet4Address, so it is judged as IPv4.
      is Inet4Address ->
        b[0] == 10 ||
          b[0] == 127 ||
          (b[0] == 172 && b[1] in 16..31) ||
          (b[0] == 192 && b[1] == 168) ||
          (b[0] == 169 && b[1] == 254)
      is Inet6Address ->
        (b[0] and 0xfe) == 0xfc || // fc00::/7
          (b[0] == 0xfe && (b[1] and 0xc0) == 0x80) || // fe80::/10
          a.isLoopbackAddress // ::1
      else -> false
    }
  }
}

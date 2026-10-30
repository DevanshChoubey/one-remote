package expo.modules.lansocket

import java.net.Inet4Address
import java.net.InetAddress

/**
 * Defence in depth behind the JS `assertLocal()`: only a literal private, link-local or loopback
 * IP is accepted (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, fe80::/10, fc00::/7, ::1).
 *
 * Literals are parsed here, byte by byte, and turned into an [InetAddress] with
 * `InetAddress.getByAddress` (which never resolves anything). Host names, leading-zero octets
 * (which some resolvers read as octal), IPv6 zone ids and anything malformed are refused. The
 * returned address is the only one a socket may then connect to.
 */
internal object LocalHost {
  private val OCTET = Regex("^(0|[1-9][0-9]{0,2})$")
  private val GROUP = Regex("^[0-9A-Fa-f]{1,4}$")

  /** The checked local address for [host] (brackets allowed for IPv6), or null. */
  fun parseLocalLiteral(host: String): InetAddress? {
    val address = parseLiteral(host) ?: return null
    return if (isLocal(address)) address else null
  }

  fun isLocalLiteral(host: String): Boolean = parseLocalLiteral(host) != null

  /** A strict IPv4 or IPv6 literal, without any lookup; null for anything else. */
  fun parseLiteral(host: String): InetAddress? {
    val bare =
      if (host.startsWith("[") && host.endsWith("]")) host.substring(1, host.length - 1) else host
    val bytes = (if (bare.contains(':')) parseV6(bare) else parseV4(bare)) ?: return null
    return try {
      InetAddress.getByAddress(bytes)
    } catch (e: Exception) {
      null
    }
  }

  private fun parseV4(s: String): ByteArray? {
    val parts = s.split('.')
    if (parts.size != 4) return null
    val out = ByteArray(4)
    for ((i, p) in parts.withIndex()) {
      if (!OCTET.matches(p)) return null
      val v = p.toInt()
      if (v > 255) return null
      out[i] = v.toByte()
    }
    return out
  }

  private fun parseV6(input: String): ByteArray? {
    if (input.contains('%')) return null // zone ids are not supported
    var s = input
    var tail = IntArray(0)
    val lastColon = s.lastIndexOf(':')
    val last = s.substring(lastColon + 1)
    if (last.contains('.')) {
      val v4 = parseV4(last) ?: return null
      val b = v4.map { it.toInt() and 0xff }
      tail = intArrayOf((b[0] shl 8) or b[1], (b[2] shl 8) or b[3])
      s = s.substring(0, lastColon + 1)
      if (!s.endsWith("::")) s = s.dropLast(1)
    }
    val halves = s.split("::")
    if (halves.size > 2) return null
    fun groups(h: String): List<Int>? {
      if (h.isEmpty()) return emptyList()
      return h.split(':').map { g -> if (GROUP.matches(g)) g.toInt(16) else return null }
    }
    val head = groups(halves[0]) ?: return null
    val all: List<Int> =
      if (halves.size == 1) {
        (head + tail.toList()).takeIf { it.size == 8 } ?: return null
      } else {
        val rest = groups(halves[1]) ?: return null
        val fill = 8 - head.size - rest.size - tail.size
        if (fill < 1) return null
        head + List(fill) { 0 } + rest + tail.toList()
      }
    val out = ByteArray(16)
    for ((i, g) in all.withIndex()) {
      out[i * 2] = (g shr 8).toByte()
      out[i * 2 + 1] = (g and 0xff).toByte()
    }
    return out
  }

  private fun isLocal(a: InetAddress): Boolean {
    val b = a.address.map { it.toInt() and 0xff }
    // An IPv4-mapped IPv6 literal comes back from getByAddress as an Inet4Address.
    if (a is Inet4Address) {
      return b[0] == 10 ||
        b[0] == 127 ||
        (b[0] == 172 && b[1] in 16..31) ||
        (b[0] == 192 && b[1] == 168) ||
        (b[0] == 169 && b[1] == 254)
    }
    if (b.size != 16) return false
    return (b[0] and 0xfe) == 0xfc || // fc00::/7
      (b[0] == 0xfe && (b[1] and 0xc0) == 0x80) || // fe80::/10
      (b.subList(0, 15).all { it == 0 } && b[15] == 1) // ::1
  }
}

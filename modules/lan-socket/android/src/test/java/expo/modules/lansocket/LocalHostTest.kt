package expo.modules.lansocket

import java.net.InetAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalHostTest {
  @Test
  fun acceptsPrivateLinkLocalAndLoopbackLiterals() {
    for (h in listOf(
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.0.193",
      "169.254.1.1",
      "127.0.0.1",
      "fe80::1",
      "[fe80::1]",
      "FE80::abcd:1",
      "fd00::1",
      "fc00::",
      "::1",
      "[::1]",
      "::ffff:192.168.1.5",
    )) {
      assertTrue(h, LocalHost.isLocalLiteral(h))
    }
  }

  @Test
  fun refusesPublicSpecialAndMalformedHosts() {
    for (h in listOf(
      "8.8.8.8",
      "172.15.0.1",
      "172.32.0.1",
      "192.169.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.251",
      "2001:4860::1",
      "::",
      "::ffff:8.8.8.8",
      "ff02::1",
      // Leading zeros can be read as octal by some resolvers: 010 would be 8.
      "010.0.0.1",
      "192.168.01.1",
      "fe80::1%wlan0",
      "localhost",
      "tv.local",
      "example.com",
      "abc:def",
      "1:2:3:4:5:6:7:8:9",
      "fe80:::1",
      "1::2::3",
      "192.168.1",
      "192.168.1.1.1",
      "192.168.1.256",
      "",
      "[]",
    )) {
      assertFalse(h, LocalHost.isLocalLiteral(h))
    }
  }

  @Test
  fun parsesToTheSameAddressTheResolverWould() {
    assertEquals(InetAddress.getByName("192.168.0.193"), LocalHost.parseLiteral("192.168.0.193"))
    assertEquals(InetAddress.getByName("fe80::1"), LocalHost.parseLiteral("[fe80:0:0::1]"))
    assertEquals(
      InetAddress.getByName("192.168.1.5"),
      LocalHost.parseLocalLiteral("::ffff:192.168.1.5"),
    )
    assertNull(LocalHost.parseLiteral("localhost"))
  }
}

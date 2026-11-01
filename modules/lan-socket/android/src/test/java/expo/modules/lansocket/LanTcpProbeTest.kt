package expo.modules.lansocket

import java.net.InetAddress
import java.net.ServerSocket
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LanTcpProbeTest {
  @Test
  fun anOpenPortIsTrue() {
    ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { server ->
      assertTrue(LanTcpProbe.probe("127.0.0.1", server.localPort, 2000))
    }
  }

  @Test
  fun aClosedPortIsFalse() {
    val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
    assertFalse(LanTcpProbe.probe("127.0.0.1", port, 2000))
  }

  @Test
  fun aPublicAddressIsRefusedWithoutConnecting() {
    val e = assertThrows(LanOpenError::class.java) { LanTcpProbe.probe("8.8.8.8", 53, 2000) }
    assertEquals(ERR_NOT_LOCAL, e.code)
  }

  @Test
  fun aHostNameIsRefused() {
    val e = assertThrows(LanOpenError::class.java) { LanTcpProbe.probe("localhost", 80, 2000) }
    assertEquals(ERR_NOT_LOCAL, e.code)
  }
}

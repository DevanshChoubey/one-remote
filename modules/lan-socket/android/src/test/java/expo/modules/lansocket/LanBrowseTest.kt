package expo.modules.lansocket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LanBrowseTest {
  private val txt = mapOf<String, ByteArray?>("bt" to "AA:BB".toByteArray(), "flag" to null)

  @Test
  fun keepsLocalHostsAndDecodesTxt() {
    val s = BrowsedService.from("Living room", "192.168.1.40", 6466, txt)
    assertEquals(BrowsedService("Living room", "192.168.1.40", 6466, mapOf("bt" to "AA:BB", "flag" to "")), s)
    assertEquals("10.0.0.2", BrowsedService.from("a", "10.0.0.2", 1, emptyMap())?.host)
    assertEquals("fe80::1", BrowsedService.from("a", "fe80::1", 1, emptyMap())?.host)
  }

  @Test
  fun dropsNonLocalAndMalformedHosts() {
    for (h in listOf("8.8.8.8", "2001:4860:4860::8888", "example.com", "fe80::1%wlan0", "192.168.01.1", "", null)) {
      assertNull(h, BrowsedService.from("a", h, 1, emptyMap()))
    }
  }

  @Test
  fun serialQueueRunsOneTaskAtATime() {
    val q = SerialQueue()
    val log = mutableListOf<String>()
    val dones = mutableListOf<() -> Unit>()
    for (n in 1..3) {
      q.enqueue { done ->
        log += "start$n"
        dones += done
      }
    }
    assertEquals(listOf("start1"), log)
    dones[0]()
    dones[0]() // a second done is ignored
    assertEquals(listOf("start1", "start2"), log)
    dones[1]()
    assertEquals(listOf("start1", "start2", "start3"), log)
  }

  @Test
  fun serialQueueDropsPendingWhenClosedAndSurvivesAThrowingTask() {
    val q = SerialQueue()
    val log = mutableListOf<String>()
    q.enqueue { throw IllegalStateException("boom") }
    q.enqueue { done ->
      log += "second"
      q.close()
      q.enqueue { log += "never" }
      done()
    }
    assertEquals(listOf("second"), log)
  }
}

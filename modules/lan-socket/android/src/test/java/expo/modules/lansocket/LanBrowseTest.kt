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

  private class FakeScheduler {
    val tasks = mutableListOf<Pair<Long, () -> Unit>>()
    var cancelled = 0
    val scheduler: Scheduler = { ms, block ->
      tasks += ms to block
      val cancel: () -> Unit = { cancelled++ }
      cancel
    }
  }

  @Test
  fun timeoutWinsAndALateAnswerIsIgnored() {
    val f = FakeScheduler()
    var timeouts = 0
    val g = ResolveGuard(f.scheduler, 5000) { timeouts++ }
    assertEquals(5000L, f.tasks[0].first)
    f.tasks[0].second()
    assertEquals(1, timeouts)
    assertEquals(false, g.complete())
    f.tasks[0].second()
    assertEquals(1, timeouts)
  }

  @Test
  fun answerCancelsTheTimer() {
    val f = FakeScheduler()
    var timeouts = 0
    val g = ResolveGuard(f.scheduler, 5000) { timeouts++ }
    assertEquals(true, g.complete())
    assertEquals(1, f.cancelled)
    f.tasks[0].second()
    assertEquals(0, timeouts)
    assertEquals(false, g.complete())
  }

  @Test
  fun aTimedOutResolveFreesTheQueueOnceOnly() {
    val f = FakeScheduler()
    val q = SerialQueue()
    val started = mutableListOf<Int>()
    val dones = mutableListOf<() -> Unit>()
    for (n in 1..2) {
      q.enqueue { done ->
        started += n
        dones += done
        ResolveGuard(f.scheduler, 5000) { done() }
      }
    }
    assertEquals(listOf(1), started)
    f.tasks[0].second() // task 1 times out
    assertEquals(listOf(1, 2), started)
    dones[0]() // a late done from task 1 must not free task 2's slot
    q.enqueue { started += 3 }
    assertEquals(listOf(1, 2), started)
  }
}

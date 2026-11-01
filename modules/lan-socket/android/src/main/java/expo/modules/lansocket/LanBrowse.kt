package expo.modules.lansocket

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.net.Inet4Address
import java.nio.charset.StandardCharsets
import java.util.ArrayDeque

/** One resolved mDNS service whose host is a literal local IP. */
internal data class BrowsedService(
  val name: String,
  val host: String,
  val port: Int,
  val txt: Map<String, String>,
) {
  companion object {
    /**
     * The service for a resolved record, or null when [host] is not a literal private, link-local
     * or loopback IP (checked by [LocalHost], like every address this module dials). A scoped IPv6
     * address ("fe80::1%wlan0") is dropped too: zone ids are unsupported, so it could not be dialled.
     */
    fun from(
      name: String,
      host: String?,
      port: Int,
      attributes: Map<String, ByteArray?>,
    ): BrowsedService? {
      if (host == null || !LocalHost.isLocalLiteral(host)) return null
      val txt = attributes.mapValues { (_, v) -> v?.toString(StandardCharsets.UTF_8) ?: "" }
      return BrowsedService(name, host, port, txt)
    }
  }
}

/** Runs queued tasks strictly one at a time; a task calls the `done` it is given when it ends. */
internal class SerialQueue {
  private val pending = ArrayDeque<(done: () -> Unit) -> Unit>()
  private var running = false
  private var closed = false

  fun enqueue(task: (done: () -> Unit) -> Unit) {
    synchronized(this) {
      if (closed) return
      pending.add(task)
    }
    pump()
  }

  /** Drops what has not started; a task already running may still call its `done`. */
  fun close() {
    synchronized(this) {
      closed = true
      pending.clear()
    }
  }

  private fun pump() {
    val task =
      synchronized(this) {
        if (running || closed) return
        val next = pending.poll() ?: return
        running = true
        next
      }
    var finished = false
    val done = {
      val again =
        synchronized(this) {
          if (finished) false else {
            finished = true
            running = false
            true
          }
        }
      if (again) pump()
    }
    try {
      task(done)
    } catch (e: Exception) {
      done()
    }
  }
}

/** Runs [block] after [delayMs]; the returned function cancels it. */
internal typealias Scheduler = (delayMs: Long, block: () -> Unit) -> () -> Unit

internal val mainScheduler: Scheduler = { delayMs, block ->
  val handler = Handler(Looper.getMainLooper())
  val r = Runnable { block() }
  handler.postDelayed(r, delayMs)
  val cancel: () -> Unit = { handler.removeCallbacks(r) }
  cancel
}

/**
 * Guards one resolve: exactly one of [complete] (the platform answered) or the timeout wins. The
 * loser does nothing, so a late answer neither reports nor frees the next queued task early.
 */
internal class ResolveGuard(
  schedule: Scheduler,
  timeoutMs: Long,
  private val onTimeout: () -> Unit,
) {
  private var settled = false
  private val cancel: () -> Unit

  init {
    cancel = schedule(timeoutMs) { if (settle()) onTimeout() }
  }

  /** True when the caller owns the result (the timeout has not fired); stops the timer. */
  fun complete(): Boolean {
    if (!settle()) return false
    cancel()
    return true
  }

  private fun settle(): Boolean =
    synchronized(this) {
      if (settled) false else { settled = true; true }
    }
}

/**
 * One mDNS browse on [NsdManager]. Each found service is resolved (one resolve at a time: before
 * API 34 a second concurrent resolve fails with FAILURE_ALREADY_ACTIVE) and reported through
 * [onService] when its host is a local literal IP. Every failure ends the browse quietly: it just
 * finds nothing.
 */
internal class LanBrowse(
  private val nsd: NsdManager,
  private val serviceType: String,
  private val schedule: Scheduler = mainScheduler,
  private val onService: (BrowsedService) -> Unit,
) {
  private val reported = HashSet<String>()
  private val queue = SerialQueue()
  private var stopped = false
  private var started = false

  private val discovery =
    object : NsdManager.DiscoveryListener {
      override fun onStartDiscoveryFailed(type: String, errorCode: Int) = stop()

      override fun onStopDiscoveryFailed(type: String, errorCode: Int) {}

      override fun onDiscoveryStarted(type: String) {}

      override fun onDiscoveryStopped(type: String) {}

      override fun onServiceLost(info: NsdServiceInfo) {}

      override fun onServiceFound(info: NsdServiceInfo) = resolve(info)
    }

  fun start() {
    synchronized(this) {
      if (stopped || started) return
      started = true
    }
    try {
      nsd.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discovery)
    } catch (e: Exception) {
      stop()
    }
  }

  /** Safe to call more than once and from any thread. */
  fun stop() {
    val wasStarted =
      synchronized(this) {
        if (stopped) return
        stopped = true
        started
      }
    queue.close()
    if (wasStarted) {
      try {
        nsd.stopServiceDiscovery(discovery)
      } catch (e: Exception) {
        // never started or already stopped
      }
    }
  }

  private fun resolve(found: NsdServiceInfo) {
    queue.enqueue { done ->
      if (synchronized(this) { stopped }) {
        done()
      } else {
        var guard: ResolveGuard? = null
        val listener =
          object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
              if (guard?.complete() != false) done()
            }

            override fun onServiceResolved(info: NsdServiceInfo) {
              if (guard?.complete() == false) return
              try {
                if (!synchronized(this@LanBrowse) { stopped }) report(info)
              } finally {
                done()
              }
            }
          }
        guard =
          ResolveGuard(schedule, RESOLVE_TIMEOUT_MS) {
            if (Build.VERSION.SDK_INT >= 34) {
              try {
                nsd.stopServiceResolution(listener)
              } catch (e: Exception) {
                // not resolving any more
              }
            }
            done()
          }
        try {
          @Suppress("DEPRECATION") nsd.resolveService(found, listener)
        } catch (e: Exception) {
          if (guard.complete()) done()
        }
      }
    }
  }

  private fun report(info: NsdServiceInfo) {
    @Suppress("DEPRECATION") val host = info.host?.let { (it as? Inet4Address)?.hostAddress ?: it.hostAddress }
    BrowsedService.from(info.serviceName ?: "", host, info.port, info.attributes ?: emptyMap())
      ?.takeIf { synchronized(reported) { reported.add("${it.name}|${it.host}") } }
      ?.let(onService)
  }

  private companion object {
    const val RESOLVE_TIMEOUT_MS = 5000L
  }
}

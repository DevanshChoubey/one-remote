package expo.modules.multicastlock

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android drops Wi-Fi multicast packets unless an app holds a MulticastLock. Matter finds the AC
 * with mDNS, so the Matter lane holds the lock while it works and lets go afterwards.
 */
class MulticastLockModule : Module() {
  private var lock: WifiManager.MulticastLock? = null

  override fun definition() = ModuleDefinition {
    Name("MulticastLock")

    Function("acquire") {
      synchronized(this@MulticastLockModule) {
        if (lock == null) {
          val wifi = appContext.reactContext?.applicationContext
            ?.getSystemService(Context.WIFI_SERVICE) as? WifiManager
          lock = wifi?.createMulticastLock("one-remote-matter")?.apply {
            setReferenceCounted(false)
          }
        }
        lock?.acquire()
      }
    }

    Function("release") {
      synchronized(this@MulticastLockModule) {
        lock?.takeIf { it.isHeld }?.release()
      }
    }

    OnDestroy {
      synchronized(this@MulticastLockModule) {
        lock?.takeIf { it.isHeld }?.release()
        lock = null
      }
    }
  }
}

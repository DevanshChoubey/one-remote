package expo.modules.volumekeys

import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Lets the JS side take over the phone's volume keys. `MainActivity.dispatchKeyEvent` (added by
 * plugins/withVolumeKeys.js) calls [handle] first; while enabled it consumes the volume keys, so
 * the system volume does not change, and reports them to JS.
 */
object VolumeKeys {
  @Volatile
  var enabled: Boolean = false

  @Volatile
  var listener: ((String) -> Unit)? = null

  /** True when the event was consumed. Only a key press (and its auto-repeats) is consumed. */
  fun handle(event: KeyEvent): Boolean {
    if (!enabled) return false
    val direction = when (event.keyCode) {
      KeyEvent.KEYCODE_VOLUME_UP -> "up"
      KeyEvent.KEYCODE_VOLUME_DOWN -> "down"
      else -> return false
    }
    if (event.action != KeyEvent.ACTION_DOWN) return false
    listener?.invoke(direction)
    return true
  }
}

class VolumeKeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VolumeKeys")

    Events("onVolumeKey")

    OnCreate {
      VolumeKeys.listener = { direction -> sendEvent("onVolumeKey", mapOf("direction" to direction)) }
    }

    Function("setEnabled") { on: Boolean ->
      VolumeKeys.enabled = on
    }

    OnDestroy {
      VolumeKeys.enabled = false
      VolumeKeys.listener = null
    }
  }
}

package expo.modules.iremitter

import android.content.Context
import android.hardware.ConsumerIrManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class IrEmitterModule : Module() {
  private val manager: ConsumerIrManager?
    get() = appContext.reactContext?.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager

  override fun definition() = ModuleDefinition {
    Name("IrEmitter")

    Function("hasIrEmitter") {
      try {
        manager?.hasIrEmitter() == true
      } catch (e: Exception) {
        false
      }
    }

    // Pattern is microseconds, mark first. One call is one transmit; never retried here.
    AsyncFunction("transmit") { freq: Int, pattern: IntArray ->
      try {
        val m = manager ?: throw IllegalStateException("no ConsumerIrManager")
        m.transmit(freq, pattern)
      } catch (e: Exception) {
        throw CodedException("E_IR_TRANSMIT", e.message, e)
      }
    }
  }
}

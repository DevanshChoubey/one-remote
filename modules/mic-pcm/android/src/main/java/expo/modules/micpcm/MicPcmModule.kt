package expo.modules.micpcm

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** One capture: an AudioRecord read on its own thread, delivering about 100 ms of PCM per chunk. */
internal class MicCapture(
  sampleRate: Int,
  private val onChunk: (ByteArray) -> Unit,
) {
  private val chunkBytes = sampleRate / 10 * 2
  private val record: AudioRecord
  @Volatile private var running = true
  private val thread: Thread

  init {
    val min = AudioRecord.getMinBufferSize(
      sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
    )
    if (min <= 0) throw IllegalStateException("The microphone does not support $sampleRate Hz")
    record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, chunkBytes * 2),
    )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      throw IllegalStateException("The microphone is busy")
    }
    record.startRecording()
    thread = Thread({ loop() }, "mic-pcm")
    thread.start()
  }

  private fun loop() {
    val buf = ByteArray(chunkBytes)
    while (running) {
      val n = record.read(buf, 0, buf.size)
      if (n <= 0) break
      if (running) onChunk(buf.copyOf(n))
    }
  }

  /** Idempotent: stops the thread and frees the microphone. */
  @Synchronized
  fun stop() {
    if (!running) return
    running = false
    try {
      record.stop()
    } catch (_: IllegalStateException) {
    }
    thread.join(500)
    record.release()
  }
}

class MicPcmModule : Module() {
  private var capture: MicCapture? = null

  override fun definition() = ModuleDefinition {
    Name("MicPcm")
    Events("chunk")

    AsyncFunction("requestPermission") { promise: Promise ->
      // Asking again when already granted still flashes the system dialog, which sends the app to
      // the background and so ends the hold that asked (seen on the RMX1901, Android 11).
      val ctx = appContext.reactContext
      if (ctx != null &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val perms = appContext.permissions
      if (perms == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      perms.askForPermissions({ result ->
        val status = result[Manifest.permission.RECORD_AUDIO]?.status
        promise.resolve(status == PermissionsStatus.GRANTED)
      }, Manifest.permission.RECORD_AUDIO)
    }

    Function("start") { sampleRate: Int ->
      val ctx = appContext.reactContext ?: throw CodedException("ERR_MIC_FAILED", "No app context", null)
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("ERR_MIC_DENIED", "The microphone permission is missing", null)
      }
      synchronized(this@MicPcmModule) {
        if (capture != null) throw CodedException("ERR_MIC_BUSY", "The microphone is already in use", null)
        try {
          capture = MicCapture(sampleRate) { bytes ->
            sendEvent("chunk", mapOf("base64" to Base64.encodeToString(bytes, Base64.NO_WRAP)))
          }
        } catch (e: IllegalStateException) {
          throw CodedException("ERR_MIC_FAILED", e.message ?: "The microphone failed", e)
        }
      }
    }

    Function("stop") { stopCapture() }

    OnDestroy { stopCapture() }
    OnActivityEntersBackground { stopCapture() }
  }

  private fun stopCapture() {
    val c = synchronized(this) { capture.also { capture = null } }
    c?.stop()
  }
}

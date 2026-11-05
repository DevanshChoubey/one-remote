import AVFoundation
import ExpoModulesCore

/// Microphone capture as PCM16 little-endian mono chunks (about 100 ms each), base64 in `chunk`
/// events. The audio session is `.record` while capturing and deactivated on stop.
public class MicPcmModule: Module {
  private let engine = AVAudioEngine()
  private var running = false

  public func definition() -> ModuleDefinition {
    Name("MicPcm")
    Events("chunk")

    AsyncFunction("requestPermission") { (promise: Promise) in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        promise.resolve(granted)
      }
    }

    Function("start") { (sampleRate: Double) in
      try self.startCapture(sampleRate)
    }

    Function("stop") {
      self.stopCapture()
    }

    OnDestroy { self.stopCapture() }
    OnAppEntersBackground { self.stopCapture() }
  }

  private func startCapture(_ sampleRate: Double) throws {
    guard !running else {
      throw Exception(name: "ERR_MIC_BUSY", description: "The microphone is already in use")
    }
    let session = AVAudioSession.sharedInstance()
    guard session.recordPermission == .granted else {
      throw Exception(name: "ERR_MIC_DENIED", description: "The microphone permission is missing")
    }
    guard
      let target = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true)
    else {
      throw Exception(name: "ERR_MIC_FAILED", description: "Unsupported sample rate")
    }
    try session.setCategory(.record, mode: .measurement)
    try session.setActive(true)
    let input = engine.inputNode
    let source = input.outputFormat(forBus: 0)
    guard let converter = AVAudioConverter(from: source, to: target) else {
      throw Exception(name: "ERR_MIC_FAILED", description: "No converter for the microphone format")
    }
    input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(source.sampleRate / 10), format: source) {
      [weak self] buffer, _ in
      let capacity = AVAudioFrameCount(Double(buffer.frameLength) * sampleRate / source.sampleRate) + 16
      guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
      var fed = false
      var error: NSError?
      converter.convert(to: out, error: &error) { _, status in
        if fed {
          status.pointee = .noDataNow
          return nil
        }
        fed = true
        status.pointee = .haveData
        return buffer
      }
      guard error == nil, out.frameLength > 0, let data = out.int16ChannelData else { return }
      let bytes = Data(bytes: data[0], count: Int(out.frameLength) * 2)
      self?.sendEvent("chunk", ["base64": bytes.base64EncodedString()])
    }
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      try? session.setActive(false)
      throw error
    }
    running = true
  }

  private func stopCapture() {
    guard running else { return }
    running = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

import CryptoKit
import ExpoModulesCore
import Foundation

struct OpenOptions: Record {
  @Field var pinSha256: String? = nil
  @Field var pairing: Bool = false
  /// Android runs probes in their own pool; every iOS socket has its own session already.
  @Field var probe: Bool = false
  @Field var timeoutMs: Double = 3000
}

private let errNotLocal = "ERR_LAN_NOT_LOCAL"
private let errNoTrust = "ERR_LAN_NO_TRUST"
private let errPinMismatch = "ERR_LAN_PIN_MISMATCH"
private let errOpenFailed = "ERR_LAN_OPEN_FAILED"

private func lanError(_ code: String, _ message: String) -> Exception {
  Exception(name: "LanSocketError", description: message, code: code)
}

/// WebSockets to literal local IPs; see modules/lan-socket/index.ts for the contract.
public final class LanSocketModule: Module {
  private var sockets: [String: LanConnection] = [:]
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("LanSocket")

    Events("message", "close")

    AsyncFunction("open") { (id: String, url: String, opts: OpenOptions, promise: Promise) in
      self.open(id: id, url: url, opts: opts, promise: promise)
    }

    Function("send") { (id: String, text: String) throws in
      guard let conn = self.connection(id), conn.isOpen else {
        throw lanError(errOpenFailed, "The socket is not open")
      }
      conn.send(text)
    }

    Function("close") { (id: String) in
      self.take(id)?.closeByUs()
    }

    OnDestroy {
      self.lock.lock()
      let all = Array(self.sockets.values)
      self.sockets.removeAll()
      self.lock.unlock()
      all.forEach { $0.closeByUs() }
    }
  }

  private func open(id: String, url: String, opts: OpenOptions, promise: Promise) {
    guard let parsed = URL(string: url), let scheme = parsed.scheme?.lowercased(),
      scheme == "ws" || scheme == "wss", let host = parsed.host, parsed.user == nil,
      parsed.password == nil
    else {
      promise.reject(lanError(errNotLocal, "Not a plain ws:// or wss:// address"))
      return
    }
    guard LocalHost.isLocalLiteral(host) else {
      promise.reject(lanError(errNotLocal, "Address is not a local IP"))
      return
    }
    let secure = scheme == "wss"
    let pin = opts.pinSha256?.trimmingCharacters(in: .whitespaces).lowercased()
    let usablePin = (pin?.isEmpty ?? true) ? nil : pin
    if secure && usablePin == nil && !opts.pairing {
      promise.reject(lanError(errNoTrust, "wss needs a pinned certificate outside pairing"))
      return
    }
    let conn = LanConnection(
      id: id, secure: secure, pin: usablePin, promise: promise, module: self)
    lock.lock()
    if sockets[id] != nil {
      lock.unlock()
      promise.reject(lanError(errOpenFailed, "Socket id already in use"))
      return
    }
    sockets[id] = conn
    lock.unlock()
    conn.start(url: parsed, timeout: max(0.001, min(opts.timeoutMs, 60_000)) / 1000)
  }

  private func connection(_ id: String) -> LanConnection? {
    lock.lock()
    defer { lock.unlock() }
    return sockets[id]
  }

  private func take(_ id: String) -> LanConnection? {
    lock.lock()
    defer { lock.unlock() }
    return sockets.removeValue(forKey: id)
  }

  fileprivate func forget(_ conn: LanConnection) {
    lock.lock()
    if sockets[conn.id] === conn { sockets.removeValue(forKey: conn.id) }
    lock.unlock()
  }

  fileprivate func emit(_ name: String, _ body: [String: Any?]) {
    sendEvent(name, body)
  }
}

/// One socket with its own URLSession and its own trust decision. The app's default trust is never
/// changed: only this session's server-trust challenges are answered here.
private final class LanConnection: NSObject, URLSessionWebSocketDelegate {
  let id: String
  private let secure: Bool
  /// nil: pairing (accept and record the leaf). Otherwise: accept only this leaf SHA-256.
  private let pin: String?
  private var promise: Promise?
  private weak var module: LanSocketModule?
  private let queue: OperationQueue = {
    let q = OperationQueue()
    q.maxConcurrentOperationCount = 1
    return q
  }()
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var seenSha256: String?
  private var mismatch = false
  private var opened = false
  private var ended = false

  var isOpen: Bool { queue.addOperationAndWait { self.opened && !self.ended } }

  init(id: String, secure: Bool, pin: String?, promise: Promise, module: LanSocketModule) {
    self.id = id
    self.secure = secure
    self.pin = pin
    self.promise = promise
    self.module = module
  }

  /// URLSession's request timeout is an idle timeout (time between data), so it must not be the
  /// open deadline: a TV socket is idle for long stretches (the pairing prompt waits up to 60 s).
  /// The open deadline is the explicit timer below.
  private static let idleForever: TimeInterval = 7 * 24 * 3600

  func start(url: URL, timeout: TimeInterval) {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = LanConnection.idleForever
    config.timeoutIntervalForResource = LanConnection.idleForever
    config.waitsForConnectivity = false
    config.urlCache = nil
    // No proxy: TV traffic never leaves the LAN through a system or MDM proxy.
    config.connectionProxyDictionary = [:]
    let session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
    var request = URLRequest(url: url)
    request.timeoutInterval = LanConnection.idleForever
    let task = session.webSocketTask(with: request)
    queue.addOperation {
      self.session = session
      self.task = task
      task.resume()
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
      self?.queue.addOperation {
        guard let self, !self.opened, !self.ended else { return }
        self.finish(event: nil, why: "Timed out opening the socket")
      }
    }
  }

  func send(_ text: String) {
    queue.addOperation {
      self.task?.send(.string(text)) { _ in
        // A failed write ends the task; didCompleteWithError reports it.
      }
    }
  }

  func closeByUs() {
    queue.addOperation {
      guard !self.ended else { return }
      self.ended = true
      if let promise = self.promise {
        self.promise = nil
        promise.reject(lanError(errOpenFailed, "Cancelled"))
      }
      self.task?.cancel(with: .normalClosure, reason: nil)
      self.session?.invalidateAndCancel()
    }
  }

  // MARK: - Trust

  func urlSession(
    _ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust
    else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    guard secure, let trust = challenge.protectionSpace.serverTrust,
      let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let leaf = chain.first
    else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    let der = SecCertificateCopyData(leaf) as Data
    let sha = SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
    seenSha256 = sha
    if let pin, sha != pin {
      mismatch = true
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    // Pairing, or the pinned leaf: accept without chain or host-name evaluation.
    completionHandler(.useCredential, URLCredential(trust: trust))
  }

  /// Redirects are never followed: the target would skip the local-address check.
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  // MARK: - Socket

  func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    guard !ended, let promise else { return }
    self.promise = nil
    opened = true
    var result: [String: Any] = [:]
    if secure, let seenSha256 { result["certSha256"] = seenSha256 }
    promise.resolve(result)
    receive()
  }

  private func receive() {
    task?.receive { [weak self] result in
      guard let self else { return }
      self.queue.addOperation {
        guard !self.ended else { return }
        if case .success(let message) = result {
          if case .string(let text) = message {
            self.module?.emit("message", ["id": self.id, "data": text])
          }
          self.receive()
        }
        // A failure ends the task; didCompleteWithError reports it.
      }
    }
  }

  func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
  ) {
    let text = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    finish(
      event: ["id": id, "code": closeCode.rawValue, "reason": text],
      why: "Closed by the TV (\(closeCode.rawValue))")
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let why: String
    if let error = error as NSError? {
      why = "\(error.domain) \(error.code): \(error.localizedDescription)"
    } else {
      why = "The socket ended"
    }
    finish(event: ["id": id, "error": why], why: why)
  }

  /// Runs on `queue`. Rejects a pending open, or reports the end of an open socket, once.
  private func finish(event: [String: Any?]?, why: String) {
    guard !ended else { return }
    ended = true
    module?.forget(self)
    if let promise {
      self.promise = nil
      promise.reject(lanError(mismatch ? errPinMismatch : errOpenFailed, why))
    } else if let event {
      module?.emit("close", event)
    }
    task?.cancel(with: .normalClosure, reason: nil)
    session?.invalidateAndCancel()
  }
}

private extension OperationQueue {
  func addOperationAndWait<T>(_ block: @escaping () -> T) -> T {
    if OperationQueue.current === self { return block() }
    var value: T?
    addOperations([BlockOperation { value = block() }], waitUntilFinished: true)
    // swiftlint:disable:next force_unwrapping
    return value!
  }
}

/// Defence in depth behind the JS `assertLocal()`: only a literal private, link-local or loopback
/// IP (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, fe80::/10, fc00::/7, ::1). Never resolves names.
enum LocalHost {
  static func isLocalLiteral(_ rawHost: String) -> Bool {
    var host = rawHost
    if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
    if host.contains("%") { return false }  // zone ids are not supported (as on Android)
    var v4 = in_addr()
    if host.allSatisfy({ $0.isNumber || $0 == "." }), inet_pton(AF_INET, host, &v4) == 1 {
      return isLocalV4(withUnsafeBytes(of: v4.s_addr) { Array($0) })
    }
    var v6 = in6_addr()
    if host.contains(":"), inet_pton(AF_INET6, host, &v6) == 1 {
      let b = withUnsafeBytes(of: v6) { Array($0) }
      // IPv4-mapped (::ffff:a.b.c.d) is judged as IPv4.
      if b[0..<10].allSatisfy({ $0 == 0 }) && b[10] == 0xff && b[11] == 0xff {
        return isLocalV4(Array(b[12..<16]))
      }
      if (b[0] & 0xfe) == 0xfc { return true }  // fc00::/7
      if b[0] == 0xfe && (b[1] & 0xc0) == 0x80 { return true }  // fe80::/10
      return b[0..<15].allSatisfy({ $0 == 0 }) && b[15] == 1  // ::1
    }
    return false
  }

  private static func isLocalV4(_ b: [UInt8]) -> Bool {
    guard b.count == 4 else { return false }
    return b[0] == 10 || b[0] == 127 || (b[0] == 172 && (16...31).contains(b[1]))
      || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
  }
}

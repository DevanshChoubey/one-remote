import CryptoKit
import ExpoModulesCore
import Foundation
import Network
import Security

struct OpenOptions: Record {
  @Field var pinSha256: String? = nil
  @Field var pairing: Bool = false
  /// Android runs probes in their own pool; every iOS socket has its own session already.
  @Field var probe: Bool = false
  @Field var timeoutMs: Double = 3000
}

struct StreamOptions: Record {
  @Field var pinSha256: String? = nil
  @Field var pairing: Bool = false
  /// Ref of a client identity; the Keychain identity tagged `lan-identity:<ref>` is presented.
  @Field var identity: String? = nil
  @Field var timeoutMs: Double = 3000
}

struct RequestOptions: Record {
  @Field var method: String = "GET"
  @Field var url: String = ""
  @Field var headers: [String: String]? = nil
  @Field var body: String? = nil
  @Field var pinSha256: String? = nil
  @Field var pairing: Bool = false
  @Field var timeoutMs: Double = 3000
  @Field var maxBytes: Double = 262144
}

private let errNotLocal = "ERR_LAN_NOT_LOCAL"
private let errNoTrust = "ERR_LAN_NO_TRUST"
private let errPinMismatch = "ERR_LAN_PIN_MISMATCH"
private let errOpenFailed = "ERR_LAN_OPEN_FAILED"

private func lanError(_ code: String, _ message: String) -> Exception {
  Exception(name: "LanSocketError", description: message, code: code)
}

/// WebSockets and TLS byte streams to literal local IPs; see modules/lan-socket/index.ts for the
/// contract. Sockets and streams share one id space and `close(id)`.
public final class LanSocketModule: Module {
  private var sockets: [String: LanConnection] = [:]
  private var streams: [String: LanStream] = [:]
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("LanSocket")

    Events("message", "data", "close")

    AsyncFunction("open") { (id: String, url: String, opts: OpenOptions, promise: Promise) in
      self.open(id: id, url: url, opts: opts, promise: promise)
    }

    Function("send") { (id: String, text: String) throws in
      guard let conn = self.connection(id), conn.isOpen else {
        throw lanError(errOpenFailed, "The socket is not open")
      }
      conn.send(text)
    }

    AsyncFunction("openStream") {
      (id: String, host: String, port: Int, opts: StreamOptions, promise: Promise) in
      self.openStream(id: id, host: host, port: port, opts: opts, promise: promise)
    }

    Function("write") { (id: String, base64: String) throws in
      guard let bytes = Data(base64Encoded: base64) else {
        throw lanError(errOpenFailed, "Not valid base64")
      }
      guard let stream = self.stream(id), stream.isOpen else {
        throw lanError(errOpenFailed, "The stream is not open")
      }
      stream.write(bytes)
    }

    AsyncFunction("request") { (opts: RequestOptions, promise: Promise) in
      self.request(opts: opts, promise: promise)
    }

    Function("close") { (id: String) in
      self.take(id)?.closeByUs()
      self.takeStream(id)?.closeByUs()
    }

    OnDestroy {
      self.lock.lock()
      let all = Array(self.sockets.values)
      let allStreams = Array(self.streams.values)
      self.sockets.removeAll()
      self.streams.removeAll()
      self.lock.unlock()
      all.forEach { $0.closeByUs() }
      allStreams.forEach { $0.closeByUs() }
    }
  }

  /// A one-shot HTTP(S) request. Checked here exactly like `open`, then run by a [LanHttpRequest]
  /// that keeps itself alive until it completes (it is not tracked by id: it cannot be cancelled).
  private func request(opts: RequestOptions, promise: Promise) {
    guard let parsed = URL(string: opts.url), let scheme = parsed.scheme?.lowercased(),
      scheme == "http" || scheme == "https", let host = parsed.host, parsed.user == nil,
      parsed.password == nil
    else {
      promise.reject(lanError(errNotLocal, "Not a plain http:// or https:// address"))
      return
    }
    guard LocalHost.isLocalLiteral(host) else {
      promise.reject(lanError(errNotLocal, "Address is not a local IP"))
      return
    }
    guard ["GET", "POST", "PUT"].contains(opts.method) else {
      promise.reject(lanError(errOpenFailed, "Unsupported method \(opts.method)"))
      return
    }
    let secure = scheme == "https"
    let pin = opts.pinSha256?.trimmingCharacters(in: .whitespaces).lowercased()
    let usablePin = (pin?.isEmpty ?? true) ? nil : pin
    if secure && usablePin == nil && !opts.pairing {
      promise.reject(lanError(errNoTrust, "https needs a pinned certificate outside pairing"))
      return
    }
    var request = URLRequest(url: parsed)
    request.httpMethod = opts.method
    request.httpShouldHandleCookies = false
    for (name, value) in opts.headers ?? [:] { request.setValue(value, forHTTPHeaderField: name) }
    if let body = opts.body { request.httpBody = Data(body.utf8) }
    let timeout = max(0.001, min(opts.timeoutMs, 60_000)) / 1000
    request.timeoutInterval = timeout
    LanHttpRequest(
      secure: secure, pin: usablePin, maxBytes: max(0, Int(min(opts.maxBytes, 64 * 1024 * 1024))),
      promise: promise
    ).start(request: request, timeout: timeout)
  }

  private func openStream(
    id: String, host: String, port: Int, opts: StreamOptions, promise: Promise
  ) {
    guard LocalHost.isLocalLiteral(host), let endpointHost = LocalHost.endpointHost(host) else {
      promise.reject(lanError(errNotLocal, "Address is not a local IP"))
      return
    }
    guard (1...65535).contains(port), let endpointPort = NWEndpoint.Port(rawValue: UInt16(port))
    else {
      promise.reject(lanError(errOpenFailed, "Not a valid port: \(port)"))
      return
    }
    let pin = opts.pinSha256?.trimmingCharacters(in: .whitespaces).lowercased()
    let usablePin = (pin?.isEmpty ?? true) ? nil : pin
    if usablePin == nil && !opts.pairing {
      promise.reject(
        lanError(errNoTrust, "A TLS stream needs a pinned certificate outside pairing"))
      return
    }
    var identity: SecIdentity?
    if let ref = opts.identity {
      guard let found = LanStream.identity(ref: ref) else {
        promise.reject(lanError(errOpenFailed, "No client identity '\(ref)'"))
        return
      }
      identity = found
    }
    let stream = LanStream(id: id, pin: usablePin, promise: promise, module: self)
    lock.lock()
    if sockets[id] != nil || streams[id] != nil {
      lock.unlock()
      promise.reject(lanError(errOpenFailed, "Socket id already in use"))
      return
    }
    streams[id] = stream
    lock.unlock()
    stream.start(
      host: endpointHost, port: endpointPort, identity: identity,
      timeout: max(0.001, min(opts.timeoutMs, 60_000)) / 1000)
  }

  private func stream(_ id: String) -> LanStream? {
    lock.lock()
    defer { lock.unlock() }
    return streams[id]
  }

  private func takeStream(_ id: String) -> LanStream? {
    lock.lock()
    defer { lock.unlock() }
    return streams.removeValue(forKey: id)
  }

  fileprivate func forget(_ stream: LanStream) {
    lock.lock()
    if streams[stream.id] === stream { streams.removeValue(forKey: stream.id) }
    lock.unlock()
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
    if sockets[id] != nil || streams[id] != nil {
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

/// One one-shot request with its own ephemeral URLSession (no cookies, no cache, no proxy) and its
/// own trust decision, made as for [LanConnection]: pairing accepts and records the leaf, a pin
/// accepts only that leaf. Redirects are never followed: a 3xx is returned as it is. The response
/// body is cut off, and the request fails, once it passes `maxBytes`. Everything runs on `queue`.
private final class LanHttpRequest: NSObject, URLSessionDataDelegate {
  private let secure: Bool
  private let pin: String?
  private let maxBytes: Int
  private var promise: Promise?
  private let queue: OperationQueue = {
    let q = OperationQueue()
    q.maxConcurrentOperationCount = 1
    return q
  }()
  private var session: URLSession?
  private var status = 0
  private var headers: [String: String] = [:]
  private var body = Data()
  private var tooLarge = false
  private var seenSha256: String?
  private var mismatch = false
  /// The session retains its delegate until invalidated, which `finish` does; this also keeps the
  /// request alive if the caller drops it.
  private var selfRetain: LanHttpRequest?

  init(secure: Bool, pin: String?, maxBytes: Int, promise: Promise) {
    self.secure = secure
    self.pin = pin
    self.maxBytes = maxBytes
    self.promise = promise
  }

  func start(request: URLRequest, timeout: TimeInterval) {
    selfRetain = self
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = timeout
    config.timeoutIntervalForResource = timeout
    config.waitsForConnectivity = false
    config.urlCache = nil
    config.httpCookieStorage = nil
    config.httpCookieAcceptPolicy = .never
    config.httpShouldSetCookies = false
    // No proxy: TV traffic never leaves the LAN through a system or MDM proxy.
    config.connectionProxyDictionary = [:]
    let session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
    queue.addOperation {
      self.session = session
      session.dataTask(with: request).resume()
    }
  }

  private func finish(_ error: (code: String, message: String)?) {
    guard let promise else { return }
    self.promise = nil
    session?.invalidateAndCancel()
    session = nil
    selfRetain = nil
    if let error {
      promise.reject(lanError(error.code, error.message))
      return
    }
    var result: [String: Any] = [
      "status": status, "headers": headers, "body": String(decoding: body, as: UTF8.self),
    ]
    if secure, let seenSha256 { result["certSha256"] = seenSha256 }
    promise.resolve(result)
  }

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

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    if let http = response as? HTTPURLResponse {
      status = http.statusCode
      for (name, value) in http.allHeaderFields {
        if let name = name as? String, let value = value as? String {
          headers[name.lowercased()] = value
        }
      }
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard !tooLarge else { return }
    if body.count + data.count > maxBytes {
      tooLarge = true
      body = Data()
      dataTask.cancel()
      return
    }
    body.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if tooLarge {
      finish((errOpenFailed, "The response is larger than \(maxBytes) bytes"))
    } else if mismatch {
      finish((errPinMismatch, "The TV's certificate does not match the one seen at pairing"))
    } else if let error {
      finish((errOpenFailed, error.localizedDescription))
    } else {
      finish(nil)
    }
  }
}

/// One TLS byte stream (Network framework) with its own trust decision, made in the verify block
/// exactly as the WebSocket path does: pairing accepts and records the leaf, a pin accepts only that
/// leaf. Chain and host name are never evaluated (the TV is self-signed and reached by IP). No proxy
/// is used and only the checked literal is dialled. Everything runs on `queue`.
private final class LanStream {
  let id: String
  /// nil: pairing (accept and record the leaf). Otherwise: accept only this leaf SHA-256.
  private let pin: String?
  private var promise: Promise?
  private weak var module: LanSocketModule?
  private static let queueKey = DispatchSpecificKey<Bool>()
  private let queue = DispatchQueue(label: "lan-stream")
  private var connection: NWConnection?
  private var leaf: SecCertificate?
  private var seenSha256: String?
  private var mismatch = false
  private var opened = false
  private var ended = false

  var isOpen: Bool { onQueue { self.opened && !self.ended } }

  init(id: String, pin: String?, promise: Promise, module: LanSocketModule) {
    self.id = id
    self.pin = pin
    self.promise = promise
    self.module = module
    queue.setSpecific(key: LanStream.queueKey, value: true)
  }

  /// The Keychain identity tagged `lan-identity:<ref>`, or nil.
  static func identity(ref: String) -> SecIdentity? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecAttrApplicationTag as String: Data("lan-identity:\(ref)".utf8),
      kSecReturnRef as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item,
      CFGetTypeID(item) == SecIdentityGetTypeID()
    else { return nil }
    // swiftlint:disable:next force_cast
    return (item as! SecIdentity)
  }

  func start(
    host: NWEndpoint.Host, port: NWEndpoint.Port, identity: SecIdentity?, timeout: TimeInterval
  ) {
    let tls = NWProtocolTLS.Options()
    let sec = tls.securityProtocolOptions
    if let identity, let secIdentity = sec_identity_create(identity) {
      sec_protocol_options_set_local_identity(sec, secIdentity)
    }
    sec_protocol_options_set_verify_block(
      sec,
      { [weak self] _, trust, complete in
        guard let self else {
          complete(false)
          return
        }
        let secTrust = sec_trust_copy_ref(trust).takeRetainedValue()
        guard let chain = SecTrustCopyCertificateChain(secTrust) as? [SecCertificate],
          let leaf = chain.first
        else {
          complete(false)
          return
        }
        let der = SecCertificateCopyData(leaf) as Data
        let sha = SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
        self.seenSha256 = sha
        self.leaf = leaf
        if let pin = self.pin, sha != pin {
          self.mismatch = true
          complete(false)
          return
        }
        // Pairing, or the pinned leaf: accept without chain or host-name evaluation.
        complete(true)
      }, queue)
    let tcp = NWProtocolTCP.Options()
    tcp.connectionTimeout = max(1, Int(timeout.rounded(.up)))
    let params = NWParameters(tls: tls, tcp: tcp)
    // No proxy: TV traffic never leaves the LAN through a system or MDM proxy.
    params.preferNoProxies = true
    let conn = NWConnection(host: host, port: port, using: params)
    conn.stateUpdateHandler = { [weak self] state in self?.changed(state) }
    queue.async {
      guard !self.ended else { return }
      self.connection = conn
      conn.start(queue: self.queue)
    }
    queue.asyncAfter(deadline: .now() + timeout) { [weak self] in
      guard let self, !self.opened, !self.ended else { return }
      self.finish(event: nil, why: "Timed out opening the stream")
    }
  }

  /// On `queue`.
  private func changed(_ state: NWConnection.State) {
    switch state {
    case .ready:
      guard !ended, let promise else { return }
      guard let leaf, let seenSha256 else {
        finish(event: nil, why: "The server sent no certificate")
        return
      }
      self.promise = nil
      opened = true
      let key = LanStream.rsaKey(leaf)
      promise.resolve([
        "certSha256": seenSha256,
        "serverModulusHex": key?.modulus ?? "",
        "serverExponentHex": key?.exponent ?? "",
        "serverSubject": Rfc2253.subject(of: SecCertificateCopyData(leaf) as Data) ?? "",
      ])
      receive()
    case .failed(let error), .waiting(let error):
      // `.waiting` would retry later; a stream to a TV fails instead, as Android does.
      let why = "\(error)"
      finish(event: ["id": id, "error": why], why: why)
    case .cancelled:
      finish(event: ["id": id, "error": "The stream ended"], why: "The stream ended")
    default:
      break
    }
  }

  private func receive() {
    connection?.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
      [weak self] data, _, isComplete, error in
      guard let self, !self.ended else { return }
      if let data, !data.isEmpty {
        self.module?.emit("data", ["id": self.id, "base64": data.base64EncodedString()])
      }
      if let error {
        let why = "\(error)"
        self.finish(event: ["id": self.id, "error": why], why: why)
      } else if isComplete {
        self.finish(event: ["id": self.id, "reason": "Closed by the TV"], why: "Closed by the TV")
      } else {
        self.receive()
      }
    }
  }

  func write(_ bytes: Data) {
    queue.async {
      guard self.opened, !self.ended, let conn = self.connection else { return }
      conn.send(
        content: bytes,
        completion: .contentProcessed { [weak self] error in
          guard let self, let error else { return }
          let why = "\(error)"
          self.finish(event: ["id": self.id, "error": why], why: why)
        })
    }
  }

  func closeByUs() {
    queue.async {
      guard !self.ended else { return }
      self.ended = true
      if let promise = self.promise {
        self.promise = nil
        promise.reject(lanError(errOpenFailed, "Cancelled"))
      }
      self.connection?.cancel()
    }
  }

  /// Runs on `queue`. Rejects a pending open, or reports the end of an open stream, once.
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
    connection?.cancel()
  }

  private func onQueue<T>(_ block: () -> T) -> T {
    if DispatchQueue.getSpecific(key: LanStream.queueKey) == true { return block() }
    return queue.sync(execute: block)
  }

  /// The leaf's RSA public key as upper-case hex without leading zeros, or nil for another key.
  static func rsaKey(_ leaf: SecCertificate) -> (modulus: String, exponent: String)? {
    guard let key = SecCertificateCopyKey(leaf),
      let attrs = SecKeyCopyAttributes(key) as? [String: Any],
      (attrs[kSecAttrKeyType as String] as? String) == (kSecAttrKeyTypeRSA as String),
      let pkcs1 = SecKeyCopyExternalRepresentation(key, nil) as Data?
    else { return nil }
    // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
    var outer = Der(pkcs1)
    guard let seq = outer.next(), seq.tag == 0x30 else { return nil }
    var inner = Der(seq.value)
    guard let n = inner.next(), n.tag == 0x02, let e = inner.next(), e.tag == 0x02 else {
      return nil
    }
    return (hexNoLeadingZeros(n.value), hexNoLeadingZeros(e.value))
  }

  private static func hexNoLeadingZeros(_ bytes: Data) -> String {
    let hex = bytes.map { String(format: "%02X", $0) }.joined()
    let trimmed = hex.drop(while: { $0 == "0" })
    return trimmed.isEmpty ? "0" : String(trimmed)
  }
}

/// A minimal DER reader: one tag-length-value at a time (definite lengths only).
private struct Der {
  private let bytes: [UInt8]
  private var at = 0

  init(_ data: Data) { bytes = [UInt8](data) }

  var atEnd: Bool { at >= bytes.count }

  /// The next element, with its full encoding in `raw`.
  mutating func next() -> (tag: UInt8, value: Data, raw: Data)? {
    let start = at
    guard at + 2 <= bytes.count else { return nil }
    let tag = bytes[at]
    var len = Int(bytes[at + 1])
    at += 2
    if len & 0x80 != 0 {
      let count = len & 0x7f
      guard count >= 1, count <= 4, at + count <= bytes.count else { return nil }
      len = 0
      for _ in 0..<count {
        len = (len << 8) | Int(bytes[at])
        at += 1
      }
    }
    guard len >= 0, at + len <= bytes.count else { return nil }
    let value = Data(bytes[at..<(at + len)])
    at += len
    return (tag, value, Data(bytes[start..<at]))
  }
}

/// The subject of a DER certificate in RFC 2253 form, as Java's
/// `X500Principal.getName(X500Principal.RFC2253)` writes it: RDNs last-first, known attribute
/// keywords, other attributes as `OID=#hex`.
private enum Rfc2253 {
  private static let keywords: [String: String] = [
    "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O",
    "2.5.4.11": "OU", "2.5.4.9": "STREET", "0.9.2342.19200300.100.1.25": "DC",
    "0.9.2342.19200300.100.1.1": "UID",
  ]

  static func subject(of cert: Data) -> String? {
    // Certificate ::= SEQUENCE { tbsCertificate, ... }
    var top = Der(cert)
    guard let certSeq = top.next(), certSeq.tag == 0x30 else { return nil }
    var c = Der(certSeq.value)
    guard let tbs = c.next(), tbs.tag == 0x30 else { return nil }
    var t = Der(tbs.value)
    // [0] version (optional), serialNumber, signature, issuer, validity, subject
    guard let first = t.next() else { return nil }
    if first.tag == 0xA0 && t.next() == nil { return nil }  // with a version, the serial follows
    guard t.next() != nil, t.next() != nil, t.next() != nil, let subject = t.next(),
      subject.tag == 0x30
    else { return nil }
    var rdns: [String] = []
    var s = Der(subject.value)
    while !s.atEnd {
      guard let set = s.next(), set.tag == 0x31 else { return nil }
      var attrs: [String] = []
      var a = Der(set.value)
      while !a.atEnd {
        guard let pair = a.next(), pair.tag == 0x30 else { return nil }
        var p = Der(pair.value)
        guard let oid = p.next(), oid.tag == 0x06, let value = p.next() else { return nil }
        let dotted = oidString(oid.value)
        if let keyword = keywords[dotted], let text = string(tag: value.tag, value.value) {
          attrs.append("\(keyword)=\(escape(text))")
        } else {
          attrs.append("\(dotted)=#" + value.raw.map { String(format: "%02x", $0) }.joined())
        }
      }
      rdns.append(attrs.joined(separator: "+"))
    }
    return rdns.reversed().joined(separator: ",")
  }

  private static func string(tag: UInt8, _ value: Data) -> String? {
    switch tag {
    case 0x0C: return String(data: value, encoding: .utf8)  // UTF8String
    case 0x13, 0x16, 0x14: return String(data: value, encoding: .isoLatin1)  // Printable, IA5, T61
    case 0x1E: return String(data: value, encoding: .utf16BigEndian)  // BMPString
    case 0x1C: return String(data: value, encoding: .utf32BigEndian)  // UniversalString
    default: return nil
    }
  }

  private static func escape(_ text: String) -> String {
    var out = ""
    for (i, ch) in text.enumerated() {
      let first = i == 0
      let last = i == text.count - 1
      if ",+\"\\<>;".contains(ch) || (first && (ch == "#" || ch == " ")) || (last && ch == " ") {
        out.append("\\")
      }
      out.append(ch)
    }
    return out
  }

  private static func oidString(_ bytes: Data) -> String {
    var parts: [UInt64] = []
    var acc: UInt64 = 0
    for b in bytes {
      acc = (acc << 7) | UInt64(b & 0x7f)
      if b & 0x80 == 0 {
        parts.append(acc)
        acc = 0
      }
    }
    guard let first = parts.first else { return "" }
    let head: [UInt64] = first < 80 ? [first / 40, first % 40] : [2, first - 80]
    return (head + parts.dropFirst()).map(String.init).joined(separator: ".")
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

  /// The endpoint for a host that passed `isLocalLiteral`: an IP literal, never a name to resolve.
  static func endpointHost(_ rawHost: String) -> NWEndpoint.Host? {
    var host = rawHost
    if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
    if host.contains(":") { return IPv6Address(host).map { .ipv6($0) } }
    return IPv4Address(host).map { .ipv4($0) }
  }

  private static func isLocalV4(_ b: [UInt8]) -> Bool {
    guard b.count == 4 else { return false }
    return b[0] == 10 || b[0] == 127 || (b[0] == 172 && (16...31).contains(b[1]))
      || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
  }
}

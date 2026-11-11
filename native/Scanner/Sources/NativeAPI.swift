import Foundation
import WebKit

indirect enum NativeJSON: Codable, Equatable, Sendable {
  case object([String: NativeJSON])
  case array([NativeJSON])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null
  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let v = try? c.decode(Bool.self) {
      self = .bool(v)
    } else if let v = try? c.decode(Double.self) {
      self = .number(v)
    } else if let v = try? c.decode(String.self) {
      self = .string(v)
    } else if let v = try? c.decode([NativeJSON].self) {
      self = .array(v)
    } else {
      self = .object(try c.decode([String: NativeJSON].self))
    }
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .object(let v): try c.encode(v)
    case .array(let v): try c.encode(v)
    case .string(let v): try c.encode(v)
    case .number(let v): try c.encode(v)
    case .bool(let v): try c.encode(v)
    case .null: try c.encodeNil()
    }
  }
  subscript(_ key: String) -> NativeJSON {
    if case .object(let v) = self { return v[key] ?? .null }
    return .null
  }
  var string: String {
    if case .string(let v) = self { return v }
    return ""
  }
  var int: Int {
    if case .number(let v) = self { return Int(v) }
    return 0
  }
  var flag: Bool {
    if case .bool(let v) = self { return v }
    return false
  }
  var items: [NativeJSON] {
    if case .array(let v) = self { return v }
    return []
  }
  var dictionary: [String: NativeJSON] {
    if case .object(let v) = self { return v }
    return [:]
  }
  var id: String { self["id"].string }
  static func text(_ v: String) -> NativeJSON { .string(v) }
  static func fields(_ values: [String: String]) -> NativeJSON {
    .object(values.mapValues { .string($0) })
  }
  var display: String {
    switch self {
    case .string(let v): return v
    case .number(let v): return v.rounded() == v ? String(Int(v)) : String(v)
    case .bool(let v): return v ? "Yes" : "No"
    case .array(let v): return v.map(\.display).joined(separator: ", ")
    case .null: return ""
    case .object: return ""
    }
  }
}
struct NativeAPIError: LocalizedError {
  let status: Int
  let code: String
  let message: String
  let fields: NativeJSON
  var errorDescription: String? { message }
  var uncertain: Bool { status >= 500 || status == 0 }
}
@MainActor final class NativeAPI: NSObject, URLSessionTaskDelegate {
  let cookies: WKHTTPCookieStore
  private var csrf = ""
  private var epoch = 0
  private var tasks: [UUID: Task<(Data, URLResponse), Error>] = [:]
  private lazy var transport: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.httpCookieStorage = nil
    c.httpShouldSetCookies = false
    c.urlCache = nil
    c.timeoutIntervalForRequest = 15
    c.timeoutIntervalForResource = 25
    return URLSession(configuration: c, delegate: self, delegateQueue: nil)
  }()
  init(cookies: WKHTTPCookieStore) { self.cookies = cookies }
  nonisolated func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  func invalidate() {
    epoch += 1
    csrf = ""
    for t in tasks.values { t.cancel() }
    tasks.removeAll()
  }
  func session() async throws -> NativeJSON {
    let value = try await request("/auth/session")
    csrf = value["csrfToken"].string
    return value
  }
  func request(
    _ path: String, method: String = "GET", body: NativeJSON? = nil, key: String? = nil,
    retry: Bool = true
  ) async throws -> NativeJSON {
    #if DEBUG
      if NativeFixtures.enabled {
        return try await NativeFixtures.response(path, method: method, body: body)
      }
    #endif
    guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"),
      let url = URL(string: ScannerPolicy.origin + "/api/v1" + path), ScannerPolicy.trusted(url)
    else {
      throw NativeAPIError(
        status: 0, code: "INVALID_PATH", message: "This destination is unavailable.", fields: .null)
    }
    let generation = epoch
    if method != "GET" && csrf.isEmpty { _ = try await session() }
    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    req.httpMethod = method
    req.setValue(ScannerPolicy.origin, forHTTPHeaderField: "Origin")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    let list = await cookies.allCookies().filter {
      $0.domain == "gdggt.dev" && $0.isSecure && $0.path == "/"
    }
    if let value = HTTPCookie.requestHeaderFields(with: list)["Cookie"] {
      req.setValue(value, forHTTPHeaderField: "Cookie")
    }
    if !csrf.isEmpty { req.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
    if let key { req.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
    if let body {
      req.httpBody = try JSONEncoder().encode(body)
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    guard generation == epoch else { throw CancellationError() }
    let id = UUID()
    let task = Task { try await transport.data(for: req) }
    tasks[id] = task
    defer { tasks.removeValue(forKey: id) }
    let (data, response) = try await task.value
    guard generation == epoch, !Task.isCancelled else { throw CancellationError() }
    guard let http = response as? HTTPURLResponse, ScannerPolicy.trusted(http.url),
      data.count <= 8 * 1024 * 1024
    else {
      throw NativeAPIError(
        status: 0, code: "UNEXPECTED_RESPONSE",
        message: "The server returned an unexpected response.", fields: .null)
    }
    let raw = try JSONDecoder().decode(NativeJSON.self, from: data)
    if !(200...299).contains(http.statusCode) {
      let error = NativeAPIError(
        status: http.statusCode, code: raw["error"]["code"].string,
        message: raw["error"]["message"].string.isEmpty
          ? "The request could not be completed." : raw["error"]["message"].string,
        fields: raw["error"]["fields"])
      if error.code == "CSRF_INVALID" && retry && path != "/auth/session" {
        _ = try await session()
        return try await request(path, method: method, body: body, key: key, retry: false)
      }
      if http.statusCode == 401 {
        NotificationCenter.default.post(name: .nativeAuthenticationRequired, object: nil)
      }
      throw error
    }
    return raw["data"]
  }
  func downloadAuthorized(_ authorization: NativeJSON) async throws -> URL {
    guard let url = URL(string: authorization["url"].string), url.scheme == "https",
      url.user == nil, url.password == nil, url.fragment == nil,
      (1...60).contains(authorization["expiresIn"].int)
    else { throw SignInFailure.message("The file authorization could not be verified.") }
    let g = epoch
    let (temporary, response) = try await transport.download(
      for: URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard g == epoch, let http = response as? HTTPURLResponse, http.statusCode == 200,
      http.url?.host == url.host, http.url?.scheme == "https",
      let ext = ScannerPolicy.downloadExtension(http.mimeType),
      response.expectedContentLength <= 64 * 1024 * 1024
    else { throw SignInFailure.message("The file download expired or is unavailable.") }
    let attrs = try FileManager.default.attributesOfItem(atPath: temporary.path)
    guard (attrs[.size] as? Int ?? Int.max) <= 64 * 1024 * 1024 else {
      throw SignInFailure.message("This file is too large to open on this device.")
    }
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "GDGNativeShares", isDirectory: true)
    try FileManager.default.createDirectory(
      at: folder, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    let destination = folder.appendingPathComponent(UUID().uuidString + "." + ext)
    try FileManager.default.copyItem(at: temporary, to: destination)
    return destination
  }
  func download(_ path: String) async throws -> URL {
    guard path.hasPrefix("/api/v1/admin/"), let url = URL(string: ScannerPolicy.origin + path),
      ScannerPolicy.trusted(url)
    else { throw SignInFailure.message("This file cannot be opened.") }
    let generation = epoch
    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    let list = await cookies.allCookies().filter {
      $0.domain == "gdggt.dev" && $0.isSecure && $0.path == "/"
    }
    if let value = HTTPCookie.requestHeaderFields(with: list)["Cookie"] {
      req.setValue(value, forHTTPHeaderField: "Cookie")
    }
    req.setValue(ScannerPolicy.origin, forHTTPHeaderField: "Origin")
    let (temporary, response) = try await transport.download(for: req)
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard generation == epoch, let http = response as? HTTPURLResponse, http.statusCode == 200,
      ScannerPolicy.trusted(http.url), let ext = ScannerPolicy.downloadExtension(http.mimeType),
      response.expectedContentLength <= 64 * 1024 * 1024
    else { throw SignInFailure.message("This file is unavailable or your session has expired.") }
    let attrs = try FileManager.default.attributesOfItem(atPath: temporary.path)
    guard (attrs[.size] as? Int ?? Int.max) <= 64 * 1024 * 1024 else {
      throw SignInFailure.message("This file is too large to share on this device.")
    }
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "GDGNativeShares", isDirectory: true)
    try FileManager.default.createDirectory(
      at: folder, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    let destination = folder.appendingPathComponent(UUID().uuidString + "." + ext)
    try FileManager.default.copyItem(at: temporary, to: destination)
    return destination
  }
}
extension Notification.Name {
  static let nativeAuthenticationRequired = Notification.Name("nativeAuthenticationRequired")
}

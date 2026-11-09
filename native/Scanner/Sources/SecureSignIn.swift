import Foundation
import Security
import LocalAuthentication
import WebKit

struct OfficerCredentials: Codable {
    let code: String
    let email: String
    let password: String
}

/// Only the OS biometric prompt can release this device-bound Keychain item.
enum OfficerKeychain {
    private static let service = "dev.gdggt.scanner.officer"
    private static let account = "remembered-officer"
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    static var available: Bool {
        var result: CFTypeRef?
        var q = query
        q[kSecReturnAttributes as String] = true
        let context = LAContext(); context.interactionNotAllowed = true
        q[kSecUseAuthenticationContext as String] = context
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }
    static func remove() { SecItemDelete(query as CFDictionary) }
    static func save(_ credentials: OfficerCredentials) throws {
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, &error) else {
            throw SignInFailure.message("Enable Face ID and a device passcode to remember this account.")
        }
        var q = query
        q[kSecAttrAccessControl as String] = access
        q[kSecValueData as String] = try JSONEncoder().encode(credentials)
        remove()
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else {
            throw SignInFailure.message("Your account signed in, but Face ID sign-in could not be saved.")
        }
    }
    static func read(context: LAContext) throws -> OfficerCredentials {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecUseAuthenticationContext as String] = context
        context.localizedReason = "Unlock your GDG workspace"
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else {
            throw SignInFailure.message("Face ID did not unlock your account. Try again or sign in with your password.")
        }
        return try JSONDecoder().decode(OfficerCredentials.self, from: data)
    }
}
enum SignInFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

/// Native credentials never enter JavaScript, UserDefaults, logs or browser storage.
/// Cookies remain in this app's existing WebKit store; server expiry/revocation still apply.
final class OfficerSignIn: NSObject, URLSessionTaskDelegate {
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
    private func request(_ path: String, body: [String: String]?, cookies: [HTTPCookie]) async throws -> (HTTPURLResponse, Data, [HTTPCookie]) {
        let url = URL(string: ScannerPolicy.origin + path)!
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue(ScannerPolicy.origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let header = HTTPCookie.requestHeaderFields(with: cookies)["Cookie"] { request.setValue(header, forHTTPHeaderField: "Cookie") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, result) = try await session.data(for: request)
        guard let response = result as? HTTPURLResponse, ScannerPolicy.trusted(response.url), data.count <= 131072 else {
            throw SignInFailure.message("The sign-in server returned an unexpected response.")
        }
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { output, entry in output[String(describing: entry.key)] = String(describing: entry.value) }
        return (response, data, HTTPCookie.cookies(withResponseHeaderFields: headers, for: url))
    }
    @MainActor
    func authenticate(_ credentials: OfficerCredentials, store: WKHTTPCookieStore, restore: Bool) async throws -> Bool {
        var cookies = await store.allCookies().filter { $0.domain == "gdggt.dev" && $0.isSecure && $0.path == "/" }
        if restore {
            let (response, data, _) = try await request("/api/v1/admin/me", body: nil, cookies: cookies)
            if response.statusCode == 200 {
                let body = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                let account = (body?["data"] as? [String: Any])?["user"] as? [String: Any]
                if (account?["email"] as? String)?.lowercased() == credentials.email.lowercased() { return false }
            }
            guard response.statusCode == 401 || response.statusCode == 200 else { throw SignInFailure.message("Your account could not be checked. Try again when connected.") }
        }
        let (gate, _, gateCookies) = try await request("/api/v1/auth/gate", body: ["code": credentials.code], cookies: cookies)
        guard gate.statusCode == 200 else {
            throw SignInFailure.message(gate.statusCode == 429 ? "Too many attempts. Wait before trying again." : "The access code could not be verified.")
        }
        for cookie in gateCookies { cookies.removeAll { $0.name == cookie.name }; cookies.append(cookie) }
        let (login, _, loginCookies) = try await request("/api/v1/auth/login", body: ["email": credentials.email, "password": credentials.password], cookies: cookies)
        guard login.statusCode == 200 else {
            throw SignInFailure.message(login.statusCode == 429 ? "Too many attempts. Wait before trying again." : "Sign-in failed. Check your access code, email and password.")
        }
        for cookie in gateCookies + loginCookies where cookie.domain == "gdggt.dev" && cookie.isSecure && cookie.isHTTPOnly {
            await store.setCookie(cookie)
        }
        return true
    }
}

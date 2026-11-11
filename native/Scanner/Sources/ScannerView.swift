import Foundation
import LocalAuthentication
import SwiftUI
import UserNotifications
import WebKit

enum NativeTab: Hashable { case home, events, checkin, members, more }
enum NativeSheet: String, Identifiable {
  case notifications, profile, notificationSettings
  var id: String { rawValue }
}
@MainActor final class ScannerModel: ObservableObject {
  @Published var unlocked = false
  @Published var hasRememberedAccount = OfficerKeychain.available
  @Published var signingIn = false
  @Published var signInNotice: String?
  @Published var user: NativeJSON = .null
  @Published var routes: Set<String> = []
  @Published var selectedTab: NativeTab = .home
  @Published var sheet: NativeSheet?
  @Published var unread = 0
  let api: NativeAPI
  let checkin: NativeCheckinModel
  private let cookieStore = WKWebsiteDataStore.default().httpCookieStore
  private let signInClient = OfficerSignIn()
  private var generation = 0
  private var authenticationContext: LAContext?
  var biometryAvailable: Bool {
    LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
  }
  var superAdmin: Bool { user["role"].string == "super_admin" }
  var name: String {
    user["display_name"].string.isEmpty
      ? user["email"].string.components(separatedBy: "@").first ?? "Officer"
      : user["display_name"].string
  }
  init() {
    let client = NativeAPI(cookies: WKWebsiteDataStore.default().httpCookieStore)
    api = client
    checkin = NativeCheckinModel(api: client)
    NotificationCenter.default.addObserver(
      forName: .nativeAuthenticationRequired, object: nil, queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        self?.lock()
        self?.signInNotice = "Your session expired. Unlock to sign in again."
      }
    }
    NotificationCenter.default.addObserver(forName: .gdgPushOpened, object: nil, queue: .main) {
      [weak self] _ in Task { @MainActor in self?.openPush() }
    }
    #if DEBUG
      if NativeFixtures.enabled {
        hasRememberedAccount = false
        Task { try? await self.openWorkspace() }
      }
    #endif
  }
  #if DEBUG
    func resumeFixture() async { if NativeFixtures.enabled { try? await openWorkspace() } }
  #endif
  func signIn(_ credentials: OfficerCredentials, remember: Bool) async {
    guard !signingIn else { return }
    signingIn = true
    signInNotice = nil
    let g = generation
    defer { signingIn = false }
    do {
      if remember {
        let context = LAContext()
        authenticationContext = context
        guard
          try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Enable Face ID sign-in for GDG")
        else { return }
      }
      guard g == generation else { return }
      _ = try await signInClient.authenticate(credentials, store: cookieStore, restore: false)
      guard g == generation else { return }
      if remember { try OfficerKeychain.save(credentials) } else { OfficerKeychain.remove() }
      hasRememberedAccount = OfficerKeychain.available
      try await openWorkspace()
    } catch { if g == generation { signInNotice = error.localizedDescription } }
    authenticationContext = nil
  }
  func unlock() async {
    guard !signingIn, !unlocked else { return }
    signingIn = true
    signInNotice = nil
    let g = generation
    defer { signingIn = false }
    do {
      let context = LAContext()
      authenticationContext = context
      let credentials = try await Task.detached { try OfficerKeychain.read(context: context) }.value
      guard g == generation else { return }
      _ = try await signInClient.authenticate(credentials, store: cookieStore, restore: true)
      guard g == generation else { return }
      try await openWorkspace()
    } catch { if g == generation { signInNotice = error.localizedDescription } }
    authenticationContext = nil
  }
  private func openWorkspace() async throws {
    let g = generation
    let session = try await api.session()
    let access = try await api.request("/admin/access")
    guard g == generation else { return }
    let account = session["user"]
    if !user.id.isEmpty && user.id != account.id {
      checkin.reset()
      unread = 0
    }
    user = account
    routes = Set(access["accessibleRoutes"].items.map(\.string))
    unlocked = true
    signInNotice = nil
    openPush()
    Task { await syncNotifications() }
  }
  func lock() {
    generation += 1
    authenticationContext?.invalidate()
    authenticationContext = nil
    checkin.pause()
    api.invalidate()
    unlocked = false
  }
  func forgetLocally() {
    lock()
    OfficerKeychain.remove()
    hasRememberedAccount = false
    signInNotice = nil
    sheet = nil
    user = .null
    routes = []
    unread = 0
    checkin.reset()
    NativeNotifications.shared.forget()
    signingIn = true
    WKWebsiteDataStore.default().removeData(
      ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast
    ) { [weak self] in Task { @MainActor in self?.signingIn = false } }
    try? FileManager.default.removeItem(
      at: FileManager.default.temporaryDirectory.appendingPathComponent("GDGNativeShares"))
  }
  func signOut() async throws {
    _ = try await api.request("/auth/session", method: "DELETE")
    forgetLocally()
  }
  func openPush() {
    guard unlocked, NativeNotifications.shared.pendingOpen else { return }
    NativeNotifications.shared.pendingOpen = false
    sheet = .notifications
  }
  func syncNotifications() async {
    #if DEBUG
      if NativeFixtures.enabled { return }
    #endif
    do {
      let settings = try await api.request("/admin/app-notifications")
      let state = try await pushState("status")
      guard let installation = state["installationId"] as? String,
        settings["devices"].items.contains(where: { $0["installationId"].string == installation })
      else { return }
      try await registerPush(state)
    } catch
    { /* Settings presents actionable provider errors; no background prompts or logging of tokens. */
    }
  }
  func pushState(_ method: String) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      NativeNotifications.shared.request(id: UUID().uuidString, method: method) { state, error in
        if let state {
          continuation.resume(returning: state)
        } else {
          continuation.resume(
            throwing: SignInFailure.message(error ?? "Notifications could not register."))
        }
      }
    }
  }
  func registerPush(_ state: [String: Any]) async throws {
    guard let token = state["token"] as? String,
      let installation = state["installationId"] as? String
    else { throw SignInFailure.message("Allow notifications in iPhone Settings to continue.") }
    _ = try await api.request(
      "/admin/app-notifications/devices", method: "POST",
      body: .fields([
        "platform": "ios", "installationId": installation,
        "environment": state["environment"] as? String ?? "production", "token": token,
        "label": "iPhone app",
      ]))
  }
  func updateBadge(_ count: Int) {
    unread = count
    UNUserNotificationCenter.current().setBadgeCount(min(9999, max(0, count))) { _ in }
  }
}

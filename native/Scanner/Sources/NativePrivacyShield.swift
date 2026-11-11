import SwiftUI
import UIKit

/// A separate window covers every native sheet as well as the root navigation stack.
/// Keeping the workspace mounted preserves in-memory drafts while Face ID is locked.
@MainActor final class NativePrivacyShield {
  static let shared = NativePrivacyShield()
  private var window: UIWindow?
  private weak var previous: UIWindow?
  func update(model: ScannerModel, active: Bool) {
    if active && model.unlocked {
      hide()
      return
    }
    guard window == nil,
      let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(
        where: { $0.activationState != .unattached })
    else { return }
    previous = scene.windows.first(where: { $0.isKeyWindow })
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    let cover = UIWindow(windowScene: scene)
    cover.windowLevel = .alert + 1
    cover.rootViewController = UIHostingController(rootView: NativePrivacyScreen(model: model))
    cover.backgroundColor = .systemGroupedBackground
    window = cover
    cover.makeKeyAndVisible()
  }
  func hide() {
    window?.isHidden = true
    window?.rootViewController = nil
    window = nil
    previous?.makeKeyAndVisible()
    previous = nil
  }
}
private struct NativePrivacyScreen: View {
  @ObservedObject var model: ScannerModel
  var body: some View {
    Group {
      if model.unlocked {
        Color(.systemGroupedBackground).ignoresSafeArea().overlay {
          Label("GDG@GT", systemImage: "lock.fill").font(.title2.bold())
        }
      } else {
        NativeSignInScreen(model: model).background(
          Color(.systemGroupedBackground).ignoresSafeArea())
      }
    }.tint(Color(red: 0.72, green: 0.25, blue: 0.19)).preferredColorScheme(.light)
  }
}

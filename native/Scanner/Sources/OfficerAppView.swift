import SwiftUI

struct OfficerAppView: View {
  @StateObject private var model = ScannerModel()
  @Environment(\.scenePhase) private var phase
  var body: some View {
    ZStack {
      if !model.user.id.isEmpty {
        NativeWorkspace().environmentObject(model).id(model.user.id).disabled(!model.unlocked)
          .accessibilityHidden(!model.unlocked)
      } else {
        NativeSignInScreen(model: model)
      }
      if phase != .active {
        Color(.systemGroupedBackground).ignoresSafeArea().overlay {
          Label("GDG@GT", systemImage: "lock.fill").font(.title2.bold())
        }
      }
    }
    .onChange(of: phase) { _, value in
      if value == .background { model.lock() }
      NativePrivacyShield.shared.update(model: model, active: value == .active)
      #if DEBUG
        if value == .active && NativeFixtures.enabled && !model.unlocked {
          Task { await model.resumeFixture() }
        }
      #endif
      if value == .active && model.hasRememberedAccount && !model.unlocked {
        Task { await model.unlock() }
      }
    }
    .onChange(of: model.unlocked) { _, _ in
      NativePrivacyShield.shared.update(model: model, active: phase == .active)
    }
    .task { if model.hasRememberedAccount { await model.unlock() } }
  }
}
struct NativeSignInScreen: View {
  @ObservedObject var model: ScannerModel
  @State private var code = ""
  @State private var email = ""
  @State private var password = ""
  @State private var remember = true
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 26) {
          HStack(spacing: 10) {
            Image("AppMark").resizable().scaledToFit().frame(width: 32, height: 24)
            Text("GDG@GT").font(.headline)
          }.padding(.top, 20)
          VStack(alignment: .leading, spacing: 10) {
            Text(model.hasRememberedAccount ? "Welcome back" : "Your chapter.\nIn your pocket.")
              .font(.system(size: 36, weight: .bold, design: .rounded))
            Text(
              model.hasRememberedAccount
                ? "Unlock your workspace to continue." : "The tools you need, ready when you are."
            ).foregroundStyle(.secondary)
          }
          if model.hasRememberedAccount {
            Image(systemName: "faceid").font(.system(size: 64)).foregroundStyle(.tint).frame(
              maxWidth: .infinity
            ).padding(.vertical, 30)
            Button {
              Task { await model.unlock() }
            } label: {
              Label("Unlock with Face ID", systemImage: "faceid").frame(
                maxWidth: .infinity, minHeight: 42)
            }.buttonStyle(.borderedProminent).disabled(model.signingIn)
            Button("Use another account") { model.forgetLocally() }.frame(
              maxWidth: .infinity, minHeight: 42
            ).disabled(model.signingIn)
          } else {
            VStack(alignment: .leading, spacing: 18) {
              field("Chapter access code") {
                SecureField("Access code", text: $code).textContentType(.none)
              }
              field("Email") {
                TextField("you@gatech.edu", text: $email).textContentType(.username).keyboardType(
                  .emailAddress
                ).textInputAutocapitalization(.never).autocorrectionDisabled()
              }
              field("Password") {
                SecureField("Password", text: $password).textContentType(.password)
              }
              Toggle("Remember with Face ID", isOn: $remember).disabled(!model.biometryAvailable)
              Button {
                let credentials = OfficerCredentials(
                  code: code, email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                  password: password)
                code = ""
                password = ""
                Task {
                  await model.signIn(credentials, remember: remember && model.biometryAvailable)
                }
              } label: {
                Text(model.signingIn ? "Signing in…" : "Sign in").frame(
                  maxWidth: .infinity, minHeight: 42)
              }.buttonStyle(.borderedProminent).disabled(
                model.signingIn || code.isEmpty || email.isEmpty || password.isEmpty)
            }
          }
          if model.signingIn { ProgressView().frame(maxWidth: .infinity) }
          if let message = model.signInNotice { NativeErrorView(error: message) }
        }.padding(24).frame(maxWidth: 540).frame(maxWidth: .infinity)
      }.scrollDismissesKeyboard(.interactively).background(Color(.systemGroupedBackground)).toolbar(
        .hidden, for: .navigationBar)
    }
    .onChange(of: model.unlocked) { _, _ in
      code = ""
      password = ""
    }
  }
  func field<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.subheadline.weight(.medium))
      content().padding(15).background(
        Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
  }
}
struct NativeWorkspace: View {
  @EnvironmentObject var model: ScannerModel
  var body: some View {
    TabView(selection: $model.selectedTab) {
      NavigationStack { NativeHome() }.tabItem { Label("Home", systemImage: "house") }.tag(
        NativeTab.home)
      NavigationStack { NativeEventList() }.tabItem { Label("Events", systemImage: "calendar") }
        .tag(NativeTab.events)
      Group {
        if model.superAdmin {
          NavigationStack { NativeCheckinScreen(model: model.checkin) }
        } else {
          NavigationStack {
            NativeEmpty(
              title: "Check-in access", symbol: "lock",
              message: "Your account cannot change attendance or points.")
          }
        }
      }.tabItem { Label("Check-in", systemImage: "wave.3.right") }.tag(NativeTab.checkin)
      NavigationStack { NativeMemberList() }.tabItem { Label("Members", systemImage: "person.2") }
        .tag(NativeTab.members)
      NavigationStack { NativeMore() }.tabItem { Label("More", systemImage: "square.grid.2x2") }
        .tag(NativeTab.more).badge(model.unread)
    }
    .sheet(item: $model.sheet) { sheet in
      NavigationStack {
        Group {
          switch sheet {
          case .notifications: NativeNotificationList()
          case .profile: NativeProfile()
          case .notificationSettings: NativeNotificationSettings()
          }
        }.toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { model.sheet = nil } }
        }
      }.environmentObject(model)
    }
  }
}

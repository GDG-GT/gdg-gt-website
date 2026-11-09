import SwiftUI
import LocalAuthentication

struct OfficerDestination: Identifiable {
    let path: String
    let title: String
    let symbol: String
    var id: String { path }
}

struct OfficerAppView: View {
    @StateObject private var model = ScannerModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var code = ""
    @State private var email = ""
    @State private var password = ""
    @State private var remember = true
    @State private var tools = false
    @State private var search = ""
    private let canvas = Color(red: 0.97, green: 0.97, blue: 0.96)
    var body: some View {
        ZStack {
            canvas.ignoresSafeArea()
            if model.unlocked {
                NavigationStack {
                    WorkspaceView(model: model)
                        .accessibilityHidden(scenePhase != .active)
                        .overlay(alignment: .top) {
                            if model.loading { ProgressView().padding(10).background(.regularMaterial, in: Capsule()).padding(8).accessibilityLabel("Loading workspace") }
                        }
                        .overlay { if let error = model.error { ContentUnavailableView { Label("Couldn’t load workspace", systemImage: "wifi.exclamationmark") } description: { Text(error) } actions: { Button("Try again") { model.reload() } } .background(canvas) } }
                        .navigationTitle(model.pageTitle)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            if model.canGoBack && !model.destinations.contains(where: { $0.path == model.path }) {
                                ToolbarItem(placement: .topBarLeading) {
                                    Button { model.navigateBack() } label: { Label("Back", systemImage: "chevron.left") }
                                }
                            }
                            ToolbarItem(placement: .topBarTrailing) {
                                Button { model.requestNavigation("notifications") } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications")
                            }
                            ToolbarItem(placement: .topBarTrailing) {
                                Menu {
                                    Button("Find a tool", systemImage: "magnifyingglass") { model.requestNavigation("search") }
                                    Button("Reload", systemImage: "arrow.clockwise") { model.requestNavigation("reload") }
                                    Button("Lock app", systemImage: "lock") { model.lock() }
                                    Button("Sign out and forget account", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { model.requestNavigation("signOut") }
                                } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Account and app options")
                            }
                        }
                        .safeAreaInset(edge: .bottom, spacing: 0) {
                            HStack(spacing: 0) {
                                tab("Home", "house", "/admin")
                                tab("Events", "calendar", "/admin/events")
                                tab("Check-in", "wave.3.right", "/admin/rewards")
                                tab("Members", "person.2", "/admin/members")
                                Button { tools = true } label: { VStack(spacing: 5) { Image(systemName: "square.grid.2x2").font(.system(size: 20)); Text("More").font(.caption2) }.frame(maxWidth: .infinity, minHeight: 54).contentShape(Rectangle()) }.foregroundStyle(.secondary)
                            }.padding(.horizontal, 8).background(.bar)
                        }
                }
            } else {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            Label("GDG@GT", systemImage: "chevron.left.forwardslash.chevron.right").font(.headline).foregroundStyle(.tint)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(model.hasRememberedAccount ? "Welcome back" : "Chapter workspace").font(.largeTitle.bold())
                                Text(model.hasRememberedAccount ? "Unlock your workspace to continue." : "Your chapter, wherever you are.").foregroundStyle(.secondary)
                            }
                            if model.hasRememberedAccount {
                                Image(systemName: "faceid").font(.system(size: 58)).foregroundStyle(.tint).frame(maxWidth: .infinity).padding(.vertical, 24).accessibilityHidden(true)
                                Button { Task { await model.unlock() } } label: { Label("Unlock with Face ID", systemImage: "faceid").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.borderedProminent).disabled(model.signingIn)
                                Button("Use another account") { model.forgetLocally() }.frame(maxWidth: .infinity, minHeight: 44).disabled(model.signingIn)
                            } else {
                                VStack(spacing: 18) {
                                    field("Access code") { SecureField("Chapter access code", text: $code).textContentType(.none) }
                                    field("Email") { TextField("Email address", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }
                                    field("Password") { SecureField("Password", text: $password).textContentType(.password) }
                                    Toggle("Remember with Face ID", isOn: $remember).disabled(!model.biometryAvailable)
                                    if !model.biometryAvailable { Text("Set up Face ID or Touch ID in iPhone Settings to remember this account.").font(.footnote).foregroundStyle(.secondary) }
                                    Button {
                                        let credentials = OfficerCredentials(code: code, email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
                                        password = ""; code = ""
                                        Task { await model.signIn(credentials, remember: remember && model.biometryAvailable) }
                                    } label: { Text(model.signingIn ? "Signing in…" : "Sign in").frame(maxWidth: .infinity, minHeight: 44) }
                                    .buttonStyle(.borderedProminent).disabled(model.signingIn || code.isEmpty || email.isEmpty || password.isEmpty)
                                }
                            }
                            if model.signingIn { ProgressView().frame(maxWidth: .infinity) }
                            if let message = model.signInNotice { Text(message).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
                        }.padding(24).frame(maxWidth: 540).frame(maxWidth: .infinity)
                    }.scrollDismissesKeyboard(.interactively).background(canvas).toolbar(.hidden, for: .navigationBar)
                }
            }
            // Covers account data in the app switcher, before the system takes its snapshot.
            if scenePhase != .active { canvas.ignoresSafeArea().overlay { Label("GDG@GT", systemImage: "lock.fill").font(.title2.bold()) } }
        }
        .sheet(isPresented: $tools) {
            NavigationStack {
                List {
                    ForEach(model.destinations.filter { search.isEmpty || $0.title.localizedCaseInsensitiveContains(search) }) { destination in
                        Button { tools = false; model.requestNavigation(destination.path) } label: { Label(destination.title, systemImage: destination.symbol).frame(minHeight: 32) }.foregroundStyle(.primary)
                    }
                    Section("Security") {
                        Button("Lock app", systemImage: "lock") { tools = false; model.lock() }
                        Button("Sign out and forget account", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { tools = false; model.requestNavigation("signOut") }
                    }
                }.scrollContentBackground(.hidden).background(canvas).searchable(text: $search, prompt: "Find a chapter tool").navigationTitle("All tools").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { tools = false } } }
            }
        }
        .onChange(of: scenePhase) { _, value in
            if value == .background { tools = false; model.lock(); code = ""; password = "" }
            if value == .active && model.hasRememberedAccount && !model.unlocked { Task { await model.unlock() } }
        }
        .task { if model.hasRememberedAccount { await model.unlock() } }
    }
    private func tab(_ title: String, _ symbol: String, _ path: String) -> some View {
        let enabled = model.destinations.contains { $0.path == path }
        let selected = model.path == path || (path != "/admin" && model.path.hasPrefix(path + "/"))
        return Button { model.requestNavigation(path) } label: {
            VStack(spacing: 5) { Image(systemName: selected ? symbol + (symbol == "wave.3.right" || symbol == "calendar" ? "" : ".fill") : symbol).font(.system(size: 20)); Text(title).font(.caption2) }.frame(maxWidth: .infinity, minHeight: 54).contentShape(Rectangle())
        }.disabled(!enabled).foregroundStyle(selected ? Color.accentColor : Color.secondary).accessibilityAddTraits(selected ? [.isSelected] : [])
    }
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 7) { Text(label).font(.subheadline.weight(.medium)); content().padding(13).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12)) }
    }
}

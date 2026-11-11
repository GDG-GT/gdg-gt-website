import SwiftUI

struct NativeMore: View {
  @EnvironmentObject var session: ScannerModel
  @State private var signingOut = false
  @State private var error: String?
  @State private var confirm = false
  var body: some View {
    List {
      Section {
        Button {
          session.sheet = .profile
        } label: {
          HStack(spacing: 14) {
            NativeAvatar(name: session.name, size: 54)
            VStack(alignment: .leading, spacing: 5) {
              Text(session.name).font(.headline).foregroundStyle(.primary)
              Text(session.user["email"].string).font(.caption).foregroundStyle(.secondary)
            }
          }.padding(.vertical, 5)
        }
      }
      Section("Workspace") {
        NavigationLink {
          NativeTaskList()
        } label: {
          Label("Tasks", systemImage: "checklist")
        }
        if session.routes.contains("/admin/forms") {
          NavigationLink {
            NativeFormList()
          } label: {
            Label("Forms & responses", systemImage: "list.clipboard")
          }
        }
        NavigationLink {
          NativeNotificationList()
        } label: {
          HStack {
            Label("Notifications", systemImage: "bell")
            Spacer()
            if session.unread > 0 {
              Text(String(session.unread)).font(.caption.weight(.semibold)).foregroundStyle(.tint)
            }
          }
        }
      }
      if session.routes.contains("/admin/newsletter") {
        Section("Chapter") {
          NavigationLink {
            NativeNewsletter()
          } label: {
            Label("Newsletter", systemImage: "envelope")
          }
        }
      }
      Section("Preferences") {
        NavigationLink {
          NativeNotificationSettings()
        } label: {
          Label("Device notifications", systemImage: "bell.badge")
        }
        Button {
          session.lock()
        } label: {
          Label("Lock workspace", systemImage: "lock")
        }
      }
      Section {
        Link(destination: URL(string: "https://gdggt.dev/admin")!) {
          Label("Open full website", systemImage: "arrow.up.right.square")
        }
      } header: {
        Text("Desktop tools")
      } footer: {
        Text("Advanced publishing, finance and whiteboard editors open in your browser.")
      }
      Section {
        Button(
          "Sign out and forget account", systemImage: "rectangle.portrait.and.arrow.right",
          role: .destructive
        ) { confirm = true }.disabled(signingOut)
      }
      if let error { NativeErrorView(error: error) }
      Section { LabeledContent("GDG Workspace", value: "1.0 · Build 11") }
    }.navigationTitle("More").confirmationDialog(
      "Sign out of GDG Workspace?", isPresented: $confirm, titleVisibility: .visible
    ) {
      Button("Sign out and forget account", role: .destructive) {
        Task {
          signingOut = true
          defer { signingOut = false }
          do { try await session.signOut() } catch {
            self.error = "Sign-out could not reach the server. Try again when connected."
          }
        }
      }
      Button("Cancel", role: .cancel) {}
    }
  }
}
struct NativeNotificationList: View {
  @EnvironmentObject var session: ScannerModel
  @State private var items: [NativeJSON] = []
  @State private var total = 0
  @State private var page = 1
  @State private var loading = true
  @State private var error: String?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if loading { ProgressView("Loading updates…") }
      ForEach(items, id: \.id) { item in
        NavigationLink {
          NativeNotificationDetail(item: item)
        } label: {
          HStack(alignment: .top, spacing: 12) {
            Circle().fill(item["is_read"].flag ? .clear : Color.accentColor).frame(
              width: 7, height: 7
            ).padding(.top, 7)
            VStack(alignment: .leading, spacing: 6) {
              Text(item["title"].string).fontWeight(item["is_read"].flag ? .regular : .semibold)
              Text(item["message"].string).font(.subheadline).foregroundStyle(.secondary).lineLimit(
                3)
              Text(nativeDateLabel(item["created_at"].string)).font(.caption2).foregroundStyle(
                .secondary)
            }
          }.padding(.vertical, 5)
        }.swipeActions { Button("Dismiss", role: .destructive) { Task { await remove(item.id) } } }
      }
      if items.isEmpty && !loading && error == nil {
        NativeEmpty(title: "You’re all caught up", symbol: "bell.badge")
      }
      NativePagination(page: $page, total: total, size: 20, loading: loading) {
        Task { await load() }
      }
    }.navigationTitle("Notifications").navigationBarTitleDisplayMode(.inline).toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Read all") {
          Task {
            do {
              _ = try await session.api.request(
                "/admin/notifications", method: "PATCH", body: .object(["is_read": .bool(true)]))
              await load()
            } catch { self.error = error.localizedDescription }
          }
        }.disabled(loading || items.isEmpty)
      }
    }.task { await load() }.refreshable { await load() }
  }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      let r = try await session.api.request("/admin/notifications?page=\(page)&pageSize=20")
      items = r["items"].items
      total = r["total"].int
      session.updateBadge(r["unreadCount"].int)
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func remove(_ id: String) async {
    do {
      _ = try await session.api.request("/admin/notifications/" + id, method: "DELETE")
      await load()
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeNotificationDetail: View {
  @EnvironmentObject var session: ScannerModel
  let item: NativeJSON
  @State private var error: String?
  var body: some View {
    List {
      Section {
        Text(item["title"].string).font(.title2.bold())
        Text(item["message"].string).textSelection(.enabled)
        Text(nativeDateLabel(item["created_at"].string)).font(.caption).foregroundStyle(.secondary)
      }
      let target = URL(string: item["link"].string, relativeTo: URL(string: ScannerPolicy.origin))?
        .absoluteURL
      let path = ScannerPolicy.admin(target) ? target!.path : ""
      let taskId =
        URLComponents(
          url: target ?? URL(string: ScannerPolicy.origin)!, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "task" })?.value ?? ""
      if path.hasPrefix("/admin/forms/") {
        let pieces = path.split(separator: "/")
        if pieces.count >= 3 {
          NavigationLink("Open form responses") { NativeFormResponses(id: String(pieces[2])) }
        }
      } else if path.hasPrefix("/admin/events/") {
        let pieces = path.split(separator: "/")
        if pieces.count >= 3 {
          NavigationLink("Open event") { NativeEventDetail(id: String(pieces[2])) }
        }
      } else if path.hasPrefix("/admin/members/") {
        let pieces = path.split(separator: "/")
        if pieces.count >= 3 {
          NavigationLink("Open member") { NativeMemberDetail(id: String(pieces[2])) }
        }
      } else if path.hasPrefix("/admin/communications") {
        if UUID(uuidString: taskId) != nil {
          NavigationLink("Open task") { NativeTaskDetail(id: taskId) }
        } else {
          NavigationLink("Open tasks") { NativeTaskList() }
        }
      }
      if let error { NativeErrorView(error: error) }
    }.navigationTitle("Update").navigationBarTitleDisplayMode(.inline).task {
      if !item["is_read"].flag {
        do {
          _ = try await session.api.request(
            "/admin/notifications/" + item.id, method: "PATCH",
            body: .object(["is_read": .bool(true)]))
          let r = try await session.api.request("/admin/notifications?pageSize=1")
          session.updateBadge(r["unreadCount"].int)
        } catch { self.error = error.localizedDescription }
      }
    }
  }
}
struct NativeNotificationSettings: View {
  @EnvironmentObject var session: ScannerModel
  @State private var data: NativeJSON = .null
  @State private var busy = false
  @State private var error: String?
  @State private var notice: String?
  let categories = [
    ("forms", "Form responses"), ("events", "Events and registrations"),
    ("newsletter", "Chapter news"), ("accounts", "Account updates"),
    ("id", "Membership cards and Wallet"), ("contact", "Contact messages"),
    ("workspace", "Tasks, messages and team updates"),
  ]
  var body: some View {
    Form {
      Section {
        Button("Enable on this iPhone") { Task { await enable() } }.disabled(busy)
        if let notice { Text(notice).foregroundStyle(.green) }
      }
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if !data.dictionary.isEmpty {
        Section("Notify me about") {
          ForEach(categories, id: \.0) { key, label in
            Toggle(
              label,
              isOn: Binding(
                get: { data["preferences"][key].flag },
                set: { value in Task { await preference(key, value) } })
            ).disabled(busy)
          }
        }
        if !data["devices"].items.isEmpty {
          Section("Enabled devices") {
            ForEach(data["devices"].items, id: \.id) { device in
              HStack {
                Label(device["label"].string, systemImage: "iphone")
                Spacer()
                Button("Turn off", role: .destructive) { Task { await remove(device.id) } }
                  .disabled(busy)
              }
            }
          }
        }
      }
    }.navigationTitle("Device notifications").navigationBarTitleDisplayMode(.inline).task {
      await load()
    }
  }
  func load() async {
    do {
      data = try await session.api.request("/admin/app-notifications")
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func enable() async {
    busy = true
    error = nil
    defer { busy = false }
    do {
      try await session.registerPush(try await session.pushState("enable"))
      notice = "Notifications enabled on this iPhone."
      await load()
    } catch { self.error = error.localizedDescription }
  }
  func preference(_ key: String, _ value: Bool) async {
    busy = true
    defer { busy = false }
    var prefs = data["preferences"].dictionary
    prefs[key] = .bool(value)
    do {
      _ = try await session.api.request(
        "/admin/app-notifications/preferences", method: "PATCH", body: .object(prefs))
      await load()
    } catch { self.error = error.localizedDescription }
  }
  func remove(_ id: String) async {
    busy = true
    defer { busy = false }
    do {
      _ = try await session.api.request("/admin/app-notifications/devices/" + id, method: "DELETE")
      notice = "Notifications turned off for that device."
      await load()
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeProfile: View {
  @EnvironmentObject var session: ScannerModel
  @State private var name = ""
  @State private var role = ""
  @State private var bio = ""
  @State private var linkedin = ""
  @State private var github = ""
  @State private var website = ""
  @State private var image = ""
  @State private var data: NativeJSON = .null
  @State private var busy = false
  @State private var error: String?
  @State private var notice: String?
  @State private var fieldErrors: NativeJSON = .null
  var body: some View {
    Form {
      Section("Account") {
        LabeledContent("Email", value: session.user["email"].string)
        LabeledContent(
          "Access",
          value: session.user["role"].string.replacingOccurrences(of: "_", with: " ").capitalized)
      }
      Section("Public team profile") {
        entry("Full name", value: $name, key: "profile.name")
        entry("Chapter role", value: $role, key: "profile.role")
        TextField("Short bio", text: $bio, axis: .vertical).lineLimit(3...8)
        entry("Photo URL", value: $image, key: "profile.imageUrl", link: true)
        entry("LinkedIn", value: $linkedin, key: "profile.linkedinUrl", link: true)
        entry("GitHub", value: $github, key: "profile.githubUrl", link: true)
        entry("Portfolio / website", value: $website, key: "profile.portfolioUrl", link: true)
      }
      if let error { NativeErrorView(error: error) }
      if let notice { Text(notice).foregroundStyle(.green) }
      Section {
        Button(busy ? "Saving…" : "Save profile") { Task { await save() } }.disabled(
          busy || name.count < 2 || role.isEmpty)
      }
    }.navigationTitle("My profile").navigationBarTitleDisplayMode(.inline).task { await load() }
  }
  func entry(_ title: String, value: Binding<String>, key: String, link: Bool = false) -> some View
  {
    VStack(alignment: .leading, spacing: 7) {
      Text(title).font(.caption).foregroundStyle(.secondary)
      TextField(title, text: value).keyboardType(link ? .URL : .default)
        .textInputAutocapitalization(link ? .never : .words).autocorrectionDisabled(link)
        .accessibilityLabel(title)
      if !fieldErrors[key].string.isEmpty {
        Text(fieldErrors[key].string).font(.caption).foregroundStyle(.red)
      }
    }.padding(.vertical, 3)
  }
  func load() async {
    do {
      data = try await session.api.request("/admin/me")
      let p = data["profile"]
      name = p["name"].string.isEmpty ? session.name : p["name"].string
      role = p["role"].string
      bio = p["bio"].string
      linkedin = p["linkedin_url"].string
      github = p["github_url"].string
      website = p["portfolio_url"].string
      image = p["image_url"].string
    } catch { self.error = error.localizedDescription }
  }
  func save() async {
    busy = true
    defer { busy = false }
    error = nil
    notice = nil
    fieldErrors = .null
    do {
      _ = try await session.api.request(
        "/admin/me", method: "PATCH",
        body: .object([
          "display_name": .string(name),
          "profile": .fields([
            "name": name, "role": role, "bio": bio, "imageUrl": image, "linkedinUrl": linkedin,
            "githubUrl": github, "portfolioUrl": website,
          ]),
        ]))
      notice = "Profile saved."
    } catch {
      self.error = error.localizedDescription
      if let error = error as? NativeAPIError { fieldErrors = error.fields }
    }
  }
}

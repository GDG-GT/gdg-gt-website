import SwiftUI

struct NativeHome: View {
  @EnvironmentObject var model: ScannerModel
  @State private var data: NativeJSON = .null
  @State private var error: String?
  @State private var loading = true
  var events: [NativeJSON] { data["widgets"]["events"]["data"]["items"].items }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 6) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day())).font(.subheadline)
              .foregroundStyle(.secondary)
            Text("Hey, " + model.name.components(separatedBy: " ")[0] + ".").font(
              .system(size: 34, weight: .bold, design: .rounded))
          }
          Spacer()
          Button {
            model.sheet = .profile
          } label: {
            NativeAvatar(name: model.name)
          }.accessibilityLabel("My account")
        }
        if model.superAdmin {
          Button {
            model.selectedTab = .checkin
          } label: {
            VStack(alignment: .leading, spacing: 18) {
              HStack {
                Image(systemName: "wave.3.right").font(.title2)
                Spacer()
                Image(systemName: "arrow.up.right")
              }
              Text("Get the line moving.").font(.title2.bold())
              Text("Open check-in").font(.subheadline.weight(.semibold))
            }.foregroundStyle(.white).frame(maxWidth: .infinity, alignment: .leading).padding(24)
              .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 26))
          }.buttonStyle(.plain).accessibilityLabel("Open check-in scanner")
        }
        HStack(spacing: 12) {
          NavigationLink {
            NativeTaskList()
          } label: {
            quick("My tasks", "checklist")
          }
          Button {
            model.sheet = .notifications
          } label: {
            quick("Updates", "bell.badge")
          }
        }.buttonStyle(.plain)
        if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
        if loading { ProgressView("Loading your workspace…").frame(maxWidth: .infinity) }
        if !events.isEmpty {
          HStack {
            Text("Coming up").font(.title3.bold())
            Spacer()
            Button("All events") { model.selectedTab = .events }.font(.subheadline)
          }
          ForEach(events, id: \.id) { event in
            NavigationLink {
              NativeEventDetail(id: event.id)
            } label: {
              NativeRecordRow(
                title: event["title"].string, subtitle: nativeDateLabel(event["start_at"].string),
                symbol: "calendar", status: event["publication_status"].string.capitalized)
            }.buttonStyle(.plain)
          }
        }
        if model.routes.contains("/admin/forms") {
          NavigationLink {
            NativeFormList()
          } label: {
            HStack {
              Label("Forms & responses", systemImage: "list.clipboard").font(.headline)
              Spacer()
              Image(systemName: "chevron.right").font(.caption)
            }.padding(20).background(
              Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
          }.buttonStyle(.plain)
        }
        let activity = data["widgets"]["activity"]["data"]["items"].items
        if !activity.isEmpty {
          Text("Your recent activity").font(.title3.bold())
          ForEach(activity.prefix(5), id: \.id) { item in
            NativeRecordRow(
              title: item["action"].string.replacingOccurrences(of: ".", with: " ").capitalized,
              subtitle: nativeDateLabel(item["created_at"].string), symbol: "clock")
          }
        }
      }.padding(20)
    }.background(Color(.systemGroupedBackground)).navigationTitle("Workspace")
      .navigationBarTitleDisplayMode(.inline).toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            model.sheet = .notifications
          } label: {
            Image(systemName: model.unread > 0 ? "bell.badge" : "bell")
          }.accessibilityLabel("Notifications")
        }
      }.task { await load() }.refreshable { await load() }
  }
  func quick(_ title: String, _ symbol: String) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      Image(systemName: symbol).font(.title2).foregroundStyle(.tint)
      Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(20).background(
      Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
  }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      data = try await model.api.request("/admin/dashboard")
      let inbox = try await model.api.request("/admin/notifications?pageSize=1")
      model.updateBadge(inbox["unreadCount"].int)
      error = nil
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeEventList: View {
  @EnvironmentObject var session: ScannerModel
  @StateObject private var list = NativeListModel("/admin/events", extras: ["pageSize": "30"])
  @State private var create = false
  var body: some View {
    List {
      if let error = list.error {
        NativeErrorView(error: error, retry: { Task { await list.load(session.api) } })
      }
      if list.loading { ProgressView("Loading events…") }
      ForEach(list.items, id: \.id) { event in
        NavigationLink {
          NativeEventDetail(id: event.id)
        } label: {
          NativeRecordRow(
            title: event["title"].string,
            subtitle: nativeDateLabel(event["start_at"].string) + " · " + event["location"].string,
            symbol: "calendar", status: event["publication_status"].string.capitalized)
        }
      }
      if !list.loading && list.items.isEmpty && list.error == nil {
        NativeEmpty(
          title: "No events found", symbol: "calendar",
          message: "Try another search or create a chapter event.")
      }
      NativePagination(page: $list.page, total: list.total, size: 30, loading: list.loading) {
        Task { await list.load(session.api) }
      }
    }.navigationTitle("Events").searchable(text: $list.query, prompt: "Find an event").task(
      id: list.query
    ) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      await list.load(session.api, reset: true)
    }.refreshable { await list.load(session.api) }.toolbar {
      if list.result["capabilities"]["globalCreate"].flag {
        ToolbarItem(placement: .topBarTrailing) {
          Button("New event", systemImage: "plus") { create = true }
        }
      }
    }.sheet(isPresented: $create) {
      NavigationStack {
        NativeEventEditor(event: nil) {
          create = false
          Task { await list.load(session.api, reset: true) }
        }
      }.environmentObject(session)
    }
  }
}
struct NativePagination: View {
  @Binding var page: Int
  let total: Int
  let size: Int
  let loading: Bool
  let load: () -> Void
  var body: some View {
    if total > size {
      HStack {
        Button("Previous") {
          page -= 1
          load()
        }.disabled(page <= 1 || loading)
        Spacer()
        Text("\(page) / \(max(1,Int(ceil(Double(total)/Double(size)))))").font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
        Button("Next") {
          page += 1
          load()
        }.disabled(page * size >= total || loading)
      }
    }
  }
}
struct NativeEventDetail: View {
  @EnvironmentObject var session: ScannerModel
  let id: String
  @State private var event: NativeJSON = .null
  @State private var attendees: [NativeJSON] = []
  @State private var total = 0
  @State private var page = 1
  @State private var error: String?
  @State private var busy = false
  @State private var editing = false
  @State private var confirmPublish = false
  @State private var attemptKey: String?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if !event.id.isEmpty {
        Section {
          Text(event["title"].string).font(.title2.bold())
          Label(nativeDateLabel(event["start_at"].string), systemImage: "calendar")
          Label(event["location"].string, systemImage: "mappin.and.ellipse")
          Text(event["publication_status"].string.capitalized).font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        if session.superAdmin && event["publication_status"].string == "published" {
          Section {
            Button {
              Task {
                await session.checkin.load()
                session.checkin.choose("event:" + id)
                session.selectedTab = .checkin
              }
            } label: {
              Label("Start event check-in", systemImage: "wave.3.right").fontWeight(.semibold)
            }
          }
        }
        if !event["description"].string.isEmpty {
          Section("About") {
            Text(event["description"].string).font(.subheadline).textSelection(.enabled)
          }
        }
        Section("Registrations · \(total)") {
          ForEach(attendees, id: \.id) { attendee in
            HStack(spacing: 12) {
              NativeAvatar(name: attendee["attendee_name"].string, size: 36)
              VStack(alignment: .leading, spacing: 4) {
                Text(attendee["attendee_name"].string)
                Text(attendee["attendee_email"].string).font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              if attendee["attended"].flag {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                  .accessibilityLabel("Checked in")
              }
            }.padding(.vertical, 4)
          }
          if attendees.isEmpty {
            Text("No registrations on this page.").foregroundStyle(.secondary)
          }
          NativePagination(page: $page, total: total, size: 50, loading: busy) {
            Task { await loadAttendees() }
          }
        }
        if event["actions"].items.contains(.string("publish")) {
          Section {
            Button(
              event["publication_status"].string == "published"
                ? "Unpublish event" : "Publish event"
            ) { confirmPublish = true }.disabled(busy)
          }
        }
      } else if error == nil {
        ProgressView("Loading event…")
      }
    }.navigationTitle("Event").navigationBarTitleDisplayMode(.inline).toolbar {
      if event["actions"].items.contains(.string("update")) {
        ToolbarItem(placement: .topBarTrailing) { Button("Edit") { editing = true } }
      }
    }.task { await load() }.refreshable { await load() }.sheet(isPresented: $editing) {
      NavigationStack {
        NativeEventEditor(event: event) {
          editing = false
          Task { await load() }
        }
      }.environmentObject(session)
    }.confirmationDialog("Change event visibility?", isPresented: $confirmPublish) {
      Button(event["publication_status"].string == "published" ? "Unpublish" : "Publish") {
        Task { await publish() }
      }
      Button("Cancel", role: .cancel) {}
    }
  }
  func load() async {
    do {
      event = try await session.api.request("/admin/events/" + id)["event"]
      error = nil
      await loadAttendees()
    } catch { self.error = error.localizedDescription }
  }
  func loadAttendees() async {
    busy = true
    defer { busy = false }
    do {
      let r = try await session.api.request(
        "/admin/events/" + id + "/attendees?page=\(page)&pageSize=50")
      attendees = r["items"].items
      total = r["total"].int
    } catch { self.error = error.localizedDescription }
  }
  func publish() async {
    busy = true
    defer { busy = false }
    if attemptKey == nil { attemptKey = UUID().uuidString }
    do {
      let operation = event["publication_status"].string == "published" ? "unpublish" : "publish"
      _ = try await session.api.request(
        "/admin/events/" + id + "/" + operation, method: "POST",
        body: .object(["revision": event["revision"], "event": .object([:])]), key: attemptKey)
      attemptKey = nil
      await load()
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeEventEditor: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let event: NativeJSON?
  let saved: () -> Void
  @State private var title = ""
  @State private var location = ""
  @State private var details = ""
  @State private var slug = ""
  @State private var starts = Date()
  @State private var ends = Date().addingTimeInterval(3600)
  @State private var busy = false
  @State private var fields: NativeJSON = .null
  @State private var error: String?
  @State private var key: String?
  var body: some View {
    Form {
      Section("Event details") {
        TextField("Title", text: $title).nativeFieldError(fields, "event.title")
        TextField("Location", text: $location).nativeFieldError(fields, "event.location")
        if event == nil {
          TextField("Web address name", text: $slug).nativeFieldError(fields, "event.slug")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        DatePicker("Starts", selection: $starts)
        DatePicker("Ends", selection: $ends)
      }
      Section("Description") {
        TextEditor(text: $details).frame(minHeight: 180).nativeFieldError(
          fields, "event.description")
      }
      if let error { NativeErrorView(error: error) }
    }.navigationTitle(event == nil ? "New event" : "Edit event").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
      ToolbarItem(placement: .confirmationAction) {
        Button(busy ? "Saving…" : "Save") { Task { await save() } }.disabled(
          busy || title.trimmingCharacters(in: .whitespaces).count < 2 || location.isEmpty
            || details.count < 2 || ends <= starts)
      }
    }.interactiveDismissDisabled(busy || key != nil).task {
      if let event {
        title = event["title"].string
        location = event["location"].string
        details = event["description"].string
        starts = nativeDate(event["start_at"].string) ?? Date()
        ends = nativeDate(event["end_at"].string) ?? starts.addingTimeInterval(3600)
      }
    }.onChange(of: title) { _, value in
      if event == nil && key == nil {
        slug = value.lowercased().replacingOccurrences(
          of: "[^a-z0-9]+", with: "-", options: .regularExpression
        ).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
      }
    }
  }
  func save() async {
    fields = .null
    busy = true
    defer { busy = false }
    if key == nil { key = UUID().uuidString }
    let format = ISO8601DateFormatter()
    var values: [String: NativeJSON] = [
      "title": .string(title), "location": .string(location), "description": .string(details),
      "start_at": .string(format.string(from: starts)),
      "end_at": .string(format.string(from: ends)),
    ]
    if event == nil {
      values["slug"] = .string(slug)
      values["timezone"] = .string(TimeZone.current.identifier)
    }
    var body: [String: NativeJSON] = ["event": .object(values)]
    if let event { body["revision"] = event["revision"] }
    do {
      _ = try await session.api.request(
        "/admin/events" + (event.map { "/" + $0.id } ?? ""),
        method: event == nil ? "POST" : "PATCH", body: .object(body), key: key)
      key = nil
      saved()
    } catch {
      self.error = error.localizedDescription
      if let e = error as? NativeAPIError { fields = e.fields }
      if let error = error as? NativeAPIError, !error.uncertain { key = nil }
    }
  }
}

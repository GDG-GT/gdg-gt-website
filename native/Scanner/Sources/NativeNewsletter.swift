import SwiftUI

struct NativeNewsletter: View {
  @EnvironmentObject var session: ScannerModel
  @State private var kind = "campaigns"
  @State private var create = false
  @State private var capabilities: NativeJSON = .null
  var body: some View {
    NativeNewsletterList(kind: kind, create: $create, capabilities: capabilities)
      .navigationTitle("Newsletter")
      .safeAreaInset(edge: .top) {
        Picker("Newsletter section", selection: $kind) {
          Text("Campaigns").tag("campaigns")
          Text("Subscribers").tag("subscribers")
          Text("Templates").tag("templates")
        }.pickerStyle(.segmented).padding(.horizontal).padding(.bottom, 8).background(
          .regularMaterial)
      }
      .toolbar {
        if capabilities["chapterCreate"].flag
          || capabilities["teams"].items.contains(where: { $0["canCreate"].flag })
        {
          ToolbarItem(placement: .topBarTrailing) {
            Button(kind == "subscribers" ? "Invite subscriber" : "Create", systemImage: "plus") {
              create = true
            }
          }
        }
      }
      .task {
        capabilities = (try? await session.api.request("/admin/newsletter/capabilities")) ?? .null
      }
  }
}
struct NativeNewsletterList: View {
  @EnvironmentObject var session: ScannerModel
  let kind: String
  @Binding var create: Bool
  let capabilities: NativeJSON
  @State private var query = ""
  @State private var page = 1
  @State private var total = 0
  @State private var loading = false
  @State private var items: [NativeJSON] = []
  @State private var error: String?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if loading { ProgressView("Loading…") }
      ForEach(items, id: \.id) { item in
        NavigationLink {
          NativeNewsletterDetail(kind: kind, id: item.id)
        } label: {
          NativeRecordRow(
            title: kind == "subscribers"
              ? (item["name"].string.isEmpty ? item["email"].string : item["name"].string)
              : kind == "campaigns" ? item["subject"].string : item["name"].string,
            subtitle: kind == "subscribers"
              ? item["email"].string : nativeDateLabel(item["updatedAt"].string),
            symbol: kind == "subscribers" ? "person.crop.circle" : "envelope",
            status: kind == "subscribers"
              ? item["state"].string.capitalized : item["status"].string.capitalized)
        }
      }
      if !loading && items.isEmpty && error == nil {
        NativeEmpty(title: "No \(kind) found", symbol: "envelope")
      }
      NativePagination(page: $page, total: total, size: 50, loading: loading) {
        Task { await load() }
      }
    }.searchable(text: $query, prompt: "Search \(kind)").task(id: kind + query) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      page = 1
      await load()
    }.refreshable { await load() }
      .sheet(isPresented: $create) {
        NavigationStack {
          NativeNewsletterEditor(kind: kind, record: nil, capabilities: capabilities) {
            create = false
            Task { await load() }
          }
        }.environmentObject(session)
      }
  }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      let r = try await session.api.request(
        "/admin/newsletter/" + kind + "?" + nativeQuery(["q": query, "page": String(page)]))
      guard !Task.isCancelled else { return }
      items = r["items"].items
      total = r["total"].int
      error = nil
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
}
struct NativeNewsletterDetail: View {
  @EnvironmentObject var session: ScannerModel
  let kind: String
  let id: String
  @State private var record: NativeJSON = .null
  @State private var error: String?
  @State private var notice:String?
  @State private var notifyKey:String?
  @State private var edit = false
  @State private var send = false
  @State private var action: String?
  @State private var busy = false
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if let notice{Text(notice).foregroundStyle(.primary)}
      if !record.id.isEmpty {
        if kind == "subscribers" {
          Section {
            Text(record["name"].string.isEmpty ? record["email"].string : record["name"].string)
              .font(.title2.bold())
            Text(record["email"].string).textSelection(.enabled)
            LabeledContent("Status", value: record["state"].string.capitalized)
            if !record["confirmedAt"].string.isEmpty {
              LabeledContent("Joined", value: nativeDateLabel(record["confirmedAt"].string))
            }
          }
        } else {
          Section {
            Text(kind == "campaigns" ? record["subject"].string : record["name"].string).font(
              .title2.bold())
            if kind == "campaigns" {
              LabeledContent("Status", value: record["status"].string.capitalized)
              LabeledContent("Recipients", value: String(record["recipientCount"].int))
            }
            Text(record["content"].string).textSelection(.enabled)
          }
          if kind == "campaigns" && record["status"].string == "draft"
            && record["actions"].items.contains(.string("send_email"))
          {
            Section { Button("Review and send", systemImage: "paperplane") { send = true } }
          }
        }
        if kind=="subscribers" && record["deletedAt"].string.isEmpty && record["suppressedAt"].string.isEmpty && ((record["state"].string=="pending" && record["actions"].items.contains(.string("create"))) || (record["state"].string=="active" && record["actions"].items.contains(.string("send_email")))) {
          Section{Button(record["state"].string=="pending" ? "Resend invitation":"Resend welcome email"){Task{await notify()}}.disabled(busy)}
        }
        if record["actions"].items.contains(.string("delete")) {
          Section {
            if kind == "subscribers" && record["state"].string == "active" {
              Button("Unsubscribe", role: .destructive) { action = "deactivate" }
            }
            Button("Archive", role: .destructive) { action = "archive" }
          }
        }
      } else if error == nil {
        ProgressView("Loading…")
      }
    }.alert("Email queued",isPresented:Binding(get:{notice != nil},set:{if !$0{notice=nil}})){Button("OK"){notice=nil}}message:{Text(notice ?? "")}
    .navigationTitle(
      kind == "subscribers" ? "Subscriber" : kind == "campaigns" ? "Campaign" : "Template"
    ).navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if record["actions"].items.contains(.string("update"))
          && (kind != "campaigns" || record["status"].string == "draft")
        {
          ToolbarItem(placement: .topBarTrailing) { Button("Edit") { edit = true }.disabled(busy) }
        }
      }
      .task { await load() }.refreshable { await load() }
      .sheet(isPresented: $edit) {
        NavigationStack {
          NativeNewsletterEditor(kind: kind, record: record, capabilities: .null) {
            edit = false
            Task { await load() }
          }
        }.environmentObject(session)
      }
      .sheet(isPresented: $send) {
        NavigationStack {
          NativeNewsletterSend(record: record) {
            send = false
            Task { await load() }
          }
        }.environmentObject(session)
      }
      .confirmationDialog(
        "Confirm this change",
        isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } }),
        titleVisibility: .visible
      ) {
        Button(action == "archive" ? "Archive" : "Unsubscribe", role: .destructive) {
          if let operation=action{Task { await change(operation) }}
        }
        Button("Cancel", role: .cancel) { action = nil }
      }
  }
  func notify()async {
    busy=true;defer{busy=false};error=nil;notice=nil
    if notifyKey==nil{notifyKey=UUID().uuidString}
    do{let r=try await session.api.request("/admin/newsletter/subscribers/"+id+"/notify",method:"POST",body:.object([:]),key:notifyKey);notifyKey=nil;notice=r["purpose"].string=="welcome" ? "Welcome email queued.":"Newsletter invitation queued.";await load()}catch{self.error=error.localizedDescription;if let e=error as? NativeAPIError,!e.uncertain{notifyKey=nil}}
  }
  func load() async {
    do {
      record = try await session.api.request("/admin/newsletter/" + kind + "/" + id)["record"]
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func change(_ action:String) async {
    busy = true
    defer {
      busy = false
      self.action = nil
    }
    do {
      _ = try await session.api.request(
        "/admin/newsletter/" + kind + "/" + id, method: "POST",
        body: .object(["action": .string(action), "revision": record["revision"]]),
        key: UUID().uuidString)
      await load()
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeNewsletterEditor: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let kind: String
  let record: NativeJSON?
  let capabilities: NativeJSON
  let saved: () -> Void
  @State private var title = ""
  @State private var email = ""
  @State private var details = ""
  @State private var content = ""
  @State private var scope = "chapter"
  @State private var audience = "all"
  @State private var recipients: Set<String> = []
  @State private var selecting = false
  @State private var agreed = false
  @State private var busy = false
  @State private var key: String?
  @State private var error: String?
  @State private var frozen: NativeJSON?
  var body: some View {
    Form {
      if record == nil {
        Section("Newsletter") {
          Picker("Team", selection: $scope) {
            if capabilities["chapterCreate"].flag { Text("Chapter").tag("chapter") }
            ForEach(capabilities["teams"].items.filter { $0["canCreate"].flag }, id: \.id) { team in
              Text(team["name"].string).tag(team.id)
            }
          }
        }
      }
      if kind == "subscribers" {
        Section {
          TextField("Name", text: $title).textContentType(.name)
          if record == nil {
            TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(
              .emailAddress
            ).textInputAutocapitalization(.never).autocorrectionDisabled()
            Toggle("They agreed to receive chapter news", isOn: $agreed)
          }
        }
        if record == nil {
          Section {
            Text("We’ll send a welcome invitation with a Join the newsletter button.")
              .foregroundStyle(.secondary)
          }
        }
      } else {
        Section {
          TextField(kind == "campaigns" ? "Subject" : "Template name", text: $title)
          if kind == "templates" { TextField("Description", text: $details) }
          if kind == "campaigns" {
            Picker("Audience", selection: $audience) {
              Text("All confirmed subscribers").tag("all")
              Text("Select subscribers").tag("custom")
            }
            if audience == "custom" {
              Button("Choose subscribers · \(recipients.count) selected") { selecting = true }
            }
          }
        }
        Section("Message") { TextEditor(text: $content).frame(minHeight: 260) }
      }
      if let error { NativeErrorView(error: error) }
    }.disabled(busy || frozen != nil).navigationTitle(
      record == nil
        ? (kind == "subscribers"
          ? "Invite subscriber" : "New \(kind=="campaigns" ? "campaign":"template")")
        : "Edit \(kind=="subscribers" ? "subscriber":kind=="campaigns" ? "campaign":"template")"
    )
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
      ToolbarItem(placement: .confirmationAction) {
        Button(kind == "subscribers" && record == nil ? "Invite" : "Save") { Task { await save() } }
          .disabled(
            busy
              || (kind == "subscribers"
                ? (record == nil && (!agreed || !email.contains("@")))
                : title.isEmpty || content.isEmpty
                  || (kind == "campaigns" && audience == "custom" && recipients.isEmpty))
          )
      }
    }
    .interactiveDismissDisabled(busy || key != nil).task {
      if let record {
        title = kind == "campaigns" ? record["subject"].string : record["name"].string
        email = record["email"].string
        content = record["content"].string
        details = record["description"].string
        scope = record["teamId"].string.isEmpty ? "chapter" : record["teamId"].string
        audience = record["audience"].string.isEmpty ? "all" : record["audience"].string
        recipients = Set(record["recipientIds"].items.map(\.string))
      } else if !capabilities["chapterCreate"].flag {
        scope = capabilities["teams"].items.first(where: { $0["canCreate"].flag })?.id ?? "chapter"
      }
    }
    .sheet(isPresented: $selecting) {
      NavigationStack { NativeNewsletterAudience(scope: scope, selected: $recipients) }
        .environmentObject(session)
    }
    .onChange(of: scope) { _, _ in if record == nil { recipients = [] } }
  }
  func save() async {
    busy = true
    defer { busy = false }
    if frozen == nil {
      var values: [String: NativeJSON] = [:]
      if kind == "subscribers" {
        values = ["name": .string(title)]
        if record == nil {
          values["email"] = .string(email)
          values["consentAcknowledged"] = .bool(agreed)
        }
      } else {
        var r: [String: NativeJSON] = [
          kind == "campaigns" ? "subject" : "name": .string(title), "content": .string(content),
        ]
        if kind == "templates" {
          r["description"] = .string(details)
        } else {
          r["audience"] = .string(audience)
          r["recipientIds"] = .array(
            audience == "all" ? [] : recipients.sorted().map { .string($0) })
        }
        values["record"] = .object(r)
      }
      if let record {
        values["action"] = .string("update")
        values["revision"] = record["revision"]
      } else {
        values["teamId"] = scope == "chapter" ? .null : .string(scope)
      }
      frozen = .object(values)
      key = UUID().uuidString
    }
    do {
      _ = try await session.api.request(
        "/admin/newsletter/" + kind + (record.map { "/" + $0.id } ?? ""), method: "POST",
        body: frozen, key: key)
      key = nil
      frozen = nil
      saved()
    } catch {
      self.error = error.localizedDescription
      if let e = error as? NativeAPIError, !e.uncertain {
        key = nil
        frozen = nil
      }
    }
  }
}
struct NativeNewsletterSend: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let record: NativeJSON
  let saved: () -> Void
  @State private var review: NativeJSON = .null
  @State private var password = ""
  @State private var error: String?
  @State private var notice: String?
  @State private var busy = false
  @State private var confirm = false
  @State private var key: String?
  @State private var pendingAction: String?
  var body: some View {
    Form {
      Section {
        Text(record["subject"].string).font(.title3.bold())
        Text(record["content"].string).textSelection(.enabled)
      }
      if !review["reviewId"].string.isEmpty {
        Section("Delivery") {
          LabeledContent("Confirmed recipients", value: String(review["count"].int))
          Text("Ready to send now.").foregroundStyle(.secondary)
        }
      }
      Section("Confirm your account") {
        SecureField("Current password", text: $password).textContentType(.password)
      }
      if let error { NativeErrorView(error: error) }
      if let notice { Text(notice).foregroundStyle(.green) }
      Section {
        Button("Send test to me") { Task { await deliver("test") } }.disabled(
          busy || password.isEmpty || (pendingAction != nil && pendingAction != "test"))
        Button("Send to \(review["count"].int) subscribers", systemImage: "paperplane.fill") {
          confirm = true
        }.disabled(
          busy || password.isEmpty || review["reviewId"].string.isEmpty
            || (pendingAction != nil && pendingAction != "send"))
      }
    }.navigationTitle("Review campaign").navigationBarTitleDisplayMode(.inline).toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("Close") {
          password = ""
          dismiss()
        }.disabled(busy)
      }
    }.interactiveDismissDisabled(busy)
      .task {
        do {
          review = try await session.api.request(
            "/admin/newsletter/campaigns/" + record.id + "/send-review", method: "POST",
            body: .object(["revision": record["revision"]]))
        } catch { self.error = error.localizedDescription }
      }
      .confirmationDialog(
        "Send this campaign to \(review["count"].int) subscribers now?", isPresented: $confirm,
        titleVisibility: .visible
      ) {
        Button("Send campaign") { Task { await deliver("send") } }
        Button("Cancel", role: .cancel) {}
      }
  }
  func deliver(_ action: String) async {
    busy = true
    defer {
      busy = false
      password = ""
    }
    error = nil
    notice = nil
    if key == nil {
      key = UUID().uuidString
      pendingAction = action
    }
    guard pendingAction == action else { return }
    var body: [String: NativeJSON] = ["currentPassword": .string(password)]
    if action == "test" {
      body["revision"] = record["revision"]
      body["confirmation"] = .string("SEND TEST")
    } else {
      body["reviewId"] = review["reviewId"]
      body["reviewToken"] = review["reviewToken"]
      body["confirmation"] = .string("SEND \(review["count"].int)")
      body["scheduledAt"] = .null
    }
    do {
      _ = try await session.api.request(
        "/admin/newsletter/campaigns/" + record.id + "/" + action, method: "POST",
        body: .object(body), key: key)
      key = nil
      pendingAction = nil
      if action == "send" { saved() } else { notice = "Test email queued to your account." }
    } catch {
      self.error = error.localizedDescription
      if let e = error as? NativeAPIError, !e.uncertain {
        key = nil
        pendingAction = nil
      }
    }
  }
}

struct NativeNewsletterAudience: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let scope: String
  @Binding var selected: Set<String>
  @State private var query = ""
  @State private var items: [NativeJSON] = []
  @State private var page = 1
  @State private var total = 0
  @State private var loading = false
  @State private var error: String?
  var body: some View {
    List {
      Section {
        Text("\(selected.count) selected").font(.headline)
        if !selected.isEmpty { Button("Clear selection", role: .destructive) { selected = [] } }
      }
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if loading { ProgressView("Finding subscribers…") }
      ForEach(items, id: \.id) { item in
        Button {
          if selected.contains(item.id) {
            selected.remove(item.id)
          } else if selected.count < 1000 {
            selected.insert(item.id)
          }
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 5) {
              if !item["name"].string.isEmpty {
                Text(item["name"].string).foregroundStyle(.primary)
              }
              Text(item["email"].string).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: selected.contains(item.id) ? "checkmark.circle.fill" : "circle")
              .foregroundStyle(.tint)
          }
        }.accessibilityValue(selected.contains(item.id) ? "Selected" : "Not selected")
      }
      NativePagination(page: $page, total: total, size: 50, loading: loading) {
        Task { await load() }
      }
    }.navigationTitle("Choose subscribers").navigationBarTitleDisplayMode(.inline).searchable(
      text: $query, prompt: "Name or email"
    ).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }.task(
      id: query
    ) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      page = 1
      await load()
    }
  }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      let r = try await session.api.request(
        "/admin/newsletter/subscribers?"
          + nativeQuery(["team": scope, "status": "active", "q": query, "page": String(page)]))
      guard !Task.isCancelled else { return }
      items = r["items"].items
      total = r["total"].int
      error = nil
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
}

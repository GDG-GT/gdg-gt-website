import SwiftUI

struct NativeMemberList: View {
  @EnvironmentObject var session: ScannerModel
  @StateObject private var list = NativeListModel("/admin/members")
  @State private var create = false
  var body: some View {
    List {
      if let error = list.error {
        NativeErrorView(error: error, retry: { Task { await list.load(session.api) } })
      }
      if list.loading { ProgressView("Loading members…") }
      ForEach(list.items, id: \.id) { member in
        NavigationLink {
          NativeMemberDetail(id: member.id)
        } label: {
          HStack(spacing: 13) {
            NativeAvatar(name: member["name"].string)
            VStack(alignment: .leading, spacing: 5) {
              Text(member["name"].string).fontWeight(.medium)
              Text(member["email"].string).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if member["is_core_team"].flag {
              Image(systemName: "star.fill").font(.caption).foregroundStyle(.tint)
            }
          }.padding(.vertical, 6)
        }
      }
      if !list.loading && list.items.isEmpty && list.error == nil {
        NativeEmpty(
          title: "No members found", symbol: "person.2", message: "Search by name or email.")
      }
      NativePagination(page: $list.page, total: list.total, size: 30, loading: list.loading) {
        Task { await list.load(session.api) }
      }
    }.navigationTitle("Members").searchable(text: $list.query, prompt: "Name or email").task(
      id: list.query
    ) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      await list.load(session.api, reset: true)
    }.refreshable { await list.load(session.api) }.toolbar {
      if session.superAdmin || session.user["role"].string == "admin" {
        ToolbarItem(placement: .topBarTrailing) {
          Button("New member", systemImage: "person.badge.plus") { create = true }
        }
      }
    }.sheet(isPresented: $create) {
      NavigationStack {
        NativeMemberEditor(member: nil) {
          create = false
          Task { await list.load(session.api, reset: true) }
        }
      }.environmentObject(session)
    }
  }
}
struct NativeMemberDetail: View {
  @EnvironmentObject var session: ScannerModel
  let id: String
  @State private var member: NativeJSON = .null
  @State private var rewards: NativeJSON = .null
  @State private var error: String?
  @State private var notice: String?
  @State private var edit = false
  @State private var issue = false
  @State private var busy = false
  @State private var revoke: NativeJSON?
  @State private var cardSession: CardSession?
  @State private var pendingBind: (String, String)?
  @State private var share: NativeFile?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if let notice { Text(notice).foregroundStyle(.green) }
      if !member.id.isEmpty {
        Section {
          HStack(spacing: 15) {
            NativeAvatar(name: member["name"].string, size: 64)
            VStack(alignment: .leading, spacing: 6) {
              Text(member["name"].string).font(.title2.bold())
              Text(member["category"].string.capitalized).foregroundStyle(.secondary)
            }
          }.padding(.vertical, 8)
          if let email = URL(string: "mailto:" + member["email"].string) {
            Link(destination: email) { Label(member["email"].string, systemImage: "envelope") }
          }
          if !member["phone"].string.isEmpty {
            LabeledContent("Phone", value: member["phone"].string)
          }
          if !member["major"].string.isEmpty {
            LabeledContent("Major", value: member["major"].string)
          }
          if !member["year"].string.isEmpty { LabeledContent("Year", value: member["year"].string) }
        }
        if session.superAdmin {
          Section("Membership") {
            LabeledContent("Points", value: String(rewards["selectedMember"]["points"].int))
            Button {
              issue = true
            } label: {
              Label("Issue card or Wallet pass", systemImage: "person.crop.rectangle.badge.plus")
            }.disabled(busy)
            if let pendingBind {
              Button("Retry card registration") {
                Task { await bind(pendingBind.0, pendingBind.1) }
              }.disabled(busy)
            }
          }
          Section("Cards & Wallet") {
            ForEach(rewards["credentials"].items, id: \.id) { card in credentialRow(card) }
          }
          Section("Recent points") {
            ForEach(rewards["ledger"].items.prefix(20), id: \.id) { entry in
              HStack {
                VStack(alignment: .leading, spacing: 4) {
                  Text(entry["reason"].string)
                  Text(nativeDateLabel(entry["created_at"].string)).font(.caption).foregroundStyle(
                    .secondary)
                }
                Spacer()
                Text(
                  entry["points"].int > 0 ? "+\(entry["points"].int)" : String(entry["points"].int)
                ).fontWeight(.semibold).foregroundStyle(
                  entry["points"].int > 0 ? Color.green : Color.secondary)
              }
            }
          }
        }
      } else if error == nil {
        ProgressView("Loading member…")
      }
    }
    .navigationTitle("Member").navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if member["actions"].items.contains(.string("update")) {
        ToolbarItem(placement: .topBarTrailing) { Button("Edit") { edit = true }.disabled(busy) }
      }
    }
    .task { await load() }.refreshable { await load() }
    .sheet(isPresented: $edit) {
      NavigationStack {
        NativeMemberEditor(member: member) {
          edit = false
          Task { await load() }
        }
      }.environmentObject(session)
    }
    .sheet(isPresented: $issue) {
      NavigationStack {
        NativeCredentialIssue(memberId: id) {
          issue = false
          Task { await load() }
        }
      }.environmentObject(session)
    }
    .sheet(item: $share) { file in NativeShare(url: file.url) }
    .confirmationDialog(
      "Revoke this credential?",
      isPresented: Binding(get: { revoke != nil }, set: { if !$0 { revoke = nil } }),
      titleVisibility: .visible
    ) {
      Button("Revoke credential", role: .destructive) {
        if let revoke { Task { await mutate("revoke", body: .fields(["id": revoke.id])) } }
      }
      Button("Cancel", role: .cancel) { revoke = nil }
    } message: {
      Text("It will stop working immediately. The member’s points stay in their account.")
    }
    .navigationBarBackButtonHidden(busy).onDisappear {
      cardSession?.cancel()
      cardSession = nil
    }
  }
  func credentialRow(_ card: NativeJSON) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Label(
          card["label"].string,
          systemImage: card["kind"].string == "card" ? "wave.3.right" : "wallet.pass")
        Spacer()
        Text(
          card["revoked_at"].string.isEmpty
            ? (card["kind"].string == "card"
              ? (card["bound"].flag ? "Registered" : "Needs programming") : "Active") : "Revoked"
        ).font(.caption).foregroundStyle(.secondary)
      }
      if card["revoked_at"].string.isEmpty {
        if card["kind"].string == "card" {
          Button("Write and register card") { Task { await program(card.id) } }.disabled(busy)
        } else {
          HStack {
            if rewards["walletAvailable"].flag {
              Button("Apple Wallet") { Task { await wallet(card.id, google: false) } }
            }
            if rewards["googleWalletAvailable"].flag {
              Button("Google Wallet") { Task { await wallet(card.id, google: true) } }
            }
          }.disabled(busy)
        }
        HStack {
          Button("Email to member") {
            Task { await mutate("credential-email", body: .fields(["id": card.id])) }
          }.disabled(busy || (card["kind"].string == "card" && !card["bound"].flag))
          Spacer()
          Button("Revoke", role: .destructive) { revoke = card }.disabled(busy)
        }.font(.subheadline)
      }
    }.padding(.vertical, 8).buttonStyle(.borderless)
  }
  func load() async {
    do {
      member = try await session.api.request("/admin/members/" + id)["member"]
      if session.superAdmin {
        rewards = try await session.api.request("/admin/rewards?member=" + id)
      }
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func mutate(_ action: String, body: NativeJSON) async {
    busy = true
    error = nil
    defer { busy = false }
    do {
      _ = try await session.api.request(
        "/admin/rewards/" + action, method: "POST", body: body, key: UUID().uuidString)
      notice = action == "credential-email" ? "Member email queued." : "Credential revoked."
      revoke = nil
      await load()
    } catch { self.error = error.localizedDescription }
  }
  func program(_ cardId: String) async {
    let actor = session.user.id
    guard !busy else { return }
    busy = true
    error = nil
    notice = nil
    do {
      let card = try await session.api.request("/admin/rewards/card/" + cardId)
      cardSession = CardSession(
        action: "writeCard", url: card["url"].string,
        uidHash: card["uidHash"].string.isEmpty ? nil : card["uidHash"].string
      ) { value, error in
        Task { @MainActor in
          self.cardSession = nil
          if let error {
            self.error = error
            self.busy = false
            return
          }
          guard let value, let raw = value.data(using: .utf8),
            let proof = try? JSONDecoder().decode(NativeJSON.self, from: raw),
            proof["credential"].string == card["credential"].string
          else {
            self.error = "Card read-back could not be verified."
            self.busy = false
            return
          }
          guard self.session.user.id == actor else {
            self.busy = false
            return
          }
          self.pendingBind = (cardId, proof["uid"].string)
          guard self.session.unlocked else {
            self.busy = false
            self.error = "Unlock and retry this card registration."
            return
          }
          await self.bind(cardId, proof["uid"].string)
        }
      }
      cardSession?.start()
    } catch {
      self.error = error.localizedDescription
      busy = false
    }
  }
  func bind(_ cardId: String, _ uid: String) async {
    busy = true
    defer { busy = false }
    do {
      _ = try await session.api.request(
        "/admin/rewards/card-bind", method: "POST", body: .fields(["id": cardId, "uid": uid]))
      pendingBind = nil
      notice = "Card registered. The member’s QR and Wallet options are queued by email."
      await load()
    } catch {
      self.error =
        "Registration could not be confirmed. Retry this same registration before handing out the card."
    }
  }
  func wallet(_ cardId: String, google: Bool) async {
    busy = true
    defer { busy = false }
    do {
      if google {
        let result = try await session.api.request("/admin/rewards/google-wallet/" + cardId)
        guard let url = URL(string: result["url"].string), ScannerPolicy.googleSave(url) else {
          throw SignInFailure.message("Wallet URL could not be verified.")
        }
        _ = await UIApplication.shared.open(url)
      } else {
        share = NativeFile(
          url: try await session.api.download("/api/v1/admin/rewards/wallet/" + cardId))
      }
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeCredentialIssue: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let memberId: String
  let saved: () -> Void
  @State private var label = ""
  @State private var kind = "card"
  @State private var busy = false
  @State private var error: String?
  @State private var key: String?
  var body: some View {
    Form {
      Section {
        Picker("Credential type", selection: $kind) {
          Text("Physical NFC card").tag("card")
          Text("Wallet pass").tag("wallet")
        }
        TextField("Label", text: $label)
      }
      Section {
        Text(
          kind == "card"
            ? "After issuing, write and register the physical card. The member email follows registration."
            : "The member receives their QR and Wallet options by email."
        ).font(.subheadline).foregroundStyle(.secondary)
      }
      if let error { NativeErrorView(error: error) }
    }.navigationTitle("Issue credential").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
      ToolbarItem(placement: .confirmationAction) {
        Button(busy ? "Issuing…" : "Issue") { Task { await save() } }.disabled(
          busy || label.isEmpty)
      }
    }.interactiveDismissDisabled(busy || key != nil)
  }
  func save() async {
    busy = true
    defer { busy = false }
    if key == nil { key = UUID().uuidString }
    do {
      _ = try await session.api.request(
        "/admin/rewards/credential", method: "POST",
        body: .fields(["memberId": memberId, "kind": kind, "label": label]), key: key)
      key = nil
      saved()
    } catch {
      self.error = error.localizedDescription
      if let error = error as? NativeAPIError, !error.uncertain { key = nil }
    }
  }
}
struct NativeMemberEditor: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let member: NativeJSON?
  let saved: () -> Void
  @State private var name = ""
  @State private var email = ""
  @State private var phone = ""
  @State private var major = ""
  @State private var year = ""
  @State private var category = "member"
  @State private var active = true
  @State private var core = false
  @State private var busy = false
  @State private var fields: NativeJSON = .null
  @State private var error: String?
  @State private var key: String?
  var body: some View {
    Form {
      Section("Contact") {
        TextField("Full name", text: $name).nativeFieldError(fields, "record.name").textContentType(
          .name)
        TextField("Email", text: $email).nativeFieldError(fields, "record.email").textContentType(
          .emailAddress
        ).keyboardType(.emailAddress)
          .textInputAutocapitalization(.never).autocorrectionDisabled()
        TextField("Phone", text: $phone).nativeFieldError(fields, "record.phone").keyboardType(
          .phonePad)
      }
      Section("Community") {
        Picker("Category", selection: $category) {
          ForEach(["founder", "organizer", "lead", "active", "member", "alumni"], id: \.self) {
            Text($0.capitalized).tag($0)
          }
        }
        Toggle("Active member", isOn: $active)
        Toggle("Core community team", isOn: $core)
      }
      Section("Academic") {
        TextField("Major", text: $major).nativeFieldError(fields, "record.major")
        TextField("Year", text: $year).nativeFieldError(fields, "record.year")
      }
      if let error { NativeErrorView(error: error) }
    }.navigationTitle(member == nil ? "New member" : "Edit member").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
      ToolbarItem(placement: .confirmationAction) {
        Button(busy ? "Saving…" : "Save") { Task { await save() } }.disabled(
          busy || name.count < 2 || !email.contains("@"))
      }
    }.interactiveDismissDisabled(busy || key != nil).task {
      if let member {
        name = member["name"].string
        email = member["email"].string
        phone = member["phone"].string
        major = member["major"].string
        year = member["year"].string
        category = member["category"].string
        active = member["is_active"].flag
        core = member["is_core_team"].flag
      }
    }
  }
  func save() async {
    fields = .null
    busy = true
    defer { busy = false }
    if key == nil { key = UUID().uuidString }
    let record: NativeJSON = .object([
      "name": .string(name),
      "email": .string(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()),
      "phone": .string(phone), "year": .string(year), "major": .string(major),
      "category": .string(category), "is_active": .bool(active), "is_core_team": .bool(core),
      "team_section": member?["team_section"] ?? .string("Active Members"),
      "interests": member?["interests"] ?? .array([]),
    ])
    do {
      let body: NativeJSON =
        member.map {
          .object(["action": .string("update"), "revision": $0["revision"], "record": record])
        } ?? .object(["record": record, "teamId": .null])
      _ = try await session.api.request(
        "/admin/members" + (member.map { "/" + $0.id } ?? ""),
        method: member == nil ? "POST" : "PATCH", body: body, key: key)
      key = nil
      saved()
    } catch {
      self.error = error.localizedDescription
      if let e = error as? NativeAPIError { fields = e.fields }
      if let error = error as? NativeAPIError, !error.uncertain { key = nil }
    }
  }
}

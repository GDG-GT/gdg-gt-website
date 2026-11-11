import SwiftUI

struct NativeFormList: View {
  @EnvironmentObject var session: ScannerModel
  @StateObject private var list = NativeListModel("/admin/forms")
  var body: some View {
    List {
      if let error = list.error {
        NativeErrorView(error: error, retry: { Task { await list.load(session.api) } })
      }
      if list.loading { ProgressView("Loading forms…") }
      ForEach(list.items, id: \.id) { form in
        NavigationLink {
          NativeFormResponses(id: form.id)
        } label: {
          NativeRecordRow(
            title: form["title"].string, subtitle: "\(form["responseCount"].int) responses",
            symbol: "list.clipboard", status: form["status"].string)
        }
      }
      if list.items.isEmpty && !list.loading && list.error == nil {
        NativeEmpty(title: "No forms found", symbol: "list.clipboard")
      }
      NativePagination(page: $list.page, total: list.total, size: 30, loading: list.loading) {
        Task { await list.load(session.api) }
      }
    }.navigationTitle("Forms").searchable(text: $list.query, prompt: "Find a form").task(
      id: list.query
    ) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      await list.load(session.api, reset: true)
    }.refreshable { await list.load(session.api) }
  }
}
struct NativeFormResponses: View {
  @EnvironmentObject var session: ScannerModel
  let id: String
  @State private var form: NativeJSON = .null
  @State private var items: [NativeJSON] = []
  @State private var query = ""
  @State private var page = 1
  @State private var total = 0
  @State private var loading = true
  @State private var error: String?
  @State private var stateAction: String?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if loading { ProgressView("Loading responses…") }
      if !form.id.isEmpty {
        Section {
          HStack {
            Text(form["title"].string).font(.title3.bold())
            Spacer()
            Text(form["status"].string).font(.caption).foregroundStyle(.secondary)
          }
          Text("\(total) responses").font(.subheadline).foregroundStyle(.secondary)
        }
      }
      ForEach(items, id: \.id) { response in
        NavigationLink {
          NativeResponseDetail(form: form, response: response)
        } label: {
          NativeRecordRow(
            title: response["respondent"]["name"].string.isEmpty
              ? "Form response" : response["respondent"]["name"].string,
            subtitle: nativeDateLabel(response["submittedAt"].string), symbol: "doc.text",
            status: response["status"].string)
        }
      }
      if items.isEmpty && !loading && error == nil {
        NativeEmpty(title: "No matching responses", symbol: "tray")
      }
      NativePagination(page: $page, total: total, size: 30, loading: loading) {
        Task { await load() }
      }
      if form["actions"].items.contains(.string("edit")) {
        Section {
          Button(form["status"].string == "Open" ? "Close form" : "Reopen form") {
            stateAction = form["status"].string == "Open" ? "Closed" : "Open"
          }.disabled(loading)
        }
      }
    }.navigationTitle("Responses").navigationBarTitleDisplayMode(.inline).searchable(
      text: $query, prompt: "Search responses"
    ).task(id: query) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      page = 1
      await load()
    }.refreshable { await load() }.confirmationDialog(
      "Update form availability?",
      isPresented: Binding(get: { stateAction != nil }, set: { if !$0 { stateAction = nil } })
    ) {
      Button(stateAction == "Closed" ? "Close form" : "Reopen form") {
        if let state=stateAction{Task { await changeState(state) }}
      }
      Button("Cancel", role: .cancel) { stateAction = nil }
    }
  }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      let value = try await session.api.request("/admin/forms/" + id)
      form = value["form"].id.isEmpty ? value : value["form"]
      let result = try await session.api.request(
        "/admin/forms/" + id + "/responses?"
          + nativeQuery(["page": String(page), "pageSize": "30", "q": query]))
      guard !Task.isCancelled else { return }
      items = result["items"].items
      total = result["total"].int
      error = nil
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
  func changeState(_ state:String) async {
    loading = true
    defer {
      loading = false
      stateAction = nil
    }
    do {
      _ = try await session.api.request(
        "/admin/forms/" + id + "/state", method: "POST",
        body: .object(["revision": form["revision"], "state": .string(state)]),
        key: UUID().uuidString)
      await load()
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeResponseDetail: View {
  @EnvironmentObject var session: ScannerModel
  let form: NativeJSON
  let response: NativeJSON
  @State private var error: String?
  @State private var file: NativeFile?
  @State private var busy = false
  var fields: [NativeJSON] {
    let version =
      form["versions"].items.first { $0["version"].int == response["version"].int } ?? form
    let sections = version["sections"].items.map(\.id)
    return version["fields"].items.enumerated().sorted { left, right in
      let l = sections.firstIndex(of: left.element["sectionId"].string) ?? Int.max
      let r = sections.firstIndex(of: right.element["sectionId"].string) ?? Int.max
      return l == r ? left.offset < right.offset : l < r
    }.map(\.element).filter {
      !["title", "description", "divider", "image"].contains($0["type"].string)
    }
  }
  var body: some View {
    List {
      Section {
        Text(
          response["respondent"]["name"].string.isEmpty
            ? "Form response" : response["respondent"]["name"].string
        ).font(.title3.bold())
        if !response["respondent"]["email"].string.isEmpty {
          Text(response["respondent"]["email"].string)
        }
        Text(nativeDateLabel(response["submittedAt"].string)).font(.caption).foregroundStyle(
          .secondary)
      }
      if let error { NativeErrorView(error: error) }
      ForEach(fields, id: \.id) { field in
        Section(field["label"].string) {
          let answer = response["answers"][field.id]
          if field["type"].string == "file" {
            ForEach(answer.items.map(\.string), id: \.self) { id in
              Button {
                Task { await openFile(id) }
              } label: {
                Label("Open attachment", systemImage: "doc")
              }.disabled(busy)
            }
          } else if !answer.dictionary.isEmpty {
            ForEach(answer.dictionary.keys.sorted(), id: \.self) { key in
              LabeledContent(key, value: answer[key].display)
            }
          } else {
            Text(answer.display.isEmpty ? "No answer" : answer.display).textSelection(.enabled)
              .foregroundStyle(answer.display.isEmpty ? .secondary : .primary)
          }
        }
      }
      if fields.isEmpty {
        NativeEmpty(title: "No answers available", symbol: "doc.text.magnifyingglass")
      }
    }.navigationTitle("Response").navigationBarTitleDisplayMode(.inline).sheet(item: $file) {
      file in NativeDocumentPreview(url: file.url)
    }
  }
  func openFile(_ id: String) async {
    busy = true
    defer { busy = false }
    do {
      let authorization = try await session.api.request(
        "/admin/forms/" + form.id + "/responses/" + response.id + "/files/" + id + "?view=true")
      file = NativeFile(url: try await session.api.downloadAuthorized(authorization))
    } catch { self.error = error.localizedDescription }
  }
}
struct NativeTaskList: View {
  @EnvironmentObject var session: ScannerModel
  @StateObject private var list = NativeListModel("/admin/communications/tasks")
  @State private var create = false
  var body: some View {
    List {
      if let error = list.error {
        NativeErrorView(error: error, retry: { Task { await list.load(session.api) } })
      }
      if list.loading { ProgressView("Loading tasks…") }
      ForEach(list.items, id: \.id) { task in
        NavigationLink {
          NativeTaskDetail(id: task.id)
        } label: {
          NativeRecordRow(
            title: task["title"].string,
            subtitle: task["due_date"].string.isEmpty
              ? task["priority"].string.capitalized : "Due " + task["due_date"].string,
            symbol: task["status"].string == "completed" ? "checkmark.circle.fill" : "circle",
            status: task["status"].string.replacingOccurrences(of: "-", with: " ").capitalized)
        }
      }
      if list.items.isEmpty && !list.loading && list.error == nil {
        NativeEmpty(title: "No tasks found", symbol: "checklist")
      }
      NativePagination(page: $list.page, total: list.total, size: 30, loading: list.loading) {
        Task { await list.load(session.api) }
      }
    }.navigationTitle("Tasks").searchable(text: $list.query, prompt: "Find a task").task(
      id: list.query
    ) {
      try? await Task.sleep(for: .milliseconds(220))
      guard !Task.isCancelled else { return }
      await list.load(session.api, reset: true)
    }.refreshable { await list.load(session.api) }.toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("New task", systemImage: "plus") { create = true }
      }
    }.sheet(isPresented: $create) {
      NavigationStack {
        NativeTaskEditor {
          create = false
          Task { await list.load(session.api, reset: true) }
        }
      }.environmentObject(session)
    }
  }
}
struct NativeTaskDetail: View {
  @EnvironmentObject var session: ScannerModel
  let id: String
  @State private var record: NativeJSON = .null
  @State private var comments: [NativeJSON] = []
  @State private var comment = ""
  @State private var error: String?
  @State private var busy = false
  @State private var key: String?
  var body: some View {
    List {
      if let error { NativeErrorView(error: error, retry: { Task { await load() } }) }
      if !record.id.isEmpty {
        Section {
          Text(record["title"].string).font(.title2.bold())
          if !record["description"].string.isEmpty {
            Text(record["description"].string).textSelection(.enabled)
          }
        }
        if record["actions"].items.contains(.string("status")) {
          Section("Progress") {
            ForEach(["pending", "in-progress", "completed"], id: \.self) { status in
              Button {
                Task { await changeStatus(status) }
              } label: {
                HStack {
                  Text(status.replacingOccurrences(of: "-", with: " ").capitalized)
                  Spacer()
                  if record["status"].string == status { Image(systemName: "checkmark") }
                }
              }.disabled(busy || record["status"].string == status)
            }
          }
        }
        Section("Comments") {
          ForEach(comments, id: \.id) { entry in
            VStack(alignment: .leading, spacing: 7) {
              Text(entry["comment"].string)
              Text(entry["authorName"].string + " · " + nativeDateLabel(entry["created_at"].string))
                .font(.caption).foregroundStyle(.secondary)
            }
          }
          if record["actions"].items.contains(.string("comment")) {
            TextField("Add a comment", text: $comment, axis: .vertical).lineLimit(2...6)
            Button("Post comment") { Task { await sendComment() } }.disabled(
              busy || comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          }
        }
      } else if error == nil {
        ProgressView("Loading task…")
      }
    }.navigationTitle("Task").navigationBarTitleDisplayMode(.inline).task { await load() }
      .refreshable { await load() }
  }
  func load() async {
    do {
      record = try await session.api.request("/admin/communications/tasks/" + id)["record"]
      comments = try await session.api.request("/admin/communications/tasks/" + id + "/comments")[
        "items"
      ].items
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func changeStatus(_ status: String) async {
    busy = true
    defer { busy = false }
    do {
      _ = try await session.api.request(
        "/admin/communications/tasks/" + id, method: "POST",
        body: .object([
          "action": .string("status"), "revision": record["revision"], "status": .string(status),
        ]), key: UUID().uuidString)
      await load()
    } catch { self.error = error.localizedDescription }
  }
  func sendComment() async {
    busy = true
    defer { busy = false }
    if key == nil { key = UUID().uuidString }
    do {
      _ = try await session.api.request(
        "/admin/communications/tasks/" + id + "/comments", method: "POST",
        body: .fields(["comment": comment]), key: key)
      key = nil
      comment = ""
      await load()
    } catch {
      self.error = error.localizedDescription
      if let error = error as? NativeAPIError, !error.uncertain { key = nil }
    }
  }
}
struct NativeTaskEditor: View {
  @EnvironmentObject var session: ScannerModel
  @Environment(\.dismiss) var dismiss
  let saved: () -> Void
  @State private var title = ""
  @State private var details = ""
  @State private var priority = "medium"
  @State private var busy = false
  @State private var error: String?
  @State private var key: String?
  var body: some View {
    Form {
      Section {
        TextField("Title", text: $title)
        Picker("Priority", selection: $priority) {
          Text("Low").tag("low")
          Text("Medium").tag("medium")
          Text("High").tag("high")
        }
      }
      Section("Details") { TextEditor(text: $details).frame(minHeight: 140) }
      if let error { NativeErrorView(error: error) }
    }.navigationTitle("New task").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
      ToolbarItem(placement: .confirmationAction) {
        Button("Create") { Task { await save() } }.disabled(busy || title.count < 2)
      }
    }.interactiveDismissDisabled(busy || key != nil)
  }
  func save() async {
    busy = true
    defer { busy = false }
    if key == nil { key = UUID().uuidString }
    do {
      _ = try await session.api.request(
        "/admin/communications/tasks", method: "POST",
        body: .object([
          "title": .string(title), "description": .string(details), "priority": .string(priority),
          "dueDate": .null, "tags": .array([]), "teamId": .null,
        ]), key: key)
      key = nil
      saved()
    } catch {
      self.error = error.localizedDescription
      if let error = error as? NativeAPIError, !error.uncertain { key = nil }
    }
  }
}

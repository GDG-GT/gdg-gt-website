import QuickLook
import SwiftUI

struct NativeErrorView: View {
  let error: String
  var retry: (() -> Void)? = nil
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(error, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red)
      if let retry { Button("Try again", action: retry) }
    }.padding(.vertical, 8)
  }
}
struct NativeAvatar: View {
  let name: String
  var size: CGFloat = 44
  var body: some View {
    Text(name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined()).font(
      .system(size: size * 0.32, weight: .semibold)
    ).foregroundStyle(Color.accentColor).frame(width: size, height: size).background(
      Color.accentColor.opacity(0.1), in: Circle()
    ).accessibilityHidden(true)
  }
}
struct NativeEmpty: View {
  let title: String
  let symbol: String
  var message: String = ""
  var body: some View {
    ContentUnavailableView(
      title, systemImage: symbol, description: message.isEmpty ? nil : Text(message))
  }
}
struct NativeRecordRow: View {
  let title: String
  var subtitle: String = ""
  var symbol: String = "doc.text"
  var status: String = ""
  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: symbol).font(.title3).foregroundStyle(.tint).frame(width: 32)
      VStack(alignment: .leading, spacing: 5) {
        Text(title).font(.body.weight(.medium)).foregroundStyle(.primary)
        if !subtitle.isEmpty {
          Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
      }
      Spacer()
      if !status.isEmpty { Text(status).font(.caption.weight(.medium)).foregroundStyle(.secondary) }
    }.padding(.vertical, 6).accessibilityElement(children: .combine)
  }
}
struct NativeShare: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    let c = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    c.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: url) }
    return c
  }
  func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
  static func dismantleUIViewController(_ controller: UIActivityViewController, coordinator: ()) {
    controller.completionWithItemsHandler = nil
  }
}
struct NativeFile: Identifiable {
  let id = UUID()
  let url: URL
}
func nativeDate(_ value: String) -> Date? {
  ISO8601DateFormatter().date(from: value)
    ?? {
      let f = ISO8601DateFormatter()
      f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      return f.date(from: value)
    }()
}
func nativeDateLabel(_ value: String) -> String {
  guard let date = nativeDate(value) else { return value }
  return date.formatted(date: .abbreviated, time: .shortened)
}
func nativeQuery(_ values: [String: String]) -> String {
  var components = URLComponents()
  components.queryItems = values.map { URLQueryItem(name: $0.key, value: $0.value) }
  return components.percentEncodedQuery ?? ""
}

@MainActor final class NativeListModel: ObservableObject {
  @Published var items: [NativeJSON] = []
  @Published var total = 0
  @Published var page = 1
  @Published var query = ""
  @Published var loading = false
  @Published var error: String?
  var result: NativeJSON = .null
  private var generation = 0
  let path: String
  let itemsKey: String
  let extras: [String: String]
  init(_ path: String, itemsKey: String = "items", extras: [String: String] = [:]) {
    self.path = path
    self.itemsKey = itemsKey
    self.extras = extras
  }
  func load(_ api: NativeAPI, reset: Bool = false) async {
    if reset { page = 1 }
    generation += 1
    let g = generation
    loading = true
    defer { if g == generation { loading = false } }
    do {
      let values = extras.merging(["page": String(page), "q": query]) { _, new in new }
      let data = try await api.request(path + "?" + nativeQuery(values))
      guard g == generation, !Task.isCancelled else { return }
      result = data
      items = data[itemsKey].items
      total = data["total"].int
      error = nil
    } catch {
      guard g == generation, !Task.isCancelled else { return }
      self.error = error.localizedDescription
      if let error = error as? NativeAPIError, [401, 403, 404].contains(error.status) {
        items = []
        total = 0
      }
    }
  }
}
struct NativeDocumentPreview: UIViewControllerRepresentable {
  let url: URL
  func makeCoordinator() -> Coordinator { Coordinator(url: url) }
  func makeUIViewController(context: Context) -> QLPreviewController {
    let c = QLPreviewController()
    c.dataSource = context.coordinator
    return c
  }
  func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}
  static func dismantleUIViewController(_ controller: QLPreviewController, coordinator: Coordinator)
  { try? FileManager.default.removeItem(at: coordinator.url) }
  final class Coordinator: NSObject, QLPreviewControllerDataSource {
    let url: URL
    init(url: URL) { self.url = url }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
      -> QLPreviewItem
    { url as NSURL }
  }
}

extension View {
  func nativeFieldError(_ fields: NativeJSON, _ key: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      self.padding(.vertical, fields[key].display.isEmpty ? 0 : 4)
        .overlay(alignment: .bottom) {
          if !fields[key].display.isEmpty { Rectangle().fill(.red).frame(height: 2) }
        }
      if !fields[key].display.isEmpty {
        Text(fields[key].display).font(.caption).foregroundStyle(.red).accessibilityLabel(
          key.replacingOccurrences(of: "record.", with: "").replacingOccurrences(
            of: "event.", with: "") + ": " + fields[key].display)
      }
    }
  }
}

import AVFoundation
import AudioToolbox
import CoreNFC
import SwiftUI

@MainActor protocol NativeCheckinTransport {
  func checkinTargets() async throws -> NativeJSON
  func submitCheckin(_ body: NativeJSON, key: String) async throws -> NativeJSON
}
extension NativeAPI: NativeCheckinTransport {
  func checkinTargets() async throws -> NativeJSON { try await request("/admin/mobile/check-in") }
  func submitCheckin(_ body: NativeJSON, key: String) async throws -> NativeJSON {
    try await request("/admin/mobile/check-in", method: "POST", body: body, key: key)
  }
}
struct ScanTarget: Identifiable, Hashable {
  let kind: String
  let id: String
  let title: String
  let points: Int
  let opensAt: String
  let closesAt: String
  var key: String { kind + ":" + id }
}
struct NativeScanAttempt {
  let credential: String
  let kind: String
  let target: String
  let activity: String?
  let key: String
}
struct NativeScanResult: Identifiable {
  let id = UUID()
  let name: String
  let status: String
  let points: Int
  let time = Date()
  var success: Bool { status == "checked_in" }
}
@MainActor final class NativeCheckinModel: ObservableObject {
  let api: any NativeCheckinTransport
  @Published var targets: [ScanTarget] = []
  @Published var selected: String = ""
  @Published var activity: String = ""
  @Published var mode = "nfc"
  @Published var running = false
  @Published var processing = false
  @Published var error: String?
  @Published var notice: String?
  @Published var recent: [NativeScanResult] = []
  @Published var pending: NativeScanAttempt?
  @Published var loading = false
  @Published var succeeded = 0
  @Published var duplicates = 0
  @Published var scanBounds: CGRect?
  private var nfc: ContinuousCardReader?
  private var epoch = 0
  private var processingAttempt: String?
  private var recentToken: String?
  private var recentAt = Date.distantPast
  var target: ScanTarget? { targets.first { $0.key == selected } }
  var allowedToScan: Bool { running && !processing && pending == nil }
  init(api: any NativeCheckinTransport) { self.api = api }
  func load() async {
    loading = true
    defer { loading = false }
    do {
      let r = try await api.checkinTargets()
      targets = [("activity", "activities"), ("event", "events"), ("connection", "connections")]
        .flatMap { kind, key in
          r[key].items.map {
            ScanTarget(
              kind: kind, id: $0.id, title: $0["title"].string, points: $0["points"].int,
              opensAt: $0["opensAt"].string, closesAt: $0["closesAt"].string)
          }
        }
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  func choose(_ key: String) {
    pause()
    selected = key
    activity = ""
    notice = nil
    error = nil
  }
  func start() {
    guard let target, pending == nil else { return }
    guard isOpen(target) else {
      error = "This check-in window is not open."
      return
    }
    running = true
    error = nil
    notice = nil
    if mode == "nfc" { startNFC() }
  }
  func isOpen(_ target: ScanTarget) -> Bool {
    let now = Date()
    return (nativeDate(target.opensAt).map { $0 <= now } ?? true)
      && (nativeDate(target.closesAt).map { $0 >= now } ?? true)
  }
  private func startNFC() {
    nfc = ContinuousCardReader(
      onRead: { [weak self] value in Task { @MainActor in await self?.accept(value) } },
      onStopped: { [weak self] message in
        Task { @MainActor in
          self?.running = false
          self?.notice = message
        }
      })
    nfc?.start()
  }
  func pause() {
    epoch += 1
    running = false
    nfc?.stop()
    nfc = nil
    scanBounds = nil
  }
  func reset() {
    pause()
    recent = []
    succeeded = 0
    duplicates = 0
    pending = nil
    selected = ""
    activity = ""
    error = nil
    processing = false
    processingAttempt = nil
    recentToken = nil
  }
  func accept(_ raw: String) async {
    guard allowedToScan, let target else { return }
    guard isOpen(target) else {
      pause()
      error = "This check-in window has closed."
      return
    }
    guard let credential = NativeCheckinPolicy.credential(raw) else {
      error = "This is not a GDG member card or Wallet QR."
      UINotificationFeedbackGenerator().notificationOccurred(.error)
      nfc?.resume("Not a GDG credential. Try the next card.")
      return
    }
    if credential == recentToken && Date().timeIntervalSince(recentAt) < 2 {
      nfc?.resume("Remove the previous card, then present the next one.")
      return
    }
    recentToken = credential
    recentAt = Date()
    let attempt = NativeScanAttempt(
      credential: credential, kind: target.kind, target: target.id,
      activity: activity.isEmpty ? nil : activity, key: UUID().uuidString)
    await submit(attempt)
  }
  func retry() async {
    guard let pending, !processing else { return }
    await submit(pending)
  }
  private func submit(_ attempt: NativeScanAttempt) async {
    guard !processing else { return }
    processing = true
    error = nil
    notice = nil
    pending = attempt
    let current = epoch
    processingAttempt = attempt.key
    defer {
      if processingAttempt == attempt.key {
        processing = false
        processingAttempt = nil
      }
    }
    var body: [String: NativeJSON] = [
      "credential": .string(attempt.credential), "kind": .string(attempt.kind),
      "targetId": .string(attempt.target),
    ]
    if let activity = attempt.activity { body["activityId"] = .string(activity) }
    do {
      let r = try await api.submitCheckin(.object(body), key: attempt.key)
      if pending?.key == attempt.key { pending = nil }
      guard current == epoch else { return }
      let result = NativeScanResult(
        name: r["memberName"].string, status: r["status"].string, points: r["points"].int)
      recent.insert(result, at: 0)
      if recent.count > 100 { recent.removeLast() }
      if result.success {
        succeeded += 1
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AudioServicesPlaySystemSound(1057)
      } else if result.status == "duplicate" {
        duplicates += 1
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
      } else {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
      }
      let outcome = NativeCheckinPolicy.outcome(result.status).title
      UIAccessibility.post(notification: .announcement, argument: result.name + ". " + outcome)
      nfc?.resume(result.name + " · " + outcome + ". Ready for the next card.")
    } catch {
      guard current == epoch else { return }
      if let error = error as? NativeAPIError, !error.uncertain && error.status != 429 {
        pending = nil
        self.error = error.message
        if error.status == 401 || error.status == 403 || error.code == "INVALID_STATE" {
          pause()
        } else {
          nfc?.resume(error.message + " Present the next card.")
        }
      } else {
        pause()
        self.error =
          "The result is uncertain. Retry this same check-in before scanning anyone else."
      }
      UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
  }
}

final class ContinuousCardReader: NSObject, NFCTagReaderSessionDelegate {
  private var session: NFCTagReaderSession?
  private var processing = false
  private var suppressStop = false
  private let onRead: (String) -> Void
  private let onStopped: (String) -> Void
  init(onRead: @escaping (String) -> Void, onStopped: @escaping (String) -> Void) {
    self.onRead = onRead
    self.onStopped = onStopped
  }
  func start() {
    guard NFCTagReaderSession.readingAvailable else {
      onStopped("NFC requires a supported iPhone. You can use Wallet QR scanning instead.")
      return
    }
    session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main)
    session?.alertMessage = "Present a member card. Valid scans check in immediately."
    session?.begin()
  }
  func stop() {
    suppressStop = true
    session?.invalidate()
    session = nil
  }
  func resume(_ message: String) {
    guard let session else { return }
    session.alertMessage = message
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self, weak session] in
      guard let self, let session, self.session === session else { return }
      self.processing = false
      session.restartPolling()
    }
  }
  func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}
  func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
    guard self.session === session else { return }
    self.session = nil
    if !suppressStop { onStopped("NFC scanning paused. Tap Resume NFC to continue the line.") }
  }
  func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
    guard !processing, self.session === session else { return }
    guard tags.count == 1, let tag = tags.first else {
      resume("Present one card at a time.")
      return
    }
    guard case .miFare(let card) = tag, card.mifareFamily == .ultralight, card.identifier.count == 7
    else {
      resume("Unsupported card. Use a GDG card or Wallet QR.")
      return
    }
    processing = true
    let uid = card.identifier.map { String(format: "%02x", $0) }.joined()
    session.connect(to: tag) { [weak self] error in
      guard let self, self.session === session else { return }
      guard error == nil else {
        self.resume("Card could not connect. Try again.")
        return
      }
      card.readNDEF { [weak self] message, error in
        DispatchQueue.main.async {
          guard let self, self.session === session else { return }
          guard error == nil, let records = message?.records else {
            self.resume("Card could not be read. Try again.")
            return
          }
          var token: String?
          if records.count == 2,
            records[0].wellKnownTypeURIPayload()?.absoluteString == ScannerPolicy.cardDestination,
            records[1].typeNameFormat == .media,
            String(data: records[1].type, encoding: .utf8) == ScannerPolicy.cardMediaType
          {
            token = String(data: records[1].payload, encoding: .utf8)
          } else if records.count == 1,
            let url = records[0].wellKnownTypeURIPayload()?.absoluteString
          {
            token = ScannerPolicy.credential(url)
          }
          guard let token, token.utf8.count == 43, ScannerPolicy.credential(token) != nil,
            let data = try? JSONSerialization.data(
              withJSONObject: ["v": 2, "credential": token, "uid": uid], options: [.sortedKeys]),
            let value = String(data: data, encoding: .utf8)
          else {
            self.resume("Not a GDG member card. Present the next card.")
            return
          }
          self.onRead(value)
        }
      }
    }
  }
}

struct NativeCheckinScreen: View {
  @EnvironmentObject var session: ScannerModel
  @ObservedObject var model: NativeCheckinModel
  @State private var choosing = false
  @Environment(\.scenePhase) var phase
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        HStack {
          VStack(alignment: .leading, spacing: 5) {
            Text("CHECK-IN").font(.caption.weight(.semibold)).tracking(1.4).foregroundStyle(
              .secondary)
            Text(model.target?.title ?? "Ready for the door").font(.title2.bold())
          }
          Spacer()
          Button {
            model.pause()
            choosing = true
          } label: {
            Image(systemName: "slider.horizontal.3").font(.title3)
          }.accessibilityLabel("Choose check-in activity or event").disabled(
            model.processing || model.pending != nil)
        }
        if let target = model.target {
          HStack {
            Label(
              target.kind == "activity"
                ? "Chapter activity" : target.kind == "event" ? "Chapter event" : "Connected event",
              systemImage: "calendar")
            Spacer()
            if target.points > 0 { Text("+\(target.points) points").fontWeight(.semibold) }
          }.font(.subheadline).foregroundStyle(.secondary)
        }
        if let last = model.recent.first {
          HStack(spacing: 12) {
            Image(
              systemName: last.success
                ? "checkmark.circle.fill"
                : last.status == "duplicate" ? "person.fill.checkmark" : "xmark.circle.fill"
            ).font(.title2).foregroundStyle(
              last.success ? Color.green : last.status == "duplicate" ? Color.orange : Color.red)
            VStack(alignment: .leading, spacing: 4) {
              Text(last.name).font(.headline)
              Text(NativeCheckinPolicy.outcome(last.status).title).font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if last.points > 0 { Text("+\(last.points)").font(.headline) }
          }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(
            Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18)
          ).accessibilityElement(children: .combine)
        }
        if model.mode == "qr" && model.running {
          #if DEBUG
            if NativeFixtures.enabled {
              Color.black.overlay {
                Label("Simulator QR input", systemImage: "qrcode.viewfinder").foregroundStyle(
                  .white)
              }.frame(height: 260).clipShape(RoundedRectangle(cornerRadius: 28))
            } else {
              NativeQRCamera(
                enabled: model.allowedToScan,
                onRead: { value, bounds in
                  model.scanBounds = bounds
                  Task { await model.accept(value) }
                }
              )
              .frame(height: 260).clipShape(RoundedRectangle(cornerRadius: 28)).overlay {
                if model.processing {
                  ProgressView("Checking in…").padding(14).background(
                    .regularMaterial, in: Capsule())
                }
              }
            }
          #else
            NativeQRCamera(
              enabled: model.allowedToScan,
              onRead: { value, bounds in
                model.scanBounds = bounds
                Task { await model.accept(value) }
              }
            )
            .frame(height: 260).clipShape(RoundedRectangle(cornerRadius: 28)).overlay {
              if model.processing {
                ProgressView("Checking in…").padding(14).background(.regularMaterial, in: Capsule())
              }
            }
          #endif
        } else {
          VStack(spacing: 18) {
            Image(
              systemName: model.mode == "nfc" ? "wave.3.right.circle.fill" : "qrcode.viewfinder"
            ).font(.system(size: 76, weight: .light)).foregroundStyle(.tint)
            Text(
              model.processing
                ? "Recording check-in…"
                : model.running ? "Present the next card" : "Scan. Check in. Next."
            ).font(.title3.bold())
            Text(
              model.target == nil
                ? "Choose the activity or event once to start the line."
                : "Each valid scan records attendance immediately."
            ).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
          }.frame(maxWidth: .infinity).padding(.vertical, 30).background(
            Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 28))
        }
        HStack(spacing: 12) {
          metric(model.succeeded, "Checked in", .green)
          metric(model.duplicates, "Already here", .orange)
        }
        if let error = model.error {
          Label(error, systemImage: "exclamationmark.circle.fill").font(.subheadline)
            .foregroundStyle(.red).accessibilityLabel("Check-in error: " + error)
        }
        if let notice = model.notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
        if model.pending != nil {
          Button {
            Task { await model.retry() }
          } label: {
            Label("Retry same check-in", systemImage: "arrow.clockwise").frame(
              maxWidth: .infinity, minHeight: 42)
          }.buttonStyle(.borderedProminent).disabled(model.processing)
        } else if model.target == nil {
          Button {
            choosing = true
          } label: {
            Text("Choose activity or event").frame(maxWidth: .infinity, minHeight: 42)
          }.buttonStyle(.borderedProminent)
        } else if model.running {
          Button("Pause scanning", systemImage: "pause.fill") { model.pause() }.buttonStyle(
            .bordered
          ).frame(maxWidth: .infinity)
        } else {
          Button {
            model.start()
          } label: {
            Label(
              model.mode == "nfc" ? "Resume NFC" : "Start QR scanning",
              systemImage: model.mode == "nfc" ? "wave.3.right" : "qrcode.viewfinder"
            ).frame(maxWidth: .infinity, minHeight: 42)
          }.buttonStyle(.borderedProminent)
        }
        #if DEBUG
          if NativeFixtures.enabled {
            Button("Simulate next QR") {
              model.mode = "qr"
              model.running = true
              Task { await model.accept(String(format: "%043d", model.succeeded + 1)) }
            }.accessibilityIdentifier("simulate-next")
            Button("Simulate duplicate") {
              model.mode = "qr"
              model.running = true
              Task { await model.accept(String(format: "%043d", max(1, model.succeeded))) }
            }.accessibilityIdentifier("simulate-duplicate")
          }
        #endif
        if model.target?.kind == "event" {
          Picker("Points activity", selection: $model.activity) {
            Text("Attendance only").tag("")
            ForEach(model.targets.filter { $0.kind == "activity" }) { t in
              Text(t.title + " · +\(t.points)").tag(t.id)
            }
          }.disabled(model.running || model.processing || model.pending != nil)
        }
        Picker("Scan method", selection: $model.mode) {
          Text("NFC card").tag("nfc")
          Text("Wallet QR").tag("qr")
        }.pickerStyle(.segmented).disabled(
          model.running || model.processing || model.pending != nil)
        if !model.recent.isEmpty {
          Text("This session").font(.headline)
          ForEach(model.recent.prefix(20)) { result in
            HStack(spacing: 12) {
              Image(
                systemName: result.success
                  ? "checkmark.circle.fill"
                  : result.status == "duplicate" ? "person.fill.checkmark" : "xmark.circle.fill"
              ).font(.title2).foregroundStyle(
                result.success ? .green : result.status == "duplicate" ? .orange : .red)
              VStack(alignment: .leading, spacing: 3) {
                Text(result.name).fontWeight(.semibold)
                Text(NativeCheckinPolicy.outcome(result.status).title).font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              if result.points > 0 {
                Text("+\(result.points)").fontWeight(.bold).foregroundStyle(.green)
              }
            }.padding(.vertical, 7).accessibilityElement(children: .combine)
          }
        }
      }.padding(20)
    }.background(Color(.systemGroupedBackground)).navigationTitle("Check-in")
      .navigationBarTitleDisplayMode(.inline)
      .task { if model.targets.isEmpty { await model.load() } }
      .sheet(isPresented: $choosing) {
        NavigationStack {
          List {
            if model.loading { ProgressView("Loading activities…") }
            if let error = model.error {
              Text(error).foregroundStyle(.red)
              Button("Try again") { Task { await model.load() } }
            }
            ForEach(
              [
                ("activity", "Activities"), ("event", "Chapter events"),
                ("connection", "Connected events"),
              ], id: \.0
            ) { kind, title in
              Section(title) {
                ForEach(model.targets.filter { $0.kind == kind }) { target in
                  Button {
                    model.choose(target.key)
                    choosing = false
                  } label: {
                    HStack {
                      VStack(alignment: .leading) {
                        Text(target.title).foregroundStyle(.primary)
                        if target.points > 0 {
                          Text("+\(target.points) points per check-in").font(.caption)
                            .foregroundStyle(.secondary)
                        }
                      }
                      Spacer()
                      if model.selected == target.key { Image(systemName: "checkmark") }
                    }
                  }
                }
              }
            }
            if model.targets.isEmpty && !model.loading {
              ContentUnavailableView(
                "No check-in targets", systemImage: "calendar.badge.exclamationmark",
                description: Text("Create an activity or publish an event first."))
            }
          }.navigationTitle("Check-in for").toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { choosing = false } }
          }.refreshable { await model.load() }
        }
      }
      .onChange(of: phase) { _, value in if value != .active { model.pause() } }
      .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
        if model.running, let target = model.target, !model.isOpen(target) {
          model.pause()
          model.notice = "The check-in window has closed."
        }
      }
      .onDisappear { model.pause() }
  }
  func metric(_ number: Int, _ label: String, _ color: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(number, format: .number).font(.system(size: 32, weight: .bold, design: .rounded))
        .foregroundStyle(.primary)
      Text(label).font(.caption).foregroundStyle(.secondary)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(18).background(
      Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
  }
}

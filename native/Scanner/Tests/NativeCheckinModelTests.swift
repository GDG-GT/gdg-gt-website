#if !SWIFT_PACKAGE
  import XCTest
  @testable import GDGScanner
  @MainActor final class QueueTransport: NativeCheckinTransport {
    struct Request {
      let body: NativeJSON
      let key: String
      let continuation: CheckedContinuation<NativeJSON, Error>
    }
    var requests: [Request] = []
    func checkinTargets() async throws -> NativeJSON { .null }
    func submitCheckin(_ body: NativeJSON, key: String) async throws -> NativeJSON {
      try await withCheckedThrowingContinuation {
        requests.append(Request(body: body, key: key, continuation: $0))
      }
    }
  }
  final class NativeCheckinModelTests: XCTestCase {
    @MainActor func ready(_ api: QueueTransport) -> NativeCheckinModel {
      let m = NativeCheckinModel(api: api)
      m.targets = [
        ScanTarget(
          kind: "activity", id: "a5100000-0000-4000-8000-000000000003", title: "Queue", points: 10,
          opensAt: "2020-01-01T00:00:00Z", closesAt: "2035-01-01T00:00:00Z")
      ]
      m.selected = m.targets[0].key
      m.mode = "qr"
      m.start()
      return m
    }
    @MainActor func settle(_ api: QueueTransport, _ count: Int) async {
      for _ in 0..<100 {
        if api.requests.count >= count { return }
        await Task.yield()
      }
      XCTAssertEqual(api.requests.count, count)
    }
    @MainActor func testLateOldAccountResponseCannotClearNewCheckin() async {
      let api = QueueTransport()
      let m = ready(api)
      let first = Task { await m.accept(String(repeating: "A", count: 43)) }
      await settle(api, 1)
      m.reset()
      m.selected = m.targets[0].key
      m.mode = "qr"
      m.start()
      let second = Task { await m.accept(String(repeating: "B", count: 43)) }
      await settle(api, 2)
      api.requests[0].continuation.resume(
        returning: .object([
          "status": .string("checked_in"), "memberName": .string("Old account"),
          "points": .number(10),
        ]))
      await first.value
      XCTAssertTrue(m.processing)
      XCTAssertEqual(m.pending?.credential, String(repeating: "B", count: 43))
      XCTAssertEqual(m.succeeded, 0)
      api.requests[1].continuation.resume(
        returning: .object([
          "status": .string("checked_in"), "memberName": .string("New account"),
          "points": .number(10),
        ]))
      await second.value
      XCTAssertFalse(m.processing)
      XCTAssertNil(m.pending)
      XCTAssertEqual(m.succeeded, 1)
      XCTAssertEqual(m.recent.first?.name, "New account")
    }
    @MainActor func testUncertainResultRetriesIdenticalOperation() async {
      let api = QueueTransport()
      let m = ready(api)
      let first = Task { await m.accept(String(repeating: "A", count: 43)) }
      await settle(api, 1)
      api.requests[0].continuation.resume(
        throwing: NativeAPIError(
          status: 503, code: "UNAVAILABLE", message: "Fixture outage", fields: .null))
      await first.value
      XCTAssertFalse(m.running)
      XCTAssertNotNil(m.pending)
      let retry = Task { await m.retry() }
      await settle(api, 2)
      XCTAssertEqual(api.requests[0].key, api.requests[1].key)
      XCTAssertEqual(api.requests[0].body, api.requests[1].body)
      api.requests[1].continuation.resume(
        returning: .object([
          "status": .string("checked_in"), "memberName": .string("Participant"),
          "points": .number(10),
        ]))
      await retry.value
      XCTAssertEqual(m.succeeded, 1)
      XCTAssertNil(m.pending)
    }
  }
#endif

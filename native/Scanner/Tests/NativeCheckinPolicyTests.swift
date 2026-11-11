import XCTest

#if SWIFT_PACKAGE
  @testable import ScannerPolicy
#else
  @testable import GDGScanner
#endif
final class NativeCheckinPolicyTests: XCTestCase {
  func testCredentialKindsRemainDistinct() {
    let token = String(repeating: "A", count: 43)
    XCTAssertEqual(NativeCheckinPolicy.credential(token), token)
    let proof = "{\"v\":2,\"uid\":\"04abcdef012345\",\"credential\":\"\(token)\"}"
    XCTAssertNotEqual(NativeCheckinPolicy.credential(proof), token)
    let parsed =
      try! JSONSerialization.jsonObject(
        with: NativeCheckinPolicy.credential(proof)!.data(using: .utf8)!) as! [String: Any]
    XCTAssertEqual(parsed["uid"] as? String, "04abcdef012345")
    for raw in [
      "https://evil.test/tap#card=" + token, token + "\n",
      proof.replacingOccurrences(of: "04abcdef012345", with: "04ABCDEF012345"),
      proof.replacingOccurrences(of: "\"v\":2", with: "\"v\":1"),
      proof.replacingOccurrences(of: "\"v\":2", with: "\"extra\":true,\"v\":2"),
      String(repeating: "x", count: 400),
    ] { XCTAssertNil(NativeCheckinPolicy.credential(raw), raw) }
  }
  func testOnlyConfirmedAttendanceIsSuccess() {
    XCTAssertTrue(NativeCheckinPolicy.outcome("checked_in").success)
    for state in ["duplicate", "not_registered", "waitlisted", "unlinked", "cancelled", "unknown"] {
      XCTAssertFalse(NativeCheckinPolicy.outcome(state).success)
    }
    XCTAssertEqual(NativeCheckinPolicy.outcome("duplicate").title, "Already checked in")
  }
}

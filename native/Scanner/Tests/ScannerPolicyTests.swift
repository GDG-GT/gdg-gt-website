import XCTest
#if SWIFT_PACKAGE
@testable import ScannerPolicy
#else
@testable import GDGScanner
#endif
final class ScannerPolicyTests: XCTestCase {
    let token = String(repeating: "A", count: 43)
    func testOnlyFirstPartyWorkspaceCanUseBridge() {
        XCTAssertTrue(ScannerPolicy.workspace(URL(string: "https://gdggt.dev/admin/rewards")))
        for raw in ["http://gdggt.dev/admin/rewards", "https://gdggt.dev.evil.test/admin/rewards", "https://leaderboards.gdggt.dev/admin/rewards", "https://gdggt.dev:444/admin/rewards", "https://evil@gdggt.dev/admin/rewards", "https://gdggt.dev/admin/members", "https://gdggt.dev/admin/rewards-evil"] {
            XCTAssertFalse(ScannerPolicy.workspace(URL(string: raw)), raw)
        }
    }
    func testCredentialsAndCanonicalWriteURL() {
        XCTAssertNil(ScannerPolicy.credential(token + "\n"))
        let url = "https://gdggt.dev/tap#card=" + token
        XCTAssertEqual(ScannerPolicy.credential(token), token)
        XCTAssertEqual(ScannerPolicy.credential(url), token)
        XCTAssertNotNil(ScannerPolicy.writableURL(url))
        for raw in [token, url + "&card=" + token, url + "&x=1", "https://gdggt.dev/tap?x=1#card=" + token, "https://evil.test/tap#card=" + token, "https://gdggt.dev/tap#card=short", "https://gdggt.dev/tap#card=" + String(repeating: "+", count: 43)] {
            XCTAssertNil(ScannerPolicy.writableURL(raw), raw)
        }
    }
}

extension ScannerPolicyTests {
    func testAdminAndDownloadBoundaries() {
        XCTAssertTrue(ScannerPolicy.admin(URL(string: "https://gdggt.dev/admin/forms/new")))
        XCTAssertTrue(ScannerPolicy.passDownload(URL(string: "https://gdggt.dev/api/v1/admin/rewards/wallet/123")))
        XCTAssertTrue(ScannerPolicy.blobDownload(URL(string: "blob:https://gdggt.dev/12345678-1234-1234-1234-123456789012")))
        for raw in ["https://gdggt.dev/admin-evil", "https://gdggt.dev.evil.test/admin/forms", "https://gdggt.dev:444/admin", "http://gdggt.dev/admin"] { XCTAssertFalse(ScannerPolicy.admin(URL(string: raw))) }
        for raw in ["blob:https://evil.test/12345678-1234-1234-1234-123456789012", "blob:https://gdggt.dev.evil.test/12345678-1234-1234-1234-123456789012"] { XCTAssertFalse(ScannerPolicy.blobDownload(URL(string: raw))) }
        XCTAssertTrue(ScannerPolicy.googleSave(URL(string: "https://pay.google.com/gp/v/save/abc.def.ghi")))
        XCTAssertFalse(ScannerPolicy.googleSave(URL(string: "https://pay.google.com.evil.test/gp/v/save/abc")))
        XCTAssertEqual(ScannerPolicy.downloadExtension("application/pdf"), "pdf")
        XCTAssertNil(ScannerPolicy.downloadExtension("text/html"))
    }
}

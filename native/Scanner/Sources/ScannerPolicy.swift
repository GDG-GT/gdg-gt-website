import Foundation

/// Keep the native hardware surface limited to the chapter's first-party workspace.
enum ScannerPolicy {
    static let origin = "https://gdggt.dev"
    static let startURL = URL(string: origin + "/admin/scanner")!
    static let cardDestination = "https://leaderboards.gdggt.dev/"
    static let cardMediaType = "application/vnd.gdggt.card"
    static let passTypeIdentifier = "pass.dev.gdggt.membership"
    static func trusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == "gdggt.dev" &&
            (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }
    static func admin(_ url: URL?) -> Bool {
        trusted(url) && (url!.path == "/admin" || url!.path.hasPrefix("/admin/"))
    }
    static func googleSave(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == "pay.google.com" && url.port == nil && url.user == nil && url.password == nil && url.path.hasPrefix("/gp/v/save/")
    }
    static func passDownload(_ url: URL?) -> Bool {
        guard trusted(url) else { return false }
        return url!.path.hasPrefix("/api/v1/admin/")
    }
    static func blobDownload(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.absoluteString.range(of: "^blob:https://gdggt\\.dev/[0-9a-fA-F-]{36}$", options: .regularExpression) != nil
    }
    static func downloadExtension(_ mime: String?) -> String? {
        let types = ["application/vnd.apple.pkpass": "pkpass", "application/pdf": "pdf", "text/csv": "csv", "application/zip": "zip", "application/json": "json", "text/plain": "txt", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/octet-stream": "bin"]
        return types[mime?.lowercased() ?? ""]
    }
    static func workspace(_ url: URL?) -> Bool {
        trusted(url) && (url!.path == "/admin/rewards" || url!.path == "/admin/rewards/")
    }
    static func credential(_ value: String) -> String? {
        if value.utf8.count == 43 && value.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil { return value }
        guard let url = URL(string: value), trusted(url), url.path == "/tap", url.query == nil,
              let fragment = url.fragment, fragment.hasPrefix("card="), fragment.count == 48 else { return nil }
        let token = String(fragment.dropFirst(5))
        return credential(token)
    }
    static func writableURL(_ value: String) -> URL? {
        guard let token = credential(value), value == origin + "/tap#card=" + token else { return nil }
        return URL(string: value)
    }
}

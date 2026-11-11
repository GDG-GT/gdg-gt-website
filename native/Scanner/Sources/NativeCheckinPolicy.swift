import Foundation

enum NativeCheckinPolicy {
  static func credential(_ value: String) -> String? {
    guard value.utf8.count <= 300 else { return nil }
    if let raw = ScannerPolicy.credential(value) { return raw }
    guard let data = value.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      Set(object.keys) == Set(["v", "credential", "uid"]), let version = object["v"] as? Int,
      version == 2,
      let token = object["credential"] as? String, token.utf8.count == 43,
      ScannerPolicy.credential(token) != nil, let uid = object["uid"] as? String,
      uid.range(of: "^[a-f0-9]{14}$", options: .regularExpression) != nil
    else { return nil }
    guard
      let normalized = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    else { return nil }
    return String(data: normalized, encoding: .utf8)
  }
  static func outcome(_ status: String) -> (title: String, success: Bool) {
    switch status {
    case "checked_in": return ("Checked in", true)
    case "duplicate": return ("Already checked in", false)
    case "unlinked": return ("Event account not linked", false)
    case "waitlisted": return ("On the waitlist", false)
    case "cancelled": return ("Registration cancelled", false)
    case "not_registered": return ("Not registered for this event", false)
    default: return ("Check-in not confirmed", false)
    }
  }
}

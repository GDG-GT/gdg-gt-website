import UIKit
import UserNotifications
import WebKit

final class WorkspaceAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        NativeNotifications.shared.registered(token.map { String(format: "%02x", $0) }.joined())
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NativeNotifications.shared.failed()
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        completion(notification.request.content.userInfo["type"] as? String == "workspace-update" ? [.banner, .sound, .badge] : [])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completion: @escaping () -> Void) {
        if response.notification.request.content.userInfo["type"] as? String == "workspace-update" {
            DispatchQueue.main.async {
                NativeNotifications.shared.pendingOpen = true
                NotificationCenter.default.post(name: .gdgPushOpened, object: nil)
            }
        }
        completion()
    }
}
extension Notification.Name { static let gdgPushOpened = Notification.Name("gdgPushOpened") }
final class NativeNotifications {
    static let shared = NativeNotifications()
    var pendingOpen = false
    private var pending: [String: ([String: Any]?, String?) -> Void] = [:]
    private var installation: String {
        if let id = UserDefaults.standard.string(forKey: "gdg-notification-installation"), UUID(uuidString: id) != nil { return id }
        let id = UUID().uuidString.lowercased(); UserDefaults.standard.set(id, forKey: "gdg-notification-installation"); return id
    }
    private var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
    func request(id: String, method: String, reply: @escaping ([String: Any]?, String?) -> Void) {
        guard UUID(uuidString: id) != nil, ["status", "enable"].contains(method) else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            if method == "enable" && settings.authorizationStatus == .notDetermined {
                center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
                    self.request(id: id, method: "status", reply: reply)
                }
                return
            }
            DispatchQueue.main.async {
                let status: String
                switch settings.authorizationStatus {
                case .authorized: status = "authorized"
                case .provisional, .ephemeral: status = "provisional"
                case .denied: status = "denied"
                default: status = "notDetermined"
                }
                guard status == "authorized" || status == "provisional" else { reply(["permission": status, "platform": "ios"], nil); return }
                self.pending[id] = reply
                UIApplication.shared.registerForRemoteNotifications()
                DispatchQueue.main.asyncAfter(deadline: .now() + 12) {
                    self.pending.removeValue(forKey: id)?(nil, "iPhone notifications could not register. Try again when connected.")
                }
            }
        }
    }
    func registered(_ token: String) {
        DispatchQueue.main.async {
            let replies = self.pending; self.pending.removeAll()
            for reply in replies.values { reply(["permission": "authorized", "platform": "ios", "token": token, "installationId": self.installation, "environment": self.environment], nil) }
        }
    }
    func failed() {
        DispatchQueue.main.async { let replies = self.pending; self.pending.removeAll(); for reply in replies.values { reply(nil, "Device notifications could not register. Try again.") } }
    }
    func forget() {
        failed(); pendingOpen = false
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}

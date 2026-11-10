import SwiftUI

@main
struct ScannerApp: App {
    @UIApplicationDelegateAdaptor(WorkspaceAppDelegate.self) var appDelegate
    var body: some Scene {
        WindowGroup {
            OfficerAppView()
                .preferredColorScheme(.light)
                .tint(Color(red: 0.72, green: 0.25, blue: 0.19))
        }
    }
}

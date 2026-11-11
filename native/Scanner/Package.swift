// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "ScannerPolicy",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "ScannerPolicy", path: "Sources", exclude: ["NativeHomeEvents.swift", "NativeFormsTasks.swift", "ScannerView.swift", "CardSession.swift", "NativeCheckin.swift", "NativeComponents.swift", "NativeMembers.swift", "AppNotifications.swift", "Assets.xcassets", "OfficerAppView.swift", "NativeCamera.swift", "NativeAPI.swift", "ScannerApp.swift", "NativeMore.swift", "PrivacyInfo.xcprivacy", "SecureSignIn.swift", "NativeFixtures.swift", "NativeNewsletter.swift", "NativePrivacyShield.swift"], sources: ["ScannerPolicy.swift", "NativeCheckinPolicy.swift"]),
        .testTarget(name: "ScannerPolicyTests", dependencies: ["ScannerPolicy"], path: "Tests")
    ]
)

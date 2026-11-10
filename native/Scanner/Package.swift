// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "ScannerPolicy",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "ScannerPolicy", path: "Sources", exclude: ["AppNotifications.swift", "CardSession.swift", "ScannerView.swift", "ScannerApp.swift", "SecureSignIn.swift", "OfficerAppView.swift", "Assets.xcassets", "PrivacyInfo.xcprivacy"], sources: ["ScannerPolicy.swift"]),
        .testTarget(name: "ScannerPolicyTests", dependencies: ["ScannerPolicy"], path: "Tests")
    ]
)

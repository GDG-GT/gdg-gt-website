import SwiftUI
import WebKit
import CoreNFC
import LocalAuthentication

struct WorkspaceView: UIViewRepresentable {
    let model: ScannerModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class ScannerModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    @Published var unlocked = false
    @Published var hasRememberedAccount = OfficerKeychain.available
    @Published var signingIn = false
    @Published var signInNotice: String?
    @Published var pageTitle = "GDG workspace"
    @Published var path = "/admin"
    @Published var destinations: [OfficerDestination] = []
    @Published var canGoBack = false
    private let signInClient = OfficerSignIn()
    private var authenticationGeneration = 0
    private var hasWorkspace = false
    private var authenticationContext: LAContext?
    var biometryAvailable: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) }
    @Published var loading = true
    @Published var error: String?
    private var nfc: CardSession?
    private weak var confirmation: UIAlertController?
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var activeDownloads: [ObjectIdentifier: WKDownload] = [:]
    private let shareDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("GDGPassShares", isDirectory: true)
    override init() {
        super.init()
        // Remove only this app's abandoned pass-share files after a crash/relaunch.
        try? FileManager.default.removeItem(at: shareDirectory)
        try? FileManager.default.createDirectory(at: shareDirectory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    }
    private var pendingID: String?
    private var pendingDocument: URL?
    private var documentGeneration = 0
    private var pendingGeneration = 0
    #if WALLET_VAS
    private let walletEnabled = true
    #else
    private let walletEnabled = false
    #endif
    lazy var webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(self, name: "gdgScanner")
        config.userContentController.add(self, name: "gdgAdmin")
        // At document start, before the workspace mounts. Subframes never receive the bridge marker.
        let js = "if(location.origin==='https://gdggt.dev'){Object.defineProperty(window,'gdgScanner',{value:Object.freeze({version:1,admin:true,wallet:\(walletEnabled)}),writable:false});}"
        config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.95, alpha: 1)
        view.allowsBackForwardNavigationGestures = true
        return view
    }()
    @MainActor
    func signIn(_ credentials: OfficerCredentials, remember: Bool) async {
        guard !signingIn else { return }
        signingIn = true; signInNotice = nil
        let generation = authenticationGeneration
        defer { signingIn = false }
        do {
            if remember {
                let context = LAContext(); authenticationContext = context
                guard try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Enable Face ID sign-in for GDG") else { return }
            }
            guard generation == authenticationGeneration else { return }
            _ = try await signInClient.authenticate(credentials, store: webView.configuration.websiteDataStore.httpCookieStore, restore: false)
            guard generation == authenticationGeneration else { return }
            if remember { try OfficerKeychain.save(credentials) } else { OfficerKeychain.remove() }
            hasRememberedAccount = OfficerKeychain.available
            openWorkspace()
        } catch { if generation == authenticationGeneration { signInNotice = error.localizedDescription } }
        authenticationContext = nil
    }
    @MainActor
    func unlock() async {
        guard !signingIn, !unlocked else { return }
        signingIn = true; signInNotice = nil
        let generation = authenticationGeneration
        defer { signingIn = false }
        do {
            let context = LAContext(); authenticationContext = context
            let credentials = try await Task.detached { try OfficerKeychain.read(context: context) }.value
            guard generation == authenticationGeneration else { return }
            let renewed = try await signInClient.authenticate(credentials, store: webView.configuration.websiteDataStore.httpCookieStore, restore: true)
            guard generation == authenticationGeneration else { return }
            if !renewed && hasWorkspace && ScannerPolicy.admin(webView.url) {
                unlocked = true
                _ = try? await webView.evaluateJavaScript("window.dispatchEvent(new Event('focus'));")
            } else { openWorkspace() }
        } catch { if generation == authenticationGeneration { signInNotice = error.localizedDescription } }
        authenticationContext = nil
    }
    private func openWorkspace() {
        hasWorkspace = true; unlocked = true; signInNotice = nil; error = nil; loading = true
        webView.load(URLRequest(url: URL(string: ScannerPolicy.origin + "/admin")!))
    }
    func lock() {
        authenticationGeneration += 1
        authenticationContext?.invalidate(); authenticationContext = nil
        if loading { hasWorkspace = false }
        cancel(); webView.stopLoading(); unlocked = false
    }
    func forgetLocally() {
        lock(); OfficerKeychain.remove(); hasRememberedAccount = false; signInNotice = nil
        hasWorkspace = false; destinations = []; signingIn = true
        let store = webView.configuration.websiteDataStore
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in DispatchQueue.main.async { self?.signingIn = false } }
    }
    func navigateBack() { requestNavigation("back") }
    func requestNavigation(_ target: String) {
        guard unlocked, ScannerPolicy.admin(webView.url),
              ["back", "reload", "signOut", "notifications", "search"].contains(target) || destinations.contains(where: { $0.path == target }) else { return }
        webView.callAsyncJavaScript("window.dispatchEvent(new CustomEvent('gdg:native-navigation',{detail:target}));", arguments: ["target": target], in: nil, in: .page, completionHandler: { _ in })
    }
    func reload() {
        cancel()
        error = nil
        loading = true
        webView.load(URLRequest(url: URL(string: ScannerPolicy.origin + path)!))
    }
    func cancel() {
        for download in activeDownloads.values { download.cancel { _ in } }
        activeDownloads.removeAll()
        for file in downloads.values { try? FileManager.default.removeItem(at: file) }
        downloads.removeAll()
        confirmation?.dismiss(animated: false)
        confirmation = nil
        nfc?.cancel()
        nfc = nil
        if pendingID != nil { finish(error: "Scanning cancelled.") }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "gdgAdmin" {
            guard message.frameInfo.isMainFrame, ScannerPolicy.admin(message.frameInfo.request.url),
                  ScannerPolicy.admin(webView.url), message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == "gdggt.dev",
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            if action == "signedOut" { forgetLocally(); return }
            guard unlocked else { return }
            if action == "authRequired" { hasWorkspace = false; lock(); return }
            if action == "state", let currentPath = body["path"] as? String,
               ScannerPolicy.admin(URL(string: ScannerPolicy.origin + currentPath)), currentPath.hasPrefix("/admin"),
               let title = body["title"] as? String, title.count <= 100,
               let rows = body["destinations"] as? [[String: String]], rows.count <= 60 {
                path = currentPath; pageTitle = title; canGoBack = (body["canGoBack"] as? Bool) ?? webView.canGoBack
                destinations = rows.compactMap { row in
                    guard let path = row["path"], path.hasPrefix("/admin"), !path.contains("?"), !path.contains("#"),
                          ScannerPolicy.admin(URL(string: ScannerPolicy.origin + path)),
                          let title = row["title"], title.count <= 100 else { return nil }
                    let symbols = ["/admin": "house", "/admin/events": "calendar", "/admin/rewards": "wave.3.right", "/admin/members": "person.2", "/admin/forms": "list.clipboard", "/admin/finances": "dollarsign.circle", "/admin/profile": "person.crop.circle"]
                    return OfficerDestination(path: path, title: title, symbol: symbols[path] ?? "folder")
                }
            }
            return
        }
        guard unlocked, message.frameInfo.isMainFrame, ScannerPolicy.workspace(message.frameInfo.request.url),
              ScannerPolicy.workspace(webView.url), message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == "gdggt.dev",
              let body = message.body as? [String: String], let id = body["id"],
              UUID(uuidString: id) != nil, let action = body["action"] else { return }
        if action == "cancel" { if id == pendingID { cancel() }; return }
        guard pendingID == nil else { reply(id: id, error: "Finish the current scan first."); return }
        guard ["readCard", "writeCard", "readWallet"].contains(action),
              Set(body.keys).isSubset(of: ["id", "action", "url", "passTypeIdentifier"]) else { return }
        if action == "writeCard" && ScannerPolicy.writableURL(body["url"] ?? "") == nil {
            reply(id: id, error: "This is not a GDG card URL."); return
        }
        if action == "readWallet" && (!walletEnabled || body["passTypeIdentifier"] != ScannerPolicy.passTypeIdentifier) {
            reply(id: id, error: "Wallet NFC is awaiting Apple reader approval."); return
        }
        pendingID = id
        pendingDocument = webView.url
        pendingGeneration = documentGeneration
        // A native confirmation prevents a webpage from silently starting a hardware operation.
        let alert = UIAlertController(title: action == "writeCard" ? "Write member card?" : "Start NFC scan?",
            message: action == "writeCard" ? "Only a blank, rewritable NFC card will be written. The app reads it back before confirming." : "Hold the member card or pass near the top of this iPhone.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in self?.cancel() })
        alert.addAction(UIAlertAction(title: action == "writeCard" ? "Write card" : "Scan", style: .default) { [weak self] _ in
            guard let self, self.pendingID == id, ScannerPolicy.workspace(self.webView.url), self.pendingGeneration == self.documentGeneration else { return }
            self.nfc = CardSession(action: action, url: body["url"], completion: { [weak self] value, error in self?.finish(value: value, error: error) })
            self.nfc?.start()
        })
        guard let presenter = webView.window?.rootViewController else { finish(error: "Scanner is not visible."); return }
        var top = presenter
        while let presented = top.presentedViewController { top = presented }
        confirmation = alert
        top.present(alert, animated: true)
    }
    private func finish(value: String? = nil, error: String? = nil) {
        guard let id = pendingID else { return }
        let sameDocument = pendingGeneration == documentGeneration && pendingDocument == webView.url
        pendingID = nil
        pendingDocument = nil
        nfc = nil
        if sameDocument { reply(id: id, value: value, error: error) }
    }
    private func reply(id: String, value: String? = nil, error: String? = nil) {
        guard ScannerPolicy.workspace(webView.url) else { return }
        var detail: [String: String] = ["id": id]
        if let value { detail["value"] = value }
        if let error { detail["error"] = error }
        webView.callAsyncJavaScript("window.dispatchEvent(new CustomEvent('gdg:scanner-result',{detail:detail}));", arguments: ["detail": detail], in: nil, in: .page, completionHandler: { _ in })
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        // No external pages, custom schemes or subframes enter this webview.
        if unlocked, ScannerPolicy.admin(webView.url), navigationAction.targetFrame?.isMainFrame != false,
           navigationAction.navigationType == .linkActivated,
           (url.scheme == "mailto" || url.scheme == "tel" || (url.scheme == "https" && !ScannerPolicy.trusted(url))) {
            decisionHandler(.cancel); UIApplication.shared.open(url); return
        }
        if ScannerPolicy.blobDownload(url) && !navigationAction.shouldPerformDownload { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame != false && ScannerPolicy.googleSave(url) {
            decisionHandler(.cancel)
            if unlocked { UIApplication.shared.open(url) }
            return
        }
        guard navigationAction.targetFrame?.isMainFrame != false, (ScannerPolicy.trusted(url) || (ScannerPolicy.admin(webView.url) && ScannerPolicy.blobDownload(url))), unlocked else { decisionHandler(.cancel); return }
        if !ScannerPolicy.workspace(url) { cancel() }
        if navigationAction.targetFrame?.isMainFrame != false && !ScannerPolicy.admin(url) && !ScannerPolicy.passDownload(url) && !ScannerPolicy.blobDownload(url) {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated { UIApplication.shared.open(url) }
            return
        }
        decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard unlocked, ScannerPolicy.trusted(navigationResponse.response.url) || ScannerPolicy.blobDownload(navigationResponse.response.url) else { decisionHandler(.cancel); return }
        let attachment = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
        let file = ScannerPolicy.downloadExtension(navigationResponse.response.mimeType) != nil
        decisionHandler(file && (attachment || !navigationResponse.canShowMIMEType || ScannerPolicy.passDownload(navigationResponse.response.url) || ScannerPolicy.blobDownload(navigationResponse.response.url)) ? .download : .allow)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard unlocked, ScannerPolicy.trusted(response.url) || ScannerPolicy.blobDownload(response.url),
              let ext = ScannerPolicy.downloadExtension(response.mimeType), response.expectedContentLength <= 64 * 1024 * 1024 else { completionHandler(nil); return }
        let destination = shareDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
        downloads[ObjectIdentifier(download)] = destination
        activeDownloads[ObjectIdentifier(download)] = download
        completionHandler(destination)
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard unlocked, let file = downloads[ObjectIdentifier(download)], let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 64 * 1024 * 1024 else { cleanup(download); return }
        downloads.removeValue(forKey: ObjectIdentifier(download))
        activeDownloads.removeValue(forKey: ObjectIdentifier(download))
        // The officer chooses a delivery destination. No pass is sent automatically.
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.completionWithItemsHandler = { _,_,_,_ in try? FileManager.default.removeItem(at: file) }
        guard let presenter = webView.window?.rootViewController else { try? FileManager.default.removeItem(at: file); return }
        share.popoverPresentationController?.sourceView = webView
        share.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
        presenter.present(share, animated: true)
    }
    private func cleanup(_ download: WKDownload) {
        activeDownloads.removeValue(forKey: ObjectIdentifier(download))
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { cleanup(download) }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        cancel(); documentGeneration += 1; loading = true
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false; error = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) {
        if (failure as NSError).code != NSURLErrorCancelled { loading = false; error = "Check your internet connection and try again." }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) { loading = false; error = "The workspace could not finish loading. Try again." }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { cancel(); loading = false; error = "The workspace closed. Reload to continue." }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard unlocked, navigationAction.targetFrame == nil, ScannerPolicy.admin(webView.url), let url = navigationAction.request.url else { return nil }
        if ScannerPolicy.trusted(url) && (ScannerPolicy.admin(url) || ScannerPolicy.passDownload(url)) { webView.load(navigationAction.request) }
        else if url.scheme == "https" || url.scheme == "mailto" { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard frame.isMainFrame, ScannerPolicy.trusted(frame.request.url), let presenter = webView.window?.rootViewController, presenter.presentedViewController == nil else { completionHandler(false); return }
        let alert = UIAlertController(title: "Confirm change", message: String(message.prefix(1000)), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard frame.isMainFrame, ScannerPolicy.trusted(frame.request.url), let presenter = webView.window?.rootViewController, presenter.presentedViewController == nil else { completionHandler(); return }
        let alert = UIAlertController(title: "GDG Scanner", message: String(message.prefix(1000)), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == "https" && origin.host == "gdggt.dev" && frame.isMainFrame && ScannerPolicy.workspace(webView.url) && type == .camera ? .prompt : .deny)
    }
}

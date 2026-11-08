import SwiftUI
import WebKit
import CoreNFC

struct ScannerView: View {
    @StateObject private var model = ScannerModel()
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("GDG@GT").font(.headline)
                Text("Scanner").foregroundStyle(.secondary)
                Spacer()
                Button(action: { model.reload() }) { Image(systemName: "arrow.clockwise") }
                    .accessibilityLabel("Reload workspace")
            }.padding(.horizontal, 20).padding(.vertical, 12)
            if let error = model.error {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Workspace unavailable").font(.title2.bold())
                    Text(error)
                    Button("Try again") { model.reload() }.buttonStyle(.borderedProminent)
                }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                ZStack(alignment: .top) {
                    WorkspaceView(model: model)
                    if model.loading { ProgressView().padding(12).background(.regularMaterial).clipShape(Capsule()).padding(8) }
                }
            }
        }
        .background(Color(red: 0.98, green: 0.97, blue: 0.95))
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in model.cancel() }
    }
}
struct WorkspaceView: UIViewRepresentable {
    let model: ScannerModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class ScannerModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    @Published var loading = true
    @Published var error: String?
    private var nfc: CardSession?
    private weak var confirmation: UIAlertController?
    private var downloads: [ObjectIdentifier: URL] = [:]
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
        // At document start, before the workspace mounts. Subframes never receive the bridge marker.
        let js = "if(location.origin==='https://gdggt.dev'){Object.defineProperty(window,'gdgScanner',{value:Object.freeze({version:1,wallet:\(walletEnabled)}),writable:false});}"
        config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.95, alpha: 1)
        view.load(URLRequest(url: ScannerPolicy.startURL))
        return view
    }()
    func reload() {
        cancel()
        error = nil
        loading = true
        webView.load(URLRequest(url: ScannerPolicy.startURL))
    }
    func cancel() {
        confirmation?.dismiss(animated: false)
        confirmation = nil
        nfc?.cancel()
        nfc = nil
        if pendingID != nil { finish(error: "Scanning cancelled.") }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, ScannerPolicy.workspace(message.frameInfo.request.url),
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
        guard navigationAction.targetFrame?.isMainFrame != false, ScannerPolicy.trusted(url) else { decisionHandler(.cancel); return }
        if !ScannerPolicy.workspace(url) { cancel() }
        decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard ScannerPolicy.trusted(navigationResponse.response.url) else { decisionHandler(.cancel); return }
        decisionHandler(navigationResponse.response.mimeType == "application/vnd.apple.pkpass" ? .download : .allow)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard ScannerPolicy.trusted(response.url), response.mimeType == "application/vnd.apple.pkpass" else { completionHandler(nil); return }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pkpass")
        downloads[ObjectIdentifier(download)] = destination
        completionHandler(destination)
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads[ObjectIdentifier(download)], let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 2_000_000 else { cleanup(download); return }
        downloads.removeValue(forKey: ObjectIdentifier(download))
        // The officer chooses a delivery destination. No pass is sent automatically.
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.completionWithItemsHandler = { _,_,_,_ in try? FileManager.default.removeItem(at: file) }
        guard let presenter = webView.window?.rootViewController else { try? FileManager.default.removeItem(at: file); return }
        presenter.present(share, animated: true)
    }
    private func cleanup(_ download: WKDownload) {
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

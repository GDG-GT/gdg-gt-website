import Foundation
import CoreNFC

/// One-shot hardware operation. No keys, members, points or scanned history live here.
final class CardSession: NSObject, NFCNDEFReaderSessionDelegate {
    private let action: String
    private let url: String?
    private var completion: ((String?, String?) -> Void)?
    private var ndef: NFCNDEFReaderSession?
    private var vas: NFCVASReaderSession?
    private lazy var vasDelegate = WalletSessionDelegate(owner: self)
    private var processing = false
    init(action: String, url: String?, completion: @escaping (String?, String?) -> Void) {
        self.action = action; self.url = url; self.completion = completion
    }
    func start() {
        guard NFCNDEFReaderSession.readingAvailable else { done(error: "NFC needs a supported physical iPhone. It is unavailable in Simulator."); return }
        if action == "readWallet" {
            #if WALLET_VAS
            let command = NFCVASCommandConfiguration(vasMode: .normal, passTypeIdentifier: ScannerPolicy.passTypeIdentifier, url: nil)
            vas = NFCVASReaderSession(vasCommandConfigurations: [command], delegate: vasDelegate, queue: .main)
            vas?.alertMessage = "Hold the GDG Wallet pass near the top of this iPhone."
            vas?.begin()
            #else
            done(error: "This build does not have Apple Wallet reader approval.")
            #endif
        } else {
            ndef = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: false)
            ndef?.alertMessage = action == "writeCard" ? "Hold a blank member card near the top of this iPhone." : "Hold the GDG member card near the top of this iPhone."
            ndef?.begin()
        }
    }
    func cancel() { done(error: "Scanning cancelled.") }
    private func done(value: String? = nil, error: String? = nil) {
        guard let callback = completion else { return }
        completion = nil
        if let error { ndef?.invalidate(errorMessage: error); vas?.invalidate(errorMessage: error) }
        else { ndef?.alertMessage = action == "writeCard" ? "Card written and verified." : "Member credential read."; ndef?.invalidate(); vas?.invalidate() }
        ndef = nil; vas = nil
        callback(value, error)
    }
    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        guard session === ndef else { return }
        done(error: "NFC stopped. Hold the card still and try again. Check NFC permission if it keeps failing.")
    }
    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}
    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard session === ndef, completion != nil, !processing else { return }
        guard tags.count == 1, let tag = tags.first else {
            session.alertMessage = "Present one card at a time."; session.restartPolling(); return
        }
        processing = true
        session.connect(to: tag) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil else { self.done(error: "Could not connect to the card. Try again."); return }
                self.read(tag, session: session)
            }
        }
    }
    private func read(_ tag: NFCNDEFTag, session: NFCNDEFReaderSession) {
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil, status != .notSupported else { self.done(error: "Use an NDEF-formatted NFC card, such as NTAG213 or NTAG215."); return }
                if self.action == "writeCard" && status != .readWrite { self.done(error: "This card is read-only. Use a blank rewritable card."); return }
                tag.readNDEF { [weak self] message, error in
                    DispatchQueue.main.async {
                        guard let self, self.ndef === session, self.completion != nil else { return }
                        // Core NFC reports an empty NDEF tag with this specific error.
                        // Transport/permission/connection errors must never be treated as blank.
                        let emptyTag = (error as? NFCReaderError)?.code == .ndefReaderSessionErrorZeroLengthMessage && message == nil
                        guard error == nil || (self.action == "writeCard" && emptyTag) else { self.done(error: "Could not read the card. Nothing was written."); return }
                        if self.action == "writeCard" { self.write(tag, existing: message, capacity: capacity, session: session) }
                        else {
                            let values = message?.records.compactMap { $0.wellKnownTypeURIPayload()?.absoluteString } ?? []
                            guard values.count == 1, let value = values.first, ScannerPolicy.credential(value) != nil else { self.done(error: "This is not a GDG member card."); return }
                            self.done(value: value)
                        }
                    }
                }
            }
        }
    }
    private func write(_ tag: NFCNDEFTag, existing: NFCNDEFMessage?, capacity: Int, session: NFCNDEFReaderSession) {
        guard existing == nil || existing!.records.isEmpty || existing!.records.allSatisfy({ $0.typeNameFormat == .empty }) else { done(error: "This card already contains data. Use a blank card; nothing was overwritten."); return }
        guard let raw = url, let url = ScannerPolicy.writableURL(raw), let payload = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else { done(error: "Invalid member card URL."); return }
        let message = NFCNDEFMessage(records: [payload])
        guard message.length <= capacity else { done(error: "This card does not have enough space. Use NTAG213 or NTAG215."); return }
        tag.writeNDEF(message) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil else { self.done(error: "Write failed. Keep this card aside and scan it before trying again."); return }
                tag.readNDEF { [weak self] result, error in
                    DispatchQueue.main.async {
                        guard let self, self.ndef === session, self.completion != nil else { return }
                        guard error == nil, result?.records.count == 1, result?.records.first?.wellKnownTypeURIPayload()?.absoluteString == raw else { self.done(error: "The write could not be verified. Keep this card aside and scan it before use."); return }
                        self.done(value: raw)
                    }
                }
            }
        }
    }
    fileprivate func walletInvalidated(_ session: NFCVASReaderSession, error: Error) {
        guard session === vas else { return }
        done(error: "Wallet NFC stopped. Check reader approval, the NFC pass and phone position, then try again.")
    }
    fileprivate func walletReceived(_ session: NFCVASReaderSession, responses: [NFCVASResponse]) {
        guard session === vas, completion != nil else { return }
        guard responses.count == 1, let response = responses.first, response.status.rawValue == 0x9000,
              (56...120).contains(response.vasData.count) else { done(error: "No compatible GDG Wallet NFC pass was read."); return }
        done(value: response.vasData.base64EncodedString())
    }
}

private final class WalletSessionDelegate: NSObject, NFCVASReaderSessionDelegate {
    weak var owner: CardSession?
    init(owner: CardSession) { self.owner = owner }
    func readerSession(_ session: NFCVASReaderSession, didInvalidateWithError error: Error) { owner?.walletInvalidated(session, error: error) }
    func readerSession(_ session: NFCVASReaderSession, didReceive responses: [NFCVASResponse]) { owner?.walletReceived(session, responses: responses) }
}

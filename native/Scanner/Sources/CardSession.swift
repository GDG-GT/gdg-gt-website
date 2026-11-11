import Foundation
import CoreNFC
import CryptoKit

/// UID binding detects ordinary copied tags; it is not cryptographic card authentication.
final class CardSession: NSObject, NFCTagReaderSessionDelegate {
    private let action: String
    private let url: String?
    private let expectedUidHash: String?
    private var completion: ((String?, String?) -> Void)?
    private var ndef: NFCTagReaderSession?
    private var vas: NFCVASReaderSession?
    private lazy var vasDelegate = WalletSessionDelegate(owner: self)
    private var processing = false
    private var uid = ""
    init(action: String, url: String?, uidHash: String? = nil, completion: @escaping (String?, String?) -> Void) {
        self.action = action; self.url = url; self.expectedUidHash = uidHash; self.completion = completion
    }
    func start() {
        guard NFCTagReaderSession.readingAvailable else { done(error: "NFC needs a supported physical iPhone."); return }
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
            ndef = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main)
            ndef?.alertMessage = action == "writeCard" ? "Hold the member card near the top of this iPhone." : "Hold the GDG member card near the top of this iPhone."
            ndef?.begin()
        }
    }
    func cancel() { done(error: "Scanning cancelled.") }
    private func done(value: String? = nil, error: String? = nil) {
        guard let callback = completion else { return }
        completion = nil
        if let error { ndef?.invalidate(errorMessage: error); vas?.invalidate(errorMessage: error) }
        else { ndef?.alertMessage = action == "writeCard" ? "Card written and read back. Registering with the chapter…" : "Member card read."; ndef?.invalidate(); vas?.invalidate() }
        ndef = nil; vas = nil; callback(value, error)
    }
    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}
    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        guard session === ndef else { return }
        done(error: "NFC stopped. Hold the card still and try again.")
    }
    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard session === ndef, completion != nil, !processing else { return }
        guard tags.count == 1, let detected = tags.first else { session.alertMessage = "Present one card at a time."; session.restartPolling(); return }
        guard case let .miFare(card) = detected, card.mifareFamily == .ultralight, card.identifier.count == 7 else { done(error: "Use an NTAG213, NTAG215 or NTAG216 card with a seven-byte chip ID."); return }
        uid = card.identifier.map { String(format: "%02x", $0) }.joined()
        if let expected = expectedUidHash {
            let actual = SHA256.hash(data: Data(uid.utf8)).map { String(format: "%02x", $0) }.joined()
            guard expected == actual else { done(error: "This credential is registered to a different physical card. Nothing was written."); return }
        }
        processing = true
        session.connect(to: detected) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil else { self.done(error: "Could not connect to the card. Try again."); return }
                self.read(card, session: session)
            }
        }
    }
    private func cardToken(_ message: NFCNDEFMessage?) -> String? {
        guard let records = message?.records else { return nil }
        if records.count == 2, records[0].wellKnownTypeURIPayload()?.absoluteString == ScannerPolicy.cardDestination,
           records[1].typeNameFormat == .media, String(data: records[1].type, encoding: .utf8) == ScannerPolicy.cardMediaType,
           let token = String(data: records[1].payload, encoding: .utf8), token.utf8.count == 43 {
            return ScannerPolicy.credential(token)
        }
        if records.count == 1, let legacy = records[0].wellKnownTypeURIPayload()?.absoluteString { return ScannerPolicy.credential(legacy) }
        return nil
    }
    private func result(_ token: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["v": 2, "credential": token, "uid": uid], options: [.sortedKeys]), let value = String(data: data, encoding: .utf8) else { done(error: "Card data could not be prepared."); return }
        done(value: value)
    }
    private func read(_ tag: NFCMiFareTag, session: NFCTagReaderSession) {
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil, status != .notSupported else { self.done(error: "Use an NDEF-formatted NTAG card."); return }
                tag.readNDEF { [weak self] message, error in
                    DispatchQueue.main.async {
                        guard let self, self.ndef === session, self.completion != nil else { return }
                        let empty = (error as? NFCReaderError)?.code == .ndefReaderSessionErrorZeroLengthMessage && message == nil
                        guard error == nil || (self.action == "writeCard" && empty) else { self.done(error: "Could not read the card. Nothing was written."); return }
                        if self.action == "writeCard" { self.write(tag, existing: message, status: status, capacity: capacity, session: session) }
                        else if let token = self.cardToken(message) { self.result(token) }
                        else { self.done(error: "This is not a GDG member card.") }
                    }
                }
            }
        }
    }
    private func write(_ tag: NFCMiFareTag, existing: NFCNDEFMessage?, status: NFCNDEFStatus, capacity: Int, session: NFCTagReaderSession) {
        guard let raw = url, let token = ScannerPolicy.credential(raw), ScannerPolicy.writableURL(raw) != nil,
              let destination = URL(string: ScannerPolicy.cardDestination), let link = NFCNDEFPayload.wellKnownTypeURIPayload(url: destination) else { done(error: "Invalid member card credential."); return }
        let same = cardToken(existing) == token
        if same && existing?.records.count == 2 { result(token); return }
        let blank = existing == nil || existing!.records.isEmpty || existing!.records.allSatisfy { $0.typeNameFormat == .empty }
        guard blank || same else { done(error: "This card contains different data. Erase your test card first or use a blank one."); return }
        guard status == .readWrite else { done(error: "This card is read-only or protected. Use another test card; its protection was not changed."); return }
        let record = NFCNDEFPayload(format: .media, type: Data(ScannerPolicy.cardMediaType.utf8), identifier: Data(), payload: Data(token.utf8))
        let message = NFCNDEFMessage(records: [link, record])
        guard message.length <= capacity else { done(error: "This card has insufficient space for the member records."); return }
        tag.writeNDEF(message) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.ndef === session, self.completion != nil else { return }
                guard error == nil else { self.done(error: "Write failed. Scan this card before retrying."); return }
                tag.readNDEF { [weak self] result, error in
                    DispatchQueue.main.async {
                        guard let self, self.ndef === session, self.completion != nil else { return }
                        guard error == nil, result?.records.count == 2, self.cardToken(result) == token else { self.done(error: "Read-back failed. Registration was not confirmed; retry with this same card."); return }
                        self.result(token)
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

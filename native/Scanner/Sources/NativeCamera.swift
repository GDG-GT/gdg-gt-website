import AVFoundation
import SwiftUI

struct NativeQRCamera: UIViewRepresentable {
  let enabled: Bool
  let onRead: (String, CGRect) -> Void
  func makeUIView(context: Context) -> NativeCameraView {
    let view = NativeCameraView()
    view.onRead = onRead
    view.begin()
    return view
  }
  func updateUIView(_ view: NativeCameraView, context: Context) {
    view.onRead = onRead
    view.accepting = enabled
    if enabled { view.resetFocus() }
  }
  static func dismantleUIView(_ view: NativeCameraView, coordinator: ()) { view.stop() }
}
final class NativeCameraView: UIView, AVCaptureMetadataOutputObjectsDelegate {
  let capture = AVCaptureSession()
  private lazy var preview = AVCaptureVideoPreviewLayer(session: capture)
  private let cameraQueue = DispatchQueue(label: "dev.gdggt.camera")
  private let dim = CAShapeLayer(), outline = CAShapeLayer(), message = UILabel()
  var onRead: ((String, CGRect) -> Void)?
  var accepting = true
  private var detected = false
  private var stopped = false
  private let lifecycle = NSLock()
  private var isStopped: Bool {
    lifecycle.lock()
    defer { lifecycle.unlock() }
    return stopped
  }
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    dim.fillRule = .evenOdd
    dim.fillColor = UIColor.black.withAlphaComponent(0.6).cgColor
    dim.opacity = 0
    layer.addSublayer(dim)
    outline.fillColor = UIColor.clear.cgColor
    outline.strokeColor = UIColor.systemGreen.cgColor
    outline.lineWidth = 3
    outline.opacity = 0
    layer.addSublayer(outline)
    message.textColor = .white
    message.numberOfLines = 0
    message.textAlignment = .center
    message.font = .preferredFont(forTextStyle: .subheadline)
    addSubview(message)
    isAccessibilityElement = true
    accessibilityLabel = "Wallet QR camera. Hold the code inside the camera view."
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
    dim.frame = bounds
    outline.frame = bounds
    message.frame = bounds.insetBy(dx: 24, dy: 24)
  }
  func begin() {
    AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
      guard let self, !self.isStopped else { return }
      guard allowed else {
        DispatchQueue.main.async {
          self.message.text = "Allow camera access in iPhone Settings to scan Wallet QR."
        }
        return
      }
      self.cameraQueue.async {
        guard !self.isStopped else { return }
        guard let camera = AVCaptureDevice.default(for: .video),
          let input = try? AVCaptureDeviceInput(device: camera), self.capture.canAddInput(input)
        else {
          DispatchQueue.main.async { self.message.text = "Camera unavailable on this device." }
          return
        }
        self.capture.beginConfiguration()
        self.capture.sessionPreset = .high
        self.capture.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard self.capture.canAddOutput(output) else {
          self.capture.commitConfiguration()
          return
        }
        self.capture.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        self.capture.commitConfiguration()
        self.capture.startRunning()
      }
    }
  }
  func stop() {
    lifecycle.lock()
    stopped = true
    lifecycle.unlock()
    accepting = false
    onRead = nil
    cameraQueue.async { [capture] in capture.stopRunning() }
  }
  func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard !isStopped, accepting, !detected,
      let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
      let raw = object.stringValue, let transformed = preview.transformedMetadataObject(for: object)
    else { return }
    detected = true
    let rect = transformed.bounds.insetBy(dx: -8, dy: -8)
    let mask = UIBezierPath(rect: bounds)
    mask.append(UIBezierPath(roundedRect: rect, cornerRadius: 12))
    dim.path = mask.cgPath
    outline.path = UIBezierPath(roundedRect: rect, cornerRadius: 12).cgPath
    CATransaction.begin()
    CATransaction.setAnimationDuration(UIAccessibility.isReduceMotionEnabled ? 0 : 0.2)
    if !UIAccessibility.isReduceMotionEnabled {
      let zoom = CABasicAnimation(keyPath: "transform.scale")
      zoom.fromValue = 1
      zoom.toValue = 1.04
      zoom.duration = 0.2
      zoom.autoreverses = true
      preview.add(zoom, forKey: "qr-focus")
    }
    dim.opacity = 1
    outline.opacity = 1
    CATransaction.commit()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
      guard let self, self.accepting else { return }
      self.onRead?(raw, rect)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
      if self?.accepting == true { self?.resetFocus() }
    }
  }
  func resetFocus() {
    guard accepting else { return }
    detected = false
    dim.opacity = 0
    outline.opacity = 0
  }
}

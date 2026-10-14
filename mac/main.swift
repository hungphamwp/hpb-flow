// Vỏ app macOS cho HPB Flow: bật server Node đi kèm trong app rồi hiện giao diện trong cửa sổ WebKit riêng.
// Linh vật Bông:
//  - Cửa sổ nổi trong suốt (desk.html) luôn nằm trên mọi app, mọi màn hình; chỗ trống bấm xuyên qua; kéo được; có thể đi theo chuột.
//  - Nghe rảnh tay: nhận dạng tiếng Việt ngay trên máy (Speech, on-device), gọi "Bông ơi…" là nghe lệnh, trả lời xong thì nghe tiếp vài giây
//    không cần gọi lại; tạm ngừng nghe khi Bông đang nói. Phím tắt toàn hệ thống ⌥⌘B.
//  Giao diện gửi lệnh qua window.webkit.messageHandlers.bong, nhận sự kiện qua window.hpbVoice.on(ev, text).
import Cocoa
import WebKit
import Speech
import AVFoundation
import Carbon

let PORT = 4719
let BASE = URL(string: "http://127.0.0.1:\(PORT)/")!

// mẫu nhận tiếng gọi tên (chạy trên chữ đã bỏ dấu): "bông/bong/băng/bang (ơi)", có thể có "ê/hey/hello/alo" phía trước;
// "vâng" chỉ tính khi đứng sau "hello/hey/alo" (Soniox hay nghe "Hello Bông" thành "Hello vâng / Hello băng")
let WAKE_RE = #"(^|[\s,.!?])(((e|hey|hello|helo|alo|oi)[\s,]+)?(bong|bang)|(hey|hello|helo|alo)[\s,]+vang)([\s,]+(oi|a|ah))?(?=[\s,.!?]|$)"#
let WAKE_HEAD_RE = #"^[\s,.!?]*(((e|hey|hello|helo|alo|oi)[\s,]+)?(bong|bang)|(hey|hello|helo|alo)[\s,]+vang)([\s,]+(oi|a|ah))?[\s,.!?]*"#
// bỏ dấu, viết thường: để bắt "Bông ơi" dù máy nghe ra "bong oi", "Bông Ơi"
func plain(_ s: String) -> String {
  s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi_VN")).replacingOccurrences(of: "đ", with: "d")
}

// Soniox: nhận dạng tiếng Việt thời gian thực trên mạng, chính xác hơn nhiều so với Apple. Khoá do người dùng dán ở trang Quản lý Bông
// (lưu ở ~/Library/Application Support/HPBFlow/soniox.key). Dùng cho phần câu lệnh; phần chờ gọi tên "Bông ơi" vẫn nghe ngay trên máy.
final class Soniox: NSObject, URLSessionWebSocketDelegate {
  var ws: URLSessionWebSocketTask?
  var finalText = "", live = ""
  var onText: ((String) -> Void)?
  var onEnd: (() -> Void)?
  var onFail: (() -> Void)?
  var onLog: ((String) -> Void)?
  var onIdle: (() -> Void)?
  var open = false, pending: [Data] = []
  var lastMsg = Date(), sendFailed = false   // để Voice phát hiện kết nối đứt/treo mà không có báo lỗi
  var rate = 16000   // gửi đúng tần số gốc của micrô như Tocky Voice, không hạ xuống 16 kHz
  static func key() -> String? {
    let f = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/HPBFlow/soniox.key")
    guard let k = try? String(contentsOf: f, encoding: .utf8) else { return nil }
    let t = k.trimmingCharacters(in: .whitespacesAndNewlines); return t.isEmpty ? nil : t
  }
  func start(key: String, preroll: Data) {
    finalText = ""; live = ""; open = false; pending = [preroll]; lastMsg = Date(); sendFailed = false
    let s = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
    ws = s.webSocketTask(with: URL(string: "wss://stt-rt.soniox.com/transcribe-websocket")!)
    ws?.resume()
    let cfg: [String: Any] = ["api_key": key, "model": "stt-rt-preview", "audio_format": "pcm_s16le", "sample_rate": rate, "num_channels": 1,
                              "language_hints": ["vi", "en"], "enable_endpoint_detection": true]
    // như Tocky Voice: không gửi "context" — danh sách từ gợi ý làm Soniox đoán bừa ("Hello Bông" → "Hi").
    // KHÔNG bật enable_language_identification: bật vào thì câu nói nhanh bị ra chữ Thái ("แป๊บหนึ่งครับ")
    let w = ws
    if let d = try? JSONSerialization.data(withJSONObject: cfg), let t = String(data: d, encoding: .utf8) {
      w?.send(.string(t)) { [weak self] e in DispatchQueue.main.async {
        guard let self = self, self.ws === w else { return }   // phiên cũ đã bị thay thì bỏ qua
        if e != nil { self.onFail?(); return }
        self.open = true; for p in self.pending where !p.isEmpty { w?.send(.data(p)) { _ in } }; self.pending = []
      } }
    }
    receive(w)
  }
  func send(_ d: Data) {
    guard open else { if pending.count < 400 { pending.append(d) }; return }   // chưa mở xong: giữ tạm, có giới hạn để khỏi phình bộ nhớ
    let w = ws
    w?.send(.data(d)) { [weak self] e in
      guard e != nil else { return }
      DispatchQueue.main.async { guard let self = self, self.ws === w, !self.sendFailed else { return }; self.sendFailed = true; self.onLog?("sonioxSend=\((e! as NSError).code)") }
    }
  }
  // mỗi phiên WebSocket nghe riêng; tin của phiên cũ (đang đóng, hay báo "No audio received") không được làm hỏng phiên mới
  func receive(_ w: URLSessionWebSocketTask?) {
    w?.receive { [weak self] r in DispatchQueue.main.async {
      guard let self = self, self.ws === w, w != nil else { return }
      self.lastMsg = Date()
      switch r {
      case .failure(let e): self.onLog?("sonioxWS=\((e as NSError).code)"); self.onFail?()
      case .success(let m):
        var txt: String? = nil
        if case .string(let t) = m { txt = t } else if case .data(let d) = m { txt = String(data: d, encoding: .utf8) }
        if let t = txt, let j = (try? JSONSerialization.jsonObject(with: Data(t.utf8))) as? [String: Any] {
          if let c = j["error_code"] {
            let msg = "\(j["error_message"] ?? "")"; self.onLog?("sonioxErr=\(c) \(msg)")
            if msg.contains("No audio") { self.onIdle?(); return }   // phiên không nhận được âm thanh: mở phiên mới, không phải lỗi khoá/mạng
            self.onFail?(); return
          }
          var nonfinal = "", ended = false
          for tok in (j["tokens"] as? [[String: Any]]) ?? [] {
            let s = tok["text"] as? String ?? ""
            if s == "<end>" { ended = true; continue }
            if (tok["is_final"] as? Bool) == true { self.finalText += s } else { nonfinal += s }
          }
          self.live = self.finalText + nonfinal
          self.onText?(self.live)
          if ended { self.onEnd?() }
          if (j["finished"] as? Bool) == true { return }
        }
        self.receive(w)
      }
    } }
  }
  func stop() { let w = ws; ws = nil; open = false; w?.send(.string("")) { _ in }; DispatchQueue.main.asyncAfter(deadline: .now() + 1) { w?.cancel(with: .normalClosure, reason: nil) } }
}

final class Voice: NSObject, AVSpeechSynthesizerDelegate {
  weak var web: WKWebView?
  let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "vi-VN"))
  let engine = AVAudioEngine()
  var request: SFSpeechAudioBufferRecognitionRequest?
  var task: SFSpeechRecognitionTask?
  var silence: Timer?, rotate: Timer?
  var lastLevel = Date.distantPast
  let synth = AVSpeechSynthesizer()
  // chế độ: idle (không nghe) · wake (nghe chờ "Bông ơi") · command (đang nghe lệnh) · follow (vừa trả lời xong, nghe tiếp không cần gọi)
  enum Mode { case idle, wake, command, follow }
  var mode = Mode.idle { didSet { if mode != oldValue { report() } } }
  // báo trạng thái nghe cho giao diện (chấm micro trên mèo + nhật ký chẩn đoán)
  func report(_ note: String = "") {
    DispatchQueue.main.async {
      self.emit("state", "\(self.mode) eng=\(self.engine.isRunning) sx=\(self.sxOn) apple=\(self.request != nil) speak=\(self.speaking) vpio=\(self.vpioOK) auth=\(self.authorized) wake=\(self.wakeOn)\(note.isEmpty ? "" : " " + note)")
    }
  }
  var wakeOn = false          // bật "luôn nghe"
  var speaking = false        // Bông đang nói → tạm ngừng nghe
  var cmdStart: String.Index? // vị trí bắt đầu câu lệnh trong bản nghe của phiên Apple hiện tại
  var cmdText = ""
  var authorized = false
  var useSoniox = true        // có khoá Soniox thì dùng cho phần câu lệnh
  let sx = Soniox()
  var sxOn = false
  // âm thanh 16 kHz mono s16le: vòng đệm 2 giây gần nhất để gửi kèm khi vừa nghe thấy tên
  var converter: AVAudioConverter?
  var pcmFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  func bytes(_ sec: Double) -> Int { Int(pcmFmt.sampleRate * 2 * sec) }   // số byte của sec giây âm thanh đã chuyển
  var ring = Data()
  // phát giọng Bông ngay trong engine có khử tiếng vọng (voice processing), để micro vẫn mở trong lúc Bông nói → anh nói chen là Bông dừng
  let player = AVAudioPlayerNode()
  var playSeq = 0, nextIn = 0, nextOut = 0, slots: [Int: URL] = [:], playing = false, playOpen = false, playFollow = true
  var barge = false           // đang nghe trong lúc Bông nói (chỉ báo "heard", giao diện quyết định có phải anh nói không)
  var lastAmp = Date.distantPast
  override init() {
    super.init(); synth.delegate = self
    sx.onText = { [weak self] t in self?.onSoniox(t) }
    sx.onEnd = { [weak self] in self?.sonioxEnd() }
    sx.onFail = { [weak self] in self?.sonioxFail() }
    sx.onLog = { [weak self] s in self?.report(s) }
    sx.onIdle = { [weak self] in self?.reopenSoniox() }
    // bộ âm thanh đổi cấu hình (đổi thiết bị, máy ngủ/thức) → engine tự dừng; bỏ qua thông báo do chính mình bật engine/khử vọng gây ra
    NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      guard let self = self, Date().timeIntervalSince(self.engineStartedAt) > 2 else { return }
      self.recoverAudio("config")
    }
    NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self?.recoverAudio("wake") }
    }   // phiên Soniox hết hạn vì không có âm thanh
    // canh kết nối Soniox: đang nghe mà 15 giây không nhận được tin nào (Soniox trả lời liên tục khi có âm thanh),
    // hoặc gửi âm thanh bị lỗi → kết nối đã đứt/treo dù không có báo lỗi: mở phiên mới
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
      guard let self = self, self.sxOn, !self.speaking else { return }
      let quiet = Date().timeIntervalSince(self.sx.lastMsg)
      if self.sx.sendFailed || quiet > 15 { self.report("sonioxStall=\(Int(quiet))s"); self.reopenSoniox() }
    }
  }
  // mở lại phiên Soniox đúng với chế độ đang nghe
  func reopenSoniox() {
    guard sxOn else { return }
    if mode == .wake { session() }
    else if mode == .command || mode == .follow { if cmdText.isEmpty { sxOn = false; sx.stop(); beginCommand(preroll: Data()) } else { finish() } }
  }
  var soniox: String? { useSoniox ? Soniox.key() : nil }

  func emit(_ ev: String, _ text: String = "") {
    let arg = (try? JSONSerialization.data(withJSONObject: [text])).flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
    DispatchQueue.main.async { self.web?.evaluateJavaScript("window.hpbVoice&&hpbVoice.on('\(ev)',\(arg)[0])", completionHandler: nil) }
  }
  func authorize(_ then: @escaping () -> Void) {
    if authorized { then(); return }
    SFSpeechRecognizer.requestAuthorization { st in
      guard st == .authorized else { self.emit("error", "Chưa cho phép nhận dạng giọng nói: Cài đặt hệ thống › Quyền riêng tư & Bảo mật › Nhận dạng giọng nói › bật HPB Flow"); return }
      AVCaptureDevice.requestAccess(for: .audio) { ok in
        guard ok else { self.emit("error", "Chưa cho phép micro: Cài đặt hệ thống › Quyền riêng tư & Bảo mật › Micrô › bật HPB Flow"); return }
        DispatchQueue.main.async { self.authorized = true; then() }
      }
    }
  }
  // bật/tắt luôn nghe
  func setWake(_ on: Bool) {
    wakeOn = on
    if on { authorize { if self.mode == .idle && !self.speaking { self.mode = .wake; self.session() } } }
    else if mode == .wake || mode == .follow { stopAll(); mode = .idle; emit("idle") }
  }
  // nghe lệnh ngay (⌥⌘B, nút mic)
  func listen() {
    synth.stopSpeaking(at: .immediate); speaking = false
    authorize { self.ensureEngine(); self.mode = .command; self.emit("start"); self.beginCommand(preroll: Data()); self.arm(8) }
  }

  // micro chạy liên tục khi đang nghe; mỗi khung âm thanh: đưa cho Apple (khi đang chờ tên) + đổi sang 16 kHz cho vòng đệm / Soniox
  var vpioOK = true   // máy nào bật khử tiếng vọng mà micro không mở được thì tắt hẳn chế độ này cho phiên chạy
  var engineStartedAt = Date.distantPast, recoveredAt = Date.distantPast
  // macOS dừng bộ âm thanh khi máy ngủ/thức, đổi tai nghe/loa: dựng lại theo định dạng mới rồi nghe lại như cũ
  func recoverAudio(_ why: String) {
    if Date().timeIntervalSince(recoveredAt) < 1.5 { return }   // gộp các thông báo dồn dập
    recoveredAt = Date(); report("audioReset=\(why)")
    if playing || speaking { stopPlay(); emit("spoken"); speaking = false }
    barge = false; silence?.invalidate()
    if sxOn { sxOn = false; sx.stop() }; stopApple()
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0); ring = Data()
    mode = wakeOn ? .wake : .idle; cmdText = ""
    guard wakeOn else { return }
    ensureEngine(); session()
  }
  func ensureEngine() {
    if engine.isRunning { return }
    engineStartedAt = Date()
    let input = engine.inputNode
    // khử tiếng vọng: micro không thu lại giọng Bông đang phát qua engine này; không làm nhỏ tiếng app khác
    if vpioOK {
      do { try input.setVoiceProcessingEnabled(true) } catch { vpioOK = false }
      if vpioOK, #available(macOS 14, *) { input.voiceProcessingOtherAudioDuckingConfiguration = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(enableAdvancedDucking: false, duckingLevel: .min) }
    }
    if !engine.attachedNodes.contains(player) {
      engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: nil)
      player.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buf, _ in   // âm lượng giọng đang phát → mèo nhún theo
        guard let self = self, let ch = buf.floatChannelData?[0], Date().timeIntervalSince(self.lastAmp) > 0.05 else { return }
        self.lastAmp = Date(); let n = Int(buf.frameLength); var s: Float = 0
        for i in stride(from: 0, to: n, by: 4) { s += ch[i] * ch[i] }
        self.emit("amp", String(format: "%.3f", sqrt(s / Float(max(1, n / 4)))))
      }
    }
    installMicTap()
    engine.prepare()
    do { try engine.start() } catch {
      // khử tiếng vọng làm hỏng micro trên máy này → tắt nó, cài lại tap theo định dạng mới, thử lần nữa
      if input.isVoiceProcessingEnabled {
        vpioOK = false; engine.stop(); try? input.setVoiceProcessingEnabled(false)
        installMicTap(); engine.prepare()
        do { try engine.start(); emit("note", "Máy này không bật được khử tiếng vọng, em vẫn nghe bình thường nhưng anh nên nói chen khi loa nhỏ") ; return } catch { }
      }
      emit("error", "Không mở được micro (\((error as NSError).code)). Kiểm tra Cài đặt hệ thống › Quyền riêng tư & Bảo mật › Micrô › HPB Flow")
    }
  }
  func installMicTap() {
    let input = engine.inputNode
    let inFmt = input.outputFormat(forBus: 0)
    pcmFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: inFmt.sampleRate, channels: 1, interleaved: true)!
    sx.rate = Int(inFmt.sampleRate)
    converter = AVAudioConverter(from: inFmt, to: pcmFmt)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 2048, format: inFmt) { [weak self] buf, _ in
      guard let self = self else { return }
      self.request?.append(buf)
      if let d = self.to16k(buf) {
        DispatchQueue.main.async {
          self.ring.append(d); let mx = self.bytes(2); if self.ring.count > mx { self.ring.removeFirst(self.ring.count - mx) }
          if self.sxOn { self.sx.send(d) }
        }
      }
      if self.mode == .command || self.mode == .follow, let ch = buf.floatChannelData?[0], Date().timeIntervalSince(self.lastLevel) > 0.08 {
        self.lastLevel = Date(); let n = Int(buf.frameLength); var s: Float = 0
        for i in stride(from: 0, to: n, by: 4) { s += ch[i] * ch[i] }
        self.emit("level", String(format: "%.3f", sqrt(s / Float(max(1, n / 4)))))
      }
    }
  }
  func to16k(_ buf: AVAudioPCMBuffer) -> Data? {
    guard let conv = converter else { return nil }
    let cap = AVAudioFrameCount(Double(buf.frameLength) * pcmFmt.sampleRate / buf.format.sampleRate) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: pcmFmt, frameCapacity: cap) else { return nil }
    var used = false, err: NSError?
    conv.convert(to: out, error: &err) { _, st in if used { st.pointee = .noDataNow; return nil }; used = true; st.pointee = .haveData; return buf }
    guard err == nil, out.frameLength > 0, let p = out.int16ChannelData?[0] else { return nil }
    return Data(bytes: p, count: Int(out.frameLength) * 2)
  }

  // nghe bằng Apple (trên máy): chờ gọi tên, hoặc ghi lệnh khi không có Soniox. Apple giới hạn ~1 phút mỗi phiên nên cứ 50 giây đổi phiên
  var wakeAny = true   // cài đặt wakeMode = "any": nói câu gì cũng là lệnh, không cần gọi "Bông ơi"
  var wakeSoniox = false   // cài đặt wakeEngine = "soniox": chờ "Bông ơi" bằng Soniox (chính xác hơn Apple nhiều với tiếng Việt, tính phí theo thời gian nghe)
  var lastHear = ""
  func session() {
    stopApple()
    if mode == .wake, wakeSoniox, let k = soniox {   // chờ tên bằng Soniox: một phiên nghe liên tục, 4 phút làm mới để bản nghe không dài mãi
      if sxOn { sx.stop() }
      ensureEngine(); sxOn = true; cmdText = ""; sx.start(key: k, preroll: Data())
      rotate?.invalidate(); rotate = Timer.scheduledTimer(withTimeInterval: 240, repeats: false) { [weak self] _ in
        guard let self = self, self.mode == .wake else { return }; self.session()
      }
      return
    }
    guard let r = recognizer, r.isAvailable else { report("appleKhongSanSang"); return }
    ensureEngine()
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.shouldReportPartialResults = true
    if r.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
    if #available(macOS 13, *) { req.addsPunctuation = true }
    request = req; cmdStart = nil
    task = r.recognitionTask(with: req) { [weak self] res, err in
      DispatchQueue.main.async {
        guard let self = self, self.request === req else { return }
        if let res = res { self.onApple(res.bestTranscription.formattedString, final: res.isFinal) }
        if let e = err as NSError?, self.request === req { self.report("appleErr=\(e.domain)#\(e.code)"); self.restart() }
      }
    }
    rotate?.invalidate(); rotate = Timer.scheduledTimer(withTimeInterval: 50, repeats: false) { [weak self] _ in
      guard let self = self, self.mode == .wake else { return }; self.session()
    }
  }
  func onApple(_ t: String, final: Bool) {
    switch mode {
    case .wake:
      let p = plain(t)
      let tail = String(t.suffix(50)); if tail != lastHear { lastHear = tail; emit("hearW", tail) }   // nhật ký: Apple nghe ra chữ gì khi chờ tên
      if wakeAny {   // nghe mọi câu (khi đang dùng Apple dự phòng): có tiếng nói là thành câu lệnh
        let c = t.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        if !c.isEmpty { cmdStart = nil; mode = .command; emit("wake", "any"); cmdText = c; emit("partial", c); arm(1.4) }
        return
      }
      if let r = p.range(of: WAKE_RE, options: [.regularExpression, .backwards]) {
        let off = p.distance(from: p.startIndex, to: r.upperBound)
        cmdStart = t.index(t.startIndex, offsetBy: min(off, t.count))
        if speaking { speaking = false; barge = false; stopPlay(); synth.stopSpeaking(at: .immediate) }   // gọi tên lúc Bông đang nói = ngắt lời
        mode = .command; cmdText = ""; emit("wake"); arm(6)
        if soniox != nil { beginCommand(preroll: Data(ring.suffix(bytes(1.5)))) }   // gửi kèm 1,5 giây vừa thu: có "Bông ơi" + mấy chữ đầu của lệnh
        else {
          let rest = String(t[cmdStart!...]).trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
          if !rest.isEmpty { cmdText = rest; emit("partial", rest); arm(1.4) }
        }
      }
    case .command, .follow:
      if sxOn { return }
      let rest = cmdStart.map { String(t[min($0, t.endIndex)...]) } ?? t
      let c = rest.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
      if !c.isEmpty && c != cmdText {
        if mode == .follow { mode = .command; emit("start") }
        cmdText = c; emit("partial", c); arm(1.3)
      }
      if final && !cmdText.isEmpty { finish() }
    case .idle: break
    }
  }
  // ghi câu lệnh: Soniox nếu có khoá, không thì Apple
  func beginCommand(preroll: Data) {
    cmdText = ""
    if let k = soniox { stopApple(); sxStart = 0; sxOn = true; sx.start(key: k, preroll: preroll) }
    else if request == nil { session() }
  }
  // bỏ tiếng gọi tên ở đầu bản nghe của Soniox
  func stripWake(_ t: String) -> String {
    let p = plain(t)
    if let r = p.range(of: WAKE_HEAD_RE, options: .regularExpression) {
      let off = p.distance(from: p.startIndex, to: r.upperBound)
      return String(t.dropFirst(min(off, t.count)))
    }
    return t
  }
  var sxStart = 0   // vị trí bắt đầu câu lệnh trong bản nghe Soniox (khi gọi tên ngay trong phiên chờ tên)
  func onSoniox(_ t: String) {
    if mode == .wake && sxOn && wakeAny {   // nghe mọi câu: có tiếng nói là bắt đầu một câu lệnh (phiên Soniox này chỉ chứa câu đó)
      let c = t.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
      if !c.isEmpty { sxStart = 0; mode = .command; emit("wake", "any"); cmdText = c; emit("partial", c); arm(2.5) }
      return
    }
    if mode == .wake && sxOn {   // đang chờ "Bông ơi" bằng Soniox: thấy tên thì chuyển sang nghe lệnh ngay trong phiên này, không mất chữ nào
      let p = plain(t)
      if let r = p.range(of: WAKE_RE, options: [.regularExpression, .backwards]) {
        sxStart = p.distance(from: p.startIndex, to: r.upperBound)
        mode = .command; cmdText = ""; emit("wake"); arm(6)
        let rest = String(t.dropFirst(min(sxStart, t.count))).trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        if !rest.isEmpty { cmdText = rest; emit("partial", rest); arm(2.5) }
      } else { let tail = String(t.suffix(50)); if tail != lastHear { lastHear = tail; emit("hearW", tail) } }
      return
    }
    let c = (sxStart > 0 ? String(t.dropFirst(min(sxStart, t.count))) : stripWake(t)).trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
    if barge { if !c.isEmpty { emit("heard", c) }; return }   // Bông đang nói: chỉ báo nghe thấy gì
    guard sxOn, mode == .command || mode == .follow else { return }
    guard !c.isEmpty, c != cmdText else { return }
    if mode == .follow { mode = .command; emit("start") }
    cmdText = c; emit("partial", c); arm(2.5)   // Soniox tự báo hết câu (<end>); bộ đếm này chỉ để dự phòng
  }
  // Soniox báo ngắt (<end>) ở mỗi nhịp nghỉ ngắn. Tocky nghe trọn tới khi thả phím; ở đây chờ thêm một quãng im lặng
  // (câu càng ngắn chờ càng lâu, vì hay là mới nói được vài chữ đầu) rồi mới gửi, có chữ mới thì chờ tiếp
  func sonioxEnd() {
    if barge || mode == .wake { return }
    guard sxOn, !cmdText.isEmpty else { return }
    let words = cmdText.split(separator: " ").count
    arm(words <= 2 ? 1.6 : 0.9)
  }

  // ---------- phát giọng: giao diện gửi từng câu (URL /api/pet/tts…), tải song song nhưng phát đúng thứ tự
  func play(_ s: String) {
    guard let u = URL(string: s), u.host == "127.0.0.1" else { return }
    let seq = playSeq, idx = nextIn; nextIn += 1; playOpen = true
    URLSession.shared.downloadTask(with: u) { tmp, _, _ in
      var dst: URL? = nil
      if let tmp = tmp { let d = FileManager.default.temporaryDirectory.appendingPathComponent("bong-\(UUID().uuidString).mp3"); if (try? FileManager.default.moveItem(at: tmp, to: d)) != nil { dst = d } }
      DispatchQueue.main.async {
        guard seq == self.playSeq else { if let d = dst { try? FileManager.default.removeItem(at: d) }; return }
        self.slots[idx] = dst ?? URL(fileURLWithPath: "/dev/null"); self.pump()
      }
    }.resume()
  }
  // giao diện báo đã gửi hết câu của lượt này; phát xong thì coi như Bông nói xong
  func playEnd(follow: Bool) { playOpen = false; playFollow = follow; pump() }
  func pump() {
    if playing { return }
    guard let u = slots[nextOut] else {
      if !playOpen && nextOut >= nextIn && speaking { speaking = false; emit("spoken"); afterSpeech() }
      return
    }
    slots[nextOut] = nil; nextOut += 1
    guard let f = try? AVAudioFile(forReading: u) else { try? FileManager.default.removeItem(at: u); pump(); return }
    ensureEngine()
    engine.disconnectNodeOutput(player); engine.connect(player, to: engine.mainMixerNode, format: f.processingFormat)
    if !engine.isRunning { try? engine.start() }
    // bộ âm thanh chưa chạy (vd máy vừa thức dậy, vừa đổi loa): gọi play() lúc này là macOS ném lỗi Obj-C làm sập app.
    // Bỏ phần giọng còn lại của lượt này, báo đã nói xong, rồi dựng lại bộ âm thanh
    guard engine.isRunning else {
      try? FileManager.default.removeItem(at: u)
      report("playSkip"); stopPlay(); emit("spoken")
      if speaking { speaking = false; afterSpeech() }
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.recoverAudio("playSkip") }
      return
    }
    if !speaking { speaking = true; emit("speaking"); beginBarge() }
    playing = true
    let seq = playSeq
    player.scheduleFile(f, at: nil) { DispatchQueue.main.async {
      try? FileManager.default.removeItem(at: u)
      guard seq == self.playSeq else { return }
      self.playing = false; self.pump()
    } }
    player.play()
  }
  func stopPlay() {
    playSeq += 1; slots.removeAll(); nextIn = 0; nextOut = 0; playing = false; playOpen = false
    player.stop()
  }
  // trong lúc Bông nói: Soniox vẫn nghe (micro đã khử tiếng vọng), Apple vẫn chờ "Bông ơi"
  // có khử tiếng vọng thật sự thì mới nghe trong lúc Bông nói; không có thì tắt hẳn nghe (tránh Bông tự nghe giọng mình rồi tự trả lời)
  var echoSafe: Bool { vpioOK && engine.inputNode.isVoiceProcessingEnabled }
  func beginBarge() {
    silence?.invalidate(); stopApple(); if sxOn { sxOn = false; sx.stop() }; barge = false
    guard echoSafe else { mode = .idle; return }
    if let k = soniox { barge = true; mode = .follow; sxOn = true; cmdText = ""; sx.start(key: k, preroll: Data()) }
    else { mode = .wake; session() }
  }
  // giao diện xác nhận đó là anh nói chen (không phải tiếng vọng): dừng giọng, ghi lại câu của anh từ ~1 giây trước
  func bargeIn() {
    stopPlay(); speaking = false; barge = false
    if sxOn { sxOn = false; sx.stop() }
    mode = .command; cmdText = ""; emit("start")
    beginCommand(preroll: Data(ring.suffix(bytes(1)))); arm(3)
  }
  func afterSpeech() {
    barge = false
    if mode == .command { return }
    if sxOn { sxOn = false; sx.stop() }
    mode = .idle
    // chờ 0,7 giây cho hết dư âm trong phòng rồi mới nghe lại
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
      guard !self.speaking, self.mode == .idle else { return }
      if self.playFollow { self.mode = .follow; self.emit("follow"); self.beginCommand(preroll: Data()); self.arm(8) }
      else { self.mode = self.wakeOn ? .wake : .idle; if self.mode == .wake { self.session() } }
    }
  }
  func sonioxFail() {   // mất mạng / khoá lỗi: quay về Apple, 2 phút sau thử lại Soniox
    guard sxOn else { return }
    sxOn = false; sx.stop(); useSoniox = false
    emit("note", "Soniox đang lỗi, em tạm dùng nhận dạng của Apple")
    if mode == .command || mode == .follow { session(); arm(6) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 120) { self.useSoniox = true }
  }
  func arm(_ s: Double) { silence?.invalidate(); silence = Timer.scheduledTimer(withTimeInterval: s, repeats: false) { [weak self] _ in self?.finish() } }
  // hết lệnh → gửi cho giao diện, quay về chờ gọi tên
  func finish() {
    silence?.invalidate(); silence = nil
    if sxOn { sxOn = false; sx.stop() }
    let was = mode
    // Bông chỉ nghe tiếng Việt/Anh: bản nghe ra chữ Thái/Trung/Nhật/Hàn là nghe nhầm, bỏ đi chứ không gửi cho não
    if was == .command, cmdText.range(of: "[\u{0E00}-\u{0E7F}\u{3040}-\u{30FF}\u{4E00}-\u{9FFF}\u{AC00}-\u{D7AF}]", options: .regularExpression) != nil {
      emit("note2", "bỏ câu nghe nhầm ngôn ngữ: \(cmdText.prefix(40))"); emit("cancel"); cmdText = ""; mode = .follow; beginCommand(preroll: Data()); arm(10); return
    }
    if was == .command {
      emit("final", cmdText); cmdText = ""
      // anh có thể nói tiếp ngay khi Bông đang nghĩ: nghe tiếp 10 giây, câu mới sẽ thay câu cũ
      mode = .follow; beginCommand(preroll: Data()); arm(10); return
    }
    if was == .follow { emit("idle") }
    mode = wakeOn ? .wake : .idle
    cmdText = ""
    if mode == .wake { session() } else { stopAll() }
  }
  func restart() { if mode == .idle || speaking { stopApple() } else if !sxOn { session() } }
  func cancel() { silence?.invalidate(); if sxOn { sxOn = false; sx.stop() }; mode = wakeOn ? .wake : .idle; emit("cancel"); if mode == .wake { session() } else { stopAll() } }
  func stopApple() { rotate?.invalidate(); request?.endAudio(); request = nil; task?.cancel(); task = nil }
  func stopAll() {
    stopApple(); if sxOn { sxOn = false; sx.stop() }
    if playing || speaking { return }   // đang phát giọng thì giữ engine chạy
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0); ring = Data()
  }
  // Bông bắt đầu / thôi nói: tạm ngừng nghe để khỏi nghe chính mình; nói xong thì nghe tiếp 8 giây không cần gọi tên
  func setSpeaking(_ on: Bool, followUp: Bool) {
    if !on && mode == .command { speaking = false; return }   // đã bị ngắt lời và đang nghe lệnh mới
    speaking = on
    if on {   // Bông nói (giọng phát trong trang hoặc giọng máy): tắt nghe; chỉ chờ "Bông ơi" khi có khử tiếng vọng
      silence?.invalidate(); if sxOn { sxOn = false; sx.stop() }; stopApple()
      if echoSafe { mode = .wake; session() } else { mode = .idle }
      return
    }
    guard wakeOn || followUp else { return }
    authorize { DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {   // chờ hết dư âm rồi mới nghe lại
      guard !self.speaking, self.mode != .command else { return }
      self.mode = followUp ? .follow : (self.wakeOn ? .wake : .idle)
      if self.mode == .idle { return }
      self.ensureEngine()
      if self.mode == .follow { self.emit("follow"); self.beginCommand(preroll: Data()); self.arm(8) } else { self.session() }
    } }
  }
  // giọng macOS dự phòng khi không dùng ElevenLabs
  func speak(_ text: String) {
    synth.stopSpeaking(at: .immediate)
    let u = AVSpeechUtterance(string: text)
    let vi = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "vi-VN" }
    u.voice = vi.max(by: { $0.quality.rawValue < $1.quality.rawValue }) ?? AVSpeechSynthesisVoice(language: "vi-VN")
    u.rate = 0.53; u.pitchMultiplier = 1.12
    synth.speak(u)
  }
  func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) { emit("speaking"); setSpeaking(true, followUp: false) }
  func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { if !s.isSpeaking { emit("spoken"); setSpeaking(false, followUp: true) } }
}

// cửa sổ nổi của pet: không viền, trong suốt, nhận bàn phím khi cần gõ chat
final class PetPanel: NSPanel {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var server: Process?
  let voice = Voice()
  var hotKey: EventHotKeyRef?
  var desk: PetPanel?
  var deskWeb: WKWebView?
  var hitRects: [NSRect] = []          // vùng có nội dung trong cửa sổ pet (toạ độ trang, gốc trên-trái)
  var tick: Timer?
  var follow = true
  var lastMouse = NSPoint.zero, mouseStill = Date()
  var dragging = false, walking = false

  func makeConfig() -> WKWebViewConfiguration {
    let cfg = WKWebViewConfiguration()
    cfg.userContentController.add(self, name: "bong")
    cfg.mediaTypesRequiringUserActionForPlayback = []   // giọng Bông tự phát, không cần bấm
    return cfg
  }

  // tin từ giao diện
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let b = m.body as? [String: Any], let cmd = b["cmd"] as? String else { return }
    switch cmd {
    case "listen": voice.listen()
    case "stop": voice.finish()
    case "cancel": voice.cancel()
    case "speak": voice.speak(b["text"] as? String ?? "")
    case "hush": voice.synth.stopSpeaking(at: .immediate); voice.stopPlay(); if voice.speaking { voice.speaking = false; voice.barge = false }
    case "play": voice.play(b["url"] as? String ?? "")
    case "playEnd": voice.playEnd(follow: (b["follow"] as? Bool) ?? true)
    case "barge": voice.bargeIn()
    case "speaking": voice.setSpeaking(true, followUp: false)
    case "spoken": voice.setSpeaking(false, followUp: (b["follow"] as? Bool) ?? true)
    case "wake": voice.setWake((b["on"] as? Bool) ?? false)
    case "hit":   // [[x,y,w,h], …]
      hitRects = ((b["rects"] as? [[Double]]) ?? []).compactMap { $0.count == 4 ? NSRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }
    case "drag":
      guard let d = desk else { return }
      dragging = (b["active"] as? Bool) ?? false
      let dx = (b["dx"] as? Double) ?? 0, dy = (b["dy"] as? Double) ?? 0
      var f = d.frame; f.origin.x += dx; f.origin.y -= dy; d.setFrame(clamp(f), display: true)
      if !dragging { UserDefaults.standard.set(NSStringFromPoint(d.frame.origin), forKey: "petOrigin") }
    case "open":  // mở cửa sổ chính, tới trang
      NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
      if let h = b["hash"] as? String, let js = try? JSONSerialization.data(withJSONObject: [h]), let s = String(data: js, encoding: .utf8) {
        web.evaluateJavaScript("location.hash=\(s)[0]", completionHandler: nil)
      }
    case "focus": desk?.makeKey()
    case "ping":   // trang vừa tải / hỏi định kỳ: báo trạng thái nghe; nếu đang bật "luôn nghe" mà micro chưa chạy thì khởi động lại
      if voice.web != m.webView, desk != nil, m.webView == deskWeb { voice.web = deskWeb }
      voice.report("ping")
      if voice.wakeOn && voice.mode == .idle && !voice.speaking { voice.setWake(true) }
    case "settings": applySettings()
    default: break
    }
  }

  // đọc cài đặt pet từ server rồi bật/tắt cửa sổ nổi, đi theo chuột, luôn nghe
  func applySettings() {
    var req = URLRequest(url: BASE.appendingPathComponent("api/pet/settings")); req.timeoutInterval = 3
    URLSession.shared.dataTask(with: req) { d, _, _ in
      let s = (d.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
      DispatchQueue.main.async {
        let deskOn = (s["desk"] as? Bool) ?? true
        self.follow = (s["follow"] as? Bool) ?? false
        if deskOn { self.showDesk() } else { self.hideDesk() }
        self.voice.web = deskOn ? self.deskWeb : self.web
        self.voice.useSoniox = ((s["stt"] as? String) ?? "soniox") != "apple"
        self.voice.wakeSoniox = ((s["wakeEngine"] as? String) ?? "soniox") == "soniox"
        self.voice.wakeAny = ((s["wakeMode"] as? String) ?? "any") == "any"
        self.voice.setWake((s["wake"] as? Bool) ?? true)
        for w in [self.web, self.deskWeb] { w?.evaluateJavaScript("window.hpbPetSettings&&hpbPetSettings()", completionHandler: nil) }
      }
    }.resume()
  }

  func showDesk() {
    if let d = desk { d.orderFrontRegardless(); return }
    let size = NSSize(width: 470, height: 640)
    let vf = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
    var origin = NSPoint(x: vf.maxX - size.width - 8, y: vf.minY + 4)
    if let s = UserDefaults.standard.string(forKey: "petOrigin") { origin = NSPointFromString(s) }
    let p = PetPanel(contentRect: NSRect(origin: origin, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = false
    p.level = .floating; p.hidesOnDeactivate = false; p.isMovable = false
    p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    p.ignoresMouseEvents = true
    let w = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: makeConfig())
    w.setValue(false, forKey: "drawsBackground")
    w.uiDelegate = self; w.navigationDelegate = self
    w.load(URLRequest(url: BASE.appendingPathComponent("desk.html")))
    p.contentView = w
    p.setFrame(clamp(p.frame), display: true)
    p.orderFrontRegardless()
    desk = p; deskWeb = w
    tick?.invalidate()
    tick = Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.onTick() }
  }
  func hideDesk() { tick?.invalidate(); tick = nil; desk?.orderOut(nil); desk = nil; deskWeb = nil; hitRects = [] }

  // giữ cửa sổ pet trong màn hình đang chứa nó
  func clamp(_ f: NSRect) -> NSRect {
    let scr = NSScreen.screens.first(where: { $0.frame.contains(NSPoint(x: f.maxX - 74, y: f.minY + 70)) }) ?? NSScreen.main ?? NSScreen.screens[0]
    let v = scr.visibleFrame; var r = f
    r.origin.x = min(max(r.origin.x, v.minX - f.width + 150), v.maxX - f.width + 6)
    r.origin.y = min(max(r.origin.y, v.minY - 6), v.maxY - 160)
    return r
  }

  // 60 lần/giây: chuột ở trên pet/khung chat thì nhận chuột, không thì bấm xuyên qua; đi theo chuột khi bật
  func onTick() {
    guard let d = desk else { return }
    let m = NSEvent.mouseLocation, f = d.frame
    let local = NSPoint(x: m.x - f.minX, y: f.height - (m.y - f.minY))
    let inside = dragging || hitRects.contains { $0.insetBy(dx: -4, dy: -4).contains(local) }
    if d.ignoresMouseEvents == inside { d.ignoresMouseEvents = !inside }
    if hypot(m.x - lastMouse.x, m.y - lastMouse.y) > 2 { lastMouse = m; mouseStill = Date() }
    let petCenter = NSPoint(x: f.maxX - 74, y: f.minY + 70)
    let dist = hypot(m.x - petCenter.x, m.y - petCenter.y)
    let want = follow && !dragging && !inside && Date().timeIntervalSince(mouseStill) > 1.6 && (walking ? dist > 170 : dist > 420)
    if want != walking { walking = want; deskWeb?.evaluateJavaScript("window.hpbVoice&&hpbVoice.on('\(want ? "walk" : "stopwalk")','\(m.x < petCenter.x ? "left" : "right")')", completionHandler: nil) }
    guard want else { return }
    // pet ngồi ở góc dưới-phải cửa sổ; đích: pet đứng cạnh con trỏ (bên phải, hơi thấp)
    let target = NSPoint(x: m.x + 110 + 74 - f.width, y: m.y - 120 - 70)
    var nf = f
    let k = 0.045
    nf.origin.x += max(-14, min(14, (target.x - f.origin.x) * k))
    nf.origin.y += max(-14, min(14, (target.y - f.origin.y) * k))
    d.setFrame(clamp(nf), display: true)
  }

  // ⌥⌘B ở bất cứ đâu: Bông nghe lệnh
  func registerHotKey() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
      DispatchQueue.main.async { (NSApp.delegate as? AppDelegate)?.summon() }; return noErr
    }, 1, &spec, nil, nil)
    RegisterEventHotKey(UInt32(kVK_ANSI_B), UInt32(optionKey | cmdKey), EventHotKeyID(signature: OSType(0x48504246), id: 1), GetApplicationEventTarget(), 0, &hotKey)
  }
  @objc func summon() {
    if desk == nil { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }
    (voice.web ?? web).evaluateJavaScript("window.hpbVoice&&hpbVoice.on('summon','')", completionHandler: nil)
  }
  @objc func togglePet() {
    var req = URLRequest(url: BASE.appendingPathComponent("api/pet/settings")); req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["desk": desk == nil])
    URLSession.shared.dataTask(with: req) { _, _, _ in DispatchQueue.main.async { self.applySettings() } }.resume()
  }

  func applicationDidFinishLaunching(_ n: Notification) {
    NSApp.appearance = NSAppearance(named: .aqua) // luôn nền sáng
    buildMenu()
    web = WKWebView(frame: .zero, configuration: makeConfig())
    voice.web = web
    registerHotKey()
    web.uiDelegate = self
    web.navigationDelegate = self
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "HPB Flow"
    window.minSize = NSSize(width: 900, height: 600)
    window.contentView = web
    window.center()
    window.setFrameAutosaveName("HPBFlowMain")
    window.isReleasedWhenClosed = false
    window.makeKeyAndOrderFront(nil)
    web.loadHTMLString("<body style='font:15px -apple-system;color:#64748b;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>Đang khởi động HPB Flow…</body>", baseURL: nil)
    boot()
    watchMain()
    #if HANGTEST   // chỉ bản thử: làm kẹt luồng chính để kiểm tra luồng canh
    if !FileManager.default.fileExists(atPath: "/tmp/hpb-hangtest-done") {
      FileManager.default.createFile(atPath: "/tmp/hpb-hangtest-done", contents: nil)
      DispatchQueue.main.asyncAfter(deadline: .now() + 15) { Thread.sleep(forTimeInterval: 600) }
    }
    #endif
  }

  // luồng chính bị kẹt (vd CoreAudio không trả lời khi gắn micrô/loa) thì cả app đứng hình, không thoát được.
  // Một luồng canh riêng hỏi thăm luồng chính mỗi 5 giây; kẹt quá 20 giây thì tự mở lại app.
  // Server không bị tắt nên flow đang chạy vẫn chạy tiếp; app mới sẽ dùng lại server đó
  func watchMain() {
    let t = Thread { [weak self] in
      while true {
        Thread.sleep(forTimeInterval: 5)
        let ping = DispatchSemaphore(value: 0)
        DispatchQueue.main.async { ping.signal() }
        if ping.wait(timeout: .now() + 20) == .success { continue }
        guard let self = self, !self.quitting else { continue }
        self.relaunchAfterHang(); return
      }
    }
    t.name = "hpb.watch-main"; t.start()
  }
  func relaunchAfterHang() {
    let last = UserDefaults.standard.double(forKey: "hangRelaunchAt"), now = Date().timeIntervalSince1970
    if now - last < 180 { NSLog("HPB Flow: luồng chính kẹt lần nữa trong 3 phút, không tự mở lại để tránh lặp"); return }
    UserDefaults.standard.set(now, forKey: "hangRelaunchAt"); UserDefaults.standard.synchronize()
    NSLog("HPB Flow: luồng chính kẹt quá 20 giây, tự mở lại app")
    server?.terminationHandler = nil
    // chờ tiến trình này thoát hẳn rồi mở lại; open không lên (LaunchServices còn nhớ bản cũ) thì chạy thẳng tệp thực thi
    let app = Bundle.main.bundlePath, exe = Bundle.main.executablePath ?? ""
    let sh = Process(); sh.executableURL = URL(fileURLWithPath: "/bin/sh")
    sh.arguments = ["-c", "while kill -0 \(getpid()) 2>/dev/null; do sleep 0.2; done; sleep 0.5; open \"$1\"; sleep 4; pgrep -x HPBFlow >/dev/null || \"$2\" >/dev/null 2>&1 &", "relaunch", app, exe]
    try? sh.run()
    _exit(0)
  }

  // khởi động server rồi mở giao diện; hỏng thì tự thử lại mỗi 5 giây chứ không đứng ở trang lỗi
  var booting = false, quitting = false, bootTries = 0
  func boot() {
    if booting || quitting { return }
    booting = true; bootTries += 1
    DispatchQueue.global().async {
      let ok = self.isUp() || self.startServer()
      DispatchQueue.main.async {
        self.booting = false
        if ok { self.bootTries = 0; self.web.load(URLRequest(url: BASE)); self.deskWeb?.reload(); self.applySettings(); self.watchHealth(); return }
        self.web.loadHTMLString("<body style='font:15px -apple-system;color:#64748b;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0'><div>HPB Flow chưa khởi động xong, đang tự thử lại (lần \(self.bootTries))…</div><div style='font-size:12px;margin-top:8px'>Nhật ký: ~/Library/Logs/hpb-flow.log</div></body>", baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.boot() }
      }
    }
  }

  // server cũ còn giữ cổng mà không trả lời (lần trước thoát không sạch): dừng nó trước khi chạy server mới.
  // Chỉ đụng tới tiến trình node của chính HPB Flow, không giết thứ khác đang dùng cổng
  func freePort() {
    let q = Process(), pipe = Pipe()
    q.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof"); q.arguments = ["-t", "-iTCP:\(PORT)", "-sTCP:LISTEN"]; q.standardOutput = pipe
    guard (try? q.run()) != nil else { return }; q.waitUntilExit()
    let pids = (String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "").split(separator: "\n").compactMap { Int32($0) }
    for pid in pids {
      let c = Process(), cp = Pipe()
      c.executableURL = URL(fileURLWithPath: "/bin/ps"); c.arguments = ["-o", "command=", "-p", "\(pid)"]; c.standardOutput = cp
      guard (try? c.run()) != nil else { continue }; c.waitUntilExit()
      let cmd = String(data: cp.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
      guard cmd.contains("node"), cmd.contains("server.js") else { continue }
      kill(pid, SIGTERM)
      for _ in 0..<20 where kill(pid, 0) == 0 { Thread.sleep(forTimeInterval: 0.1) }
      if kill(pid, 0) == 0 { kill(pid, SIGKILL); Thread.sleep(forTimeInterval: 0.3) }
    }
  }

  // canh sức khoẻ server mỗi 10 giây: server treo (hoặc server cũ do lần trước tắt ngang để lại) mà 6 lần liền (~1 phút)
  // không trả lời thì khởi động lại; ngưỡng 1 phút để không giết nhầm server đang bận chạy flow nặng
  var health: Timer?, misses = 0
  func watchHealth() {
    health?.invalidate(); misses = 0
    health = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
      guard let self = self, !self.booting, !self.quitting else { return }
      DispatchQueue.global().async {
        let ok = self.isUp()
        DispatchQueue.main.async {
          self.misses = ok ? 0 : self.misses + 1
          if self.misses >= 6 { NSLog("HPB Flow: server không trả lời 1 phút, khởi động lại"); self.misses = 0; self.health?.invalidate(); self.boot() }
        }
      }
    }
  }

  // server chết giữa chừng (không phải do mình thoát app): tự chạy lại, tối đa 5 lần mỗi 2 phút để khỏi lặp vô tận
  var crashes: [Date] = []
  func serverDied(_ code: Int32) {
    if quitting { return }
    crashes = crashes.filter { Date().timeIntervalSince($0) < 120 } + [Date()]
    NSLog("HPB Flow: server dừng (mã \(code)), lần \(crashes.count) trong 2 phút")
    if crashes.count > 5 { DispatchQueue.main.asyncAfter(deadline: .now() + 60) { self.crashes = []; self.boot() }; return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.boot() }
  }

  func isUp() -> Bool {
    var req = URLRequest(url: BASE.appendingPathComponent("api/profiles")); req.timeoutInterval = 1
    let sem = DispatchSemaphore(value: 0); var ok = false
    URLSession.shared.dataTask(with: req) { _, r, _ in ok = (r as? HTTPURLResponse)?.statusCode == 200; sem.signal() }.resume()
    sem.wait(); return ok
  }

  func startServer() -> Bool {
    let res = Bundle.main.resourceURL!
    let p = Process()
    p.executableURL = res.appendingPathComponent("node/bin/node")
    p.arguments = [res.appendingPathComponent("app/src/server.js").path]
    p.currentDirectoryURL = res.appendingPathComponent("app")
    let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/hpb-flow.log")
    if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
    if let log = try? FileHandle(forWritingTo: logURL) { log.seekToEndOfFile(); p.standardOutput = log; p.standardError = log }
    freePort()
    p.terminationHandler = { [weak self] q in DispatchQueue.main.async { guard let self = self, self.server === q else { return }; self.server = nil; self.serverDied(q.terminationStatus) } }
    do { try p.run() } catch { return false }
    DispatchQueue.main.sync { self.server = p }
    // máy 8GB lúc vừa bật có thể chậm: chờ tới 60 giây
    let until = Date().addingTimeInterval(60)   // tính theo đồng hồ: mỗi lần hỏi server treo tốn thêm 1 giây chờ
    while Date() < until { if isUp() { return true }; if !p.isRunning { return false }; Thread.sleep(forTimeInterval: 0.25) }
    p.terminate(); return false   // không lên trong 60 giây: dừng nó, lần thử sau freePort dọn nốt
  }

  // thoát app: dừng server và chờ nó nhả cổng, để lần mở sau không vướng server cũ
  func applicationWillTerminate(_ n: Notification) {
    quitting = true
    guard let p = server, p.isRunning else { if server == nil { freePort() }; return }
    p.terminate()
    for _ in 0..<30 where p.isRunning { Thread.sleep(forTimeInterval: 0.1) }
    if p.isRunning { kill(p.processIdentifier, SIGKILL) }
  }
  // macOS dừng tiến trình hiển thị web (thường do thiếu RAM): tải lại thay vì để cửa sổ trắng
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) {
    NSLog("HPB Flow: tiến trình web bị dừng, tải lại")
    if w === web { w.load(URLRequest(url: BASE)) } else { w.reload() }
  }
  func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
  // đóng cửa sổ chính không thoát app: pet vẫn ở lại trên màn hình
  func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }

  // Link ra ngoài (target=_blank, trang khác) mở bằng trình duyệt mặc định
  func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
    if let u = a.request.url { NSWorkspace.shared.open(u) }; return nil
  }
  func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let u = a.request.url, a.navigationType == .linkActivated, u.host != "127.0.0.1" { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
    decisionHandler(.allow)
  }
  // alert / confirm / prompt của giao diện web
  func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let a = NSAlert(); a.messageText = m; a.runModal(); completionHandler()
  }
  func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "Đồng ý"); a.addButton(withTitle: "Huỷ")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }
  func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText d: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    let a = NSAlert(); a.messageText = p; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Huỷ")
    let tf = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24)); tf.stringValue = d ?? ""; a.accessoryView = tf
    completionHandler(a.runModal() == .alertFirstButtonReturn ? tf.stringValue : nil)
  }
  // <input type=file>
  func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let o = NSOpenPanel(); o.allowsMultipleSelection = p.allowsMultipleSelection; o.canChooseDirectories = p.allowsDirectories
    completionHandler(o.runModal() == .OK ? o.urls : nil)
  }

  @objc func reload() { web.load(URLRequest(url: BASE)); deskWeb?.reload() }
  @objc func openInBrowser() { NSWorkspace.shared.open(web.url ?? BASE) }

  func buildMenu() {
    let main = NSMenu()
    func sub(_ title: String, _ items: [NSMenuItem]) { let m = NSMenuItem(); m.submenu = NSMenu(title: title); items.forEach { m.submenu!.addItem($0) }; main.addItem(m) }
    func item(_ t: String, _ s: Selector?, _ k: String, _ mod: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
      let i = NSMenuItem(title: t, action: s, keyEquivalent: k); i.keyEquivalentModifierMask = mod; i.target = target; return i
    }
    sub("HPB Flow", [item("Giới thiệu HPB Flow", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""), .separator(),
                     item("Ẩn HPB Flow", #selector(NSApplication.hide(_:)), "h"), .separator(),
                     item("Thoát HPB Flow", #selector(NSApplication.terminate(_:)), "q")])
    sub("Sửa", [item("Hoàn tác", Selector(("undo:")), "z"), item("Làm lại", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                item("Cắt", #selector(NSText.cut(_:)), "x"), item("Sao chép", #selector(NSText.copy(_:)), "c"),
                item("Dán", #selector(NSText.paste(_:)), "v"), item("Chọn tất cả", #selector(NSText.selectAll(_:)), "a")])
    sub("Xem", [item("Tải lại", #selector(reload), "r", target: self), item("Mở trong trình duyệt", #selector(openInBrowser), "o", [.command, .shift], target: self), .separator(),
                item("Nói với Bông", #selector(summon), "b", [.command, .option], target: self),
                item("Hiện / ẩn Bông trên màn hình", #selector(togglePet), "", target: self)])
    sub("Cửa sổ", [item("Thu nhỏ", #selector(NSWindow.performMiniaturize(_:)), "m"), item("Đóng", #selector(NSWindow.performClose(_:)), "w")])
    NSApp.mainMenu = main
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

// Vỏ app macOS cho HPB Flow: bật server Node đi kèm trong app rồi hiện giao diện trong cửa sổ WebKit riêng.
import Cocoa
import WebKit

let PORT = 4719
let BASE = URL(string: "http://127.0.0.1:\(PORT)/")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var server: Process?

  func applicationDidFinishLaunching(_ n: Notification) {
    NSApp.appearance = NSAppearance(named: .aqua) // luôn nền sáng
    buildMenu()
    web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    web.uiDelegate = self
    web.navigationDelegate = self
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "HPB Flow"
    window.minSize = NSSize(width: 900, height: 600)
    window.contentView = web
    window.center()
    window.setFrameAutosaveName("HPBFlowMain")
    window.makeKeyAndOrderFront(nil)
    web.loadHTMLString("<body style='font:15px -apple-system;color:#64748b;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>Đang khởi động HPB Flow…</body>", baseURL: nil)
    DispatchQueue.global().async {
      let ok = self.isUp() || self.startServer()
      DispatchQueue.main.async {
        if ok { self.web.load(URLRequest(url: BASE)) }
        else { self.web.loadHTMLString("<body style='font:15px -apple-system;padding:40px'>Không khởi động được HPB Flow. Xem log: ~/Library/Logs/hpb-flow.log</body>", baseURL: nil) }
      }
    }
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
    do { try p.run() } catch { return false }
    server = p
    for _ in 0..<80 { if isUp() { return true }; Thread.sleep(forTimeInterval: 0.25) }
    return false
  }

  func applicationWillTerminate(_ n: Notification) { server?.terminate() }
  func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }

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

  @objc func reload() { web.load(URLRequest(url: BASE)) }
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
    sub("Xem", [item("Tải lại", #selector(reload), "r", target: self), item("Mở trong trình duyệt", #selector(openInBrowser), "o", [.command, .shift], target: self)])
    sub("Cửa sổ", [item("Thu nhỏ", #selector(NSWindow.performMiniaturize(_:)), "m"), item("Đóng", #selector(NSWindow.performClose(_:)), "w")])
    NSApp.mainMenu = main
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

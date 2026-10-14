// Cửa sổ nhắc việc nổi của HPB Flow: thay hộp thoại xám của osascript bằng thẻ HTML sinh động (sticker động, hiệu ứng, âm thanh).
// Server gọi: hpb-remind <url trang /remind.html?...>  → hiện panel trong suốt, luôn trên cùng, mọi màn hình Space.
// Trang báo lại bằng webkit.messageHandlers.hpb.postMessage("done" | "snooze" | "later") → in ra stdout rồi thoát.
// Không bấm gì sau 30 phút thì tự đóng (in "timeout").
import Cocoa
import WebKit

final class Panel: NSPanel { override var canBecomeKey: Bool { true } }

final class Remind: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
  var panel: Panel!
  let url: URL
  init(url: URL) { self.url = url }

  func applicationDidFinishLaunching(_ n: Notification) {
    let w: CGFloat = 400, h: CGFloat = 640
    let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main!
    let f = screen.visibleFrame
    panel = Panel(contentRect: NSRect(x: f.midX - w / 2, y: f.midY - h / 2 + 40, width: w, height: h),
                  styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.isMovableByWindowBackground = true

    let cfg = WKWebViewConfiguration()
    cfg.userContentController.add(self, name: "hpb")
    cfg.mediaTypesRequiringUserActionForPlayback = []
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
    web.setValue(false, forKey: "drawsBackground")
    web.underPageBackgroundColor = .clear
    web.load(URLRequest(url: url))
    panel.contentView = web
    panel.orderFrontRegardless()
    panel.makeKey()
    NSApp.activate(ignoringOtherApps: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1800) { self.finish("timeout") }
  }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    finish(String(describing: m.body))
  }

  func finish(_ s: String) {
    print(s); fflush(stdout)
    exit(0)
  }
}

guard CommandLine.arguments.count > 1, let u = URL(string: CommandLine.arguments[1]) else { print("thiếu url"); exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // không hiện icon trên Dock
let d = Remind(url: u)
app.delegate = d
app.run()

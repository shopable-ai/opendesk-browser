// Owned macOS CFT input only. See r251-visual-native.mjs for the parent contract.
// No browser launch, permission approval, DOM assignment, or synthetic events.
import Cocoa
import ApplicationServices

var inputPID: pid_t?
var pendingKey: (CGKeyCode, CGEventFlags)?
var pendingMouse: CGPoint?
func fail(_ message: String) -> Never {
    // Never leave a pressed key/button behind if ownership changes mid-input.
    // Release to the original PID, not whichever application became frontmost.
    if let target = inputPID {
        if let (code, flags) = pendingKey,
           let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) {
            event.flags = flags; event.postToPid(target)
        }
        if let point = pendingMouse,
           let event = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                               mouseCursorPosition: point, mouseButton: .left) { event.postToPid(target) }
    }
    let data = try! JSONSerialization.data(withJSONObject: ["status": "NOT_TESTED", "reason": message])
    print(String(data: data, encoding: .utf8)!)
    exit(3)
}
guard CommandLine.arguments.count >= 4, let pid = pid_t(CommandLine.arguments[1]), pid > 0,
      let owned = NSRunningApplication(processIdentifier: pid),
      owned.bundleIdentifier == "com.google.chrome.for.testing", AXIsProcessTrusted() else {
    fail("Exact accessible owned CFT PID required")
}
let command = CommandLine.arguments[2], url = CommandLine.arguments[3]
inputPID = pid
guard url.hasPrefix("chrome-extension://"), url.contains("/ui/tool.html") else {
    fail("Exact trusted Side Panel URL required")
}
if let session = CGSessionCopyCurrentDictionary() as? [String: Any],
   session["CGSSessionScreenIsLocked"] as? Bool == true { fail("Mac session is locked") }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
func value(_ node: AXUIElement, _ key: String) -> Any? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(node, key as CFString, &result) == .success else { return nil }
    return result
}
func text(_ node: AXUIElement, _ key: String) -> String { value(node, key) as? String ?? "" }
func frame(_ node: AXUIElement) -> CGRect? {
    guard let p = value(node, kAXPositionAttribute), let s = value(node, kAXSizeAttribute),
          CFGetTypeID(p as CFTypeRef) == AXValueGetTypeID(),
          CFGetTypeID(s as CFTypeRef) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point),
          AXValueGetValue(s as! AXValue, .cgSize, &size), size.width > 0, size.height > 0 else { return nil }
    return CGRect(origin: point, size: size)
}
func object(_ r: CGRect) -> [String: Double] {
    ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]
}
func descendants(_ root: AXUIElement) -> [AXUIElement] {
    var nodes: [AXUIElement] = [], budget = 10000
    func visit(_ node: AXUIElement, _ depth: Int) {
        budget -= 1
        guard budget > 0, depth < 40, !nodes.contains(where: {CFEqual($0, node)}) else { return }
        nodes.append(node)
        for child in value(node, kAXChildrenAttribute) as? [AXUIElement] ?? [] { visit(child, depth + 1) }
    }
    visit(root, 0)
    if budget <= 0 { fail("AX tree traversal budget exhausted") }
    return nodes
}
func webURL(_ node: AXUIElement) -> String {
    if let link = value(node, "AXURL") as? URL { return link.absoluteString }
    return text(node, "AXURL")
}
let windows = value(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
var matches: [(AXUIElement, AXUIElement, [AXUIElement])] = []
for window in windows {
    let nodes = descendants(window)
    for panel in nodes where text(panel, kAXRoleAttribute) == "AXWebArea" && webURL(panel) == url {
        matches.append((window, panel, nodes))
    }
}
guard matches.count == 1 else { fail("Exact Side Panel AXWebArea matches=\(matches.count)") }
let (window, panel, nodes) = matches[0]
guard let windowFrame = frame(window), let panelFrame = frame(panel),
      windowFrame.contains(panelFrame) else { fail("Exact panel/window native bounds unavailable") }
let screens = NSScreen.screens.filter { screen in
    guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return false }
    return CGDisplayBounds(CGDirectDisplayID(number.uint32Value)).contains(windowFrame)
}
guard screens.count == 1, let number = screens[0].deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
    fail("Owned browser window must fit a single known native display")
}
let screen: [String: Any] = ["displayId": number.uint32Value, "backingScaleFactor": screens[0].backingScaleFactor,
    "bounds": object(CGDisplayBounds(CGDirectDisplayID(number.uint32Value)))]
func requireForeground() {
    if let session = CGSessionCopyCurrentDictionary() as? [String: Any],
       session["CGSSessionScreenIsLocked"] as? Bool == true { fail("Mac session became locked") }
    guard !owned.isTerminated, NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
          let current = value(app, kAXFocusedWindowAttribute), CFEqual(current as CFTypeRef, window) else {
        fail("Owned CFT/window foreground changed; native input refused")
    }
}
func receipt(_ extra: [String: Any] = [:]) {
    var row: [String: Any] = ["status": "CONTROLLED", "pid": pid, "url": url, "command": command,
        "at": ISO8601DateFormatter().string(from: Date()), "window": object(frame(window) ?? windowFrame),
        "panel": object(frame(panel) ?? panelFrame), "screen": screen,
        "frontmost": NSWorkspace.shared.frontmostApplication?.processIdentifier == pid]
    row.merge(extra) {_, new in new}
    let data = try! JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
if command == "inspect" { receipt(); exit(0) }
if command == "activate" {
    owned.activate(options: [])
    guard AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success else { fail("Native AXRaise unavailable") }
    RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    requireForeground(); receipt(["method": "NSRunningApplication.activate + owned AXRaise"]); exit(0)
}
requireForeground()
guard CGPreflightPostEventAccess() else { fail("Native CGEvent posting access unavailable; no permission prompt requested") }
if command == "key" {
    guard CommandLine.arguments.count == 5 else { fail("Exact native key required") }
    let name = CommandLine.arguments[4]
    let code: CGKeyCode, flags: CGEventFlags
    switch name {
    case "zoom-reset": code = 29; flags = .maskCommand
    case "zoom-in": code = 24; flags = [.maskCommand, .maskShift]
    case "zoom-out": code = 27; flags = .maskCommand
    case "tab": code = 48; flags = []
    case "shift-tab": code = 48; flags = .maskShift
    default: fail("Native key is not allowlisted")
    }
    for down in [true, false] {
        requireForeground()
        guard let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else { fail("Native key event unavailable") }
        if down { pendingKey = (code, flags) }
        event.flags = flags; event.post(tap: .cghidEventTap)
        if !down { pendingKey = nil }
    }
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    requireForeground(); receipt(["method": "owned foreground CGEvent keyboard", "key": name]); exit(0)
}
if command == "drag" {
    guard CommandLine.arguments.count == 7, let delta = Double(CommandLine.arguments[4]),
          let cssWidth = Double(CommandLine.arguments[5]), let zoom = Double(CommandLine.arguments[6]),
          delta.isFinite, cssWidth.isFinite, zoom.isFinite, cssWidth > 0, zoom > 0,
          abs(panelFrame.width - cssWidth * zoom) <= 3 else {
        fail("AX panel width does not bind to the CDP CSS viewport and browser zoom")
    }
    let rightPanel = panelFrame.midX > windowFrame.midX
    let edge = rightPanel ? panelFrame.minX : panelFrame.maxX
    let splitters = nodes.filter { node in
        guard text(node, kAXRoleAttribute) == "AXSplitter", let r = frame(node) else { return false }
        return r.width <= 20 && r.height >= 100 && abs(r.midX - edge) <= 12 && r.intersects(panelFrame)
    }
    guard splitters.count <= 1 else { fail("Native Side Panel splitter is ambiguous") }
    // Chrome may omit an AXSplitter. Its exact URL-bound AXWebArea still gives
    // the native divider edge; only a subsequent CDP width change proves drag.
    let handle = splitters.first.flatMap {frame($0)}
    let start = CGPoint(x: handle?.midX ?? (edge + (rightPanel ? -2 : 2)),
                        y: handle?.midY ?? panelFrame.midY)
    let end = CGPoint(x: start.x + (rightPanel ? -delta : delta), y: start.y)
    guard windowFrame.insetBy(dx: 6, dy: 6).contains(start),
          windowFrame.insetBy(dx: 6, dy: 6).contains(end) else {
        fail("Requested splitter drag exceeds the owned native browser window")
    }
    func mouse(_ type: CGEventType, _ point: CGPoint) {
        requireForeground()
        guard let event = CGEvent(mouseEventSource: nil, mouseType: type,
                                  mouseCursorPosition: point, mouseButton: .left) else { fail("Native mouse event unavailable") }
        if type == .leftMouseDown || type == .leftMouseDragged { pendingMouse = point }
        event.post(tap: .cghidEventTap)
        if type == .leftMouseUp { pendingMouse = nil }
    }
    // Allow Chrome's narrow divider to receive hover and capture the mouse
    // before moving. Native11 had one inert drag at otherwise valid geometry.
    mouse(.mouseMoved, start)
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    mouse(.leftMouseDown, start)
    RunLoop.current.run(until: Date().addingTimeInterval(0.12))
    for step in 1...16 {
        let ratio = Double(step) / 16
        mouse(.leftMouseDragged, CGPoint(x: start.x + (end.x - start.x) * ratio, y: start.y))
        RunLoop.current.run(until: Date().addingTimeInterval(0.035))
    }
    mouse(.leftMouseUp, end)
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    receipt(["method": handle == nil ? "exact AXWebArea edge + native splitter drag" : "exact AXSplitter + native drag",
             "start": ["x": start.x, "y": start.y], "end": ["x": end.x, "y": end.y], "deltaNativePoints": delta,
             "hoverSeconds": 0.15, "pickupSeconds": 0.12, "dragSteps": 16, "stepSeconds": 0.035])
    exit(0)
}
fail("Unknown visual input command")

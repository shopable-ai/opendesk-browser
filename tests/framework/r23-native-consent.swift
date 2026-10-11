import Cocoa
import ApplicationServices

guard let pid = pid_t(CommandLine.arguments[1]),
      let running = NSRunningApplication(processIdentifier: pid),
      running.bundleIdentifier == "com.google.chrome.for.testing" else {
    print("Owned CFT identity mismatch"); exit(3)
}
guard AXIsProcessTrusted() else { print("Native acceptance requires existing Accessibility access"); exit(3) }
running.activate(options: [])
if CommandLine.arguments.contains("--focus") { print("FOCUSED owned CFT PID \(pid)"); exit(0) }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
func value(_ node: AXUIElement, _ key: String) -> Any? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(node, key as CFString, &result) == .success else { return nil }
    return result
}
func text(_ node: AXUIElement, _ key: String) -> String { value(node, key) as? String ?? "" }
var nodes: [AXUIElement] = [], budget = 1000
func visit(_ node: AXUIElement, _ depth: Int) {
    budget -= 1
    if depth > 16 || budget < 0 || text(node, kAXRoleAttribute) == "AXWebArea" { return }
    nodes.append(node)
    for child in value(node, kAXChildrenAttribute) as? [AXUIElement] ?? [] { visit(child, depth + 1) }
}
visit(app, 0)
let labels = nodes.map { text($0, kAXTitleAttribute) + " " + text($0, kAXDescriptionAttribute) + " " + text($0, kAXValueAttribute) }.joined(separator: "\n")
if let index = CommandLine.arguments.firstIndex(of: "--menu"), CommandLine.arguments.count > index + 1 {
    let wanted = CommandLine.arguments[index + 1]
    let matches = nodes.filter { text($0, kAXRoleAttribute) == "AXMenuItem" && text($0, kAXTitleAttribute) == wanted && value($0, kAXEnabledAttribute) as? Bool == true }
    let items = matches.reduce(into: [AXUIElement]()) { list, node in
        if !list.contains(where: { CFEqual($0, node) }) { list.append(node) }
    }
    guard budget >= 0, items.count == 1 else { print("WAIT: no unique owned Native menu item"); exit(2) }
    var owner: pid_t = 0
    guard AXUIElementGetPid(items[0], &owner) == .success, owner == pid,
          AXUIElementPerformAction(items[0], kAXPressAction as CFString) == .success else { print("Native menu PID/action mismatch"); exit(3) }
    print("NATIVE_SELECT_PID_AXPRESS"); exit(0)
}
guard budget >= 0, labels.contains("OpenDesk Browser"),
      labels.contains("has requested additional permissions") || labels.contains("请求获得更多权限"),
      labels.contains("Communicate with cooperating native applications") || labels.contains("与协作的本机应用通信") else {
    print("WAIT: no exact Native permission modal for PID \(pid)"); exit(2)
}
let matches = nodes.filter {
    text($0, kAXRoleAttribute) == "AXButton" &&
    (["Allow", "允许"].contains(text($0, kAXTitleAttribute)) || ["Allow", "允许"].contains(text($0, kAXDescriptionAttribute)))
}
// AX can expose the same native sheet through two ancestor paths.
let buttons = matches.reduce(into: [AXUIElement]()) { list, node in
    if !list.contains(where: { CFEqual($0, node) }) { list.append(node) }
}
guard buttons.count == 1 else { print("WAIT: no unique Native Allow control"); exit(2) }
var found: pid_t = 0
guard AXUIElementGetPid(buttons[0], &found) == .success, found == pid else { print("AX PID mismatch"); exit(3) }
if CommandLine.arguments.contains("--press") {
    guard AXUIElementPerformAction(buttons[0], kAXPressAction as CFString) == .success else { print("AX press failed"); exit(3) }
    print("PRESSED Native permission Allow for PID \(pid)")
} else { print("MATCH Native permission Allow for PID \(pid)") }

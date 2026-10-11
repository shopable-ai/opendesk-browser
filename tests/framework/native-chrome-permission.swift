// PID-bound native permission input; never traverse renderer web content.
import Cocoa
import ApplicationServices

guard CommandLine.arguments.count >= 2,
      let pid = pid_t(CommandLine.arguments[1]), pid > 0,
      let running = NSRunningApplication(processIdentifier: pid),
      running.bundleIdentifier == "com.google.chrome.for.testing" else {
    print("Owned CFT identity mismatch"); exit(3)
}
guard AXIsProcessTrusted() else {
    print("Existing Accessibility access is required"); exit(3)
}
running.activate(options: [])
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
guard budget >= 0 else { print("Native AX tree exceeds inspection budget"); exit(3) }
let labels = nodes.map {
    text($0, kAXTitleAttribute) + " " + text($0, kAXDescriptionAttribute) + " " + text($0, kAXValueAttribute)
}.joined(separator: "\n")
guard labels.contains("OpenDesk Browser"),
      labels.contains("has requested additional permissions") || labels.contains("请求获得更多权限"),
      labels.contains("Communicate with cooperating native applications") || labels.contains("与协作的本机应用通信") else {
    print("WAIT: no exact Native permission dialog for PID \(pid)"); exit(2)
}
let matches = nodes.filter {
    text($0, kAXRoleAttribute) == "AXButton" &&
    (["Allow", "允许"].contains(text($0, kAXTitleAttribute)) ||
     ["Allow", "允许"].contains(text($0, kAXDescriptionAttribute))) &&
    value($0, kAXEnabledAttribute) as? Bool == true
}
let buttons = matches.reduce(into: [AXUIElement]()) { list, node in
    if !list.contains(where: { CFEqual($0, node) }) { list.append(node) }
}
guard buttons.count == 1 else { print("WAIT: no unique Native Allow control"); exit(2) }
var found: pid_t = 0
guard AXUIElementGetPid(buttons[0], &found) == .success, found == pid else {
    print("Native AX PID mismatch"); exit(3)
}
guard AXUIElementPerformAction(buttons[0], kAXPressAction as CFString) == .success else {
    print("Native AX press failed"); exit(3)
}
print("CLICKED: PID \(pid) Native permission Allow\n" + labels)

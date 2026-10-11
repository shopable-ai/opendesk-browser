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
var candidates = value(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
var budget = 1000
func appendCandidate(_ node: AXUIElement) {
    if !candidates.contains(where: { CFEqual($0, node) }) { candidates.append(node) }
}
func collect(_ root: AXUIElement) -> [AXUIElement] {
    var nodes: [AXUIElement] = []
    func visit(_ node: AXUIElement, _ depth: Int) {
        budget -= 1
        if depth > 16 || budget < 0 { return }
        let role = text(node, kAXRoleAttribute)
        if role == "AXWebArea" { return }
        if !CFEqual(node, root) && (["AXWindow", "AXSheet", "AXDialog"].contains(role) ||
            ["AXDialog", "AXApplicationAlertDialog", "AXSystemDialog"].contains(text(node, kAXSubroleAttribute))) {
            appendCandidate(node); return
        }
        nodes.append(node)
        for child in value(node, kAXChildrenAttribute) as? [AXUIElement] ?? [] { visit(child, depth + 1) }
    }
    visit(root, 0)
    return nodes
}
var matches: [(AXUIElement, String, String)] = [], index = 0
while index < candidates.count && index < 16 {
    let root = candidates[index]; index += 1
    for sheet in value(root, "AXSheets") as? [AXUIElement] ?? [] { appendCandidate(sheet) }
    let title = text(root, kAXTitleAttribute)
    let nodes = collect(root)
    guard title.isEmpty || title == "OpenDesk Browser" ||
        title.contains("has requested additional permissions") || title.contains("请求获得更多权限") else { continue }
    guard budget >= 0 else { print("Native AX tree exceeds inspection budget"); exit(3) }
    let labels = nodes.map {
        text($0, kAXTitleAttribute) + " " + text($0, kAXDescriptionAttribute) + " " + text($0, kAXValueAttribute)
    }.joined(separator: "\n")
    let namedHeading = nodes.contains { node in
        ["AXStaticText", "AXHeading"].contains(text(node, kAXRoleAttribute)) &&
        [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute].contains { key in
            let label = text(node, key)
            return label == "OpenDesk Browser" ||
                ((label.hasPrefix("“OpenDesk Browser”") || label.hasPrefix("\"OpenDesk Browser\"") || label.hasPrefix("OpenDesk Browser ")) &&
                 (label.contains("has requested additional permissions") || label.contains("请求获得更多权限")))
        }
    }
    guard namedHeading,
          labels.contains("has requested additional permissions") || labels.contains("请求获得更多权限"),
          labels.contains("Communicate with cooperating native applications") || labels.contains("与协作的本机应用通信") else { continue }
    let buttons = nodes.filter {
        text($0, kAXRoleAttribute) == "AXButton" &&
        (["Allow", "允许"].contains(text($0, kAXTitleAttribute)) ||
         ["Allow", "允许"].contains(text($0, kAXDescriptionAttribute))) &&
        value($0, kAXEnabledAttribute) as? Bool == true
    }.reduce(into: [AXUIElement]()) { list, node in
        if !list.contains(where: { CFEqual($0, node) }) { list.append(node) }
    }
    if buttons.isEmpty { continue }
    guard buttons.count == 1 else { print("Native permission dialog has no unique Allow"); exit(3) }
    if !matches.contains(where: { CFEqual($0.0, buttons[0]) }) { matches.append((buttons[0], title, labels)) }
}
guard candidates.count <= 16, matches.count == 1 else {
    print("WAIT: no unique exact Native permission dialog for PID \(pid)"); exit(2)
}
var found: pid_t = 0
let (button, title, labels) = matches[0]
guard AXUIElementGetPid(button, &found) == .success, found == pid else {
    print("Native AX PID mismatch"); exit(3)
}
guard AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else {
    print("Native AX press failed"); exit(3)
}
print("CLICKED: PID \(pid) window/sheet \(title) Native permission Allow\n" + labels)

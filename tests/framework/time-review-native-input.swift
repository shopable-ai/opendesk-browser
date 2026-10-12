import Cocoa
import ApplicationServices

guard CommandLine.arguments.count >= 3, let pid=pid_t(CommandLine.arguments[1]),
      let owned=NSRunningApplication(processIdentifier:pid),
      owned.bundleIdentifier == "com.google.chrome.for.testing", AXIsProcessTrusted() else {
    print("Owned accessible CFT required");exit(3)
}
let command=CommandLine.arguments[2]
let app=AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app,"AXEnhancedUserInterface" as CFString,kCFBooleanTrue)
func value(_ node:AXUIElement,_ key:String)->Any?{var result:CFTypeRef?;guard AXUIElementCopyAttributeValue(node,key as CFString,&result) == .success else{return nil};return result}
func text(_ node:AXUIElement,_ key:String)->String{value(node,key) as? String ?? ""}
var nodes:[AXUIElement]=[],budget=10000
func visit(_ node:AXUIElement,_ depth:Int){budget-=1;guard depth<40,budget>0 else{return};if nodes.contains(where:{CFEqual($0,node)}){return};nodes.append(node);for key in [kAXChildrenAttribute,"AXSheets"]{for child in value(node,key) as? [AXUIElement] ?? []{visit(child,depth+1)}}}
if command == "activate" {owned.activate(options:[]);RunLoop.current.run(until:Date().addingTimeInterval(0.25));guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{exit(4)};print("OWNED_FRONTMOST");exit(0)}
visit(app,0)
if command == "dump" {
  let rows=nodes.map{["role":text($0,kAXRoleAttribute),"title":text($0,kAXTitleAttribute),"description":text($0,kAXDescriptionAttribute),"value":text($0,kAXValueAttribute),"focused":value($0,kAXFocusedAttribute) as? Bool ?? false,"enabled":value($0,kAXEnabledAttribute) as? Bool ?? false] as [String:Any]}
  let data=try! JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!);exit(0)
}
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{print("Foreground owner changed");exit(4)}
if command == "key" || command == "text" {
  guard CommandLine.arguments.count == 4 else{exit(5)}
  let input=CommandLine.arguments[3]
  func key(_ code:CGKeyCode,_ flags:CGEventFlags=[]){
    for down in [true,false]{let event=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down);event?.flags=flags;event?.post(tap:.cghidEventTap)}
    RunLoop.current.run(until:Date().addingTimeInterval(0.12))
  }
  if command == "key" {
    switch input {
    case "tab":key(48)
    case "shift-tab":key(48,.maskShift)
    case "return":key(36)
    case "escape":key(53)
    case "home":key(115)
    case "down":key(125)
    case "up":key(126)
    case "end":key(119)
    default:exit(5)
    }
  } else {
    key(0,.maskCommand)
    let characters=Array(input.utf16)
    for down in [true,false]{let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down);event?.keyboardSetUnicodeString(stringLength:characters.count,unicodeString:characters);event?.post(tap:.cghidEventTap)}
  }
  print("OWNED_NATIVE_\(command.uppercased()) \(input)");exit(0)
}
if command == "activity" {
  guard let window=(value(app,kAXWindowsAttribute) as? [AXUIElement])?.first,
        let raw=value(window,kAXPositionAttribute) else{exit(7)}
  var point=CGPoint.zero
  guard AXValueGetValue(raw as! AXValue,.cgPoint,&point) else{exit(7)}
  point.x+=200;point.y+=12
  let move=CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)
  move?.post(tap:.cghidEventTap);print("OWNED_NATIVE_MOUSE_MOVED \(point.x),\(point.y)");exit(0)
}
if command == "press" {
  guard CommandLine.arguments.count == 4 else{exit(5)}
  let label=CommandLine.arguments[3]
  let matches=nodes.filter{[text($0,kAXTitleAttribute),text($0,kAXDescriptionAttribute)].contains(label)&&["AXButton","AXPopUpButton","AXMenuItem"].contains(text($0,kAXRoleAttribute))}
  guard matches.count == 1 else{print("Expected one owned AX control: \(label); matches=\(matches.count)");exit(5)}
  let result=AXUIElementPerformAction(matches[0],kAXPressAction as CFString)
  guard result == .success else{print("AX press failed: \(result.rawValue)");exit(6)}
  print("OWNED_AX_PRESS \(label)");exit(0)
}
print("Use activate | dump | press LABEL");exit(2)

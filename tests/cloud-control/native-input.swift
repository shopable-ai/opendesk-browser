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
func visit(_ node:AXUIElement,_ depth:Int){budget-=1;guard depth<40,budget>0 else{return};if nodes.contains(where:{CFEqual($0,node)}){return};nodes.append(node);for child in value(node,kAXChildrenAttribute) as? [AXUIElement] ?? []{visit(child,depth+1)}}
if command == "activate" {owned.activate(options:[]);RunLoop.current.run(until:Date().addingTimeInterval(0.25));guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{exit(4)};print("OWNED_FRONTMOST");exit(0)}
if command == "key" || command == "type" || command == "typefile" {
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{exit(4)}
 if command == "key" {
   let code=CGKeyCode(CommandLine.arguments[3])!
   for down in [true,false] {let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down)!;e.flags=[];if CommandLine.arguments.count>4 {if CommandLine.arguments[4]=="cmdshift"{e.flags=[.maskCommand,.maskShift]}else if CommandLine.arguments[4]=="cmd"{e.flags=[.maskCommand]}};e.post(tap:.cghidEventTap)}
 }else{let input=command == "typefile" ? try! String(contentsOfFile:CommandLine.arguments[3],encoding:.utf8) : CommandLine.arguments[3];let units=Array(input.utf16);for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!;e.flags=[];units.withUnsafeBufferPointer{p in e.keyboardSetUnicodeString(stringLength:units.count,unicodeString:p.baseAddress!)};e.post(tap:.cghidEventTap)}}
 RunLoop.current.run(until:Date().addingTimeInterval(0.2))
 print("OWNED_NATIVE_KEY_INPUT");exit(0)
}
visit(app,0)
if command == "dump" {
  let rows=nodes.map{["role":text($0,kAXRoleAttribute),"title":text($0,kAXTitleAttribute),"description":text($0,kAXDescriptionAttribute),"value":text($0,kAXValueAttribute)]}
  let data=try! JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!);exit(0)
}
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{print("Foreground owner changed");exit(4)}
if command == "activity" {
  guard let window=(value(app,kAXWindowsAttribute) as? [AXUIElement])?.first,
        let raw=value(window,kAXPositionAttribute) else{exit(7)}
  var point=CGPoint.zero
  guard AXValueGetValue(raw as! AXValue,.cgPoint,&point) else{exit(7)}
  point.x+=200;point.y+=12
  let move=CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)
  move?.post(tap:.cghidEventTap);print("OWNED_NATIVE_MOUSE_MOVED \(point.x),\(point.y)");exit(0)
}
if command == "press" || command == "focus" {
  guard CommandLine.arguments.count == 5 else{exit(5)}
  let label=CommandLine.arguments[3]
  let matches=nodes.filter{[text($0,kAXTitleAttribute),text($0,kAXDescriptionAttribute)].contains(label)&&text($0,kAXRoleAttribute)==CommandLine.arguments[4]}
  guard matches.count == 1 else{print("Expected one owned AX control: \(label); matches=\(matches.count)");exit(5)}
  let result=command == "focus" ? AXUIElementSetAttributeValue(matches[0],kAXFocusedAttribute as CFString,kCFBooleanTrue) : AXUIElementPerformAction(matches[0],kAXPressAction as CFString)
  guard result == .success else{print("AX press failed: \(result.rawValue)");exit(6)}
  print("OWNED_AX_PRESS \(label)");exit(0)
}
print("Use activate | dump | press LABEL");exit(2)

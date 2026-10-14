import Cocoa
import ApplicationServices

guard CommandLine.arguments.count >= 3, let pid=pid_t(CommandLine.arguments[1]),
      let owned=NSRunningApplication(processIdentifier:pid),
      owned.bundleIdentifier == "com.google.chrome.for.testing", AXIsProcessTrusted() else {
    print("Owned accessible CFT required");exit(3)
}
let command=CommandLine.arguments[2]
let app=AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app,2)
func value(_ node:AXUIElement,_ key:String)->Any?{var result:CFTypeRef?;guard AXUIElementCopyAttributeValue(node,key as CFString,&result) == .success else{return nil};return result}
func text(_ node:AXUIElement,_ key:String)->String{value(node,key) as? String ?? ""}
func requireForeground(){guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else{let front=NSWorkspace.shared.frontmostApplication;print("Foreground owner changed: expected=\(pid) actual=\(front?.processIdentifier ?? -1) name=\(front?.localizedName ?? "unknown")");exit(4)}}
func standardWindow()->AXUIElement?{
  let matches=(value(app,kAXWindowsAttribute) as? [AXUIElement] ?? []).filter{text($0,kAXSubroleAttribute)=="AXStandardWindow"}
  return matches.count==1 ? matches[0] : nil
}
var nodes:[AXUIElement]=[],budget=10000
func visit(_ node:AXUIElement,_ depth:Int){budget-=1;guard depth<40,budget>0 else{return};if nodes.contains(where:{CFEqual($0,node)}){return};nodes.append(node);for key in [kAXChildrenAttribute,"AXSheets"]{for child in value(node,key) as? [AXUIElement] ?? []{visit(child,depth+1)}}}
if command == "activate" {
  for _ in 0..<3 {
    owned.activate(options:[])
    var settable=DarwinBoolean(false)
    if AXUIElementIsAttributeSettable(app,kAXFrontmostAttribute as CFString,&settable) == .success && settable.boolValue {
      let activated=AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)
      guard activated == .success else{print("Owned AX foreground activation failed: \(activated.rawValue)");exit(6)}
    }
    if let window=standardWindow(){
      let raised=AXUIElementPerformAction(window,kAXRaiseAction as CFString)
      guard raised == .success else{print("Owned standard window raise failed: \(raised.rawValue)");exit(6)}
    }
    RunLoop.current.run(until:Date().addingTimeInterval(0.25))
    if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid {print("OWNED_FRONTMOST");exit(0)}
  }
  let front=NSWorkspace.shared.frontmostApplication
  print("Foreground owner changed: \(front?.localizedName ?? "unknown") pid=\(front?.processIdentifier ?? -1)");exit(4)
}
// Native input needs window bounds, not a full accessibility-tree traversal.
// Traverse only for an observation or a uniquely identified AX control.
if command == "dump-dialog" || command == "press-dialog" {
  func dialogVisit(_ node:AXUIElement,_ depth:Int){
    budget-=1;guard depth<16,budget>0 else{return}
    if nodes.contains(where:{CFEqual($0,node)}){return};nodes.append(node)
    let role=text(node,kAXRoleAttribute)
    if ["AXBrowser","AXOutline","AXTable","AXWebArea","AXScrollArea"].contains(role){return}
    for key in [kAXChildrenAttribute,"AXSheets"]{for child in value(node,key) as? [AXUIElement] ?? []{dialogVisit(child,depth+1)}}
  }
  let windows=value(app,kAXWindowsAttribute) as? [AXUIElement] ?? []
  var sheets:[AXUIElement]=[]
  for window in windows {
    let candidates=(value(window,"AXSheets") as? [AXUIElement] ?? []) +
      (value(window,kAXChildrenAttribute) as? [AXUIElement] ?? []).filter{text($0,kAXRoleAttribute)=="AXSheet"}
    for sheet in candidates {if !sheets.contains(where:{CFEqual($0,sheet)}){sheets.append(sheet)}}
  }
  budget=1500;for sheet in sheets{dialogVisit(sheet,0)}
} else {if command == "dump" || command == "press" {visit(app,0)}}
if command == "dump" || command == "dump-dialog" {
  let rows=nodes.map{node -> [String:Any] in
    var row=["role":text(node,kAXRoleAttribute),"subrole":text(node,kAXSubroleAttribute),"title":text(node,kAXTitleAttribute),"description":text(node,kAXDescriptionAttribute),"value":text(node,kAXValueAttribute),"focused":value(node,kAXFocusedAttribute) as? Bool ?? false,"enabled":value(node,kAXEnabledAttribute) as? Bool ?? false] as [String:Any]
    if let raw=value(node,kAXPositionAttribute){var point=CGPoint.zero;if AXValueGetValue(raw as! AXValue,.cgPoint,&point){row["position"]=["x":point.x,"y":point.y]}}
    if let raw=value(node,kAXSizeAttribute){var size=CGSize.zero;if AXValueGetValue(raw as! AXValue,.cgSize,&size){row["size"]=["width":size.width,"height":size.height]}}
    return row
  }
  let data=try! JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!);exit(0)
}
requireForeground()
if command == "click-at" {
  guard CommandLine.arguments.count == 5,
        let x=Double(CommandLine.arguments[3]),let y=Double(CommandLine.arguments[4]),
        x.isFinite,y.isFinite,
        let windows=value(app,kAXWindowsAttribute) as? [AXUIElement] else{exit(7)}
  var inside=false,bounds:[String]=[]
  for window in windows {
    guard let position=value(window,kAXPositionAttribute),let dimensions=value(window,kAXSizeAttribute) else{continue}
    var origin=CGPoint.zero,size=CGSize.zero
    guard AXValueGetValue(position as! AXValue,.cgPoint,&origin),AXValueGetValue(dimensions as! AXValue,.cgSize,&size) else{continue}
    let rect=CGRect(origin:origin,size:size);bounds.append("\(rect)");inside=inside||rect.contains(CGPoint(x:x,y:y))
  }
  guard inside else{print("Outside owned CFT windows: \(x),\(y); \(bounds)");exit(7)}
  for kind in [CGEventType.leftMouseDown,.leftMouseUp]{
    requireForeground()
    let visible=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    let atPoint=visible.first{row in
      // WindowServer lists full-screen NotificationCenter overlay bounds even
      // where no notification receives input. Compare ordinary app windows;
      // the driver separately proves the requested DOM/ARIA focus afterward.
      guard (row[kCGWindowLayer as String] as? NSNumber)?.intValue==0,
            (row[kCGWindowAlpha as String] as? Double ?? 0)>0,
            let raw=row[kCGWindowBounds as String] as? [String:Any],
            let rect=CGRect(dictionaryRepresentation:raw as CFDictionary) else{return false}
      return rect.contains(CGPoint(x:x,y:y))
    }
    guard (atPoint?[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid else{
      print("Visible window owner changed at native point: expected=\(pid) actual=\(String(describing:atPoint?[kCGWindowOwnerPID as String]))");exit(9)
    }
    guard let event=CGEvent(mouseEventSource:nil,mouseType:kind,mouseCursorPosition:CGPoint(x:x,y:y),mouseButton:.left) else{exit(8)}
    event.setIntegerValueField(.mouseEventClickState,value:1);event.post(tap:.cghidEventTap)
  }
  RunLoop.current.run(until:Date().addingTimeInterval(0.2));print("OWNED_NATIVE_CLICK \(x),\(y)");exit(0)
}
if command == "key" || command == "text" {
  guard CommandLine.arguments.count == 4 else{exit(5)}
  let input=CommandLine.arguments[3]
  func key(_ code:CGKeyCode,_ flags:CGEventFlags=[]){
    for down in [true,false]{requireForeground();guard let event=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down) else{exit(8)};event.flags=flags;event.post(tap:.cghidEventTap)}
    RunLoop.current.run(until:Date().addingTimeInterval(0.12))
  }
  if command == "key" {
    switch input {
    case "tab":key(48)
    case "shift-tab":key(48,.maskShift)
    case "return":key(36)
    case "escape":key(53)
    case "home":key(115)
    case "go-to-folder":key(5,[.maskCommand,.maskShift])
    case "down":key(125)
    case "up":key(126)
    case "end":key(119)
    case "zoom-in":key(24,[.maskCommand,.maskShift])
    case "zoom-out":key(27,.maskCommand)
    case "zoom-reset":key(29,.maskCommand)
    default:exit(5)
    }
  } else {
    key(0,.maskCommand)
    var chunks:[[UInt16]]=[],chunk:[UInt16]=[]
    for scalar in input.unicodeScalars {
      let units=Array(String(scalar).utf16)
      if chunk.count+units.count>8 {chunks.append(chunk);chunk=[]}
      chunk.append(contentsOf:units)
    }
    if !chunk.isEmpty {chunks.append(chunk)}
    for chunk in chunks {
      for down in [true,false]{requireForeground();guard let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down) else{exit(8)};event.flags=[];event.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:chunk);event.post(tap:.cghidEventTap)}
      RunLoop.current.run(until:Date().addingTimeInterval(0.04))
    }
  }
  print("OWNED_NATIVE_\(command.uppercased()) \(input)");exit(0)
}
if command == "activity" {
  guard let window=standardWindow(),
        let raw=value(window,kAXPositionAttribute) else{exit(7)}
  var point=CGPoint.zero
  guard AXValueGetValue(raw as! AXValue,.cgPoint,&point) else{exit(7)}
  point.x+=200;point.y+=12
  // A repeated event at the unchanged cursor position may not reset native
  // idle detection. Move to a different point inside the owned title bar.
  if let current=CGEvent(source:nil)?.location,abs(current.x-point.x)<1&&abs(current.y-point.y)<1 {point.x+=2}
  guard let move=CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left) else{exit(8)}
  move.post(tap:.cghidEventTap);print("OWNED_NATIVE_MOUSE_MOVED \(point.x),\(point.y)");exit(0)
}
if command == "press" || command == "press-dialog" {
  guard CommandLine.arguments.count == 4 else{exit(5)}
  let label=CommandLine.arguments[3]
  let matches=nodes.filter{[text($0,kAXTitleAttribute),text($0,kAXDescriptionAttribute)].contains(label)&&["AXButton","AXPopUpButton","AXMenuItem"].contains(text($0,kAXRoleAttribute))}
  guard matches.count == 1 else{print("Expected one owned AX control: \(label); matches=\(matches.count)");exit(5)}
  let result=AXUIElementPerformAction(matches[0],kAXPressAction as CFString)
  guard result == .success else{print("AX press failed: \(result.rawValue)");exit(6)}
  print("OWNED_AX_PRESS \(label)");exit(0)
}
print("Use activate | dump | press LABEL");exit(2)

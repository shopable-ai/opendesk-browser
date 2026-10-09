// User-authorized macOS native UI adapter. Every operation targets one PID.
// No browser script, DOM assignment, import API, or receipt substitution.
import ApplicationServices
import Foundation
import AppKit
let args=CommandLine.arguments
guard args.count>=3,let pid=Int32(args[1]),kill(pid,0)==0 else {fatalError("Live PID required")}
let app=AXUIElementCreateApplication(pid)
func attribute(_ element:AXUIElement,_ name:String)->CFTypeRef? {
  var value:CFTypeRef?;return AXUIElementCopyAttributeValue(element,name as CFString,&value) == .success ? value:nil
}
func string(_ e:AXUIElement,_ key:String)->String {attribute(e,key).map {String(describing:$0)} ?? ""}
var nodes:[AXUIElement]=[]
func scan(_ e:AXUIElement,_ depth:Int=0) {
  guard depth<30,nodes.count<5000 else{return};nodes.append(e)
  for child in (attribute(e,kAXChildrenAttribute) as? [AXUIElement] ?? []){scan(child,depth+1)}
}
if ["snapshot","press","click","choose"].contains(args[2]){scan(app)}
func output() {
 let rows=nodes.enumerated().compactMap {i,e->[String:Any]? in
   let role=string(e,kAXRoleAttribute),title=string(e,kAXTitleAttribute),desc=string(e,kAXDescriptionAttribute)
   guard !["AXGroup","AXUnknown","AXApplication"].contains(role) else{return nil}
   return ["index":i,"role":role,"title":title,"description":desc,"value":string(e,kAXValueAttribute),"enabled":string(e,kAXEnabledAttribute),"selectedText":string(e,kAXSelectedTextAttribute),"position":string(e,kAXPositionAttribute),"size":string(e,kAXSizeAttribute)]
 }
 let data=try! JSONSerialization.data(withJSONObject:["eventAccess":CGPreflightPostEventAccess(),"axTrusted":AXIsProcessTrusted(),"frontmostPid":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1,"pid":pid,"at":ISO8601DateFormatter().string(from:Date()),"nodes":rows,"windows":(CGWindowListCopyWindowInfo(.optionOnScreenOnly,kCGNullWindowID) as? [[String:Any]] ?? []).filter {($0[kCGWindowOwnerPID as String] as? Int32)==pid}],options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!)
}
switch args[2] {
case "pickerstate", "picker":
 var pickerNodes:[AXUIElement]=[]
 func pickerScan(_ e:AXUIElement,_ depth:Int=0){
  guard depth<24,pickerNodes.count<600 else{return}
  let role=string(e,kAXRoleAttribute)
  if ["AXMenuBar","AXBrowser","AXTable","AXOutline","AXOutlineView","AXColumn","AXRow","AXTabGroup","AXToolbar"].contains(role){return}
  pickerNodes.append(e)
  for child in (attribute(e,kAXChildrenAttribute) as? [AXUIElement] ?? []){pickerScan(child,depth+1)}
 }
 pickerScan(app)
 let sheets=pickerNodes.filter{string($0,kAXRoleAttribute)=="AXSheet"}
 if args[2]=="pickerstate" {print("{\"pid\":\(pid),\"open\":\(sheets.contains{string($0,kAXDescriptionAttribute)=="打开"})}");exit(0)}
 guard args.count==4,args[3].hasPrefix("/private/tmp/opendesk-sidebar-r3-01a11fba/"),FileManager.default.fileExists(atPath:args[3]),sheets.contains(where:{string($0,kAXDescriptionAttribute)=="打开"}) else{fatalError("Owned real open sheet and bounded existing file required")}
 AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)
 NSRunningApplication(processIdentifier:pid)?.activate(options:[])
 for _ in 0..<50{if NSWorkspace.shared.frontmostApplication?.processIdentifier==pid{break};Thread.sleep(forTimeInterval:0.02)}
 func pickerKey(_ code:UInt16,_ flags:CGEventFlags=[]){
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Picker PID focus mismatch")}
  for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down)!;e.flags=down ? flags:[];e.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 }
 if sheets.count>1{pickerKey(53);Thread.sleep(forTimeInterval:0.1)}
 pickerKey(5,[.maskCommand,.maskShift]);Thread.sleep(forTimeInterval:0.2)
 pickerKey(0,.maskCommand)
 let units=Array(args[3].utf16)
 for down in [true,false]{guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Picker PID focus mismatch")};let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!;e.flags=[];units.withUnsafeBufferPointer{e.keyboardSetUnicodeString(stringLength:units.count,unicodeString:$0.baseAddress!)};e.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 Thread.sleep(forTimeInterval:0.15)
 guard let focused=attribute(app,kAXFocusedUIElementAttribute) else{fatalError("Native Go To field missing")}
 let field=focused as! AXUIElement;var fieldPid:Int32=0;AXUIElementGetPid(field,&fieldPid)
 let focusedObserved:[String:Any]=["pid":fieldPid,"role":string(field,kAXRoleAttribute),"value":string(field,kAXValueAttribute),"expected":args[3]]
 if fieldPid != pid || string(field,kAXValueAttribute) != args[3]{let data=try! JSONSerialization.data(withJSONObject:focusedObserved);FileHandle.standardError.write(data);fatalError("Actual native Go To path differs")}
 let typedPathBeforeOpen=string(field,kAXValueAttribute)
 pickerKey(36);Thread.sleep(forTimeInterval:0.3)
 pickerNodes=[];pickerScan(app)
 var open:[AXUIElement]=[]
 for e in pickerNodes where string(e,kAXRoleAttribute)=="AXButton"&&string(e,kAXTitleAttribute)=="打开"{if !open.contains(where:{CFEqual($0,e)}){open.append(e)}}
 guard open.count==1,string(open[0],kAXEnabledAttribute)=="1" else{fatalError("Real Open button not enabled")}
 var buttonPid:Int32=0;AXUIElementGetPid(open[0],&buttonPid);guard buttonPid==pid else{fatalError("Open PID mismatch")}
 guard AXUIElementPerformAction(open[0],kAXPressAction as CFString) == .success else{fatalError("Native Open failed")}
 let result:[String:Any]=["pid":pid,"path":args[3],"typedNativePath":typedPathBeforeOpen,"nativeFilePicker":true,"nativeOpen":true]
 print(String(data:try! JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),encoding:.utf8)!)
case "snapshot":output()
case "accessible":
 AXUIElementSetAttributeValue(app,"AXManualAccessibility" as CFString,kCFBooleanTrue)
 Thread.sleep(forTimeInterval:0.3)
 print("{\"pid\":\(pid),\"observer\":\"AXManualAccessibility\"}")
case "activate":
 AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)
 if let windows=attribute(app,kAXWindowsAttribute) as? [AXUIElement],let first=windows.first{AXUIElementPerformAction(first,kAXRaiseAction as CFString)}
 NSRunningApplication(processIdentifier:pid)?.activate(options:[])
 for _ in 0..<50 {if NSWorkspace.shared.frontmostApplication?.processIdentifier==pid {break};Thread.sleep(forTimeInterval:0.02)}
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 print("{\"pid\":\(pid),\"nativeAction\":\"activate\"}")
case "press", "click", "choose":
 guard args.count==5 else{fatalError("press ROLE TITLE_OR_DESCRIPTION")}
 let candidates=nodes.filter {string($0,kAXRoleAttribute)==args[3] && [string($0,kAXTitleAttribute),string($0,kAXDescriptionAttribute)].contains(args[4])}
 var matches:[AXUIElement]=[];for candidate in candidates {if !matches.contains(where:{CFEqual($0,candidate)}){matches.append(candidate)}}
 guard matches.count==1 else{fatalError("Expected unique native AX control, found \(matches.count)")}
 var actual:Int32=0;AXUIElementGetPid(matches[0],&actual);guard actual==pid else{fatalError("AX PID mismatch")}
 if args[2]=="choose" {
  guard args[3]=="AXMenuItem" else{fatalError("Bounded native menu item required")}
  let result=AXUIElementPerformAction(matches[0],kAXPressAction as CFString);guard result == .success else{fatalError("Native menu selection failed")}
  print("{\"pid\":\(pid),\"nativeAction\":\"AX menu selection\"}");exit(0)
 }
 AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)
 if let window=attribute(app,kAXWindowsAttribute) as? [AXUIElement],let first=window.first{AXUIElementPerformAction(first,kAXRaiseAction as CFString)}
 NSRunningApplication(processIdentifier:pid)?.activate(options:[])
 for _ in 0..<25 {if NSWorkspace.shared.frontmostApplication?.processIdentifier==pid {break};Thread.sleep(forTimeInterval:0.02)}

 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 if args[2]=="click" {
  guard let pos=attribute(matches[0],kAXPositionAttribute),let size=attribute(matches[0],kAXSizeAttribute) else{fatalError("No AX geometry")}
  var point=CGPoint.zero;var extent=CGSize.zero
  AXValueGetValue(pos as! AXValue,.cgPoint,&point);AXValueGetValue(size as! AXValue,.cgSize,&extent)
  point.x+=extent.width/2;point.y+=extent.height/2
  for type in [CGEventType.mouseMoved,.leftMouseDown,.leftMouseUp]{CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 }else{let result=AXUIElementPerformAction(matches[0],kAXPressAction as CFString);guard result == .success else{fatalError("AXPress failed \(result)")}}
 print("{\"pid\":\(pid),\"nativeAction\":\"AXPress\"}")
case "point":
 guard args.count==5,let x=Double(args[3]),let y=Double(args[4]) else{fatalError("point X Y")}
 AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)
 if let windows=attribute(app,kAXWindowsAttribute) as? [AXUIElement],let first=windows.first{AXUIElementPerformAction(first,kAXRaiseAction as CFString)}
 Thread.sleep(forTimeInterval:0.2)
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 let point=CGPoint(x:x,y:y)
 for type in [CGEventType.mouseMoved,.leftMouseDown,.leftMouseUp]{CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 print("{\"pid\":\(pid),\"nativeAction\":\"CGEvent mouse\",\"x\":\(x),\"y\":\(y)}")
case "key":
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 guard args.count>=4,let code=UInt16(args[3]) else{fatalError("key CODE [cmd|shift|ctrl|alt]")}
 var flags=CGEventFlags();for flag in args.dropFirst(4){switch flag{case "cmd":flags.insert(.maskCommand);case "shift":flags.insert(.maskShift);case "ctrl":flags.insert(.maskControl);case "alt":flags.insert(.maskAlternate);default:fatalError("Unknown modifier")}}
 for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down)!;e.flags=down ? flags:[];e.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 print("{\"pid\":\(pid),\"nativeAction\":\"CGEvent key\"}")
case "text-keys":
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 guard args.count==4,args[3].count<256 else{fatalError("Bounded native text required")}
 for ch in args[3] {
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID changed during native text")}
  let units=Array(String(ch).utf16)
  for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!;e.flags=[];units.withUnsafeBufferPointer {e.keyboardSetUnicodeString(stringLength:units.count,unicodeString:$0.baseAddress!)};e.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.015)}
 }
 print("{\"pid\":\(pid),\"nativeAction\":\"CGEvent character keys\"}")
case "text":
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{fatalError("Frontmost PID mismatch")}
 guard args.count==4 else{fatalError("text STRING")};let chars=Array(args[3].utf16)
 for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!;e.flags=[];chars.withUnsafeBufferPointer {e.keyboardSetUnicodeString(stringLength:chars.count,unicodeString:$0.baseAddress!)};e.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.05)}
 print("{\"pid\":\(pid),\"nativeAction\":\"CGEvent text\"}")
default:fatalError("Unknown native command")
}

// Test driver for the actual Chrome permission bubble. No permission API,
// profile preference writes, TCC changes or automatic dialog acceptance flags.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function approveNativePermission({pid,evidenceDirectory,timeoutMs=40000}) {
  if(process.platform!=='darwin'||!Number.isSafeInteger(pid)||pid<=0)throw new Error('Real macOS Chrome process required for permission input');
  fs.mkdirSync(evidenceDirectory,{recursive:true});
  const script=accept=>`property remaining : 300
  on nativeNodes(rootNode, depth)
    if depth > 12 then return {}
    set remaining to remaining - 1
    if remaining < 0 then error "Native AX tree exceeds inspection budget"
    tell application "System Events"
      set nodeRole to role of rootNode
      -- Renderer DOM is observed via CDP; only inspect native Chrome controls.
      if nodeRole is "AXWebArea" then return {}
      set answer to {contents of rootNode}
      repeat with childNode in UI elements of rootNode
        set answer to answer & my nativeNodes(contents of childNode, depth + 1)
      end repeat
    end tell
    return answer
  end nativeNodes
  tell application "System Events"
    set candidates to application processes whose unix id is ${pid}
    if (count candidates) is not 1 then error "Owned Chrome process is unavailable"
    tell item 1 of candidates
      if unix id is not ${pid} then error "Chrome AX process identity changed"
      set frontmost to true
      -- Same accessibility initialization as the existing CI permission helper.
      -- This affects only the owned Chrome AX tree, not extension permissions.
      set value of attribute "AXEnhancedUserInterface" to true
      if (count windows) is 0 then return "WAIT: no visible Chrome window"
      set nodes to {}
      set inspectedTitles to ""
    try
    repeat with ownedWindow in windows
        set modalCandidates to {contents of ownedWindow}
        try
          set modalCandidates to modalCandidates & sheets of ownedWindow
        end try
        repeat with candidateWindow in modalCandidates
          set windowTitle to name of candidateWindow as text
          set inspectedTitles to inspectedTitles & windowTitle & linefeed
          -- macOS may leave the permission window's AX title empty while its
          -- native form heading carries the exact request. Web areas remain
          -- excluded; validate the native heading/body/unique Allow below.
          if windowTitle is "missing value" or windowTitle is "" or windowTitle is "OpenDesk Browser" or windowTitle contains "has requested additional permissions" or windowTitle contains "请求获得更多权限" then
            set nodes to nodes & my nativeNodes(contents of candidateWindow, 0)
          end if
        end repeat
    end repeat
    on error axMessage number axNumber
      if axNumber is -1719 then return "WAIT: owned Chrome AX windows changed during inspection"
      error axMessage number axNumber
    end try
      if (count nodes) is 0 then return "WAIT: no exact permission modal; " & inspectedTitles
      set labels to ""
      set allowButtons to {}
      set allowFrames to {}
      repeat with node in nodes
        try
          set nodeRole to role of node
          if nodeRole is "AXStaticText" then
            set labelText to value of node as text
          else
            set labelText to name of node as text
          end if
          set labels to labels & labelText & linefeed
          if nodeRole is "AXButton" and (labelText is "Allow" or labelText is "允许") and enabled of node then
            set coordinates to position of node
            set dimensions to size of node
            set frameKey to (item 1 of coordinates as text) & "," & (item 2 of coordinates as text) & "," & (item 1 of dimensions as text) & "," & (item 2 of dimensions as text)
            -- A macOS modal is reachable both as a window and its parent's
            -- sheet. Deduplicate the same actual control, never distinct buttons.
            if allowFrames does not contain frameKey then
              set end of allowFrames to frameKey
              set end of allowButtons to contents of node
            end if
          end if
        end try
      end repeat
      if labels does not contain "OpenDesk Browser" then return "WAIT: " & labels
      if labels does not contain "has requested additional permissions" and labels does not contain "请求获得更多权限" then return "WAIT: " & labels
      if labels does not contain "Communicate with cooperating native applications" and labels does not contain "与协作的本机应用通信" then return "WAIT: " & labels
      if (count allowButtons) is 0 then return "WAIT: Allow is not enabled yet; " & labels
      if (count allowButtons) is not 1 then error "Native permission Allow button is not unique: " & (allowFrames as text)
      ${accept?'click item 1 of allowButtons':'-- Inspection only; the second call revalidates the exact same permission.'}
      return "${accept?'CLICKED':'MATCH'}: " & labels
    end tell
  end tell`;
  const runScript=async accept=>{
    const started=Date.now();
    try{return await execute('/usr/bin/osascript',['-e',script(accept)],{timeout:35000});}
    catch(error){
      const details={phase:accept?'press':'inspect',elapsedMs:Date.now()-started,code:error.code,killed:error.killed,signal:error.signal,stderr:error.stderr?.slice(0,4000),stdout:error.stdout?.slice(0,4000)};
      fs.writeFileSync(path.join(evidenceDirectory,'native-permission-inspection-error.json'),JSON.stringify(details,null,2));
      console.error('NATIVE_PERMISSION_INPUT_ERROR='+JSON.stringify(details));throw error;
    }
  };
  const until=Date.now()+timeoutMs;let last='';
  while(Date.now()<until) {
    const {stdout}=await runScript(false);
    last=stdout;fs.writeFileSync(path.join(evidenceDirectory,'native-permission-ax.txt'),last);
    if(stdout.startsWith('MATCH:')) {
      try{await execute('/usr/sbin/screencapture',['-x',path.join(evidenceDirectory,'native-permission-before.png')],{timeout:5000});}catch{}
      const clicked=await runScript(true);
      if(!clicked.stdout.startsWith('CLICKED:'))throw new Error('Permission bubble changed before native input');
      return {kind:'macos-accessibility-press',pid,permission:'nativeMessaging',dialog:clicked.stdout.trim()};
    }
    await pause(200);
  }
  throw new Error('Native permission bubble was not safely actionable: '+last.slice(0,1500));
}

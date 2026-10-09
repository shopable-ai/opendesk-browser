// Test driver for the actual Chrome permission bubble. No permission API,
// profile preference writes, TCC changes or automatic dialog acceptance flags.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function approveNativePermission({pid,evidenceDirectory,timeoutMs=15000}) {
  if(process.platform!=='darwin'||!Number.isSafeInteger(pid)||pid<=0)throw new Error('Real macOS Chrome process required for permission input');
  fs.mkdirSync(evidenceDirectory,{recursive:true});
  const script=accept=>`tell application "System Events"
    set candidates to application processes whose unix id is ${pid}
    if (count candidates) is not 1 then error "Owned Chrome process is unavailable"
    tell item 1 of candidates
      set frontmost to true
      if (count windows) is 0 then return "WAIT: no visible Chrome window"
      set nodes to {}
      repeat with ownedWindow in windows
        set nodes to nodes & (entire contents of ownedWindow)
      end repeat
      set labels to ""
      set allowButtons to {}
      repeat with node in nodes
        try
          set labelText to name of node as text
          if role of node is "AXStaticText" then set labelText to value of node as text
          set labels to labels & labelText & linefeed
          if role of node is "AXButton" and enabled of node and (labelText is "Allow" or labelText is "允许") then set end of allowButtons to contents of node
        end try
      end repeat
      if labels does not contain "OpenDesk Browser" then return "WAIT: " & labels
      if labels does not contain "Communicate with cooperating native applications" and labels does not contain "本机应用" and labels does not contain "本机程序" then return "WAIT: " & labels
      if (count allowButtons) is 0 then return "WAIT: Allow is not enabled yet; " & labels
      if (count allowButtons) is not 1 then error "Native permission Allow button is not unique"
      ${accept?'click item 1 of allowButtons':'-- Inspection only; the second call revalidates the exact same permission.'}
      return "${accept?'CLICKED':'MATCH'}: " & labels
    end tell
  end tell`;
  const until=Date.now()+timeoutMs;let last='';
  while(Date.now()<until) {
    const {stdout}=await execute('/usr/bin/osascript',['-e',script(false)],{timeout:5000});
    last=stdout;fs.writeFileSync(path.join(evidenceDirectory,'native-permission-ax.txt'),last);
    if(stdout.startsWith('MATCH:')) {
      try{await execute('/usr/sbin/screencapture',['-x',path.join(evidenceDirectory,'native-permission-before.png')],{timeout:5000});}catch{}
      const clicked=await execute('/usr/bin/osascript',['-e',script(true)],{timeout:5000});
      if(!clicked.stdout.startsWith('CLICKED:'))throw new Error('Permission bubble changed before native input');
      return {kind:'macos-accessibility-press',pid,permission:'nativeMessaging',dialog:clicked.stdout.trim()};
    }
    await pause(200);
  }
  throw new Error('Native permission bubble was not safely actionable: '+last.slice(0,1500));
}

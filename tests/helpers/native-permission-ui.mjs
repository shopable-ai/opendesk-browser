// Test-only macOS accessibility input. No permission API override or storage edit.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function findOwnedChrome(output,{testPid,binary,extension}) {
  const rows=output.split('\n').map(line=>line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .map(([,pid,parent,command])=>({pid:Number(pid),parent:Number(parent),command}));
  const parents=new Map(rows.map(row=>[row.pid,row.parent]));
  const descendant=pid=>{const seen=new Set();while(pid&&!seen.has(pid)){
    if(pid===testPid)return true;seen.add(pid);pid=parents.get(pid);
  }return false;};
  const matches=rows.filter(row=>descendant(row.parent)&&row.command.startsWith(binary+' ')&&
    !row.command.includes(' --type=')&&row.command.includes('--load-extension='+extension+' ')&&
    /--user-data-dir=\/private\/tmp\/odbr-[A-Za-z0-9]+\/browser-profile(?:\s|$)/.test(row.command));
  if(matches.length>1)throw Error('E_NATIVE_UI_AMBIGUOUS: multiple owned Chrome processes');
  return matches[0]?.pid;
}

const script=`on run argv
  set ownedPID to (item 1 of argv) as integer
  tell application "System Events"
    set candidates to application processes whose unix id is ownedPID
    if (count of candidates) is not 1 then return "WAIT"
    set ownedProcess to item 1 of candidates
    set frontmost of ownedProcess to true
    repeat with ownedWindow in windows of ownedProcess
      set labels to ""
      set allowButtons to {}
      repeat with node in entire contents of ownedWindow
        try
          set nodeRole to role of node
          if nodeRole is "AXStaticText" then
            try
              set labels to labels & " " & (value of node as text)
            end try
            try
              set labels to labels & " " & (name of node as text)
            end try
          end if
          if nodeRole is "AXButton" and (name of node as text) is "Allow" then
            set end of allowButtons to contents of node
          end if
        end try
      end repeat
      if labels contains "OpenDesk Browser" and labels contains "native applications" and (count of allowButtons) is 1 then
        click item 1 of allowButtons
        return "CLICKED_NATIVE_PERMISSION"
      end if
    end repeat
    return "WAIT"
  end tell
end run`;

async function main() {
  const testPid=Number(process.argv[2]),binary=process.env.CHROME_FOR_TESTING_BIN;
  if(process.platform!=='darwin'||process.env.CI!=='true'||!Number.isSafeInteger(testPid)||testPid<=1||!binary)
    throw Error('E_NATIVE_UI_SCOPE: requires explicit CI test process and exact CFT binary');
  const extension=resolve('dist/production'),until=Date.now()+85000;
  while(Date.now()<until){
    const ps=spawnSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',timeout:3000});
    if(ps.status!==0)throw Error('E_NATIVE_UI_PS');
    const pid=findOwnedChrome(ps.stdout,{testPid,binary,extension});
    if(pid){
      const result=spawnSync('/usr/bin/osascript',['-e',script,String(pid)],{encoding:'utf8',timeout:5000});
      if(result.status!==0)throw Error('E_NATIVE_UI_UNAVAILABLE: '+(result.stderr||result.error?.message));
      if(result.stdout.trim()==='CLICKED_NATIVE_PERMISSION'){
        console.log('REAL_MACOS_PERMISSION_UI_CLICK='+JSON.stringify({testPid,chromePid:pid,
          extension:'OpenDesk Browser',permission:'native applications',button:'Allow'}));
        return;
      }
    }
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  throw Error('E_NATIVE_UI_NOT_FOUND: matching owned native permission dialog not observed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(error.message);process.exitCode=1;});

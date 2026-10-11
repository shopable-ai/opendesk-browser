// Test driver for the actual Chrome permission bubble. No permission API,
// profile preference writes, TCC changes or automatic dialog acceptance flags.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function approveNativePermission({pid,evidenceDirectory,timeoutMs=40000}) {
  if(process.platform!=='darwin'||!Number.isSafeInteger(pid)||pid<=0)throw new Error('Real macOS Chrome process required for permission input');
  fs.mkdirSync(evidenceDirectory,{recursive:true});
  // System Events can resolve duplicate CFT app names to the wrong process.
  // AXUIElementCreateApplication binds inspection and AXPress to the owned PID.
  const helper=fileURLToPath(new URL('./native-chrome-permission.swift',import.meta.url));
  const runScript=async()=>{
    const started=Date.now();
    try{return await execute('/usr/bin/swift',[helper,String(pid)],{timeout:35000});}
    catch(error){
      if(error.code===2)return {stdout:error.stdout||'WAIT: owned permission dialog not ready'};
      const details={phase:'inspect-and-press',elapsedMs:Date.now()-started,code:error.code,killed:error.killed,signal:error.signal,stderr:error.stderr?.slice(0,4000),stdout:error.stdout?.slice(0,4000)};
      fs.writeFileSync(path.join(evidenceDirectory,'native-permission-inspection-error.json'),JSON.stringify(details,null,2));
      console.error('NATIVE_PERMISSION_INPUT_ERROR='+JSON.stringify(details));throw error;
    }
  };
  const until=Date.now()+timeoutMs;let last='';
  while(Date.now()<until) {
    const {stdout}=await runScript();
    last=stdout;fs.writeFileSync(path.join(evidenceDirectory,'native-permission-ax.txt'),last);
    if(stdout.startsWith('CLICKED:'))
      return {kind:'macos-accessibility-press',pid,permission:'nativeMessaging',dialog:stdout.trim()};
    await pause(200);
  }
  throw new Error('Native permission bubble was not safely actionable: '+last.slice(0,1500));
}

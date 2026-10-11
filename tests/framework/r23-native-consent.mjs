// Native acceptance only: AX object identity is the PID, never an app name.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export async function r23NativeInput(pid,...args){
  const script=fileURLToPath(new URL('./r23-native-consent.swift',import.meta.url));
  return execute('/usr/bin/swift',[script,String(pid),...args],{timeout:10000});
}
export async function approveR23NativePermission({pid,evidenceDirectory}){
  if(process.platform!=='darwin'||!Number.isSafeInteger(pid)||pid<=0)throw Error('Owned macOS CFT PID required');
  const script=fileURLToPath(new URL('./r23-native-consent.swift',import.meta.url)),started=Date.now();let last;
  while(Date.now()-started<40000){
    try{
      const {stdout}=await execute('/usr/bin/swift',[script,String(pid),'--press'],{timeout:10000});
      const receipt={kind:'macos-pid-accessibility-press',pid,permission:'nativeMessaging',elapsedMs:Date.now()-started,nativeInput:stdout.trim()};
      fs.writeFileSync(path.join(evidenceDirectory,'native-permission-pid.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
    }catch(error){if(error.code!==2)throw error;last=error.stdout;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('Exact owned Native permission control unavailable: '+last);
}

// User-authorized PID-bound address-bar input, no Page.navigate or DOM mutation.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
const [sessionPath,url,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),run=promisify(execFile),b='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control',events=[];
if(!['http://127.0.0.1:43111/demo-form.html','http://127.0.0.1:43111/'].includes(url))throw Error('Only authorized fixture and negative path');
for(const args of [['activate'],['key','37','cmd'],['key','0','cmd'],['text',url],['key','36']]){const r=await run(b,[String(s.pid),...args]);events.push({args,output:r.stdout});}
await writeFile(out,JSON.stringify({at:new Date().toISOString(),pid:s.pid,url,events,nativeAddressBar:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pid:s.pid,url,nativeAddressBar:true}));

// Real visible native file-picker transaction, bounded to the owned PID.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
const [sessionPath,catalog,file,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),run=promisify(execFile),b='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control';
const native=async(...args)=>(await run(b,[String(s.pid),...args])).stdout;
const driver=async(...args)=>run(process.execPath,['tests/framework/program-native-acceptance.mjs',...args],{env:{...process.env,PROGRAM_EVIDENCE_DIR:sessionPath.slice(0,sessionPath.lastIndexOf('/'))}});
await driver('activate',catalog);await native('activate');
let state=JSON.parse(await native('pickerstate'));
if(!state.open){await driver('input',catalog,'#task-package-file');for(let i=0;i<20&&!state.open;i++){state=JSON.parse(await native('pickerstate'));if(!state.open)await new Promise(r=>setTimeout(r,100));}}
if(!state.open)throw Error('Actual native Open sheet missing');const observed=JSON.parse(await native('picker',file));
await writeFile(out,JSON.stringify({at:new Date().toISOString(),sessionPath,catalog,file,observed,realFilePicker:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(observed));

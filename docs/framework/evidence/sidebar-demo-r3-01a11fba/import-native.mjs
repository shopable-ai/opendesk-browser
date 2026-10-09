// Real file picker only. PID-guarded native keys; no import API or DOM assignment.
import {readFile,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
const [sessionPath,catalog,file,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath));
const run=promisify(execFile),bin='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control',events=[];
const native=async(...args)=>{const r=await run(bin,[String(s.pid),...args]);events.push({args,output:r.stdout});return r.stdout;};
const driver=async(...args)=>run(process.execPath,['tests/framework/program-native-acceptance.mjs',...args],{env:{...process.env,PROGRAM_EVIDENCE_DIR:sessionPath.slice(0,sessionPath.lastIndexOf('/'))}});
await driver('activate',catalog);await native('activate');
await driver('input',catalog,'#task-package-file');
await native('key','5','cmd','shift');
await native('key','0','cmd');await native('text',file);await native('key','36');
await new Promise(r=>setTimeout(r,350));
const before=JSON.parse(await native('snapshot'));
if(!before.nodes.some(n=>n.role==='AXSheet'&&n.description==='打开') || !before.nodes.some(n=>n.value.includes(file.split('/').at(-1))||n.title.includes(file.split('/').at(-1))))throw Error('Actual open sheet or selected filename missing');
await native('click','AXButton','打开');
await writeFile(out,JSON.stringify({at:new Date().toISOString(),sessionPath,catalog,file,pid:s.pid,events,realFilePicker:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({importPickerOpened:true,file}));

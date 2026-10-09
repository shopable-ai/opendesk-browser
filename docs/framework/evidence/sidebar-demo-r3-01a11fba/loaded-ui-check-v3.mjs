// Actual visible SIDE_PANEL script bytes, read through Debugger; no mutations.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const dir='docs/framework/evidence/sidebar-demo-r3-01a11fba/native-verified',s=JSON.parse(await readFile(dir+'/session.json'));
const ws=new WebSocket(s.endpoint),pending=new Map();let seq=0,sid,resolveParsed;
const scripts=[],parsed=new Promise(r=>resolveParsed=r),url=`chrome-extension://${s.extensionId}/ui/tool-shell.js`;
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
const send=(method,params={},sessionId=sid)=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,{ok,fail});ws.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.fail(Error(JSON.stringify(m.error))):p.ok(m.result);}else if(m.method==='Debugger.scriptParsed'){scripts.push(m.params);if(m.params.url===url)resolveParsed(m.params)};};
try {
 const target=(await send('Target.getTargets',{},null)).targetInfos.find(t=>t.targetId==='84DF12DC48041BF416F46EC02A6FD1FC'&&t.url.includes(s.extensionId));
 if(!target)throw Error('Observed SIDE_PANEL missing');
 sid=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;await send('Debugger.enable');
 await Promise.race([parsed,new Promise(ok=>setTimeout(ok,1000))]); await writeFile(dir+'/actual-ui-scripts-observed.json',JSON.stringify(scripts,null,2)+'\n',{flag:'wx'});let script=scripts.find(p=>p.url===url);if(!script){const diskBytes=await readFile(s.extension+'/ui/tool-shell.js','utf8');for(const p of scripts){const source=(await send('Debugger.getScriptSource',{scriptId:p.scriptId})).scriptSource;if(source===diskBytes){script=p;break}}}if(!script)throw Error('No actual script matching disk; raw script metadata preserved');
 const loaded=(await send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource,disk=await readFile(s.extension+'/ui/tool-shell.js','utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
 const result={at:new Date().toISOString(),target,script,packageHashOnDisk:s.package.packageHash,loadedSha256:hash(loaded),diskSha256:hash(disk),matches:loaded===disk};
 await writeFile(dir+'/actual-loaded-ui-v3.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
} finally {await send('Debugger.disable').catch(()=>{});ws.close();}

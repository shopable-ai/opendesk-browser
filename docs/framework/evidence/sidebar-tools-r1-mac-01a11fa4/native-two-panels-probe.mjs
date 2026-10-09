// Acceptance-only driver: real Side Panels and real bridge/storage calls.
// This does not seed privileged storage or fabricate native acknowledgments.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.env.TOOL_SOURCE_ROOT;
const directory=process.env.TOOL_EVIDENCE_DIR;
const {connect,evaluate}=await import(pathToFileURL(path.join(root,'tests/framework/sidebar-native-session.mjs')));
const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
const client=await connect(session.endpoint);
const output={at:new Date().toISOString(),session,method:'Two actual Chrome windows / embedded SIDE_PANEL contexts; direct public SDK storage calls in real opaque tool frames, no simulated native input or seeded privileged data.'};
try{
 const targets=(await client.send('Target.getTargets')).targetInfos;
 const worker=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
 assert(worker,'Actual worker required');
 const workerSession=(await client.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
 const contexts=await evaluate(client,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})',workerSession);
 output.contexts=contexts;
 assert.equal(contexts.length,2,'Two actual SIDE_PANEL documents required');
 const hosts=targets.filter(t=>t.type==='page'&&t.url.includes('/ui/tool.html?hostInstanceId='));
 assert.equal(hosts.length,2);
 const panels=[];
 for(const host of hosts){
  assert(contexts.some(c=>c.documentUrl===host.url),'Host must be a real SIDE_PANEL context');
  const id=(await client.send('Target.attachToTarget',{targetId:host.targetId,flatten:true})).sessionId;
  const window=await evaluate(client,'chrome.windows.getCurrent()',id);
  const tree=(await client.send('Page.getFrameTree',{},id)).frameTree;
  const iframeCount=await evaluate(client,'document.querySelectorAll("#sidebar-tool-frame iframe").length',id);
  assert.equal(iframeCount,1,'Each actual host has exactly one embedded tool frame');
  const children=targets.filter(t=>t.type==='iframe'&&t.parentId===host.targetId&&t.parentFrameId===tree.frame.id&&t.url.includes('/sidebar-tools/sandbox.html'));
  assert.equal(children.length,1,'Exactly one OOPIF with the actual host parentId and parentFrameId required');
  const target=children[0];
  const toolSession=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const state=await evaluate(client,'({url:location.href,chromeRuntime:typeof chrome?.runtime,note:document.querySelector("#note-text").value})',toolSession);
  assert.equal(state.chromeRuntime,'undefined');
  panels.push({host:host.targetId,window,child:target.targetId,target,frameTree:tree,id:toolSession,state});
 }
 const windows=[...new Set(panels.map(p=>p.window.id))];
 assert.equal(windows.length,2,'Actual host chrome.windows.getCurrent() must resolve two different windows');
 const namespace='opendesk.sidebar-tools.data.v1:quick-notes';
 const read=()=>evaluate(client,'chrome.storage.local.get('+JSON.stringify(namespace)+')',workerSession);
 const before=await read();const pairs=[];
 for(let round=0;round<10;round++){
  const requests=panels.map((p,index)=>({panel:index,key:'race-'+index+'-'+round,value:'真实双面板：'+index+'/'+round}));
  const start=Date.now();
  const responses=await Promise.all(requests.map((r,index)=>evaluate(client,'OpenDeskTool.request("storage.set",'+JSON.stringify({key:r.key,value:r.value})+')',panels[index].id)));
  pairs.push({round,startedAt:start,finishedAt:Date.now(),requests,responses});
 }
 const after=await read();assert.equal(after[namespace].note,before[namespace].note);
 for(const pair of pairs)for(const request of pair.requests)assert.equal(after[namespace][request.key],request.value);
 assert.equal(Object.keys(after[namespace]).length,Object.keys(before[namespace]).length+20);
 output.status='NATIVE_PASS';output.contexts=contexts;output.panels=panels.map(({id,...p})=>p);output.pairs=pairs;output.before=before;output.after=after;
 await writeFile(path.join(directory,'two-panels-storage.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({status:output.status,windows,pairs:pairs.length,preservedFields:20,packageHash:session.package.packageHash}));
}catch(error){output.status='FAILED';output.error=String(error);await writeFile(path.join(directory,'two-panels-storage-failed-'+Date.now()+'.json'),JSON.stringify(output,null,2)+'\n');throw error;}
finally{client.close();}


// Real installed Side Panel + Native provider. Logpoints observe only; no mocked returns.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
import {dir,cfg,launch,attach,click,snapshot,save} from './control.mjs';
const mode=process.argv[2];if(!['provider','stop-switch'].includes(mode))throw Error('Own case required');
const targets=JSON.parse(await readFile(dir+'/session.json','utf8')),scripts=[];
const c=await connect((await readFile(launch.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1],{onEvent:m=>{if(m.method==='Debugger.scriptParsed')scripts.push({...m.params,sessionId:m.sessionId})}});
const native=()=>JSON.parse(execFileSync('/usr/bin/python3',['-c',`import json,sqlite3,pathlib
p=pathlib.Path(${JSON.stringify(cfg.codexHome)})/'thread_history_1.sqlite'
if not p.exists():print('[]')
else:
 c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
 names=[r[1] for r in c.execute('PRAGMA table_info(thread_turns)')];keep=[n for n in ['id','thread_id','turn_id','status','started_at','completed_at'] if n in names]
 print(json.dumps([dict(r) for r in c.execute('SELECT '+','.join(keep)+' FROM thread_turns')]) if keep else '[]')`],{encoding:'utf8'}));
const out={mode,request:`把当前页面放入R211-${mode}-取消验证收藏夹，如果没有，就创建目录`,startedAt:Date.now(),boundary:cfg.candidateBoundary};
let s;const persist=async()=>save(mode+'-real',out);
try{
 s=await attach(c,targets.panelTargetId);await c.send('Debugger.enable',{},s);
 const sc=scripts.find(x=>x.sessionId===s&&x.url.endsWith('/ui/tool-shell.js'));if(!sc)throw Error('Loaded tool source missing');
 const src=(await c.send('Debugger.getScriptSource',{scriptId:sc.scriptId},s)).scriptSource;
 out.sourceSha256=createHash('sha256').update(src).digest('hex');if(out.sourceSha256!==cfg.toolShellSha256)throw Error('Frozen candidate identity mismatch');
 await evaluate(c,`globalThis.__bmLifeSdk=[];globalThis.__bmLifeNative=[];globalThis.__bmLifeEvents=[];globalThis.__bmLifecycleInputs=[];
 document.addEventListener('click',e=>{const n=e.target.closest('button');if(n)globalThis.__bmLifecycleInputs.push({id:n.id,label:n.getAttribute('aria-label'),text:n.textContent,trusted:e.isTrusted,at:Date.now()})},true);
 for(const [name,event] of Object.entries({created:chrome.bookmarks.onCreated,removed:chrome.bookmarks.onRemoved,changed:chrome.bookmarks.onChanged,moved:chrome.bookmarks.onMoved}))event.addListener((id,info)=>globalThis.__bmLifeEvents.push({name,id,info,at:Date.now()}));`,s);
 const lp=async(index,expression)=>{if(index<0)throw Error('Production observation anchor missing');const lines=src.slice(0,index).split('\n');await c.send('Debugger.setBreakpointByUrl',{url:sc.url,lineNumber:lines.length-1,columnNumber:lines.at(-1).length,condition:'('+expression+',false)'},s)};
 const read=src.match(/await ([\w$]+)\.bookmarks\.getTree\(\{limit:100\}\)/),write=src.match(/await ([\w$]+)\.bookmarks\[([\w$]+)\]\(([\w$]+)\)/);
 if(!read||!write)throw Error('SDK anchors missing');
 await lp(read.index,'globalThis.__bmLifeSdk.push({method:"getTree",at:Date.now()})');
 await lp(write.index,`globalThis.__bmLifeSdk.push({method:${write[2]},at:Date.now()})`);
 const start=src.indexOf('for(N.turnId=r.turnId,e.state="RUNNING";');
 await lp(start,'globalThis.__bmLifeNative.push({kind:"plan-ack",sessionId:e.sessionId,threadId:e.threadId,turnId:r.turnId,at:Date.now()})');
 const terminal=src.indexOf('return(c||["CLOSED","DISCONNECTED"].includes(i.state))');
 await lp(terminal,'globalThis.__bmLifeNative.push({kind:"cancel-terminal",state:i.state,terminalStatus:s.status,sessionId:n.sessionId,threadId:n.threadId,turnId:s.turnId,cursor:n.cursor,at:Date.now()})');
 const batch=src.indexOf('if(e.controller.signal.aborted)throw li(e.controller.signal);if(!ri(i)||!Array.isArray(i.events)');
 await lp(batch,'globalThis.__bmLifeNative.push({kind:"cancel-batch",state:i.state,cursor:i.cursor,events:i.events?.map(x=>({type:x.type,sequence:x.sequence,sessionId:x.sessionId,threadId:x.threadId,turnId:x.turnId,status:x.status,error:x.error?{code:x.error.code,outcome:x.error.outcome}:undefined})),at:Date.now()})');
 out.before={tree:await evaluate(c,'chrome.bookmarks.getTree()',s),native:native(),ui:await snapshot(c,s)};await persist();
 await click(c,s,'#od-conversation-input');await evaluate(c,'(()=>{const n=document.querySelector("#od-conversation-input");n.setSelectionRange(0,n.value.length)})()',s);
 await c.send('Input.insertText',{text:out.request},s);await click(c,s,'button[aria-label="发送"]');out.sentAt=Date.now();await persist();console.log(mode+' one actual Send');
 for(let i=0;i<45;i++){const rows=native(),trace=await evaluate(c,'globalThis.__bmLifeNative',s);if(rows.some(x=>x.status==='inProgress'&&!out.before.native.some(y=>y.turn_id===x.turn_id))&&trace.some(x=>x.kind==='plan-ack')){out.inFlight={native:rows,trace,at:Date.now()};break}if(!await evaluate(c,'!!document.querySelector(".od-conversation-phase")',s))break;await new Promise(r=>setTimeout(r,500))}
 if(!out.inFlight)throw Error('Actual in-progress native turn not observed; no cancel action taken');
 out.beforeAction=await snapshot(c,s);out.actionStartedAt=Date.now();
 if(mode==='provider'){
   await click(c,s,'#tab-workflow');await click(c,s,'#workflow-provider-toggle');await click(c,s,'#workflow-source-https');
   out.providerSwitch=await evaluate(c,'({https:document.querySelector("#workflow-source-https")?.getAttribute("aria-pressed"),local:document.querySelector("#workflow-source-local")?.getAttribute("aria-pressed"),at:Date.now()})',s);
   await click(c,s,'#workflow-source-local');await click(c,s,'button[aria-label="关闭 AI 设置"]');await click(c,s,'#tab-tools');
   await click(c,s,'button[aria-label="打开「书签管理」"]');await click(c,s,'button[aria-label="AI 对话"]');
 }else{
   await click(c,s,'button[aria-label="停止"]');out.stopClickedAt=Date.now();
 }
 await persist();console.log(mode+' actual cancellation action performed');
 for(let i=0;i<75;i++){
  const state=await evaluate(c,'({native:globalThis.__bmLifeNative,sdk:globalThis.__bmLifeSdk,events:globalThis.__bmLifeEvents,inputs:globalThis.__bmLifecycleInputs,body:document.body.innerText,at:Date.now()})',s);
  out.observation=state;await persist();
  if(state.native.some(x=>x.kind==='cancel-terminal')){out.terminalObservedAt=Date.now();break}
  if(i%15===0)console.log(mode+' monitoring '+i+'s, native terminal not yet observed');
  await new Promise(r=>setTimeout(r,1000));
 }
 if(mode==='stop-switch'&&out.terminalObservedAt){
   await click(c,s,'#sidebar-tool-back');await click(c,s,'button[aria-label="打开「网页笔记」"]');out.otherTool=await snapshot(c,s);
   await click(c,s,'#sidebar-tool-back');await click(c,s,'button[aria-label="打开「书签管理」"]');await click(c,s,'button[aria-label="AI 对话"]');out.actualInstanceSwitchAt=Date.now();
 }
 out.after={tree:await evaluate(c,'chrome.bookmarks.getTree()',s),native:native(),ui:await snapshot(c,s),traces:await evaluate(c,'({native:globalThis.__bmLifeNative,sdk:globalThis.__bmLifeSdk,events:globalThis.__bmLifeEvents,inputs:globalThis.__bmLifecycleInputs})',s),at:Date.now()};
 const tr=out.after.traces;
 out.checks={oneTrustedSend:tr.inputs.filter(x=>x.label==='发送'&&x.trusted).length===1,realNativeInFlight:!!out.inFlight,noSDKWrites:tr.sdk.every(x=>x.method==='getTree'),noChromeChanges:tr.events.length===0,unchangedTree:JSON.stringify(out.before.tree)===JSON.stringify(out.after.tree),realCancelTerminal:tr.native.some(x=>x.kind==='cancel-terminal'&&x.terminalStatus==='interrupted'),actualProviderSwitch:mode==='provider'?out.providerSwitch?.https==='true':true,actualInstanceSwitch:mode==='stop-switch'?!!out.actualInstanceSwitchAt:true};
 out.status=Object.values(out.checks).every(Boolean)?'PASS_SPECIFIC_REAL_CASE':'NOT_PASS_REVIEW';
 const img=await c.send('Page.captureScreenshot',{format:'png'},s);await writeFile(dir+'/'+mode+'-final.png',Buffer.from(img.data,'base64'));
}catch(e){out.error=String(e);out.status='NOT_PASS_DRIVER_ENVIRONMENT_OR_PRODUCT_REQUIRES_CLASSIFICATION'}finally{await persist();if(s)await c.send('Debugger.disable',{},s).catch(()=>{});c.close();console.log(JSON.stringify({mode,status:out.status,error:out.error,checks:out.checks,providerSwitch:out.providerSwitch,terminal:out.after?.traces?.native?.filter(x=>x.kind==='cancel-terminal')}))}

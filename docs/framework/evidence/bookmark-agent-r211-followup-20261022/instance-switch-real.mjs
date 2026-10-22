// Real UI input, passive SDK logpoints, actual Chrome readback. No replaced API results.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const dir='artifacts/bookmark-agent-r211-followup',l=JSON.parse(await readFile(dir+'/native-launch.json','utf8')),scripts=[];
const c=await connect((await readFile(l.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1],{onEvent:m=>{if(m.method==='Debugger.scriptParsed')scripts.push({...m.params,sessionId:m.sessionId})}});
const resume=process.argv.includes('--resume-same-request');
const out=resume?JSON.parse(await readFile(dir+'/t9-instance-switch-real.json','utf8')):{kind:'T9 real Native model in flight then actual tool instance exit',at:Date.now(),request:'把当前页面放入实例切换验证'+Date.now()+'收藏夹，如果没有，就创建目录'};
if(resume){out.driverCorrection='Initial driver queried nonexistent turns table and matched hidden extension-detail back control; corrected to actual thread_turns and #sidebar-tool-back; resume SAME real request, no new Send.';delete out.error;}
let ps;
const native=()=>JSON.parse(execFileSync('/usr/bin/python3',['-c',`import json,sqlite3,pathlib
cfg=json.loads(pathlib.Path('${dir}/native-runtime.json').read_text());p=pathlib.Path(cfg['codexHome'])/'thread_history_1.sqlite'
if not p.exists():print('[]')
else:
 c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
 names=[r[1] for r in c.execute('PRAGMA table_info(thread_turns)')];keep=[n for n in ['id','thread_id','turn_id','status','started_at','completed_at'] if n in names]
 print(json.dumps([dict(r) for r in c.execute('SELECT '+','.join(keep)+' FROM thread_turns')]) if keep else '[]')
`],{encoding:'utf8'}));
try{
 const targets=(await c.send('Target.getTargets')).targetInfos,p=targets.find(t=>t.url.includes('/sidepanel.html?hostInstanceId='));ps=(await c.send('Target.attachToTarget',{targetId:p.targetId,flatten:true})).sessionId;
 await c.send('Page.bringToFront',{},ps);await c.send('Debugger.enable',{},ps);
 const sc=scripts.find(x=>x.sessionId===ps&&x.url.endsWith('/ui/tool-shell.js')),source=(await c.send('Debugger.getScriptSource',{scriptId:sc.scriptId},ps)).scriptSource,sha=s=>createHash('sha256').update(s).digest('hex');
 if(sha(source)!==sha(await readFile(dir+'/production/ui/tool-shell.js','utf8')))throw Error('Candidate bytes changed');out.sourceSha256=sha(source);
 if(!resume)await evaluate(c,'globalThis.__bmTrace=[];globalThis.__bmSdk=[];globalThis.__bmCreates=[];chrome.bookmarks.onCreated.addListener((id,node)=>globalThis.__bmCreates.push({id,node,at:Date.now()}));document.addEventListener("click",e=>{const label=e.target.closest("button")?.getAttribute("aria-label");if(["发送","返回扩展列表"].includes(label))globalThis.__bmTrace.push({label,trusted:e.isTrusted,at:Date.now()})},true)',ps);
 const write=source.match(/await ([\w$]+)\.bookmarks\[([\w$]+)\]\(([\w$]+)\)/);if(!write)throw Error('No SDK boundary');
 const pre=source.slice(0,write.index).split('\n');await c.send('Debugger.setBreakpointByUrl',{url:sc.url,lineNumber:pre.length-1,columnNumber:pre.at(-1).length,condition:`(globalThis.__bmSdk.push({method:${write[2]},at:Date.now()}),false)`},ps);
 const click=async selector=>{const pt=await evaluate(c,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('No control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Control hidden');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,ps);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...pt},ps)};
 if(!resume){out.before=await evaluate(c,'(async()=>({tree:await chrome.bookmarks.getTree(),body:document.body.innerText,at:Date.now()}))()',ps);out.nativeBefore=native();
 await click('#od-conversation-input');await evaluate(c,'(()=>{const e=document.querySelector("#od-conversation-input");e.setSelectionRange(0,e.value.length)})()',ps);await c.send('Input.insertText',{text:out.request},ps);await click('button[aria-label="发送"]');out.sentAt=Date.now();
 }for(let i=0;i<30;i++){const rows=native();if(rows.some(x=>!out.nativeBefore.some(y=>JSON.stringify(y)===JSON.stringify(x))&&x.status==='inProgress')){out.nativeInFlight=rows;break}await new Promise(r=>setTimeout(r,1000))}
 out.preSwitch=await evaluate(c,'({body:document.body.innerText,trace:globalThis.__bmTrace,sdk:globalThis.__bmSdk,stopVisible:!!document.querySelector("button[aria-label=停止对话]")?.getBoundingClientRect().width,at:Date.now()})',ps);
 if(!out.nativeInFlight)throw Error('No independently observed real Native inProgress turn; do not count as model interruption');
 await click('#sidebar-tool-back');out.switchedAt=Date.now();await new Promise(r=>setTimeout(r,15000));
 out.after=await evaluate(c,'(async()=>({body:document.body.innerText,tree:await chrome.bookmarks.getTree(),trace:globalThis.__bmTrace,sdk:globalThis.__bmSdk,creates:globalThis.__bmCreates,at:Date.now()}))()',ps);out.nativeAfter=native();
 out.checks={oneTrustedSend:out.after.trace.filter(x=>x.label==='发送'&&x.trusted).length===1,trustedExit:out.after.trace.some(x=>x.label==='返回扩展列表'&&x.trusted),realModelInFlight:!!out.nativeInFlight,stopVisible:out.preSwitch.stopVisible,noSDKWrites:out.after.sdk.length===0,noChromeCreates:out.after.creates.length===0,sameChromeTree:JSON.stringify(out.before.tree)===JSON.stringify(out.after.tree)};
 out.status=Object.values(out.checks).every(Boolean)?'PASS_SDK_FENCE_NATIVE_TERMINAL_REVIEW_SEPARATELY':'FAIL';
}catch(e){out.error=String(e);out.status='NOT_PASS_DRIVER_OR_ENVIRONMENT'}finally{await writeFile(dir+'/t9-instance-switch-real.json',JSON.stringify(out,null,2)+'\n');if(ps)await c.send('Debugger.disable',{},ps).catch(()=>{});c.close();console.log(JSON.stringify({status:out.status,error:out.error,checks:out.checks,nativeInFlight:out.nativeInFlight,nativeAfter:out.nativeAfter},null,2))}

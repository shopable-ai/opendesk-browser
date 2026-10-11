// Headed, isolated Mac Chrome. UI writes use trusted Chrome Input or native AX;
// evaluation only observes product state/geometry. No storage/DOM/API injection.
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
const run=process.env.OPENDESK_TIME_REVIEW_NATIVE_RUN||'candidate2';
if(!/^[a-z][a-z0-9-]{0,40}$/.test(run))throw Error('Invalid evidence run');
const root=process.cwd(),directory=path.resolve('docs/framework/workstreams/evidence/time-review-r12-01a12b0d/native',run);
await mkdir(directory,{recursive:true});
const extension=path.resolve('artifacts/time-review-r12',run+'-extension');
await mkdir(path.dirname(extension),{recursive:true});
await cp(path.resolve('dist/production'),extension,{recursive:true});
const packageIdentity=await packageFingerprint(extension);
const binary=path.resolve('tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser=await launchChrome({root,binary,extension,headed:true,directory,label:'time-review-r12',sameProfileRestart:true});
let client=await connect(browser.endpoint),session={...browser.metadata,endpoint:browser.endpoint,extension,package:packageIdentity,version:await client.send('Browser.getVersion')},sequence=0;
const save=(label,data)=>writeFile(path.join(directory,label+'.json'),JSON.stringify(data,null,2)+'\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function guard(){
  const argv=execFileSync('/bin/ps',['-p',String(session.pid),'-o','command='],{encoding:'utf8'});
  if(!argv.includes(binary)||!argv.includes('--user-data-dir='+session.profile)||!argv.includes('--load-extension='+extension))throw Error('Owned CFT identity changed');
}
async function targets(){return (await client.send('Target.getTargets')).targetInfos;}
async function target(kind='host'){
  const all=await targets();
  const selected=kind==='worker'?all.find(row=>row.type==='service_worker'&&row.url.endsWith('/sw.js')):
    kind==='frame'?all.find(row=>row.type==='iframe'&&row.url.includes('/sidebar-tools/sandbox.html')):
    kind==='market'?all.find(row=>row.type==='page'&&row.url.includes('/ui/marketplace.html')):
    kind==='sidepanel'?all.find(row=>row.type==='other'&&row.url.includes('/ui/tool.html')):
    kind==='host'?all.find(row=>['page','other'].includes(row.type)&&row.url.includes('/ui/tool.html')):
    all.find(row=>row.targetId===kind);
  if(!selected)throw Error('Target missing: '+kind);
  const sessionId=(await client.send('Target.attachToTarget',{targetId:selected.targetId,flatten:true})).sessionId;
  if(selected.type!=='service_worker')await client.send('Page.enable',{},sessionId);
  return {...selected,sessionId};
}
async function observe(label){
  await guard();const observations=[];
  for(const row of await targets()){
    if(!['page','other','iframe','service_worker'].includes(row.type))continue;
    const id=(await client.send('Target.attachToTarget',{targetId:row.targetId,flatten:true})).sessionId;
    try{
      const state=await evaluate(client,row.type==='service_worker'?`(async()=>({storage:await chrome.storage.local.get(null),session:await chrome.storage.session.get(null),alarms:await chrome.alarms.getAll(),permissions:await chrome.permissions.getAll(),windows:await chrome.windows.getAll(),tabs:await chrome.tabs.query({}),contexts:await chrome.runtime.getContexts({})}))()`:
        `(()=>{const visible=n=>!!n.getClientRects().length;return {url:location.href,title:document.title,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,controls:[...document.querySelectorAll('[id],button')].filter(visible).map(n=>({id:n.id,text:n.textContent.slice(0,180),value:n.value,disabled:n.disabled,rect:(()=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()}))};})()`,id);
      observations.push({target:row,state});
      if(row.type!=='service_worker'&&(row.url.includes('/ui/')||row.url.includes('/sandbox.html'))){try{const shot=await client.send('Page.captureScreenshot',{format:'png'},id);await writeFile(path.join(directory,label+'-'+row.targetId+'.png'),Buffer.from(shot.data,'base64'));}catch{}}
    }catch(error){observations.push({target:row,error:String(error)});}
  }
  await save(label,{at:new Date().toISOString(),session,observations});
  return {label,targets:observations.map(row=>({id:row.target.targetId,type:row.target.type,url:row.target.url,text:row.state?.text?.slice(0,700),error:row.error}))};
}
async function click(kind,selector){
  await guard();const row=await target(kind);
  const rect=await evaluate(client,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)throw Error('Visible enabled control required');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,row.sessionId);
  await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1},row.sessionId);
  await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1},row.sessionId);
  return {method:'trusted Chrome Input.dispatchMouseEvent',target:row.targetId,selector,rect};
}
async function command(request){
  await guard();const label=String(++sequence).padStart(3,'0')+'-'+request.action;
  let result;
  if(request.action==='open'){
    const url=request.url.replaceAll('{extensionId}',session.extensionId);result=await client.send('Target.createTarget',{url});await client.send('Target.activateTarget',{targetId:result.targetId});
  }else if(request.action==='activate'){await client.send('Target.activateTarget',{targetId:request.targetId});result={activated:request.targetId};}
  else if(request.action==='click')result=await click(request.kind,request.selector);
  else if(request.action==='type'){
    result=await click(request.kind,request.selector);const row=await target(request.kind);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},row.sessionId);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},row.sessionId);
    await client.send('Input.insertText',{text:request.text},row.sessionId);result.text=request.text;
  }else if(request.action==='observe')result=await observe(request.label||label);
  else if(request.action==='ax'){
    const output=execFileSync(path.resolve('artifacts/time-review-r12/native-input'),[String(session.pid),request.command,...(request.label?[request.label]:[])],{encoding:'utf8'});result={nativeAX:true,output};
    if(request.command==='dump')await writeFile(path.join(directory,label+'-ax.txt'),output);
  }else if(request.action==='stop-worker'){
    await client.send('ServiceWorker.enable');const worker=await target('worker');
    await client.send('ServiceWorker.stopAllWorkers');result={oldWorker:worker.targetId};
  }else if(request.action==='restart'){
    await client.send('Browser.close').catch(()=>{});client.close();const next=await browser.restart();client=await connect(next.endpoint);Object.assign(session,next.metadata,{endpoint:next.endpoint});await save('session',session);result={pid:session.pid,sameProfile:next.metadata.restartObserved.sameProfile};
  }else if(request.action==='dialog'){
    const row=await target(request.kind);result=await client.send('Page.handleJavaScriptDialog',{accept:request.accept===true},row.sessionId);
  }else if(request.action==='downloads'){
    const row=await target('worker');result=await evaluate(client,'chrome.downloads.search({})',row.sessionId);
    for(const item of result.filter(item=>item.state==='complete')){try{await cp(item.filename,path.join(directory,'download-'+path.basename(item.filename)));}catch{}}
  }else if(request.action==='stop'){
    await client.send('Browser.close').catch(()=>{});client.close();await browser.copyLog();result=await browser.stop();await save('cleanup',result);console.log(JSON.stringify({label,result}));process.exit();
  }else throw Error('Unknown native command');
  await save(label,{at:new Date().toISOString(),request,result,session});console.log(JSON.stringify({label,result}));
}
for(let i=0;i<100;i++){const sw=(await targets()).find(row=>row.type==='service_worker'&&row.url.endsWith('/sw.js'));if(sw){session.extensionId=sw.url.split('/')[2];break;}await sleep(100);}
if(!session.extensionId)throw Error('Real worker missing');await save('session',session);console.log(JSON.stringify({ready:true,pid:session.pid,extensionId:session.extensionId,endpoint:session.endpoint,packageHash:packageIdentity.packageHash}));
let queue=Promise.resolve();createInterface({input:process.stdin}).on('line',line=>{queue=queue.then(()=>command(JSON.parse(line))).catch(async error=>{await save('error-'+(++sequence),{line,error:String(error),stack:error.stack});console.log(JSON.stringify({failed:true,error:String(error)}));});});
process.on('SIGTERM',()=>{void command({action:'stop'});});

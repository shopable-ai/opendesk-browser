// Actual headed Mac CFT smoke. Business actions use only trusted Chrome Input.
// Runtime evaluations read DOM/contexts/permissions and limited install metadata.
// No injected controls, storage writes, Cookie writes, grants or synthetic events.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture='http://127.0.0.1:43111/demo-form.html';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=JSON.stringify;
const required=name=>{assert(process.env[name],name+' is required');return path.resolve(process.env[name]);};
const extension=required('COOKIE_NATIVE_EXTENSION');
const binary=required('COOKIE_NATIVE_CHROME_BIN');
const evidenceBase=required('COOKIE_NATIVE_EVIDENCE');
const stage=process.env.COOKIE_NATIVE_STAGE==='all'?undefined:process.env.COOKIE_NATIVE_STAGE;
const directory=path.join(evidenceBase,'native-core-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
const driverFile=fileURLToPath(import.meta.url),driverBytes=await readFile(driverFile);
await mkdir(directory,{recursive:true});
const report={mode:'headed-owned-macos-CFT',startedAt:new Date().toISOString(),extension,fixture,
  directory,driver:{path:path.relative(root,driverFile),sha256:hash(driverBytes),bytes:driverBytes.length},scope:'Installed Side Panel core CRUD; all Cookie mutations originate in tool UI; Chrome API reads only',
  cases:Object.fromEntries(['launch','product-side-panel','official-install','active-fixture','read-grant']
    .map(id=>[id,{status:'NOT_TESTED'}])),screenshots:[],steps:[],complete:false};
let launched,client,control,side,sideTargetId,website,currentCase,toolSession;
const targetSessions=new Map();
const trace=[];
// Native assertions may compare synthetic Cookie values in memory. Persisted
// reports, failure envelopes, and Input traces must never contain those values.
const evidenceJson=input=>JSON.stringify(input,(key,value)=>
  key==='value'&&typeof value==='string'?'[REDACTED_COOKIE_VALUE]':value,2)+'\n';
const persist=()=>writeFile(path.join(directory,'native-report.json'),evidenceJson(report));
function requireNativeResource(){
  const active=execFileSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n')
    .map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .filter(([,pid,parent,command])=>command.includes('Chrome for Testing')&&!command.includes('/Helpers/')&&parent!=='1'&&Number(pid)!==launched?.metadata?.pid)
    .filter(([,pid])=>{try{return !/(^|\s)--headless(?:=|\s|$)/.test(execFileSync('ps',['-p',pid,'-ww','-o','command='],{encoding:'utf8'}));}catch{return false;}})
    .map(([,pid,parent])=>({pid:Number(pid),parent:Number(parent)}));
  assert.equal(active.length,0,'E_NATIVE_RESOURCE_BUSY '+JSON.stringify(active));
}
async function fingerprint(){
  const files=[];
  async function scan(dir){
    for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path.join(dir,item.name);
      assert(!item.isSymbolicLink(),'Candidate symlink is not an immutable input: '+file);
      if(item.isDirectory())await scan(file);
      else if(item.isFile())files.push({path:path.relative(extension,file),sha256:hash(await readFile(file))});
    }
  }
  await scan(extension);return {files,sha256:hash(JSON.stringify(files))};
}
function guard(){
  requireNativeResource();
  assert(launched,'Owned launcher is required');
  const m=launched.metadata;
  process.kill(m.pid,0);process.kill(m.launcherPid,0);
  const line=execFileSync('/bin/ps',['-p',String(m.pid),'-ww','-o','pid=,ppid=,command='],{encoding:'utf8'}).trim();
  const parts=line.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
  assert(parts&&Number(parts[1])===m.pid&&Number(parts[2])===m.launcherPid,'Owned Chrome PID/parent changed');
  for(const flag of ['--use-mock-keychain','--user-data-dir='+m.profile,'--load-extension='+extension])
    assert(parts[3].includes(flag),'Owned Chrome lost '+flag);
}
async function read(session,expression){guard();return evaluate(client,expression,session);}
async function until(fn,label,ms=12000){
  const end=Date.now()+ms;let last;
  while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(error){last=error.message;}await sleep(150);}
  throw Error(label+' timed out'+(last?': '+last:''));
}
async function attach(target){
  if(targetSessions.has(target.targetId))return targetSessions.get(target.targetId);
  const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},session);await client.send('Page.enable',{},session);
  targetSessions.set(target.targetId,session);return session;
}
async function click(session,selector){
  // Scroll with actual input, never scrollIntoView or DOM focus/value writes.
  // ResizeObserver can move the sandbox after a confirmation opens. Require
  // two stable native hit-test samples before dispatching one business click.
  let previousPoint;
  const stable=point=>{
    const key=JSON.stringify([point.x,point.y,point.w,point.h,point.width,point.height]);
    const settled=key===previousPoint;previousPoint=key;return settled?point:false;
  };
  const point=await until(async()=>{
    const p=await read(session,`(()=>{const n=document.querySelector(${quote(selector)});
      if(!n||n.disabled||!n.getClientRects().length)return null;
      const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:innerWidth,height:innerHeight,w:r.width,h:r.height,
        hit:x>0&&x<innerWidth&&y>0&&y<innerHeight&&n.contains(document.elementFromPoint(x,y))};})()`);
    if(!p)return false;
    if(p.hit&&p.w>0&&p.h>0){
      if(session===toolSession){
        const frame=await read(side,`(()=>{const n=document.querySelector("#sidebar-tool-frame iframe"),r=n.getBoundingClientRect();
          const x=r.x+${p.x},y=r.y+${p.y};return {x:r.x,y:r.y,width:innerWidth,height:innerHeight,
          hit:x>0&&x<innerWidth&&y>${p.h/2}+85&&y<innerHeight-${p.h/2}-8&&document.elementFromPoint(x,y)===n};})()`);
        if(frame.hit)return stable({...p,x:p.x+frame.x,y:p.y+frame.y});
        previousPoint=undefined;
        const globalY=p.y+frame.y;
        await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.max(8,Math.min(frame.width-8,p.x+frame.x)),
          y:Math.max(8,Math.min(frame.height-8,Math.max(frame.y+16,frame.height/2))),deltaX:0,
          deltaY:globalY<85?-180:180},side);
        await sleep(250);
        return false;
      }
      return stable(p);
    }
    previousPoint=undefined;
    if(p.y<0||p.y>=p.height){
      const frame=session===toolSession?await read(side,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return {x:r.x,y:r.y};})()'):{x:0,y:0};
      await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:frame.x+Math.max(8,Math.min(p.width-8,p.x)),
        y:frame.y+Math.max(8,Math.min(p.height-8,p.height/2)),deltaX:0,deltaY:p.y<0?-250:250},session===toolSession?side:session);
    }else if(session!==toolSession&&!p.hit){
      // A sticky Host approval can cover a scrolled toolbar. Return the
      // parent viewport toward its top through actual wheel input.
      await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.width-12,y:p.height/2,deltaX:0,deltaY:-250},session);
    }
    return false;
  },'Visible real control '+selector);
  guard();
  for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',
    {type,x:point.x,y:point.y,button:'left',clickCount:1},session===toolSession?side:session);
  report.steps.push({at:new Date().toISOString(),input:'CDP Input',selector,session,x:point.x,y:point.y});
  if(session===toolSession)report.steps.at(-1).focused=await read(session,'document.activeElement?.id');
}
async function type(selector,value){
  // ResizeObserver can move the iframe after opening an editor. Confirm real
  // focus before entering text; only refocus, never retry Cookie operations.
  await until(async()=>{
    await click(toolSession,selector);
    return read(toolSession,'document.activeElement===document.querySelector('+quote(selector)+')');
  },'Trusted input focus '+selector);
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},side);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},side);
  await client.send('Input.insertText',{text:value},side);
  assert.equal(await read(toolSession,'document.querySelector('+quote(selector)+').value'),value,'Native input value');
  report.steps.push({at:new Date().toISOString(),input:'CDP trusted text',selector,length:value.length});
}
async function cookies(){
  const rows=await read(control,'chrome.cookies.getAll({domain:"127.0.0.1"}).then(rows=>rows.map(c=>({...c})))');
  (report.nativeReads??=[]).push({at:new Date().toISOString(),case:currentCase,
    cookies:rows.map(({value,...metadata})=>({...metadata,valueRedacted:true}))});
  return rows;
}
async function createCookie(name,value,path='/'){
  await click(toolSession,'#live-new');await type('#cookie-name',name);await type('#cookie-value',value);
  if(path!=='/')await type('#cookie-path',path);
  return save();
}
async function scopedAction(name,path,action){
  const index=await read(toolSession,`[...document.querySelectorAll('#live-cookie-list .cookie-row')].findIndex(n=>
    n.querySelector('.cookie-row-name')?.textContent===${quote(name)}&&n.querySelector('.cookie-row-meta')?.textContent.startsWith(${quote('127.0.0.1'+path+' ·')}))`);
  assert(index>=0,'Visible exact scoped row');
  const selector='#live-cookie-list .cookie-row:nth-child('+(index+1)+')';
  return action==='展开编辑'?selector+' .cookie-row-trigger':
    selector+' button[aria-label='+quote(action+' '+name)+']';
}
async function editCookie(name,path='/'){
  const selector=await scopedAction(name,path,'展开编辑');
  if((await read(toolSession,'document.querySelector('+quote(selector)+')?.getAttribute("aria-expanded")'))!=='true')
    await click(toolSession,selector);
  await until(()=>read(toolSession,'!document.querySelector("#editor-panel").hidden&&document.querySelector('+
    quote(selector)+')?.getAttribute("aria-expanded")==="true"'),'Installed inline editor '+name);
}
async function approveHost(){
  await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Trusted Host approval');
  const message=await read(side,'document.querySelector("#sidebar-tool-action-summary").textContent');
  await click(side,'#sidebar-tool-action-continue');return message;
}
async function deleteCookie(name,path='/'){
  await editCookie(name,path);
  await click(toolSession,await scopedAction(name,path,'删除 Cookie'));
  await click(toolSession,'#confirm-accept');
  const message=await approveHost();
  await until(async()=>!(await cookies()).some(c=>c.name===name&&c.path===path),'Exact deleted slot');
  await until(()=>read(toolSession,'!document.querySelector("#live-new").disabled'),'Delete refresh');
  return {message,cookies:await cookies()};
}
async function advanced(){
  if(!await read(toolSession,'document.querySelector("#browser-permissions").open'))await click(toolSession,'#browser-permissions > summary');
}
async function closeEditor(){
  await click(toolSession,'#editor-cancel');
  if(!await read(toolSession,'document.querySelector("#confirm-panel").hidden'))await click(toolSession,'#confirm-accept');
  await until(()=>read(toolSession,'document.querySelector("#editor-panel").hidden'),'Editor dismissal');
}
async function grant(capability){
  await click(side,'#sidebar-tool-settings-open');
  await click(side,'[data-cookie-capability="'+capability+'"]');
  await until(()=>read(side,'document.querySelector('+quote('[data-cookie-capability="'+capability+'"]')+').dataset.enabled==="true"'),'Trusted '+capability+' grant');
  await click(side,'#sidebar-tool-settings-open');
}
async function bindCookieFrame(){
  const frame=await until(async()=>{
    const src=await read(side,'document.querySelector("#sidebar-tool-frame iframe")?.src');
    if(!src)return null;
    const targets=(await client.send('Target.getTargets')).targetInfos;
    for(const target of targets.filter(t=>t.type==='iframe'&&t.url===src&&t.parentFrameId===sideTargetId)){
      const session=await attach(target);
      if(await read(session,'Boolean(document.querySelector(".cookie-app"))&&document.querySelector("#tool-status")?.dataset.state==="ready"'))return {target,session};
    }
  },'Current installed Cookie iframe');
  toolSession=frame.session;return frame.target;
}
async function observeCookieFrames(){
  const host=await read(side,'({url:location.href,frames:[...document.querySelectorAll("#sidebar-tool-frame iframe")].map(n=>({src:n.src,connected:n.isConnected,visible:!!n.getClientRects().length})),status:document.querySelector("#sidebar-tool-status")?.textContent})');
  const tree=await client.send('Page.getFrameTree',{},side);
  const targets=(await client.send('Target.getTargets')).targetInfos;
  const frames=[];
  for(const target of targets.filter(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html'))){
    try{
      const session=await attach(target);
      const document=await read(session,'({url:location.href,readyState:document.readyState,timeOrigin:performance.timeOrigin,cookieApp:!!document.querySelector(".cookie-app"),status:document.querySelector("#status")?.textContent,text:document.body.innerText.slice(0,1200),scripts:[...document.scripts].map(n=>({src:n.src,type:n.type}))})');
      frames.push({target,session,document});
    }catch(error){frames.push({target,error:error.message});}
  }
  const observation={at:new Date().toISOString(),selectedSession:toolSession,host,tree,frames};
  (report.frameObservations??=[]).push(observation);
  await persist();return observation;
}
async function save(approvals=1){
  await click(toolSession,'#editor-save');
  const messages=[];
  for(let index=0;index<approvals;index++){
    await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Trusted Host approval '+index);
    messages.push(await read(side,'document.querySelector("#sidebar-tool-action-summary").textContent'));
    await click(side,'#sidebar-tool-action-continue');
  }
  await until(()=>read(toolSession,'document.querySelector("#editor-panel").hidden'),'Editor closed after verified operation');
  await until(()=>read(toolSession,'!document.querySelector("#live-new").disabled'),'Refreshed Cookie UI');
  return {messages,status:await read(toolSession,'document.querySelector("#status").textContent'),cookies:await cookies()};
}
// R4.3 editor/delete operations are scoped by exact name and Cookie Path.
async function screenshot(name){
  if(!side)return;
  guard();const image=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},side);
  const bytes=Buffer.from(image.data,'base64'),filename=name+'.png';await writeFile(path.join(directory,filename),bytes);
  report.screenshots.push({case:currentCase,file:filename,sha256:hash(bytes)});
}
async function step(id,fn){
  currentCase=id;console.log('COOKIE_NATIVE_START '+id);
  report.cases[id]={status:'RUNNING',startedAt:new Date().toISOString()};await persist();
  try{const observations=await fn();await screenshot(id);report.cases[id]={status:'PASS',observations};}
  catch(error){report.cases[id]={status:'FAIL',error:error.stack};try{if(side)await observeCookieFrames();await screenshot(id+'-failure');
    if(toolSession)report.cases[id].ui=await read(toolSession,'({text:document.body.innerText,active:document.activeElement?.id,scroll:scrollY,height:innerHeight,form:[...document.querySelectorAll("#editor-form input,#editor-form textarea,#editor-form button")].map(n=>({id:n.id,value:n.value,disabled:n.disabled,valid:n.validity?.valid,rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}}))})');
  }catch(e){report.cases[id].screenshotError=e.message;}throw error;}
  finally{report.cases[id].finishedAt=new Date().toISOString();await writeFile(path.join(directory,id+'-receipt.json'),
    evidenceJson({candidate:report.candidate,launch:report.launch,case:report.cases[id]}));await persist();}
  console.log('COOKIE_NATIVE_PASS '+id);
}
try{
  assert.equal(process.platform,'darwin','Headed Mac CFT only');
  const pinnedBinary=path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  assert.equal(path.basename(await realpath(binary)),'Google Chrome for Testing','Explicit CFT executable required');
  assert.equal(hash(await readFile(binary)),hash(await readFile(pinnedBinary)),'Owned app must retain the pinned CFT executable');
  assert(!extension.endsWith('/dist/development'),'Daily development extension is not this immutable candidate');
  const manifest=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
  const catalog=JSON.parse(await readFile(path.join(extension,'official-tools/catalog.json'),'utf8'));
  const release=catalog.apps.find(row=>row.toolId==='cookie-editor');assert(release,'Official Cookie release missing');
  const pkgBytes=await readFile(path.join(extension,'official-tools/cookie-editor/cookie-editor.opendesk-tool.json'));
  const pkg=JSON.parse(pkgBytes);const declared=JSON.parse(await readFile(path.join(root,'examples/sidebar-tools/cookie-editor/tool.config.json'),'utf8'));
  assert.equal(pkg.version,process.env.COOKIE_NATIVE_VERSION||declared.version);assert.equal(pkg.version,release.version);
  assert.equal(hash(pkgBytes),release.sha256);assert.equal(manifest.manifest_version,3);
  report.candidate={extensionFingerprint:await fingerprint(),toolVersion:pkg.version,toolFileSha256:hash(pkgBytes)};
  report.candidate.extensionPackage=await packageFingerprint(extension);
  const sourceCommit=process.env.COOKIE_NATIVE_CANDIDATE_SHA,receiptPath=process.env.COOKIE_NATIVE_BUILD_RECEIPT;
  assert.equal(Boolean(sourceCommit),Boolean(receiptPath),'Provide source commit and build receipt together');
  if(sourceCommit){
    assert(/^[0-9a-f]{40}$/.test(sourceCommit));
    const receiptBytes=await readFile(receiptPath),receipt=JSON.parse(receiptBytes);
    assert.equal(receipt.status,'passed');assert.deepEqual(receipt.sourceDriftDuringBuild,[]);
    assert.equal(receipt.report.packageHash,report.candidate.extensionPackage.packageHash);
    assert(receipt.sourceInputs.length>0);
    for(const input of receipt.sourceInputs){
      const source=execFileSync('git',['show',sourceCommit+':'+input.path],{cwd:root,maxBuffer:32*1024*1024});
      assert.equal(hash(source),input.sha256);assert.equal(source.length,input.bytes);
    }
    report.candidate.sourceCommit=sourceCommit;
    report.candidate.buildReceipt={path:receiptPath,sha256:hash(receiptBytes),bytes:receiptBytes.length};
  }
  requireNativeResource();
  const fixtureResponse=await fetch(fixture,{signal:AbortSignal.timeout(5000)});assert(fixtureResponse.ok,'Existing canonical fixture unavailable');
  await step('launch',async()=>{
    launched=await launchChrome({root,binary,extension,headed:true,directory,label:'cookie-r33-core'});
    report.launch=launched.metadata;guard();
    client=await connect(launched.endpoint,{onCommand:entry=>trace.push({at:new Date().toISOString(),...entry}),
      onEvent:entry=>{if(['Target.targetCreated','Target.targetDestroyed','Runtime.exceptionThrown'].includes(entry.method))trace.push(entry);}});
    await client.send('Target.setDiscoverTargets',{discover:true});
    const version=await client.send('Browser.getVersion');assert(version.product.includes('Chrome/155.'),'Expected pinned CFT 155');
    const worker=await until(async()=> (await client.send('Target.getTargets')).targetInfos.find(t=>
      t.type==='service_worker'&&t.url.startsWith('chrome-extension://')&&t.url.endsWith('/sw.js')),'Candidate MV3 worker',20000);
    report.extensionId=new URL(worker.url).hostname;
    return {version,extensionId:report.extensionId,pid:report.launch.pid,profile:report.launch.profile};
  });
  await step('product-side-panel',async()=>{
    const target=await client.send('Target.createTarget',{url:'chrome-extension://'+report.extensionId+'/ui/tool.html?hostInstanceId='+randomUUID()});
    control=await attach(target);
    await click(control,'#catalog-open-dev-sidebar');
    const context=await until(async()=> (await read(control,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})"))
      .find(c=>c.documentId&&c.documentUrl.startsWith('chrome-extension://'+report.extensionId+'/ui/tool.html')),'Actual SIDE_PANEL context');
    const targetInfo=await until(async()=> (await client.send('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl),'Actual Side Panel CDP target');
    sideTargetId=targetInfo.targetId;
    side=await attach(targetInfo);report.sidePanelContext=context;
    await click(side,'#tab-tools');return {context,targetInfo};
  });
  await step('official-install',async()=>{
    const imported=stage==='upgrade';
    if(imported){
      const file=required('COOKIE_NATIVE_OLD_TOOL');
      const old=JSON.parse(await readFile(file,'utf8'));assert.equal(old.version,'2.0.3');
      await click(side,'#sidebar-tool-import-trigger');await click(side,'#sidebar-tool-file');
      report.externalFilePicker={pid:launched.metadata.pid,path:file,sha256:hash(await readFile(file)),version:old.version};
      await persist();console.log('COOKIE_NATIVE_FILE_PICKER '+JSON.stringify(report.externalFilePicker));
      await until(()=>read(side,'!document.querySelector("#sidebar-tool-preview").hidden'),'Actual Mac file chooser upload',600000);
    }else{
      await click(side,'#sidebar-tool-discover-toggle');await click(side,'#sidebar-tool-official-cookie-editor-install');
    }
    await until(()=>read(side,'!!document.querySelector("#sidebar-tool-preview")&&!document.querySelector("#sidebar-tool-preview").hidden'),'Visible official review');
    const preview=await read(side,'({title:document.querySelector("#sidebar-tool-preview-title")?.textContent,version:document.querySelector("#sidebar-tool-preview-version")?.textContent,frames:document.querySelectorAll("#sidebar-tool-frame iframe").length})');
    assert(preview.title.includes('Cookie'));assert(preview.version.includes(imported?'2.0.3':pkg.version));assert.equal(preview.frames,0);
    await click(side,'#sidebar-tool-install');
    const open='[data-sidebar-tool-action="open"][data-sidebar-tool-id="cookie-editor"]';
    await until(()=>read(side,'Boolean(document.querySelector('+quote(open)+'))'),'Installed Cookie list item');
    const installed=await read(side,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.revocation-epochs.v1"]).then(v=>{const t=v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="cookie-editor");return t?{id:t.id,version:t.version,capabilities:t.capabilities,installEpoch:v["opendesk.sidebar-tools.revocation-epochs.v1"]?.[t.id]??null}:null;})');
    assert.equal(installed?.version,imported?'2.0.3':pkg.version);await click(side,open);return {preview,installed};
  });
  await step('active-fixture',async()=>{
    const target=await client.send('Target.createTarget',{url:fixture});website=await attach(target);
    await client.send('Target.activateTarget',{targetId:target.targetId});
    await until(()=>read(website,'location.href==='+quote(fixture)+'&&document.readyState==="complete"'),'Canonical fixture loaded');
    await click(side,'#sidebar-tool-settings-open');
    const state=await until(()=>read(side,`(()=>{const p=document.querySelector('.sidebar-tool-cookie-permissions');
      return p&&!p.hidden&&p.innerText.includes('127.0.0.1')?{text:p.innerText,
        buttons:[...p.querySelectorAll('[data-cookie-capability]')].map(n=>({capability:n.dataset.cookieCapability,enabled:n.dataset.enabled,disabled:n.disabled}))}:null;})()`),'Cookie settings bound to active canonical fixture');
    return {targetId:target.targetId,url:await read(website,'location.href'),settings:state};
  });
  await step('first-use-combined-grant',async()=>{
    const permissions=await read(side,'Promise.all([chrome.permissions.contains({permissions:["cookies"]}),chrome.permissions.contains({origins:["http://127.0.0.1/*"]})]).then(([cookies,site])=>({cookies,site}))');
    report.nativePermissionObservation=permissions;
    // Only the trusted Side Panel can receive this real user's combined grant.
    const firstUse=await read(side,'!document.querySelector(".sidebar-tool-cookie-first-use").hidden');
    assert(firstUse,'Official first-use review is visible');
    await click(side,'.sidebar-tool-cookie-first-use button:first-child');
    const grant=await until(()=>read(side,'(()=>{const read=document.querySelector("[data-cookie-capability=read]"),write=document.querySelector("[data-cookie-capability=write]");return read?.dataset.enabled==="true"&&write?.dataset.enabled==="true"?{read:true,write:true}:null;})()'),'Combined trusted read/write grant',10000);
    await screenshot('first-use-combined-grant-settings');
    if(await read(side,'!document.querySelector("#sidebar-tool-settings-view").hidden'))
      await click(side,'#sidebar-tool-settings-open');
    const target=await bindCookieFrame();
    report.sandbox=target;
    await observeCookieFrames();
    const ui=await until(()=>read(toolSession,'(()=>{const n=document.querySelector("#browser-state"),create=document.querySelector("#live-new"),filters=document.querySelector("#live-filters");return n?.hidden===true&&create&&!create.disabled&&filters&&!filters.hidden?{statusHidden:n.hidden,newEnabled:!create.disabled,filtersVisible:!filters.hidden,heading:document.querySelector("#browser-state-heading")?.textContent,detail:document.querySelector("#browser-state-detail")?.textContent,count:document.querySelector("#live-count")?.textContent,host:document.querySelector("#site-host")?.textContent}:null;})()'),'Granted Cookie metadata UI ready');
    assert(ui.host.includes('127.0.0.1'));return {permissions,grant,ui,sandbox:target};
  });
  await step('write-grant-reuse',async()=>{
    const grant=await read(side,'document.querySelector("[data-cookie-capability=write]").dataset.enabled');
    assert.equal(grant,'true','First-use combined grant already included write; no repeated prompt');
    return {capability:'write',alreadyGranted:true,cookies:await cookies()};
  });
  if(process.env.COOKIE_NATIVE_SUITE!=='extended'||process.env.COOKIE_NATIVE_STAGE==='all'){
  await step('new-cookie',async()=>{
    await click(toolSession,'#live-new');await type('#cookie-name','od_core');await type('#cookie-value','fictional-one');
    const result=await save();assert(result.cookies.some(c=>c.name==='od_core'&&c.value==='fictional-one'&&c.path==='/'));
    assert((await read(toolSession,'document.querySelector("#live-cookie-list").textContent')).includes('敏感值未读取'));
    assert(!(await read(toolSession,'document.querySelector("#live-cookie-list").textContent')).includes('fictional-one'));
    return result;
  });
  await step('edit-value',async()=>{
    await editCookie('od_core');await type('#cookie-value','fictional-two');
    const result=await save();assert(result.cookies.some(c=>c.name==='od_core'&&c.value==='fictional-two'));return result;
  });
  await step('rename-with-new-value',async()=>{
    await editCookie('od_core');await type('#cookie-name','od_renamed');await type('#cookie-value','fictional-three');
    const result=await save(2);assert(!result.cookies.some(c=>c.name==='od_core'));
    assert(result.cookies.some(c=>c.name==='od_renamed'&&c.value==='fictional-three'));return result;
  });
  await step('values-grant',async()=>{await grant('values');return {capability:'values'};});
  await step('rename-preserve-hidden-value',async()=>{
    await editCookie('od_renamed');assert.equal(await read(toolSession,'document.querySelector("#cookie-value").value'),'');
    await type('#cookie-name','od_kept');const result=await save(2);
    assert(!result.cookies.some(c=>c.name==='od_renamed'));assert(result.cookies.some(c=>c.name==='od_kept'&&c.value==='fictional-three'));
    return result;
  });
  await step('exact-delete',async()=>{
    await editCookie('od_kept');
    await click(toolSession,await scopedAction('od_kept','/','删除 Cookie'));
    await click(toolSession,'#confirm-accept');
    await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Trusted delete confirmation');
    await click(side,'#sidebar-tool-action-continue');
    await until(async()=>!(await cookies()).some(c=>c.name==='od_kept'),'Native exact Cookie absence');
    await until(()=>read(toolSession,'document.querySelector("#live-count").textContent==="0 / 0 条 Cookie"'),'Delete UI reread');
    return {cookies:await cookies(),status:await read(toolSession,'document.querySelector("#status").textContent')};
  });
  }
  if(process.env.COOKIE_NATIVE_SUITE==='extended'){
    if(stage==='visual'){
      await step('native-width-zoom-captures',async()=>{
        await createCookie('od_visual_long_fictional_name_for_wrapping','invented-hidden');
        const baseline=await read(side,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,url:location.href})');
        const toolBaseline=await read(toolSession,'({width:innerWidth,dpr:devicePixelRatio})');
        const websiteBaseline=await read(website,'({width:innerWidth,dpr:devicePixelRatio})');
        report.externalVisualControl={pid:launched.metadata.pid,url:baseline.url,directory,baseline,toolBaseline};await persist();
        console.log('COOKIE_NATIVE_VISUAL_CONTROL '+JSON.stringify(report.externalVisualControl));
        const samples=[];let prior='';const deadline=Date.now()+600000;
        while(Date.now()<deadline){
          const parent=await read(side,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,url:location.href})');
          const ui=await read(toolSession,'({width:innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,hiddenValue:!document.querySelector("#live-cookie-list").textContent.includes("invented-hidden"),text:document.querySelector("#live-cookie-list").textContent})');
          const page=await read(website,'({width:innerWidth,dpr:devicePixelRatio})');
          const stamp=JSON.stringify([parent.width,parent.height,parent.dpr,ui.width,ui.dpr,page.dpr]);
          if(stamp!==prior){
            prior=stamp;
            const sample={parent,ui,page,zoomFromStableDisplayDpr:ui.dpr/toolBaseline.dpr,browserPageZoom:page.dpr/websiteBaseline.dpr};samples.push(sample);
            await screenshot('visual-'+samples.length+'-'+ui.width+'-panel'+Math.round(sample.zoomFromStableDisplayDpr*100)+'-page'+Math.round(sample.browserPageZoom*100));
            report.visualSamples=samples;await persist();
          }
          if((await readdir(directory)).includes('visual-complete.json'))break;
          await sleep(250);
        }
        assert((await readdir(directory)).includes('visual-complete.json'),'Native visual controller completion');
        return {baseline,samples};
      });
    }
    if(process.env.COOKIE_NATIVE_STAGE==='all'){
      await step('revoke-values-before-negative-cases',async()=>{
        await click(side,'#sidebar-tool-settings-open');await click(side,'[data-cookie-capability="values"]');
        await until(()=>read(side,'document.querySelector("[data-cookie-capability=values]").dataset.enabled==="false"'),'Sensitive values revoked');
        await click(side,'#sidebar-tool-settings-open');
        await until(()=>read(toolSession,'!document.querySelector("#live-new").disabled'),'Revoked UI refreshed');
        return {values:false};
      });
    }
    if(stage==='upgrade'){
      await step('explicit-upgrade',async()=>{
        await click(side,'#sidebar-tool-back');
        if(await read(side,'document.querySelector("#sidebar-tool-discover-panel").hidden'))await click(side,'#sidebar-tool-discover-toggle');
        await click(side,'#sidebar-tool-filter-all');
        await click(side,'#sidebar-tool-official-cookie-editor-install');
        await until(()=>read(side,'!document.querySelector("#sidebar-tool-preview").hidden'),'New official package review');
        const review=await read(side,'({versions:document.querySelector("#sidebar-tool-update-versions").textContent,warning:document.querySelector("#sidebar-tool-update-warning").textContent})');
        assert(review.versions.includes('2.0.3')&&review.versions.includes(pkg.version));
        await click(side,'#sidebar-tool-install');
        await until(()=>read(side,`chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="cookie-editor")?.version===${quote(pkg.version)})`),'Explicit upgraded package persisted');
        await click(side,'[data-sidebar-tool-action="open"][data-sidebar-tool-id="cookie-editor"]');await bindCookieFrame();
        await click(side,'#sidebar-tool-settings-open');
        const grants=await read(side,'[...document.querySelectorAll("[data-cookie-capability]")].map(n=>({cap:n.dataset.cookieCapability,enabled:n.dataset.enabled}))');
        assert(grants.every(row=>row.enabled==='false'),'Old package grants cannot authorize the new revision');
        await click(side,'#sidebar-tool-settings-open');await grant('read');await grant('write');
        return {review,grants,toolVersion:pkg.version};
      });
      await step('upgraded-tool-save-and-delete',async()=>{
        const result=await createCookie('od_upgrade','invented-upgrade');assert(result.cookies.some(c=>c.name==='od_upgrade'));
        return deleteCookie('od_upgrade');
      });
    }
    if(stage==='partial'){
      await step('rename-partial-cancelled-old-delete',async()=>{
        await createCookie('od_partial','invented-old');await editCookie('od_partial');
        await type('#cookie-name','od_partial_new');await type('#cookie-value','invented-new');await click(toolSession,'#editor-save');
        const write=await approveHost();
        await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Separate old-name delete approval');
        const remove=await read(side,'document.querySelector("#sidebar-tool-action-summary").textContent');assert(remove.includes('删除'));
        await click(side,'#sidebar-tool-action-cancel');
        await until(()=>read(toolSession,'document.querySelector("#status").textContent.includes("旧名称删除未确认")'),'Accurate partial completion message');
        const rows=await cookies();assert(rows.some(c=>c.name==='od_partial'&&c.value==='invented-old'));
        assert(rows.some(c=>c.name==='od_partial_new'&&c.value==='invented-new'));
        await sleep(350);assert.equal((await cookies()).length,2,'No automatic retry');
        return {write,remove,cookies:rows,status:await read(toolSession,'document.querySelector("#status").textContent')};
      });
    }
    if(!stage||stage==='negative'){
    await step('conflict-preserves-original',async()=>{
      await createCookie('od_original','invented-original');await createCookie('od_taken','invented-protected');
      await editCookie('od_original');await type('#cookie-name','od_taken');await type('#cookie-value','invented-replacement');
      await click(toolSession,'#editor-save');
      await until(()=>read(toolSession,'document.querySelector("#status").textContent.includes("已存在")'),'Same slot rename conflict');
      const rows=await cookies();assert(rows.some(c=>c.name==='od_original'&&c.value==='invented-original'));
      assert(rows.some(c=>c.name==='od_taken'&&c.value==='invented-protected'));
      assert(await read(side,'document.querySelector("#sidebar-tool-action-review").hidden'));
      await closeEditor();return {cookies:rows,status:await read(toolSession,'document.querySelector("#status").textContent')};
    });
    await step('hidden-value-needs-grant',async()=>{
      await editCookie('od_original');await type('#cookie-name','od_hidden_blocked');await click(toolSession,'#editor-save');
      await until(()=>read(toolSession,'document.querySelector("#status").textContent.includes("保留旧值需")'),'Hidden old value authorization gate');
      const rows=await cookies();assert(!rows.some(c=>c.name==='od_hidden_blocked'));assert(rows.some(c=>c.name==='od_original'&&c.value==='invented-original'));
      await closeEditor();return {cookies:rows};
    });
    }
    if(!stage||['negative','path'].includes(stage)){
    await step('same-name-path-isolation',async()=>{
      const first=await createCookie('od_path','invented-root');assert(first.cookies.some(c=>c.name==='od_path'&&c.path==='/'&&c.value==='invented-root'));
      const second=await createCookie('od_path','invented-exact','/demo-form.html');assert.equal(second.cookies.filter(c=>c.name==='od_path').length,2,'Both path slots exist before deletion');
      const result=await deleteCookie('od_path','/demo-form.html');assert(result.cookies.some(c=>c.name==='od_path'&&c.path==='/'&&c.value==='invented-root'));return result;
    });
    }
    if(!stage||stage==='advanced'){
    await step('import-ui',async()=>{
      // R4.3: do not confuse read-only preview with actual native mutation.
      await click(toolSession,'#live-import');
      await type('#import-text',JSON.stringify([{name:'od_import_a',value:'invented-import-a',domain:'127.0.0.1',path:'/',hostOnly:true,session:true},
        {name:'od_import_b',value:'invented-import-b',domain:'127.0.0.1',path:'/',hostOnly:true,session:true}]));
      await click(toolSession,'#import-apply');
      const preview=await until(()=>read(toolSession,'(()=>{const n=document.querySelector("#live-import-preview");return n&&!n.hidden&&n.textContent.includes("新增 2")?n.textContent:null;})()'),'Read-only import preview');
      assert(!(await cookies()).some(c=>c.name==='od_import_a'),'Preview never writes Chrome');
      await click(toolSession,'#live-import-confirm');
      await click(toolSession,'#confirm-accept');
      const messages=[];
      messages.push(await approveHost());messages.push(await approveHost());
      await until(()=>read(toolSession,'document.querySelector("#status").textContent.includes("确认导入 2 条")'),'Verified import');
      const rows=await cookies();assert(rows.some(c=>c.name==='od_import_a'&&c.value==='invented-import-a'));
      assert(rows.some(c=>c.name==='od_import_b'&&c.value==='invented-import-b'));return {preview,messages,cookies:rows};
    });
    await step('values-grant',async()=>{await grant('values');return {capability:'values'};});
    await step('export-ui',async()=>{
      const downloads=path.join(directory,'downloads');await mkdir(downloads,{recursive:true});
      await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
      await click(toolSession,'#live-export');
      await until(()=>read(toolSession,'!document.querySelector("#live-export-panel").hidden'),'Inline export panel');
      assert.equal(await read(toolSession,'document.querySelector("#live-export-content").value'),'backup');
      assert.equal(await read(toolSession,'document.querySelector("#live-export-format").value'),'json');
      await click(toolSession,'#live-export-confirm');
      await click(toolSession,'#confirm-accept');
      await approveHost();
      const files=await until(async()=>{const rows=(await readdir(downloads)).filter(n=>n.endsWith('.json'));return rows.length?rows:null;},'Real downloaded JSON');
      const bytes=await readFile(path.join(downloads,files[0]));const text=bytes.toString('utf8');
      assert(text.includes('invented-import-a'));return {files,sha256:hash(bytes),bytes:bytes.length};
    });
    await step('observe-ui',async()=>{
      await grant('observe');await advanced();await click(toolSession,'.browser-observe > summary');await click(toolSession,'#live-observe-start');
      await approveHost();
      await until(()=>read(toolSession,'!document.querySelector("#live-observe-read").disabled'),'Observe session started');
      await createCookie('od_observed','invented-observed');await advanced();await click(toolSession,'#live-observe-read');
      await until(()=>read(toolSession,'document.querySelector("#live-observe-events").textContent.includes("od_observed")'),'Scoped native change event');
      const events=await read(toolSession,'document.querySelector("#live-observe-events").textContent');assert(!events.includes('invented-observed'));
      await click(toolSession,'#live-observe-stop');await until(()=>read(toolSession,'document.querySelector("#live-observe-status").textContent==="已停止观察。"'),'Observe stopped');
      return {events};
    });
    await step('clear-ui',async()=>{
      await grant('clear');await advanced();await click(toolSession,'#live-clear');await click(toolSession,'#confirm-accept');const message=await approveHost();
      await until(async()=>(await cookies()).length===0,'Verified scoped clear');return {message,cookies:await cookies()};
    });
    }
    if(!stage||stage==='lifecycle'){
    await step('close-and-reopen',async()=>{
      await createCookie('od_reopen','invented-reopen');await click(side,'#sidebar-tool-back');
      await until(()=>read(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),'Old tool instance closed');
      await click(side,'[data-sidebar-tool-action="open"][data-sidebar-tool-id="cookie-editor"]');
      const frame=await bindCookieFrame();
      await until(()=>read(toolSession,'document.querySelector("#live-cookie-list").textContent.includes("od_reopen")'),'Existing grant automatic reread');
      assert(!await read(toolSession,'document.querySelector("#live-cookie-list").textContent.includes("invented-reopen")'));
      return {frame,cookies:await cookies()};
    });
    await step('revoked-pending-write',async()=>{
      await click(toolSession,'#live-new');await type('#cookie-name','od_revoked');await type('#cookie-value','invented-revoked');await click(toolSession,'#editor-save');
      await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Pending real write approval');
      await click(side,'#sidebar-tool-settings-open');await click(side,'[data-cookie-capability="write"]');
      await until(()=>read(side,'document.querySelector("[data-cookie-capability=write]").dataset.enabled==="false"'),'Write grant revoked');
      assert(!(await cookies()).some(c=>c.name==='od_revoked'));
      const pending=await read(side,'({hidden:document.querySelector("#sidebar-tool-action-review").hidden,disabled:document.querySelector("#sidebar-tool-action-continue").disabled})');
      if(!pending.hidden&&!pending.disabled)await click(side,'#sidebar-tool-action-continue');
      await sleep(250);assert(!(await cookies()).some(c=>c.name==='od_revoked'));
      await click(side,'[data-cookie-capability="write"]');await until(()=>read(side,'document.querySelector("[data-cookie-capability=write]").dataset.enabled==="true"'),'New write grant');
      await click(side,'#sidebar-tool-settings-open');await sleep(250);assert(!(await cookies()).some(c=>c.name==='od_revoked'));
      return {pending,cookies:await cookies(),status:await read(toolSession,'document.querySelector("#status").textContent')};
    });
    await step('disable-with-pending-write',async()=>{
      if(!await read(toolSession,'document.querySelector("#editor-panel").hidden'))await closeEditor();
      await click(toolSession,'#live-new');await type('#cookie-name','od_disabled');await type('#cookie-value','invented-disabled');await click(toolSession,'#editor-save');
      await until(()=>read(side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'Pending write before disable');
      await click(side,'#sidebar-tool-settings-open');await click(side,'#sidebar-tool-enable');
      // A pending save is intentionally protected from dirty-discard stop.
      // Cancel its Host approval, then explicitly confirm stopping the draft.
      const busyRefusal=await read(side,'document.querySelector("#sidebar-tool-status").textContent');
      assert.equal(await read(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),1);
      assert(!(await cookies()).some(c=>c.name==='od_disabled'));
      await click(side,'#sidebar-tool-action-cancel');
      await until(()=>read(toolSession,'!document.querySelector("#editor-save").disabled'),'Cancelled pending write settled');
      await click(side,'#sidebar-tool-enable');
      if(!await read(side,'document.querySelector("#sidebar-tool-action-review").hidden')){
        const decision=await read(side,'document.querySelector("#sidebar-tool-action-summary").textContent');
        assert(/停用|未保存/.test(decision),'Reviewed stop/discard decision');await click(side,'#sidebar-tool-action-continue');
      }
      await until(()=>read(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),'Disabled tool instance retired');
      assert(!(await cookies()).some(c=>c.name==='od_disabled'));
      assert(await read(side,'document.querySelector("#sidebar-tool-action-review").hidden'));
      await click(side,'#sidebar-tool-enable');await click(side,'#sidebar-tool-settings-open');await click(side,'#sidebar-tool-launch');
      const frame=await bindCookieFrame();
      await until(()=>read(toolSession,'document.querySelector("#live-cookie-list").textContent.includes("od_reopen")'),'Reenabled tool reread');
      assert(!(await cookies()).some(c=>c.name==='od_disabled'));return {frame,busyRefusal,cookies:await cookies()};
    });
    await step('uninstall-and-clean-grants',async()=>{
      await click(side,'#sidebar-tool-remove');await click(side,'#sidebar-tool-inline-remove-confirm');
      await until(()=>read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>!v["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==="cookie-editor"))'),'Installed package removed');
      assert.equal(await read(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
      assert(await read(side,'document.querySelector("#sidebar-tool-action-review").hidden'));
      return {cookies:await cookies(),notice:await read(side,'document.body.innerText')};
    });
    await step('reinstall-requires-fresh-grants',async()=>{
      if(await read(side,'document.querySelector("#sidebar-tool-discover-panel").hidden'))await click(side,'#sidebar-tool-discover-toggle');
      await click(side,'#sidebar-tool-official-cookie-editor-install');await click(side,'#sidebar-tool-install');
      await until(()=>read(side,'Boolean(document.querySelector("[data-sidebar-tool-action=open][data-sidebar-tool-id=cookie-editor]"))'),'Explicit reinstall');
      await click(side,'[data-sidebar-tool-action="open"][data-sidebar-tool-id="cookie-editor"]');await bindCookieFrame();
      await click(side,'#sidebar-tool-settings-open');
      const grants=await read(side,'[...document.querySelectorAll("[data-cookie-capability]")].map(n=>({cap:n.dataset.cookieCapability,enabled:n.dataset.enabled}))');
      assert(grants.every(row=>row.enabled==='false'),'Uninstall removed old Cookie site grants');
      await click(side,'#sidebar-tool-settings-open');
      await until(()=>read(toolSession,'!document.querySelector("#browser-state").hidden'),'Reinstalled tool cannot automatically read without grant');
      return {grants,cookies:await cookies()};
    });
    }
  }
  report.complete=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error('COOKIE_NATIVE_FAIL '+error.message);}
finally{
  report.driverUnchanged=hash(await readFile(driverFile))===report.driver.sha256;
  if(!report.driverUnchanged){report.complete=false;process.exitCode=1;}
  if(report.candidate)try{const after=await fingerprint();report.candidateUnchanged=after.sha256===report.candidate.extensionFingerprint.sha256;
    if(!report.candidateUnchanged){report.complete=false;process.exitCode=1;report.candidateDrift={after};}}
  catch(error){report.candidateCheckError=error.message;report.complete=false;process.exitCode=1;}
  if(client){try{guard();await client.send('Browser.close');}catch(error){report.closeObservation=error.message;}client.close();}
  if(launched){report.cleanup=await launched.stop();if(report.cleanup.cleanupStatus!=='PASS'){report.complete=false;process.exitCode=1;}}
  report.finishedAt=new Date().toISOString();await writeFile(path.join(directory,'cdp-trace.json'),JSON.stringify(trace,(key,value)=>
    (key==='text'||key==='value')&&typeof value==='string'?'[REDACTED_INPUT]':value,2)+'\n');await persist();
  console.log(JSON.stringify({directory,complete:report.complete,cases:report.cases,error:report.error||null}));
}

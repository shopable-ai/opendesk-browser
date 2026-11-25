// Owned headed CFT probe. All product mutations use trusted CDP Input.
// Runtime.evaluate is limited to DOM and Chrome readback; never grants or writes.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';
import {createInterface} from 'node:readline';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {verifyCookieEditorUpgradeBaseline} from './cookie-editor-upgrade-contract.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const extension=path.resolve(process.env.COOKIE_NATIVE_EXTENSION||path.join(root,'dist/development'));
const binary=process.env.COOKIE_NATIVE_CHROME_BIN||path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const directory=path.resolve(process.env.COOKIE_NATIVE_EVIDENCE||path.join(root,'artifacts/cookie-editor-r5303/native-'+Date.now()));
const fixture='http://127.0.0.1:43111/demo-form.html';
const mode=process.env.COOKIE_NATIVE_MODE||(extension===path.join(root,'dist/development')?'development':'production');
const stage=process.env.COOKIE_NATIVE_STAGE||'baseline';
assert(['development','static-development','production'].includes(mode));
assert(['baseline','core','upgrade','diagnose','recheck','restart-dev','slow-reload','clear-receipt'].includes(stage));
const slowReload=stage==='slow-reload';
const clearReceipt=stage==='clear-receipt';
assert(mode!=='static-development'||slowReload||clearReceipt,'Static development requires an isolated fixture stage');
const localCandidate=(slowReload||clearReceipt)&&process.env.COOKIE_NATIVE_TOOL_CANDIDATE;
const localCandidateSha=process.env.COOKIE_NATIVE_TOOL_SHA256;
if(localCandidate)assert(/^[a-f0-9]{64}$/.test(localCandidateSha||''),'Pin the raw candidate JSON with COOKIE_NATIVE_TOOL_SHA256');
const targets=slowReload?[]:process.env.COOKIE_NATIVE_TARGETS?.split(',')||[fixture,'http://localhost:43111/demo-form.html','http://cookie-r5303.localhost:43111/demo-form.html'];
assert(slowReload||(targets.length===3&&new Set(targets.map(url=>new URL(url).hostname)).size===3),'Three distinct hostnames required');
const requiredCases=clearReceipt?['actual-entry','official-installed-open','all-sites-grant','clear-native-success-receipt']:slowReload?['actual-entry','official-installed-open','reload-fixture-grant','reload-stable-controls','reload-document-fence','reload-compact-status','reload-automatic-recovery','reload-hard-site-switch']:stage==='restart-dev'?['actual-entry','official-installed-open','all-sites-grant','independent-values-grant','same-profile-restart','fixture-cookie-cleanup','all-sites-revoke']:stage==='recheck'?['actual-entry','same-id-development-update','official-installed-open','all-sites-grant','independent-values-grant','automatic-site-lists','edit-save-readback','export-inline-workspace','single-click-copy','single-click-download','all-sites-revoke']:stage==='diagnose'?['actual-entry','official-installed-open','all-sites-grant','independent-values-grant','development-reread-observation']:['actual-entry','official-installed-open','all-sites-grant','independent-values-grant','edit-save-readback','export-inline-workspace','single-click-copy','single-click-download',
  ...(stage==='baseline'?[]:['three-site-list-reuse','same-profile-restart','all-sites-revoke']),
  ...(stage==='upgrade'?['same-id-upgrade']:[])];
const report={startedAt:new Date().toISOString(),mode,stage,extension,directory,targets,cases:[],
  results:Object.fromEntries(requiredCases.map(name=>[name,'NOT_TESTED'])),complete:false};
if(slowReload)for(const name of ['reload-manual-recovery-control','reload-attribute-draft'])report.results[name]='NOT_TESTED';
let launched,client,side,sideTargetId,tool,ownedFixture,release,control,pendingEdit;
const reuseReport=process.env.COOKIE_NATIVE_REUSE_REPORT;
if(slowReload||clearReceipt)assert(!reuseReport&&process.env.COOKIE_NATIVE_STAY!=='1','Fixture requires a fresh owned browser and automatic cleanup');
if(stage==='recheck')assert(reuseReport,'Development recheck must reuse an owned browser');
if(stage==='restart-dev')assert(reuseReport&&process.env.COOKIE_NATIVE_OWNER_INSPECTOR&&process.env.COOKIE_NATIVE_CORE_REPORT,'Restart reuses the original owned launcher and fixture evidence');
const contexts=new Map(),observedSessions=new Set(),attachedTargets=new Map(),downloads=[],fileChoosers=[];
const save=()=>writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
async function read(session,expression){
  if(typeof session==='string')return evaluate(client,expression,session);
  const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,contextId:session.contextId},session.sessionId);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'Frame evaluation failed');
  return result.result.value;
}
async function until(fn,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await sleep(150);}throw Error('Timeout: '+label);}
async function readWhileOpening(session,expression){
  try{return await read(session,expression);}
  catch(error){
    if(clearReceipt&&/Inspected target navigated or closed|Execution context was destroyed/.test(error.message))return null;
    throw error;
  }
}
async function attach(target){
  if(attachedTargets.has(target.targetId))return attachedTargets.get(target.targetId);
  const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  attachedTargets.set(target.targetId,session);return session;
}
async function click(session,selector){
  let previous;
  const point=await until(async()=>{
    const p=await readWhileOpening(session,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)return null;const r=n.getBoundingClientRect(),x=r.x+(n.type==='file'?Math.min(24,r.width/2):r.width/2),y=r.y+r.height/2;return {x,y,width:innerWidth,height:innerHeight,hit:n.contains(document.elementFromPoint(x,y))};})()`);
    if(!p)return null;
    let x=p.x,y=p.y,hit=p.hit,width=p.width,height=p.height;
    if(typeof session!=='string'){
      const frame=await read(side,'(()=>{const n=document.querySelector("#sidebar-tool-frame iframe"),r=n?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:innerWidth,height:innerHeight}:null;})()');
      assert(frame,'Installed tool iframe missing');x+=frame.x;y+=frame.y;width=frame.width;height=frame.height;
      hit=hit&&await read(side,`document.elementFromPoint(${x},${y})===document.querySelector('#sidebar-tool-frame iframe')`);
    }
    if(hit&&x>0&&y>0&&x<width&&y<height){const key=JSON.stringify([x,y]);if(previous===key)return{x,y};previous=key;return null;}
    previous=null;
    if(typeof session!=='string'&&(p.y<0||p.y>=p.height)){
      const frame=await read(side,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return{x:r.x,y:r.y};})()');
      await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:frame.x+Math.max(8,Math.min(p.width-8,p.x)),y:Math.max(90,Math.min(height-8,frame.y+p.height/2)),deltaX:0,deltaY:p.y<0?-220:220},side);
    }else await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.max(8,width-12),y:Math.max(8,height/2),deltaX:0,deltaY:y<85?-220:220},typeof session==='string'?session:side);
    return null;
  },'Visible trusted control '+selector);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'?'none':'left',clickCount:type==='mouseMoved'?0:1},typeof session==='string'?session:side);
}
async function keyboardClick(session,selector){
  for(let i=0;i<45;i++){
    if(await read(session,'document.activeElement?.matches('+JSON.stringify(selector)+')')){
      for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',...(type==='keyDown'?{text:'\r'}:{})},session);return;
    }
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab'},session);
  }
  throw Error('Keyboard could not reach '+selector);
}
async function state(session){return read(session,`({url:location.href,buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({id:n.id,label:n.getAttribute('aria-label'),text:n.textContent,disabled:n.disabled})),frames:[...document.querySelectorAll('iframe')].map(n=>({src:n.src})),dialogs:[...document.querySelectorAll('[role=dialog]')].filter(n=>n.getClientRects().length).map(n=>n.textContent),alerts:[...document.querySelectorAll('[role=alert]')].filter(n=>n.getClientRects().length).map(n=>n.textContent)})`);}
async function checkpoint(name,data={}){const record={...data,...(data.name?{cookieName:data.name}:{}),name,at:new Date().toISOString()};report.cases.push(record);if(name in report.results)report.results[name]='PASS';await save();console.log(JSON.stringify(record));}
async function bindTool(){
  tool=await until(async()=>{
    const src=await read(side,'document.querySelector("#sidebar-tool-frame iframe")?.src');if(!src)return null;
    // Same-process sandbox frames have their own execution context but no Target.
    const sessions=[side];
    for(const target of(await client.send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url===src&&(!t.parentFrameId||t.parentFrameId===sideTargetId)))sessions.push(await attach(target));
    for(const sessionId of sessions){
      if(!observedSessions.has(sessionId)){await client.send('Runtime.enable',{},sessionId);observedSessions.add(sessionId);}
      for(const context of contexts.get(sessionId)?.values()||[]){
        if(!context.auxData?.isDefault)continue;
        const candidate={sessionId,contextId:context.id,frameId:context.auxData.frameId};
        try{if(await read(candidate,'Boolean(document.querySelector(".cookie-editor-react"))'))return candidate;}catch{}
      }
    }
    return null;
  },'Installed React iframe default execution context');
  report.reactFrame=tool;await save();return tool;
}
async function wire(endpoint){
  contexts.clear();observedSessions.clear();attachedTargets.clear();
  client=await connect(endpoint,{onEvent:event=>{
    if(event.method==='Page.fileChooserOpened')fileChoosers.push({sessionId:event.sessionId,...event.params});
    if(event.method==='Runtime.executionContextCreated'){
      if(!contexts.has(event.sessionId))contexts.set(event.sessionId,new Map());
      contexts.get(event.sessionId).set(event.params.context.id,event.params.context);
    }
    if(event.method==='Runtime.executionContextDestroyed')contexts.get(event.sessionId)?.delete(event.params.executionContextId);
    if(event.method==='Runtime.executionContextsCleared')contexts.delete(event.sessionId);
    if(['Browser.downloadWillBegin','Browser.downloadProgress'].includes(event.method)){
      const {guid,suggestedFilename,state,filePath}=event.params;downloads.push({method:event.method,guid,suggestedFilename,state,filePath});
    }
  }});
  await client.send('Target.setDiscoverTargets',{discover:true});
}
async function openPanel(url=targets[0]){
  const sw=await until(async()=>(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'Candidate MV3 worker',25000);
  const id=new URL(sw.url).hostname;if(report.extensionId)assert.equal(id,report.extensionId);report.extensionId=id;
  const website=await visit(url);
  control=await attach(await client.send('Target.createTarget',{url:'chrome-extension://'+id+'/sidepanel.html?hostInstanceId='+randomUUID()}));
  await click(control,'#catalog-open-dev-sidebar');
  const selected=await until(async()=>{
    const live=await read(control,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    const info=(await client.send('Target.getTargets')).targetInfos;
    for(const context of live){const target=info.find(t=>t.url===context.documentUrl);if(target)return{context,target};}
    return null;
  },'Actual Side Panel target');
  sideTargetId=selected.target.targetId;side=await attach(selected.target);report.sidePanel=selected.context;
  report.developmentConnection=mode==='development'?await until(()=>read(side,
    '(()=>{const n=document.querySelector("#opendesk-development-status");return n?.textContent.includes("开发服务已连接")?{text:n.textContent,identity:n.title}:null;})()'),
    'Watcher connection'):{status:'OUT_OF_SCOPE',reason:mode==='static-development'?'isolated static development candidate':'production static candidate'};
  await client.send('Target.activateTarget',{targetId:website.targetId});await click(side,'#tab-tools');
  return website;
}
async function visit(url){
  const target=await client.send('Target.createTarget',{url});
  await client.send('Target.activateTarget',{targetId:target.targetId});const session=await attach(target);
  await until(()=>readWhileOpening(session,'document.readyState==="complete"&&location.href==='+JSON.stringify(url)),'Requested website '+url);
  return target;
}
async function readableList(url){
  await bindTool();const hostname=new URL(url).hostname;
  let clickedIdle=false,readySince;
  await until(async()=>{
    const status=await read(tool,'(()=>{const site=document.querySelector(".site-hostname"),retry=document.querySelector(".cookie-permission button"),create=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return {site:site?.textContent,retryVisible:Boolean(retry?.getClientRects().length&&retry.textContent.includes("重新读取")),retryEnabled:Boolean(retry&&!retry.disabled),canCreate:Boolean(create&&!create.disabled)};})()');
    if(!status.retryVisible)clickedIdle=false;
    if(status.retryVisible&&status.retryEnabled&&!clickedIdle){
      clickedIdle=true;readySince=undefined;await click(tool,'.cookie-permission button');
      await checkpoint('site-explicit-reread',{origin:new URL(url).origin,requiresNewGrant:false});return false;
    }
    if(!status.site?.includes(hostname)||!status.canCreate||status.retryVisible){readySince=undefined;return false;}
    readySince??=Date.now();return Date.now()-readySince>=600;
  },'Stable website list after any target-change idle phase');
}
const installed=()=>read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="cookie-editor")).then(t=>t?{id:t.id,version:t.version}:null)');
const grantRecord=()=>read(side,'chrome.storage.local.get("opendesk.browser.context-menu-grants.v1").then(v=>{const t=v["opendesk.browser.context-menu-grants.v1"]?.["cookie-editor"];return t?{version:t.version,installEpoch:t.installEpoch,cookieAllSites:t.cookieAllSites,cookieSites:t.cookieSites}:null;})');
const caps=['read','write','observe','clear'];
const granted=row=>caps.every(cap=>row?.cookieAllSites?.[cap]===true);
async function openOfficial(){
  const before=await installed();
  const row='[data-extension-key="app:cookie-editor"][data-extension-action="main"]';
  if(!before){
    // Available catalog cards open the existing installation review first.
    if(!await read(side,'Boolean(document.querySelector('+JSON.stringify(row)+')?.getClientRects().length)')){
      await click(side,'#extension-center-more');await click(side,'[data-ec-scope="available"]');
    }
    await click(side,row);await click(side,'#sidebar-tool-install');
    await until(installed,'Official Cookie package installed');
  }
  if(!await read(side,'Boolean(document.querySelector('+JSON.stringify(row)+')?.getClientRects().length)')){
    await click(side,'#extension-center-more');await click(side,'[data-ec-scope="smart"]');
  }
  await click(side,row);
  await until(()=>read(side,'Boolean(document.querySelector("#sidebar-tool-frame iframe"))'),'Installed Cookie iframe');
  const current=await installed();assert.equal(current.version,release.version);
  await checkpoint('official-installed-open',{installation:before?'preinstalled-or-existing':'reviewed-install',installed:current});
}
async function showSettings(){
  if(!await read(side,'Boolean(document.querySelector("#sidebar-tool-cookie-site-toggle")?.getClientRects().length)'))await click(side,'#sidebar-tool-settings-open');
}
async function hideSettings(){
  if(await read(side,'Boolean(document.querySelector("#sidebar-tool-cookie-site-toggle")?.getClientRects().length)'))await click(side,'#sidebar-tool-settings-open');
}
async function grantAll(){
  assert(!granted(await grantRecord()),'Fresh installation must not inherit all-sites consent');
  await showSettings();await checkpoint('before-first-grant',{side:await state(side)});
  await click(side,'#sidebar-tool-cookie-site-toggle');
  const row=await until(async()=>{const row=await grantRecord();return granted(row)?row:null;},'Single all-sites consent');
  // First use grants ordinary Cookie management, never Cookie Values.
  // Only a second trusted click can mint the separate sensitive Value consent.
  assert.equal(row.cookieAllSites.values,false,'First-use must not grant Cookie Values');
  assert.equal(row.cookieAllSites.valueConsent,false,'First-use must not mint Value consent');
  await checkpoint('all-sites-grant',{record:row,permissions:await read(side,'chrome.permissions.getAll()')});
  await hideSettings();await bindTool();
  await until(()=>read(tool,'(()=>{const root=document.querySelector(".cookie-react-view"),create=[...document.querySelectorAll("button")].find(n=>n.getAttribute("aria-label")==="新建 Cookie");return Boolean(root&&create&&!create.disabled);})()'),
    'One trusted first-use click opens a usable React Cookie list');
}
async function grantClearFixture(){
  assert(!granted(await grantRecord()),'Fresh fixture must have no existing Cookie consent');
  await click(side,'#sidebar-tool-cookie-consent-allow');
  const row=await until(async()=>{const record=await grantRecord();return granted(record)?record:null;},'Reviewed Cookie management consent');
  await bindTool();
  await checkpoint('all-sites-grant',{record:row,permissions:await read(side,'chrome.permissions.getAll()')});
}
async function grantValues(){
  const before=await grantRecord();
  assert(granted(before),'Ordinary Cookie consent must precede Values');
  assert.equal(before.cookieAllSites.values,false,'Sensitive grant must be a second explicit decision');
  await showSettings();
  await click(side,'#sidebar-tool-cookie-values-toggle');
  const after=await until(async()=>{
    const next=await grantRecord();
    return granted(next)&&next.cookieAllSites?.values===true&&next.cookieAllSites.valueConsent===true?next:null;
  },'Separate trusted Cookie Value authorization');
  assert.notEqual(after.cookieAllSites.grantEpoch,before.cookieAllSites.grantEpoch,
    'Independent Value consent must invalidate the previous Cookie session');
  await checkpoint('independent-values-grant',{
    version:after.version,baseCapabilities:caps,valueConsent:after.cookieAllSites.valueConsent,
    valuesAuthorized:after.cookieAllSites.values,grantEpochChanged:true
  });
  await hideSettings();await bindTool();
}
async function fill(selector,value){
  await click(tool,selector);
  const session=typeof tool==='string'?tool:side;
  for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',modifiers:4,...(type==='keyDown'?{commands:['selectAll']}:{})},session);
  await client.send('Input.insertText',{text:value},session);
  assert.equal(await read(tool,'document.querySelector('+JSON.stringify(selector)+').value'),value,'Native text input readback');
}
async function noSecondConfirmation(){
  const extra=await read(side,'Boolean(document.querySelector("#sidebar-tool-action-review")?.getClientRects().length)');
  if(extra){await checkpoint('unexpected-host-confirmation',{side:await state(side)});throw Error('Unexpected second Host confirmation');}
}
async function settleUI(){await sleep(300);await noSecondConfirmation();}
async function nativeRows(hostname){return read(side,'chrome.cookies.getAll({domain:'+JSON.stringify(hostname)+'})');}
async function editForSite(url,index){
  if(index>0)await visit(url);
  await bindTool();
  const hostname=new URL(url).hostname;
  await until(()=>read(tool,'document.querySelector(".site-bar strong[aria-label]")?.textContent?.includes('+JSON.stringify(hostname)+')'),'UI bound to '+hostname);
  await until(()=>read(tool,'(()=>{const n=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return n&&!n.disabled;})()'),'Granted site ready');
  const name='od_r5303_'+index,value='fictional-'+randomUUID(),updated='edited-'+randomUUID();
  await click(tool,'[aria-label="新建 Cookie"]');await fill('[aria-label="名称"]',name);await fill('[aria-label="Cookie 值"]',value);
  await click(tool,'.cookie-editor-save');
  await until(async()=>{await noSecondConfirmation();return(await nativeRows(hostname)).find(row=>row.name===name&&row.value===value);},'Created Cookie Chrome readback');
  await checkpoint('new-save-readback',{hostname,name});
  const selector=await until(()=>read(tool,`(()=>{const n=[...document.querySelectorAll('.row-trigger')].find(n=>n.textContent.includes(${JSON.stringify(name)}));return n?'[data-row='+JSON.stringify(n.dataset.row)+']':null;})()`),'Created Cookie visible row');
  await click(tool,selector);await fill('[aria-label="Cookie 值"]',updated);pendingEdit={hostname,name,updated};await click(tool,'.cookie-editor-save');
  const saved=await until(async()=>{await noSecondConfirmation();return(await nativeRows(hostname)).find(row=>row.name===name&&row.value===updated);},'Edited Cookie Chrome readback');
  await checkpoint('edit-save-readback',{hostname,cookieName:name});pendingEdit=null;
  await until(()=>read(tool,'!document.querySelector(".cookie-editor-save")||document.querySelector(".cookie-editor-save").disabled'),'Saved editor settled');
  if(await read(tool,'document.querySelector('+JSON.stringify(selector)+')?.getAttribute("aria-expanded")!=="true"'))await click(tool,selector);
  await until(()=>read(tool,'document.querySelector('+JSON.stringify('[aria-label="Cookie 值"]')+')?.value==='+JSON.stringify(updated)),'Reopened editor actual saved value');
  await checkpoint('edit-reopen-readback',{hostname,cookieName:name});
  await click(tool,'[aria-label="取消"]');
  // Only identity and hashes go into evidence, never Cookie values.
  const expected={hostname,name,valueSha256:createHash('sha256').update(updated).digest('hex'),domain:saved.domain,path:saved.path,storeId:saved.storeId};
  await checkpoint('site-create-edit-readback',{site:new URL(url).origin,...expected});return expected;
}
async function exportOnce(){
  const targetsBefore=(await client.send('Target.getTargets')).targetInfos;
  await click(tool,'[aria-label="导出 Cookie"]');
  await until(()=>read(tool,'Boolean(document.querySelector(".cookie-export-workspace")?.getClientRects().length)'),'Inline export workspace in original React context');
  assert.equal(await read(tool,'[...document.querySelectorAll("[role=dialog]")].filter(n=>n.getClientRects().length).length'),0,'Export uses no visible tool dialog');
  const targetsAfter=(await client.send('Target.getTargets')).targetInfos;
  const additionalPages=targetsAfter.filter(t=>t.type==='page'&&!targetsBefore.some(before=>before.targetId===t.targetId));
  assert.equal(additionalPages.length,0,'Inline export opens no additional page');
  const screenshot=path.join(directory,'export-inline-workspace.png');
  const captured=await client.send('Page.captureScreenshot',{format:'png'},side);
  await writeFile(screenshot,Buffer.from(captured.data,'base64'));
  await checkpoint('export-inline-workspace',{context:{...tool},visibleToolDialogs:0,additionalPages,screenshot});
  await click(tool,'.cookie-export-actions button:first-child');
  await until(async()=>{await noSecondConfirmation();return read(tool,'!document.querySelector(".cookie-export-workspace")');},'Copy delivered and export UI closed');
  const copied=execFileSync('/usr/bin/pbpaste',{encoding:'utf8'});const copiedData=JSON.parse(copied);
  assert(Array.isArray(copiedData)||Array.isArray(copiedData.cookies),'OS clipboard contains exported Cookie JSON');
  await checkpoint('single-click-copy',{bytes:Buffer.byteLength(copied),sha256:createHash('sha256').update(copied).digest('hex')});
  const downloadPath=path.join(directory,'downloads');await mkdir(downloadPath,{recursive:true});
  await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath,eventsEnabled:true});
  await click(tool,'[aria-label="导出 Cookie"]');
  const first=downloads.length;await click(tool,'.cookie-export-actions button:last-child');
  const begin=await until(async()=>{await noSecondConfirmation();return downloads.slice(first).find(e=>e.method==='Browser.downloadWillBegin');},'Real download began');
  await until(()=>downloads.slice(first).some(e=>e.guid===begin.guid&&e.state==='completed'),'Real download completed');
  const files=(await readdir(downloadPath)).filter(name=>!name.endsWith('.crdownload'));assert.equal(files.length,1);
  assert.equal(downloads.slice(first).filter(e=>e.method==='Browser.downloadWillBegin').length,1);
  const bytes=await readFile(path.join(downloadPath,files[0]));assert.equal(bytes.toString(),copied,'Copy and download contain identical bytes');
  await checkpoint('single-click-download',{guid:begin.guid,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
async function developmentUpdate(){
  const before=await installed();assert.equal(before?.version,'2.0.29');assert.equal(release.version,'2.0.30');
  const data=()=>read(side,'chrome.storage.local.get("opendesk.sidebar-tools.data.v1:cookie-editor")');
  const priorData=await data(),priorGrant=await grantRecord();
  const jsBefore=await read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="cookie-editor").js)');
  await keyboardClick(side,'button[aria-label="管理「Cookie Editor · Cookie 管理」"]');
  await click(side,'[data-ec-context-action="update"]');
  const review=await until(()=>read(side,'document.querySelector("#sidebar-tool-update-versions")?.textContent'),'Development same-ID update review');
  assert(review.includes(before.version)&&review.includes(release.version));await click(side,'#sidebar-tool-install');
  await until(async()=>(await installed())?.version===release.version,'Development updated package persisted');
  const actual=await read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="cookie-editor"))');
  const candidate=JSON.parse(await readFile(path.join(extension,release.packagePath),'utf8'));
  for(const field of ['id','version','html','css','js'])assert.equal(actual[field],candidate[field],'Installed development package '+field+' matches catalog');
  assert.deepEqual(await data(),priorData,'Existing tool data is retained during same-ID update');
  const afterGrant=await grantRecord();assert(!(afterGrant?.version===release.version&&granted(afterGrant)),'Old consent cannot silently grant new version');
  await checkpoint('same-id-development-update',{before,target:await installed(),review,candidateSHA256:release.sha256,
    installedJSSHA256:createHash('sha256').update(actual.js).digest('hex'),previousJSSHA256:createHash('sha256').update(jsBefore).digest('hex'),
    dataPreserved:true,dataExisted:Object.keys(priorData).length>0,dataSHA256:createHash('sha256').update(JSON.stringify(priorData)).digest('hex'),grantBefore:priorGrant,grantAfter:afterGrant});
}
async function automaticLists(){
  const epoch=(await grantRecord()).cookieAllSites.grantEpoch;
  for(const [index,url] of [targets[0],targets[0],targets[1],targets[2],targets[0]].entries()){
    await visit(url);await bindTool();let stable;
    const transitions=[];let previous;
    await until(async()=>{
      const state=await read(tool,'(()=>{const retry=document.querySelector(".cookie-permission button"),create=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return {site:document.querySelector(".site-hostname")?.textContent,retry:Boolean(retry?.getClientRects().length&&retry.textContent.includes("重新读取")),canCreate:Boolean(create&&!create.disabled),alerts:[...document.querySelectorAll("[role=alert],[role=status]")].filter(n=>n.getClientRects().length).map(n=>n.textContent)};})()');
      const signature=JSON.stringify(state);if(previous!==signature){transitions.push({at:new Date().toISOString(),...state});previous=signature;}
      assert(!state.alerts.some(text=>text.includes('未知')),'Read-only target change must not show an unknown write warning');
      if(state.retry||!state.canCreate||state.site!==new URL(url).hostname){stable=undefined;return false;}
      stable??=Date.now();return Date.now()-stable>=1200;
    },'Automatic list without reread click: '+new URL(url).hostname);
    assert.equal((await grantRecord()).cookieAllSites.grantEpoch,epoch);
    const screenshot=path.join(directory,'automatic-list-'+index+'.png');const captured=await client.send('Page.captureScreenshot',{format:'png'},side);await writeFile(screenshot,Buffer.from(captured.data,'base64'));
    await checkpoint('automatic-list-site',{url,sameDomain:index===1,manualRereads:0,grantEpoch:epoch,transitions,screenshot});
  }
  await checkpoint('automatic-site-lists',{origins:targets,includesSameDomain:true,manualRereads:0,grantEpoch:epoch});
}
const reloadQuery='od_slow_reload_';
const reloadCookie=suffix=>reloadQuery+suffix;
const reloadValue='fictional-before-reload';
async function grantReloadFixture(){
  assert(!granted(await grantRecord()),'Fresh fixture must have no existing Cookie consent');
  await click(side,'#sidebar-tool-cookie-consent-allow');
  const row=await until(async()=>{
    const grant=await grantRecord();
    return granted(grant)&&grant.cookieAllSites.values===true&&grant.cookieAllSites.valueConsent===true?grant:null;
  },'Reviewed Cookie Editor permission includes native Cookie values');
  await bindTool();
  await checkpoint('reload-fixture-grant',{version:row.version,values:true});
}
async function importLocalCandidate(file){
  const bytes=await readFile(file), candidate=JSON.parse(bytes);
  assert.equal(candidate.id,'cookie-editor');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),localCandidateSha,'Candidate SHA-256 changed');
  const pinnedPath=path.join(directory,'cookie-editor.candidate.opendesk-tool.json');
  await writeFile(pinnedPath,bytes,{flag:'wx'});
  const previous=await installed();
  await click(side,'#extension-center-more');await click(side,'#extension-center-import');
  await client.send('Page.enable',{},side);
  await client.send('Page.setInterceptFileChooserDialog',{enabled:true},side);
  try{
    const first=fileChoosers.length;
    await click(side,'#sidebar-tool-file');
    const chooser=await until(()=>fileChoosers.slice(first).find(event=>event.sessionId===side),'Reviewed local candidate file chooser');
    assert(chooser.backendNodeId);
    await client.send('DOM.setFileInputFiles',{files:[pinnedPath],backendNodeId:chooser.backendNodeId},side);
  }finally{await client.send('Page.setInterceptFileChooserDialog',{enabled:false},side);}
  const version=await until(()=>read(side,'document.querySelector("#sidebar-tool-preview-version")?.innerText'),'Local candidate installation review');
  assert(version.includes(candidate.version));
  await click(side,'#sidebar-tool-install');
  await until(async()=>(await installed())?.version===candidate.version,'Reviewed candidate installed');
  const actual=await read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="cookie-editor"))');
  for(const key of ['id','version','html','css','js'])assert.equal(actual[key],candidate[key],'Installed candidate '+key+' matches pinned JSON');
  report.importedCandidate={version:candidate.version,sha256:localCandidateSha,path:pinnedPath};
  release={...release,version:candidate.version};
  if(!await read(side,'Boolean(document.querySelector("#sidebar-tool-frame iframe")?.getClientRects().length)'))await openOfficial();
  await checkpoint('official-installed-open',{installation:'reviewed-local-candidate',previous,installed:await installed(),candidate:report.importedCandidate});
}
const clearSeedNames=['od_fixture_clear_a','od_fixture_clear_b'];
async function startClearFixture(){
  const route='/cookie-clear-'+randomUUID();
  let served=false;
  ownedFixture=createServer((req,res)=>{
    if(req.url!==route){res.writeHead(404);res.end();return;}
    if(!served)res.setHeader('Set-Cookie',clearSeedNames.map(name=>name+'=fictional; Path=/; HttpOnly; SameSite=Lax'));
    served=true;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<title>Fictional Cookie clear fixture</title>');
  });
  await new Promise((resolve,reject)=>{ownedFixture.once('error',reject);ownedFixture.listen(0,'127.0.0.1',resolve);});
  return 'http://127.0.0.1:'+ownedFixture.address().port+route;
}
async function verifyClearReceipt(){
  const readState=()=>read(tool,
    '({rows:[...document.querySelectorAll(".row-trigger")].map(n=>n.textContent),notices:[...document.querySelectorAll("[role=alert]")].filter(n=>n.getClientRects().length).map(n=>n.textContent)})');
  const before=(await nativeRows('127.0.0.1')).map(row=>row.name).sort();
  assert.deepEqual(before,clearSeedNames);
  await until(async()=>{const {rows}=await readState();return before.every(name=>rows.some(row=>row.includes(name)));},'Ordinary grant reads both fixture Cookies');
  await click(tool,'[aria-label="安全清理本站 Cookie"]');
  await until(()=>read(tool,'document.querySelector(".cookie-clear-dialog[open] .od-button--danger:not(:disabled)")?.textContent.includes("清理 2 条")'),'Trusted preview of both Cookies');
  assert.deepEqual((await nativeRows('127.0.0.1')).map(row=>row.name).sort(),before,'Preview did not change Cookie records');
  await click(tool,'.cookie-clear-dialog[open] .od-button--danger');
  const receipt=await until(async()=>{
    await noSecondConfirmation();
    const state=await readState();
    if(state.notices.some(message=>/清理结果未确认|E_OUTCOME_UNKNOWN/.test(message)))throw Error('Native clear lost its receipt; do not retry');
    const shared=await read(side,'[...document.querySelectorAll(".sidebar-tool-toast-message")].filter(n=>n.getClientRects().length&&n.textContent.includes("已清理 127.0.0.1")).length');
    const local=await read(tool,'[...document.querySelectorAll(".cookie-clear-toast[role=status]")].filter(n=>n.getClientRects().length).map(n=>n.textContent)');
    assert.equal(shared,0,'Clear does not create a competing Host toast');
    assert(local.length<=1,'Only one visible native clear receipt');
    if(local[0])assert.match(local[0],/已清理 127.0.0.1 的 2 条 Cookie，本次清理范围剩余 0 条。/);
    return local[0];
  },'One visible success receipt for verified native clear');
  await until(async()=>!(await readState()).rows.length,'Cookie list updated after clear');
  assert.equal((await nativeRows('127.0.0.1')).length,0);
  await checkpoint('clear-native-success-receipt',{before:before.length,after:0,receipt,unknownWarnings:0,confirmationCount:1});
}
async function startSlowReloadFixture(){
  let gate;
  const requests=[];
  function hold(hostname){
    assert(!gate,'Only one held navigation at a time');
    const current=gate={hostname,request:null,release:null};
    return current;
  }
  ownedFixture=createServer((req,res)=>{
    if(req.url!=='/slow-reload.html'){res.writeHead(404).end();return;}
    const hostname=req.headers.host?.split(':')[0];
    if(!['127.0.0.1','localhost'].includes(hostname)){res.writeHead(400).end();return;}
    const current=gate?.hostname===hostname?gate:null;
    const suffix=hostname==='localhost'?'other':current?'new':'old';
    const entry={hostname,suffix,at:Date.now(),held:Boolean(current),fetchMode:req.headers['sec-fetch-mode'],fetchDest:req.headers['sec-fetch-dest']};
    requests.push(entry);
    const respond=()=>{
      entry.releasedAt=Date.now();
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'Set-Cookie':[
          reloadCookie(suffix)+'='+(suffix==='old'?reloadValue:'fictional-'+suffix)+'; Path=/; SameSite=Lax',
          ...(hostname==='127.0.0.1'?[reloadCookie('stable')+'=fictional-stable; Path=/; SameSite=Lax']:[]),
          ...(suffix==='new'?[reloadCookie('old')+'=expired; Max-Age=0; Path=/']:[])
        ]});
      res.end('<!doctype html><meta charset="utf-8"><title>Cookie reload fixture</title><main id="'+suffix+'">Cookie reload fixture</main>');
    };
    if(current&&!current.request){
      current.request=entry;
      current.release=()=>{gate=null;respond();};
    }else respond();
  });
  await new Promise((resolve,reject)=>{ownedFixture.once('error',reject);ownedFixture.listen(0,'127.0.0.1',resolve);});
  const port=ownedFixture.address().port;
  targets.push(...['127.0.0.1','localhost'].map(host=>'http://'+host+':'+port+'/slow-reload.html'));
  report.fixtureServer={owned:true,urls:targets,requests};
  return {hold};
}
async function verifySlowReload(website,fixtureDriver){
  const websiteSession=await attach(website);
  const search='[aria-label="搜索 Cookie"]', filter='button[aria-label="筛选与排序"]';
  const activeTab='#cookie-product-tab-cookie';
  const scope=['.site-bar','.cookie-editor-workspace','#cookie-product-panel-cookie',activeTab,search,filter];
  const actions=['重新读取 Cookie','导入 Cookie','导出 Cookie','新建 Cookie','安全清理本站 Cookie','删除 Cookie'];
  const tab=await until(()=>read(side,'chrome.tabs.query({active:true,currentWindow:true}).then(t=>t.find(tab=>tab.url==='+JSON.stringify(targets[0])+'))'),'Active owned fixture tab');
  const documentId=()=>read(side,'chrome.webNavigation.getFrame({tabId:'+tab.id+',frameId:0}).then(f=>f?.documentId).catch(()=>null)');
  const appState=()=>read(tool,'('+((search,filter,actions,value)=>{
    const find=s=>document.querySelector(s), visible=n=>Boolean(n?.getClientRects().length);
    const header=find('.site-bar'), body=document.body.innerText;
    return {site:find('.site-hostname')?.textContent,header:header?.innerText,
      permission:[...document.querySelectorAll('.cookie-permission')].filter(visible).map(n=>n.innerText),
      technicalCode:/E_[A-Z_]{3,}|错误代码|读取诊断/.test(body),
      status:[...document.querySelectorAll('[role=status],[role=alert]')].filter(visible).map(n=>n.innerText).filter(t=>/网页|文档|E_/.test(t)),
      query:find(search)?.value,filterOpen:find(filter)?.getAttribute('aria-pressed'),
      focused:document.activeElement?.getAttribute('aria-label')||document.activeElement?.id,
      rows:[...document.querySelectorAll('.row-trigger')].map(n=>n.innerText),
      editor:Boolean(find('.cookie-inline-editor')),
      oldValue:[...document.querySelectorAll('input,textarea')].some(n=>n.value===value)||body.includes(value),
      actions:[...document.querySelectorAll('button')].filter(n=>visible(n)&&!n.disabled&&n.getAttribute('aria-disabled')!=='true')
        .map(n=>n.getAttribute('aria-label')).filter(n=>actions.includes(n)),
      saveEnabled:[...document.querySelectorAll('.cookie-editor-save')].some(n=>visible(n)&&!n.disabled)};
  }).toString()+')('+[search,filter,actions,reloadValue].map(value=>JSON.stringify(value)).join(',')+')');
  const hasRow=(s,suffix)=>s.rows.some(text=>text.includes(reloadCookie(suffix)));
  const ready=(s,host,suffix)=>s.site===host&&hasRow(s,suffix)&&s.actions.includes('新建 Cookie');
  const clickRow=async suffix=>{
    const selector=await until(()=>read(tool,'('+((name)=>{
      const row=[...document.querySelectorAll('.row-trigger')].find(n=>n.querySelector('.cookie-row-name strong')?.textContent===name);
      return row?'.row-trigger[data-row='+CSS.escape(row.dataset.row)+']':null;
    }).toString()+')('+JSON.stringify(reloadCookie(suffix))+')'),'Fixture Cookie '+suffix);
    await click(tool,selector);
  };
  const oldDoc=await until(documentId,'Original Chrome documentId');
  await until(async()=>ready(await appState(),'127.0.0.1','old'),'Original fixture Cookie row');
  await fill(search,reloadQuery);
  await clickRow('old');
  await until(async()=>(await appState()).oldValue,'Original value in the expanded Cookie Editor');
  await click(tool,search);
  const context=typeof tool==='string'?tool:tool.sessionId;
  const {result:reference}=await client.send('Runtime.evaluate',{
    expression:'('+JSON.stringify(scope)+').map(s=>document.querySelector(s))',
    ...(typeof tool==='string'?{}:{contextId:tool.contextId}),objectGroup:'slow-reload-controls'
  },context);
  assert(reference?.objectId,'Retain original DOM controls through CDP');
  const sameNodes=async()=>{
    const identity=await client.send('Runtime.callFunctionOn',{objectId:reference.objectId,
      functionDeclaration:'function(selectors){return this.map((n,i)=>Boolean(n?.isConnected&&n===document.querySelector(selectors[i])));}',
      arguments:[{value:scope}],returnByValue:true},context);
    if(identity.exceptionDetails)throw Error('Original tool DOM context was lost');
    return identity.result.value;
  };
  const key=async(key,modifiers=0)=>{
    const windowsVirtualKeyCode={Tab:9,Enter:13,End:35,Backspace:8,ArrowLeft:37,ArrowRight:39}[key];
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key,code:key,modifiers,windowsVirtualKeyCode,
      ...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})},side);
  };
  const tabTo=async(selector,back=false)=>{
    for(let i=0;i<12;i++){
      if(await read(tool,'document.activeElement?.matches('+JSON.stringify(selector)+')'))return true;
      await key('Tab',back?8:0);
    }
    return false;
  };
  const failures=[];
  async function verify(name,errors,data){
    errors=errors.filter(Boolean);
    if(errors.length){report.results[name]='FAIL';failures.push(...errors);}
    await checkpoint(errors.length?name+'-failed':name,{...data,errors});
  }
  const observe=async(predicate,label,timeout)=>{
    try{return await until(async()=>{const s=await appState();return predicate(s)?s:null;},label,timeout);}
    catch(error){if(!error.message.startsWith('Timeout:'))throw error;return appState();}
  };
  const fenced=s=>!s.rows.length&&!s.oldValue&&!s.editor&&!s.actions.length&&!s.saveEnabled;
  const compact=s=>/正在确认当前网页[…⋯]/.test(s.header||'')&&!s.header.includes('127.0.0.1')&&!s.technicalCode&&!s.permission.length;
  const held=fixtureDriver.hold('127.0.0.1');
  let intentionallyChangedPane=false;
  try{
    await client.send('Page.reload',{ignoreCache:true},websiteSession);
    const request=await until(()=>held.request,'Same-URL top-level HTTP reload reached the fixture');
    assert.equal(request.fetchMode,'navigate');assert.equal(request.fetchDest,'document');
    const waiting=await observe(s=>/确认当前网页|E_DOCUMENT_UNRESOLVED/.test(JSON.stringify([s.header,s.permission,s.status]))||!hasRow(s,'old'),
      'Reload becomes unresolved while its main response is held',2200);
    const identity=await sameNodes();
    const searchFocused=waiting.focused==='搜索 Cookie';
    let acceptedText=false,filterKeyboard=false,tabKeyboard=false;
    if(identity[4]&&searchFocused&&waiting.query===reloadQuery){
      await key('End');await client.send('Input.insertText',{text:'x'},side);
      acceptedText=(await appState()).query===reloadQuery+'x';
      if(acceptedText)await key('Backspace');
      if(await tabTo(filter)){
        const before=(await appState()).filterOpen;
        await key('Enter');filterKeyboard=(await appState()).filterOpen!==before;
      }
    }
    const afterKeys=await sameNodes();
    if((await tabTo(activeTab,true))){
      const selected=id=>read(tool,'document.querySelector('+JSON.stringify(id)+')?.getAttribute("aria-selected")==="true"&&document.activeElement?.matches('+JSON.stringify(id)+')');
      await key('ArrowRight');
      intentionallyChangedPane=await selected('#cookie-product-tab-accounts');
      if(intentionallyChangedPane){await key('ArrowLeft');tabKeyboard=await selected(activeTab);}
    }
    // Allow the native target resolver to settle while remaining inside the UI's 4s grace.
    await sleep(Math.max(0,1650-(Date.now()-request.at)));
    const stillWaiting=await appState(), pendingDoc=await documentId();
    assert(!request.releasedAt&&(!pendingDoc||pendingDoc===oldDoc),'Pending observations must precede replacement document');
    await verify('reload-stable-controls',[
      !(identity.every(Boolean)&&afterKeys.every(Boolean))&&'site bar, workspace, tab and search/filter must retain their DOM nodes until deliberate pane navigation',
      !(searchFocused&&acceptedText)&&'focused search must retain focus and accept keyboard text',
      !filterKeyboard&&'filter must operate by keyboard',!tabKeyboard&&'ArrowRight and ArrowLeft must navigate the product tabs'
    ],{identity:Object.fromEntries(scope.map((s,i)=>[s,identity[i]])),searchFocused,acceptedText,filterKeyboard,tabKeyboard});
    await verify('reload-document-fence',[![waiting,stillWaiting].every(fenced)&&'reload must clear live rows/value editor and fence document actions'],
      {waiting,stillWaiting,oldDoc,pendingDoc,request});
    await verify('reload-compact-status',[![waiting,stillWaiting].every(compact)&&'show compact 正在确认当前网页… in the stable site header without technical code or error card'],
      {header:waiting.header,permission:waiting.permission,status:waiting.status,technicalCode:waiting.technicalCode});
  }finally{held.release?.();}
  const recovered=await observe(s=>ready(s,'127.0.0.1','new'),'New rows load without retry after replacement document commits',12000);
  const newDoc=await documentId(),afterIdentity=await sameNodes();
  const browserReload=await read(websiteSession,'location.href==='+JSON.stringify(targets[0])+'&&Boolean(document.querySelector("#new"))&&performance.getEntriesByType("navigation")[0]?.type==="reload"');
  await verify('reload-automatic-recovery',[
    !(browserReload&&newDoc&&newDoc!==oldDoc)&&'same-tab, same-URL reload must commit a new Chrome document',
    !(ready(recovered,'127.0.0.1','new')&&!hasRow(recovered,'old')&&!recovered.oldValue&&!recovered.permission.length&&!/正在确认当前网页/.test(recovered.header||''))&&'new document must become usable and clear pending status automatically',
    recovered.query!==reloadQuery&&'same-origin reload must preserve the search text',
    !(intentionallyChangedPane?[afterIdentity[0],afterIdentity[3]]:afterIdentity).every(Boolean)&&'recovery must keep controls outside any deliberately changed pane'
  ],{oldDoc,newDoc,browserReload,recovered,afterIdentity,manualRereads:0});
  const attr='.cookie-inline-editor .toggles label:last-child input';
  const valueField='#opendesk-cookie-attribute-data';
  const unsaved='fictional-never-save-this';
  const draftState=()=>read(tool,'('+((attr,valueField,unsaved)=>{
    const editor=document.querySelector('.cookie-inline-editor');
    const httpOnly=document.querySelector(attr);
    return {editor:editor?.getAttribute('aria-label'),httpOnly:httpOnly?.checked,
      dirty:Boolean(editor?.querySelector('.cookie-dirty-note')),
      restored:editor?.querySelector('.editor-hint[role=status]')?.textContent.includes('已恢复可保留的属性修改')??false,
      typedValue:[...document.querySelectorAll('input,textarea')].some(n=>n.value===unsaved),
      valueEmpty:document.querySelector(valueField)?.value==='',
      canSave:Boolean(editor?.querySelector('.cookie-editor-save:not(:disabled)'))};
  }).toString()+')('+[attr,valueField,unsaved].map(value=>JSON.stringify(value)).join(',')+')');
  await clickRow('stable');
  await until(async()=>await read(tool,'document.querySelector('+JSON.stringify(valueField)+')?.value==="fictional-stable"'),
    'Read the original value of the stable fixture Cookie');
  await fill(valueField,unsaved);
  await click(tool,'.cookie-inline-editor .cookie-editor-details > summary');
  await click(tool,attr);
  const edited=await draftState();
  assert(edited.dirty&&edited.httpOnly&&edited.typedValue&&edited.canSave,'Native inputs changed the attribute draft and unsaved value');
  const draftGate=fixtureDriver.hold('127.0.0.1');
  let pendingDraft,draftFenced;
  try{
    await client.send('Page.reload',{ignoreCache:true},websiteSession);
    await until(()=>draftGate.request,'Second same-URL reload reached the fixture');
    const pending=await observe(fenced,'The current draft editor hides during reload',5000);
    pendingDraft=await draftState();
    draftFenced=fenced(pending)&&!pendingDraft.editor&&!pendingDraft.typedValue&&!draftGate.request.releasedAt;
  }finally{draftGate.release?.();}
  const resumed=await until(async()=>{const state=await draftState();return state.restored?state:null;},
    'Restore the reviewed attribute draft automatically after the same Cookie is verified',12000);
  const draftDoc=await documentId();
  const native=(await nativeRows('127.0.0.1')).find(row=>row.name===reloadCookie('stable'));
  await verify('reload-attribute-draft',[
    !(draftDoc&&draftDoc!==newDoc&&draftFenced)&&'the same-URL reload must hide the previous draft editor and commit a new document',
    !(resumed.editor?.endsWith(reloadCookie('stable'))&&resumed.httpOnly&&resumed.dirty&&resumed.canSave)&&'the same verified Cookie must reopen with the unsaved HttpOnly attribute',
    resumed.typedValue&&'the user-entered value must never be restored',
    !(native?.value==='fictional-stable'&&native.httpOnly===false)&&'the native store must remain unchanged without an explicit save'
  ],{edited,pendingDraft,draftFenced,resumed,draftDoc,nativeUnchanged:native?.value==='fictional-stable'&&native.httpOnly===false});
  const switchGate=fixtureDriver.hold('localhost');
  const navigation=client.send('Page.navigate',{url:targets[1]},websiteSession).then(result=>({result}),error=>({error}));
  let duringSwitch,recovery;
  try{
    await until(()=>switchGate.request,'Hard site switch reached the fixture');
    duringSwitch=await observe(fenced,'Old site rows fenced before hard switch commits',5000);
    const retry='.cookie-check-recovery button';
    const control=await until(async()=>read(tool,'Boolean(document.querySelector('+JSON.stringify(retry)+')?.getClientRects().length)'),
      'Retry appears while the replacement document is still blocked',7500).catch(()=>false);
    const reachable=control&&await tabTo(retry);
    if(reachable)await key('Enter');
    const afterRetry=await appState();
    recovery={control,reachable,afterRetry};
    await verify('reload-manual-recovery-control',[
      !control&&'a lasting page check must expose inline Retry',
      !reachable&&'Retry must be keyboard reachable',
      !fenced(afterRetry)&&'Retry must not restore old private data before commit',
      afterRetry.technicalCode&&'technical codes must stay collapsed'
    ],recovery);
  }finally{switchGate.release?.();}
  const nav=await navigation;if(nav.error)throw nav.error;assert(!nav.result.errorText,nav.result.errorText);
  const switched=await observe(s=>ready(s,'localhost','other'),'Different hostname automatically loads its own Cookie row',12000);
  const switchedDoc=await documentId();
  await verify('reload-hard-site-switch',[
    !(switchedDoc&&switchedDoc!==draftDoc&&ready(switched,'localhost','other'))&&'hard switch must commit a new document and display its own data',
    !(fenced(duringSwitch)&&!hasRow(switched,'old')&&!hasRow(switched,'new')&&!hasRow(switched,'stable')&&!switched.oldValue&&!switched.editor)&&'hard switch must fence previous-site data and draft'
  ],{duringSwitch,switched,switchedDoc,manualRereads:recovery?.reachable?1:0});
  await client.send('Runtime.releaseObjectGroup',{objectGroup:'slow-reload-controls'},context);
  assert(!failures.length,failures.join('; '));
}
async function restartDevelopment(){
  const before=await grantRecord(),previous=launched.metadata;
  const candidateBefore=await readFile(path.join(extension,release.packagePath));
  const identity=async()=>{
    const installedPackage=await read(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="cookie-editor"))');
    const catalogPackage=JSON.parse(candidateBefore);assert.equal(installedPackage.version,'2.0.30');
    for(const field of ['html','css','js'])assert.equal(installedPackage[field],catalogPackage[field]);
    return {version:installedPackage.version,catalogSHA256:release.sha256,jsSHA256:createHash('sha256').update(installedPackage.js).digest('hex')};
  };
  const packageBefore=await identity();await checkpoint('restart-before',{grant:before,package:packageBefore,profile:previous.profile,pid:previous.pid});
  const owner=await connect(process.env.COOKIE_NATIVE_OWNER_INSPECTOR);
  try{
    const closing=client.send('Browser.close').catch(()=>{});
    // This function belongs to the original test driver, and invokes its
    // existing guarded launchChrome().restart(), never product Runtime code.
    const restarted=await owner.send('Runtime.evaluate',{expression:'globalThis.__cookieR5303Restart()',awaitPromise:true,returnByValue:true});
    if(restarted.exceptionDetails)throw Error('Original owned launcher restart failed');
    await closing;client.close();const next=restarted.result.value;
    assert.equal(next.metadata.profile,previous.profile);assert.notEqual(next.metadata.pid,previous.pid);
    launched={metadata:next.metadata,endpoint:next.endpoint};report.launch=next.metadata;report.cdpEndpoint=next.endpoint;
    await wire(next.endpoint);await openPanel(targets[0]);await openOfficial();await hideSettings();await bindTool();
    const after=await grantRecord();assert(granted(after));assert.equal(after.version,'2.0.30');
    assert.equal(after.cookieAllSites.grantEpoch,before.cookieAllSites.grantEpoch);
    const packageAfter=await identity();assert.deepEqual(packageAfter,packageBefore);
    assert.equal(createHash('sha256').update(await readFile(path.join(extension,release.packagePath))).digest('hex'),release.sha256);
    await until(()=>read(tool,'(()=>{const n=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return Boolean(n&&!n.disabled&&document.querySelector(".site-hostname")?.textContent==="127.0.0.1");})()'),'Restarted list readable with retained consent');
    assert.equal(await read(tool,'Boolean(document.querySelector(".cookie-permission button")?.getClientRects().length)'),false);
    const screenshot=path.join(directory,'development-after-restart.png');const captured=await client.send('Page.captureScreenshot',{format:'png'},side);await writeFile(screenshot,Buffer.from(captured.data,'base64'));
    await checkpoint('same-profile-restart',{previousPid:previous.pid,pid:next.metadata.pid,profile:next.metadata.profile,grantEpochBefore:before.cookieAllSites.grantEpoch,grantEpochAfter:after.cookieAllSites.grantEpoch,packageBefore,packageAfter,developmentConnection:report.developmentConnection,newConsentClicks:0,manualRereads:0,screenshot});
  }finally{owner.close();}
  const core=JSON.parse(await readFile(process.env.COOKIE_NATIVE_CORE_REPORT,'utf8'));
  const expected=core.cases.filter(c=>c.name==='site-create-edit-readback');assert(expected.length>0);
  for(const row of expected){
    const existing=(await nativeRows(row.hostname)).filter(cookie=>cookie.name===row.cookieName&&cookie.domain===row.domain&&cookie.path===row.path&&cookie.storeId===row.storeId);
    assert(existing.length<=1,'Fixture has one exact native identity');
    if(existing.length){
      assert.equal(createHash('sha256').update(existing[0].value).digest('hex'),row.valueSha256,'Delete only the driver-owned fictional fixture');
      const selector=await until(()=>read(tool,`(()=>{const n=[...document.querySelectorAll('.row-trigger')].find(n=>n.textContent.includes(${JSON.stringify(row.cookieName)}));return n?'[data-row='+JSON.stringify(n.dataset.row)+']':null;})()`),'Owned fixture visible');
      await click(tool,selector);await click(tool,'[aria-label="删除 Cookie"]');
      await until(async()=>(await nativeRows(row.hostname)).every(cookie=>!(cookie.name===row.cookieName&&cookie.domain===row.domain&&cookie.path===row.path&&cookie.storeId===row.storeId)),'Exact fixture deleted through product');
    }
    await checkpoint('fixture-cookie-cleanup',{cookieName:row.cookieName,hostname:row.hostname,domain:row.domain,path:row.path,storeId:row.storeId,method:existing.length?'real-product-delete':'already-absent-after-restart',nativeAbsent:true});
  }
  await showSettings();await click(side,'#sidebar-tool-cookie-site-toggle');await until(async()=>!granted(await grantRecord()),'Final development revoke');await hideSettings();await bindTool();
  await until(()=>read(tool,'document.querySelectorAll(".row-trigger").length===0'),'Final revoke clears list');
  await checkpoint('all-sites-revoke',{record:await grantRecord(),visibleRows:0});
}
async function upgradeSameId(){
  // Keep the historical upgrade input stable after this candidate is committed.
  const baselineCommit=process.env.COOKIE_NATIVE_BASELINE_COMMIT||'b0fb4f4afc0f066494bf4c5f338a4392dbebc707';
  const oldBytes=process.env.COOKIE_NATIVE_OLD_TOOL?await readFile(process.env.COOKIE_NATIVE_OLD_TOOL):execFileSync('git',['show',baselineCommit+':projects/cookie-editor/cookie-editor.opendesk-tool.json'],{cwd:root,maxBuffer:8*1024*1024});
  const old=JSON.parse(oldBytes);assert.equal(old.version,'2.0.29','This release upgrades the historical 2.0.29 baseline');
  const oldPath=process.env.COOKIE_NATIVE_OLD_TOOL||path.join(directory,'upgrade-from-2.0.29.opendesk-tool.json');
  if(!process.env.COOKIE_NATIVE_OLD_TOOL)await writeFile(oldPath,oldBytes);
  const candidatePath=path.join(extension,release.packagePath);
  const candidate=JSON.parse(await readFile(candidatePath,'utf8'));
  const baseline=verifyCookieEditorUpgradeBaseline(oldBytes,candidate,{version:old.version,
    sha256:process.env.COOKIE_NATIVE_OLD_SHA||createHash('sha256').update(oldBytes).digest('hex')});
  report.upgradeBaseline={...baseline,sourceCommit:baselineCommit};
  await click(side,'#sidebar-tool-remove');await click(side,'#sidebar-tool-inline-remove-confirm');
  await until(async()=>!await installed(),'Candidate removed before historical baseline install');
  await click(side,'#extension-center-more');await click(side,'#extension-center-import');
  await client.send('Page.enable',{},side);
  await client.send('Page.setInterceptFileChooserDialog',{enabled:true},side);
  try{
    const first=fileChoosers.length;
    await click(side,'#sidebar-tool-file');
    const chooser=await until(()=>fileChoosers.slice(first).find(event=>event.sessionId===side),'Trusted input opens intercepted file chooser');
    assert(chooser.backendNodeId,'File chooser identifies its native input');
    await client.send('DOM.setFileInputFiles',{files:[path.resolve(oldPath)],backendNodeId:chooser.backendNodeId},side);
    await checkpoint('historical-native-picker',{path:path.resolve(oldPath),sha256:baseline.sha256,backendNodeId:chooser.backendNodeId,protocol:'Page.fileChooserOpened + DOM.setFileInputFiles'});
  }finally{await client.send('Page.setInterceptFileChooserDialog',{enabled:false},side);}
  await until(()=>read(side,'Boolean(document.querySelector("#sidebar-tool-preview")?.getClientRects().length)'),'Historical package native picker',60000);
  assert(await read(side,'document.querySelector("#sidebar-tool-preview-version").textContent.includes('+JSON.stringify(baseline.version)+')'),'Historical version review');
  await click(side,'#sidebar-tool-install');
  await until(async()=>(await installed())?.version===baseline.version,'Historical installation persisted');
  // The reviewed old package is not the new catalog's official release.
  // Do not grant it all-sites access under the new candidate's identity.
  await checkpoint('historical-reviewed-install',{installed:await installed(),controls:await read(side,'[...document.querySelectorAll(".ec-row button")].map(n=>({key:n.dataset.extensionKey,action:n.dataset.extensionAction,label:n.getAttribute("aria-label"),disabled:n.disabled,rect:n.getBoundingClientRect().toJSON()}))')});
  await click(side,'[data-extension-id="app:cookie-editor"] button[aria-haspopup="menu"]');
  await click(side,'[data-ec-context-action="update"]');
  await until(()=>read(side,'Boolean(document.querySelector("#sidebar-tool-preview")?.getClientRects().length)'),'Candidate explicit upgrade review');
  const review=await read(side,'document.querySelector("#sidebar-tool-update-versions")?.textContent');
  assert(review?.includes(baseline.version)&&review.includes(release.version),'Both upgrade versions reviewed');
  await click(side,'#sidebar-tool-install');
  await until(async()=>(await installed())?.version===release.version,'New revision installed');
  assert(!granted(await grantRecord()),'Historical installation consent cannot authorize the upgraded revision');
  await openOfficial();await bindTool();
  await checkpoint('same-id-upgrade',{baseline,targetVersion:release.version,oldPackageGrantAttempted:false,record:await grantRecord(),review,
    limitation:'Historical-version CRUD is OUT_OF_SCOPE; the new official revision receives its own reviewed grant'});
}
async function stay(){
  console.log(JSON.stringify({debugReady:true,pid:launched.metadata.pid,profile:launched.metadata.profile,directory}));
  const input=createInterface({input:process.stdin});
  for await(const line of input){
    try{
      const command=JSON.parse(line);if(command.action==='close')break;
      if(command.action==='inspect')console.log(JSON.stringify({ui:await state(tool),geometry:await read(tool,
        '({width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,controls:[...document.querySelectorAll(".cookie-editor-save,.cookie-inline-editor,[aria-label=\\"Cookie 值\\"]")].map(n=>({tag:n.tagName,class:n.className,rect:n.getBoundingClientRect().toJSON()}))})'),
        frame:await read(side,'document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect().toJSON()')}));
      else if(command.action==='wheel')await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:command.x,y:command.y,deltaX:0,deltaY:command.deltaY},side);
      else if(command.action==='click')await click(command.surface==='side'?side:tool,command.selector);
      else if(command.action==='save-current'){
        assert(pendingEdit,'No pending edited Cookie');await click(tool,'.cookie-editor-save');
        await until(async()=>{await noSecondConfirmation();return(await nativeRows(pendingEdit.hostname)).some(row=>row.name===pendingEdit.name&&row.value===pendingEdit.updated);},'Edited Cookie native readback');
        await checkpoint('edit-save-readback',{hostname:pendingEdit.hostname,cookieName:pendingEdit.name});pendingEdit=null;
      }else if(command.action==='export')await exportOnce();
      else if(command.action==='finish'){
        assert(Object.values(report.results).every(result=>result==='PASS'));report.complete=true;report.recoveredError=report.error;delete report.error;process.exitCode=0;await save();break;
      }else throw Error('Unknown debug command');
      await save();console.log(JSON.stringify({command:command.action,settled:true}));
    }catch(error){console.log(JSON.stringify({debugError:error.code==='ERR_ASSERTION'?'Assertion failed':error.message}));}
  }
  input.close();
}
await mkdir(directory,{recursive:true});
try{
  assert.equal(process.platform,'darwin');
  const reloadFixture=slowReload?await startSlowReloadFixture():null;
  const clearFixture=clearReceipt?await startClearFixture():null;
  if(!slowReload&&!clearReceipt){
  const fixtureAvailable=await fetch(fixture,{signal:AbortSignal.timeout(1500)}).then(r=>r.ok).catch(()=>false);
  if(!fixtureAvailable){
    const html=await readFile(path.join(root,'examples/tasks/demo-form.html'));
    ownedFixture=createServer((req,res)=>{if(req.url!=='/demo-form.html'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
    await new Promise((resolve,reject)=>{ownedFixture.once('error',reject);ownedFixture.listen(43111,'127.0.0.1',resolve);});
    report.fixtureServer={owned:true,url:fixture};
  }else report.fixtureServer={owned:false,url:fixture};
  }
  report.sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  report.manifestSha256=createHash('sha256').update(await readFile(path.join(extension,'manifest.json'))).digest('hex');
  const catalog=JSON.parse(await readFile(path.join(extension,'official-tools/catalog.json'),'utf8'));
  release=catalog.apps.find(row=>row.toolId==='cookie-editor');assert(release,'Official Cookie release missing');
  report.release={version:release.version,sha256:release.sha256};
  const toolBytes=await readFile(path.join(extension,release.packagePath));assert.equal(createHash('sha256').update(toolBytes).digest('hex'),release.sha256);
  if(mode!=='development')report.packageBefore=await packageFingerprint(extension);
  try{const dev=JSON.parse(await readFile(path.join(extension,'development-update.json'),'utf8'));report.developmentRevision=dev.revision;}catch{}
  report.watcherProcesses=execFileSync('/bin/ps',['-axo','pid,ppid,command'],{encoding:'utf8'}).split('\n').filter(l=>l.includes('node scripts/dev.mjs'));
  if(reuseReport){const prior=JSON.parse(await readFile(path.resolve(reuseReport),'utf8'));assert.equal(prior.extension,extension);assert.equal(prior.mode,'development');launched={metadata:prior.launch,endpoint:prior.cdpEndpoint};report.reusedOwnedBrowser={report:path.resolve(reuseReport),pid:prior.launch.pid,profile:prior.launch.profile};}
  else launched=await launchChrome({root,binary,extension,headed:true,directory,label:'cookie-r5303',sameProfileRestart:!slowReload&&!clearReceipt});
  report.launch=launched.metadata;await save();
  console.log(JSON.stringify({launched:true,pid:launched.metadata.pid,profile:launched.metadata.profile,extension,endpoint:launched.endpoint}));
  await wire(launched.endpoint);
  report.browserVersion=await client.send('Browser.getVersion');await save();
  report.cdpEndpoint=launched.endpoint;await save();
  const website=await openPanel(clearFixture||undefined);
  await checkpoint('actual-entry',{extensionId:report.extensionId,developmentConnection:report.developmentConnection});
  if(stage==='recheck')await developmentUpdate();
  if(localCandidate)await importLocalCandidate(path.resolve(localCandidate));else await openOfficial();
  if(stage==='upgrade')await upgradeSameId();
  if(slowReload)await grantReloadFixture();
  else if(clearReceipt)await grantClearFixture();
  else{await grantAll();await grantValues();}
  if(clearReceipt)await verifyClearReceipt();
  else if(slowReload)await verifySlowReload(website,reloadFixture);
  else if(stage==='restart-dev')await restartDevelopment();
  else if(stage==='diagnose'){
    const observe=async(label)=>{
      let previous;
      for(let i=0;i<12;i++){
        const status=await read(tool,'(()=>{const site=document.querySelector(".site-hostname"),retry=document.querySelector(".cookie-permission button"),create=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return {site:site?.textContent,permission:document.querySelector(".cookie-permission")?.textContent,retryVisible:Boolean(retry?.getClientRects().length),retryEnabled:Boolean(retry&&!retry.disabled),canCreate:Boolean(create&&!create.disabled),rowCount:document.querySelectorAll(".row-trigger").length,notices:[...document.querySelectorAll("[role=alert],[role=status],.cookie-notice,.cookie-warning,.cookie-error")].filter(n=>n.getClientRects().length).map(n=>n.textContent)};})()');
        const key=JSON.stringify(status);if(key!==previous){await checkpoint('development-ui-state',{label,status});previous=key;}
        await sleep(200);
      }
    };
    await observe('after-first-grant');
    for(const url of targets){
      await visit(url);await bindTool();await observe('switch:'+new URL(url).hostname);
      for(let attempt=1;attempt<=2;attempt++){
        if(!await read(tool,'(()=>{const n=document.querySelector(".cookie-permission button");return Boolean(n?.getClientRects().length&&!n.disabled&&n.textContent.includes("重新读取"));})()'))break;
        await click(tool,'.cookie-permission button');await checkpoint('development-manual-reread',{origin:new URL(url).origin,attempt});
        await observe('after-reread:'+new URL(url).hostname+':'+attempt);
      }
    }
    await checkpoint('development-reread-observation',{cookieWrites:false,record:await grantRecord()});
  }else{
  if(stage==='recheck')await automaticLists();
  const expected=[];
  expected.push(await editForSite(targets[0],0));
  await exportOnce();
  if(stage!=='baseline'&&stage!=='recheck'){
    const originalGrant=await grantRecord();
    for(const [index,url] of targets.entries()){
      if(index>0)await visit(url);await readableList(url);
      const record=await grantRecord();assert(granted(record));assert.equal(record.cookieAllSites.grantEpoch,originalGrant.cookieAllSites.grantEpoch);
      await checkpoint('site-list-reused',{origin:new URL(url).origin,grantEpoch:record.cookieAllSites.grantEpoch,visibleRows:await read(tool,'document.querySelectorAll(".row-trigger").length')});
    }
    await checkpoint('three-site-list-reuse',{origins:targets.map(url=>new URL(url).origin),grantEpoch:originalGrant.cookieAllSites.grantEpoch});
    const previous=launched.metadata;
    const closing=client.send('Browser.close').catch(()=>{});
    const restarted=await launched.restart();await closing;client.close();
    assert.equal(restarted.metadata.profile,previous.profile);assert.notEqual(restarted.metadata.pid,previous.pid);
    await wire(restarted.endpoint);await openPanel(targets[0]);await openOfficial();
    const afterRestart=await grantRecord();assert(granted(afterRestart));
    assert.equal(afterRestart.cookieAllSites.grantEpoch,originalGrant.cookieAllSites.grantEpoch,'Restart retains the identical all-sites grantEpoch');
    await hideSettings();await bindTool();
    await until(()=>read(tool,'(()=>{const n=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return n&&!n.disabled;})()'),'Reopened Cookie list readable without new consent');
    await checkpoint('same-profile-restart',{previousPid:previous.pid,pid:restarted.metadata.pid,profile:restarted.metadata.profile,
      grantEpochBefore:originalGrant.cookieAllSites.grantEpoch,grantEpochAfter:afterRestart.cookieAllSites.grantEpoch,listReadable:true,cookiePersistence:'OUT_OF_SCOPE'});
    await showSettings();await click(side,'#sidebar-tool-cookie-site-toggle');
    await until(async()=>{const record=await grantRecord();return caps.every(cap=>record?.cookieAllSites?.[cap]!==true);},'All-sites revoked');await hideSettings();await bindTool();
    for(const url of targets){
      await visit(url);await bindTool();
      await until(()=>read(tool,'(()=>{const n=document.querySelector('+JSON.stringify('[aria-label="新建 Cookie"]')+');return !n||n.disabled;})()'),'Revoked site cannot write');
      await until(()=>read(tool,'document.querySelectorAll(".row-trigger").length===0'),'Revocation clears cached Cookie rows');
    }
    await checkpoint('all-sites-revoke',{record:await grantRecord(),sites:targets.map(url=>new URL(url).origin)});
  }
  if(stage==='recheck'){
    await showSettings();await click(side,'#sidebar-tool-cookie-site-toggle');
    await until(async()=>!granted(await grantRecord()),'Revoke updated development consent');await hideSettings();await bindTool();
    await until(()=>read(tool,'document.querySelectorAll(".row-trigger").length===0'),'Revocation clears visible rows');
    await checkpoint('all-sites-revoke',{record:await grantRecord()});
    report.restart={status:'NOT_TESTED',reason:'Prioritized updated development UI; original owned browser is retained'};
  }
  }
  assert(Object.values(report.results).every(value=>value==='PASS'),'Every selected core case completed');
  if(mode!=='development'){report.packageAfter=await packageFingerprint(extension);assert.equal(report.packageAfter.packageHash,report.packageBefore.packageHash,'Static candidate must remain immutable');}
  report.complete=true;
  await save();
}catch(error){const message=error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:error.message;report.error={message,stack:String(error.stack).split('\n').filter(line=>/^\s+at /.test(line)).join('\n')};if(client)try{report.lastTargets=(await client.send('Target.getTargets')).targetInfos;}catch{};if(side)try{report.lastSide=await state(side);}catch{};if(tool)try{report.lastTool=await state(tool);}catch{};console.error(JSON.stringify({error:message,directory}));process.exitCode=1;
}finally{
  if(launched&&client&&tool&&process.env.COOKIE_NATIVE_STAY==='1')await stay();
  client?.close();
  if(launched&&!reuseReport){await launched.copyLog();report.cleanup=await launched.stop();}
  if(reuseReport)report.retainedOwnedBrowser={pid:launched.metadata.pid,profile:launched.metadata.profile,endpoint:launched.endpoint};
  if(report.cleanup&&report.cleanup.cleanupStatus!=='PASS'){report.complete=false;process.exitCode=1;}
  if(ownedFixture?.listening)await new Promise(resolve=>ownedFixture.close(resolve));
  report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({report:path.join(directory,'report.json'),complete:report.complete}));
}

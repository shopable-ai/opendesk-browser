#!/usr/bin/env node
// Two REAL installed tool packages through the existing OpenDesk Host + isolated Chrome profile.
// Unlike the dual preview, this test has NO simulated OpenDeskTool and calls the real SDK.
// Assert Chrome's genuine SIDE_PANEL context; a tool.html tab is catalog-only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey,validateSidebarToolPackage,
  serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,sidebarToolEnabled} from '../../src/ui/sidebar-tools/lifecycle.js';
import {verifyPackage} from '../verify-package.mjs';

const extension=resolve(process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const paths=[
  resolve(process.env.OPENDESK_QN_NATIVE_TOOL_FILE||'artifacts/sidebar-tools/quick-notes/native-candidate.opendesk-tool.json'),
  resolve(process.env.OPENDESK_QN_REACT_TOOL_FILE||'artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json')
];
const out=resolve(process.argv[2]||'artifacts/sidebar-tools/quick-notes-react/installed-chrome');
await mkdir(out,{recursive:true});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
async function waitForChromeExit(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise(resolve=>child.once('close',()=>resolve(true)));
  child.kill();
  if(!await Promise.race([exited,delay(2500).then(()=>false)])&&
      child.exitCode===null&&child.signalCode===null){
    child.kill('SIGKILL');
    await Promise.race([exited,delay(2500)]);
  }
}

let processChrome,profile,socket,sequence=0,launchError,host,extensionId,bootstrapHost,bootstrapTabId;
const outstanding=new Map(),attached=new Map(),browserErrors=[],networkFailures=[],browserLog=[];
const result={scope:'REAL_OPEN_DESK_NATIVE_SIDE_PANEL',macNativeSidePanel:'NOT_TESTED',
  simulatedSDK:false,isolatedProfile:true,status:'RUNNING',packages:[],operations:[],
  dataIsolation:'NOT_TESTED',upgrade:'NOT_TESTED'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function call(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{outstanding.delete(id);fail(Error('CDP_TIMEOUT '+method));},18000);
    outstanding.set(id,{ok:r=>{clearTimeout(timeout);ok(r);},fail:e=>{clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function until(fn,what,ms=24000){
  let last;
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    try{const item=await fn();if(item)return item;}catch(error){last=error.message;}
    await delay(100);
  }
  throw Error('WAIT_FOR '+what+(last?': '+last:''));
}
async function connect(){
  let port,endpoint;
  for(let i=0;i<150;i++){
    if(launchError)throw launchError;
    if(processChrome.exitCode!==null||processChrome.signalCode!==null)
      throw Error('Chrome exited before startup');
    try{
      const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      if(lines.length>=2){port=Number(lines[0]);endpoint='ws://127.0.0.1:'+port+lines[1];break;}
    }catch{}
    await delay(100);
  }
  assert.ok(endpoint,'no Chrome debugging endpoint');
  socket=new WebSocket(endpoint);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const item=JSON.parse(event.data);
    if(item.id&&outstanding.has(item.id)){
      const p=outstanding.get(item.id);outstanding.delete(item.id);
      item.error?p.fail(Error(item.error.message)):p.ok(item.result);
    }
    const p=item.params;
    if(item.method==='Runtime.exceptionThrown')
      browserErrors.push({session:item.sessionId,error:p.exceptionDetails?.exception?.description||p.exceptionDetails?.text});
    if(item.method==='Network.responseReceived'&&p.response.status>=400&&
      !p.response.url.endsWith('/favicon.ico'))networkFailures.push({status:p.response.status,url:p.response.url});
  });
  await call('Target.setDiscoverTargets',{discover:true});
}
async function attach(targetId){
  if(attached.has(targetId))return attached.get(targetId);
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Runtime.enable',{},sessionId);
  await call('Network.enable',{},sessionId);
  attached.set(targetId,sessionId);
  return sessionId;
}
async function evaluate(sessionId,expr){
  const value=await call('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function click(sessionId,selector){
  // OOPIF coordinates differ from the native panel's viewport. Use the same
  // accessible button's genuine keyboard activation inside the sandbox.
  if(sessionId!==host){
    await until(()=>evaluate(sessionId,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!e||e.disabled||!e.getClientRects().length)return false;e.focus();return document.activeElement===e})()'),
      'focus '+selector);
    const checkbox=await evaluate(sessionId,'document.activeElement?.type==="checkbox"');
    const key=checkbox?{key:' ',code:'Space',windowsVirtualKeyCode:32}:{key:'Enter',code:'Enter',windowsVirtualKeyCode:13};
    await call('Input.dispatchKeyEvent',{type:'keyDown',...key,
      text:checkbox?' ':'\r',unmodifiedText:checkbox?' ':'\r'},sessionId);
    await call('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
    (result.activationEvidence??=[]).push({selector,events:await evaluate(sessionId,'globalThis.__qnEvents')});
    return;
  }
  const pt=await until(async()=>{
    const x=await evaluate(sessionId,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!e||e.disabled||e.hidden)return null;e.scrollIntoView({block:"center"});'+
      'const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;'+
      'return {x,y,valid:r.width>0&&r.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&e.contains(document.elementFromPoint(x,y))}})()');
    return x?.valid?x:null;
  },'click '+selector);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y},sessionId);
  for(const type of ['mousePressed','mouseReleased'])
    await call('Input.dispatchMouseEvent',{type,x:pt.x,y:pt.y,button:'left',clickCount:1},sessionId);
}
async function persistedPackage(id){
  return evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+
    ').then(x=>(x['+JSON.stringify(SIDEBAR_TOOL_STORE)+']||[]).find(p=>p.id==='+JSON.stringify(id)+')||null)');
}
async function importTool(tool,{update=false}={}){
  const already=await persistedPackage(tool.id);
  if(update)assert.ok(already,'real Host update requires an installed baseline');
  if(already&&!update){
    assert.equal(hash(Buffer.from(serializeSidebarToolPackage(already))),tool.sha,
      'preinstalled native package must match its original source baseline');
    result.operations.push('PREINSTALLED_PACKAGE_MATCH_'+tool.id);
    return;
  }
  await click(host,'#extension-center-more');
  const menuProbe=await evaluate(host,'(()=>{const b=document.querySelector("#extension-center-import"),m=document.querySelector("#extension-center-menu"),t=document.querySelector("#extension-center-more"),r=b?.getBoundingClientRect(),s=b?getComputedStyle(b):null;return {expanded:t?.getAttribute("aria-expanded"),menuHidden:m?.hidden,buttonHidden:b?.hidden,offsetParent:!!b?.offsetParent,style:s?.display,visibility:s?.visibility,rect:r&&{x:r.x,y:r.y,width:r.width,height:r.height},screen:{width:innerWidth,height:innerHeight},status:document.querySelector("#extension-center-status")?.textContent}})()');
  console.log('R21_REAL_IMPORT_MENU_STATE '+JSON.stringify(menuProbe));
  if(menuProbe.menuHidden||!menuProbe.offsetParent)
    throw Error('REAL_IMPORT_MENU_NOT_VISIBLE '+JSON.stringify(menuProbe));
  await click(host,'#extension-center-import');
  await call('DOM.enable',{},host);
  const root=(await call('DOM.getDocument',{depth:1},host)).root;
  const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);
  assert.ok(nodeId,'genuine import file input');
  await call('DOM.setFileInputFiles',{nodeId,files:[tool.file]},host);
  const approval=await until(async()=>{
    const x=await evaluate(host,'(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden?'+
      '{title:document.querySelector("#sidebar-tool-preview-title")?.textContent,version:document.querySelector("#sidebar-tool-preview-version")?.textContent,disabled:document.querySelector("#sidebar-tool-install")?.disabled}:null})()');
    return x&&!x.disabled?x:null;
  },'review '+tool.id);
  assert.equal(approval.title.trim(),tool.title,'review matches imported package title');
  await click(host,'#sidebar-tool-install');
  const saved=await until(async()=>{
    const value=await persistedPackage(tool.id);
    return value&&hash(Buffer.from(serializeSidebarToolPackage(value)))===tool.sha?value:null;
  },(update?'updated ':'installed ')+tool.id);
  assert.equal(hash(Buffer.from(serializeSidebarToolPackage(saved))),tool.sha,
    'real installed package must match tested candidate bytes');
  result.operations.push((update?'TRUSTED_UI_UPDATE_':'TRUSTED_UI_IMPORT_')+tool.id);
}
async function openTool(id){
  const row='#extension-center-list button[data-extension-key="app:'+id+'"][data-extension-action="primary"]';
  await click(host,row);
  const target=await until(async()=>{
    const items=(await call('Target.getTargets')).targetInfos;
    return items.find(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html')&&
      x.url.startsWith('chrome-extension://'+extensionId+'/'));
  },'real opaque sandbox '+id);
  const frame=await attach(target.targetId);
  const state=await until(async()=>{
    const x=await evaluate(frame,'(()=>({ready:document.querySelector("#tool-status")?.dataset.state,'+
      'textarea:!!document.querySelector("#note-text")&&!document.querySelector("#note-text").disabled,'+
      'sdk:typeof globalThis.OpenDeskTool?.request,chrome:typeof globalThis.chrome?.runtime,'+
      'runtime:globalThis.OpenDeskPageReact?.version}))()');
    return x.ready==='ready'&&x.textarea?x:null;
  },'real sandbox ready '+id);
  assert.equal(state.sdk,'function','real SDK request bridge');
  assert.equal(state.chrome,'undefined','tool sandbox is not trusted Chrome code');
  assert.equal(state.runtime,id==='quick-notes-react'?'19.2.0':undefined);
  await evaluate(frame,'(()=>{globalThis.__qnEvents=[];for(const type of ["click","keydown","keypress"])'+
    'document.addEventListener(type,e=>{globalThis.__qnEvents.push({type,key:e.key,target:e.target.id||e.target.getAttribute("aria-label"),trusted:e.isTrusted})});})()');
  return {target,frame,state};
}
async function saveText(opened,text,id){
  await evaluate(opened.frame,'document.querySelector("#note-text").focus()');
  await call('Input.insertText',{text},opened.frame);
  await until(()=>evaluate(opened.frame,
    'document.querySelector("#note-text")?.value==='+JSON.stringify(text)),'user text typed '+id);
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(async()=>{
    const value=await evaluate(opened.frame,'({n:document.querySelectorAll(".note-list button").length,'+
      'status:document.querySelector("#note-status, .note-status")?.textContent||null})');
    return value.n===1&&/已保存/.test(value.status||'')?value:null;
  },'real Host storage acknowledged '+id);
  assert.deepEqual(await storedTexts(id),[text],'Host readback must match entered note');
  result.operations.push('REAL_SDK_WRITE_'+id);
}
async function closeTool(){
  await click(host,'#sidebar-tool-back');
  await until(()=>evaluate(host,
    'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),'close iframe');
}
async function storageDigest(id){
  const key=sidebarToolStorageKey(id);
  const state=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(key)+').then(x=>x['+
    JSON.stringify(key)+']??null)');
  assert.ok(state,'persistent data namespace must exist for '+id);
  return hash(Buffer.from(JSON.stringify(state)));
}

async function storedTexts(id){
  const key=sidebarToolStorageKey(id);
  return evaluate(host,'chrome.storage.local.get('+JSON.stringify(key)+').then(x=>'+
    'x['+JSON.stringify(key)+']?.notes?.map(n=>n.text)??null)');
}
async function enabledFromHost(id){
  const value=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_ENABLE_STORE)+
    ').then(x=>x['+JSON.stringify(SIDEBAR_TOOL_ENABLE_STORE)+'])');
  return sidebarToolEnabled(value,id);
}
async function manageReact(action){
  await click(host,'#extension-center-list button[data-extension-key="app:quick-notes-react"]'+
    '[data-extension-action="more"]');
  await until(()=>evaluate(host,'(()=>{const menu=document.querySelector("#extension-center-row-menu");'+
    'return menu&&!menu.hidden&&!!menu.querySelector('+
    JSON.stringify('[data-ec-context-action="'+action+'"]')+')})()'),'real React manager '+action);
  await click(host,'#extension-center-row-menu button[data-ec-context-action="'+action+'"]');
}
async function editReact(){
  const opened=await openTool('quick-notes-react');
  const content='React 已修改的独立数据';
  await evaluate(opened.frame,'(()=>{const e=document.querySelector("#note-text");'+
    'e.focus();e.select();return e.value})()');
  await call('Input.insertText',{text:content},opened.frame);
  await until(()=>evaluate(opened.frame,
    'document.querySelector("#note-text")?.value==='+JSON.stringify(content)),'real React edit');
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(async()=>{
    const values=await storedTexts('quick-notes-react');
    return values?.length===1&&values[0]===content;
  },'React edited Host storage');
  await closeTool();
  result.operations.push('REAL_SDK_EDIT_REACT');
}
async function deleteReact(){
  const opened=await openTool('quick-notes-react');
  await click(opened.frame,'button[aria-label="删除当前笔记"]');
  await until(()=>evaluate(opened.frame,'!!document.querySelector("#note-confirm-message")'),
    'React delete confirmation');
  assert.equal(await evaluate(opened.frame,'document.activeElement?.textContent'),'取消',
    'destructive dialog starts at Cancel');
  await click(opened.frame,'.note-confirm .confirm-actions button:last-child');
  await until(async()=>{
    const values=await storedTexts('quick-notes-react');
    const ui=await evaluate(opened.frame,'(()=>({count:document.querySelectorAll(".note-list button").length,'+
      'text:document.querySelector("#note-text")?.value}))()');
    return values?.length===0&&ui.count===0&&ui.text==='';
  },'React delete acknowledged by Host and UI');
  await closeTool();
  result.operations.push('REAL_SDK_DELETE_REACT');
}
async function invalidUpdateRetainsInstallation(){
  const original=await persistedPackage('quick-notes-react');
  const digest=await storageDigest('quick-notes-react');
  const file=join(profile,'quick-notes-react-rejected-update.opendesk-tool.json');
  await writeFile(file,JSON.stringify({...original,version:'1.0.2',uiRuntime:'unsupported.runtime'}));
  await click(host,'#extension-center-more');
  await click(host,'#extension-center-import');
  const {root}=await call('DOM.getDocument',{depth:1},host);
  const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);
  await call('DOM.setFileInputFiles',{nodeId,files:[file]},host);
  await until(()=>evaluate(host,'(()=>{const e=document.querySelector("#sidebar-tool-file-error");return e&&!e.hidden&&e.textContent})()'),
    'invalid update rejected visibly');
  assert.equal(await evaluate(host,'document.querySelector("#sidebar-tool-install")?.disabled'),true);
  assert.equal(serializeSidebarToolPackage(await persistedPackage('quick-notes-react')),
    serializeSidebarToolPackage(original),'rejected update preserves installed bytes');
  assert.equal(await storageDigest('quick-notes-react'),digest);
  await click(host,'#sidebar-tool-import-close');
  result.operations.push('REAL_HOST_REJECTED_UPDATE_PRESERVES_INSTALL_AND_DATA');
}
async function replaceText(frame,text){
  await evaluate(frame,'document.querySelector("#note-text").focus();document.querySelector("#note-text").select()');
  await call('Input.insertText',{text},frame);
  await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(text)),'editor input');
}
async function sdk(frame,operation,payload){
  return evaluate(frame,'OpenDeskTool.request('+JSON.stringify(operation)+','+JSON.stringify(payload)+')');
}
async function writeNotes(frame,notes){
  const {etag}=await sdk(frame,'storage.get',{key:'notes',withEtag:true});
  const receipt=await sdk(frame,'storage.set',{key:'notes',value:notes,ifMatch:etag});
  assert.equal(receipt.saved,true);
}
async function draftAndCapacityChecks(){
  let opened=await openTool('quick-notes-react');
  const original=(await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true})).value;
  await replaceText(opened.frame,'取消后保留的中文草稿😀');
  await click(opened.frame,'button[aria-label="新建笔记"]');
  await until(()=>evaluate(opened.frame,'!!document.querySelector(".note-confirm")'),'unsaved dialog');
  assert.deepEqual(await evaluate(opened.frame,'[".page-context",".notes-editor",".task-shortcut"].map(s=>document.querySelector(s).inert)'),[true,true,true],
    'modal background must be inert, including refresh and task disclosure');
  assert.equal(await evaluate(opened.frame,'document.querySelector(".note-confirm").getAttribute("aria-modal")'),'true');
  for(const expected of ['确定','取消']){
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},opened.frame);
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},opened.frame);
    assert.equal(await evaluate(opened.frame,'document.activeElement?.textContent'),expected);
  }
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},opened.frame);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},opened.frame);
  await until(()=>evaluate(opened.frame,'!document.querySelector(".note-confirm")'),'cancel unsaved dialog');
  assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value'),'取消后保留的中文草稿😀');
  assert.equal(await evaluate(opened.frame,'document.activeElement?.getAttribute("aria-label")'),'新建笔记',
    'cancel restores the invoking control after React commits');
  await writeNotes(opened.frame,[{...original[0],text:'并发 SDK 写入'}]);
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(()=>evaluate(opened.frame,'document.querySelector(".note-status[data-state=error]")?.textContent'),
    'real ETag conflict feedback');
  assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value'),'取消后保留的中文草稿😀');
  assert.deepEqual(await storedTexts('quick-notes-react'),['并发 SDK 写入']);
  result.operations.push('REAL_ETAG_CONFLICT_PRESERVES_DRAFT','REAL_UNSAVED_CANCEL_AND_FOCUS');
  await writeNotes(opened.frame,original);
  await click(opened.frame,'button[aria-label="新建笔记"]');
  await click(opened.frame,'.note-confirm .confirm-actions button:last-child');
  await replaceText(opened.frame,'中'.repeat(2800));
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(()=>evaluate(opened.frame,'/8 KiB/.test(document.querySelector(".note-status")?.textContent||"")'),
    '8 KiB UI guard');
  assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value.length'),2800);
  assert.deepEqual(await storedTexts('quick-notes-react'),original.map(n=>n.text));
  const rejected=await evaluate(opened.frame,'OpenDeskTool.request("storage.set",{key:"oversize-probe",value:"中".repeat(2800)}).then(()=>({accepted:true}),e=>({accepted:false,code:e.code,message:e.message}))');
  assert.equal(rejected.accepted,false,'actual Host rejects oversized storage');
  result.storageLimitRejection=rejected;
  await click(opened.frame,'button[aria-label="新建笔记"]');
  await click(opened.frame,'.note-confirm .confirm-actions button:last-child');
  await writeNotes(opened.frame,Array.from({length:16},(_,i)=>({id:'capacity-'+i,text:'笔记'+i,pageTitle:'',pageUrl:'',updatedAt:i})));
  await closeTool();
  opened=await openTool('quick-notes-react');
  assert.equal(await evaluate(opened.frame,'document.querySelectorAll(".note-list button").length'),16);
  await click(opened.frame,'button[aria-label="新建笔记"]');
  await replaceText(opened.frame,'第17条草稿');
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(()=>evaluate(opened.frame,'/最多保存 16/.test(document.querySelector(".note-status")?.textContent||"")'),'16-note guard');
  assert.equal((await storedTexts('quick-notes-react')).length,16);
  assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value'),'第17条草稿');
  await click(opened.frame,'.note-list button:first-child');
  await click(opened.frame,'.note-confirm .confirm-actions button:last-child');
  await replaceText(opened.frame,'满额仍可编辑');
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(async()=>{const texts=await storedTexts('quick-notes-react');return texts?.length===16&&texts[0]==='满额仍可编辑';},'edit full list');
  await writeNotes(opened.frame,original);
  await closeTool();
  result.operations.push('REAL_8KIB_LIMIT_PRESERVES_DRAFT','REAL_16_NOTE_LIMIT_AND_SELECTION');
}
async function toggleReact(enabled){
  await manageReact('toggle');
  await until(async()=>await enabledFromHost('quick-notes-react')===enabled,
    enabled?'React re-enabled by real Host':'React disabled by real Host');
  assert.ok(await persistedPackage('quick-notes-react'),'toggle must not uninstall the package');
  result.operations.push(enabled?'REAL_HOST_REENABLE_REACT':'REAL_HOST_DISABLE_REACT');
}
async function disableRevokesOpenFrame(){
  const before=new Set((await call('Target.getTargets')).targetInfos.map(t=>t.targetId));
  const page=await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/ui/tool.html?toolId=quick-notes-react'});
  const manager=await attach(page.targetId);
  const target=await until(async()=>{
    const targets=(await call('Target.getTargets')).targetInfos;
    return targets.find(t=>!before.has(t.targetId)&&t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html'));
  },'second genuine installed tool frame');
  const frame=await attach(target.targetId);
  await until(()=>evaluate(frame,'typeof globalThis.OpenDeskTool?.request==="function"&&'+
    '!!document.querySelector("#note-text")&&!document.querySelector("#note-text").disabled'),
    'second installed tool ready');
  await toggleReact(false);
  await until(()=>evaluate(manager,'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),
    'disable destroys already-open tool frame');
  assert.equal((await call('Target.getTargets')).targetInfos.some(t=>t.targetId===target.targetId),false,
    'revoked sandbox cannot execute old operations');
  await call('Target.closeTarget',{targetId:page.targetId});
  result.operations.push('REAL_HOST_DISABLE_REVOKES_OPEN_FRAME');
}
async function unknownOutcomeCheck(){
  const opened=await openTool('quick-notes-react');
  const original=(await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true})).value;
  await replaceText(opened.frame,'真实 Host 超时仍保留草稿😀');
  await call('Debugger.enable',{},host);
  await call('Debugger.pause',{},host);
  const started=Date.now();
  try{
    await click(opened.frame,'button[aria-label="保存笔记"]');
    await until(()=>evaluate(opened.frame,'/工具请求超时/.test(document.querySelector(".note-status[data-state=error]")?.textContent||"")'),
      'real paused Host request timeout',14000);
    assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value'),'真实 Host 超时仍保留草稿😀');
  }finally{
    await call('Debugger.resume',{},host);
    await call('Debugger.disable',{},host);
  }
  result.unknownOutcome={fault:'CDP_PAUSED_REAL_HOST',elapsedMs:Date.now()-started,simulatedSDK:false};
  await until(()=>evaluate(opened.frame,'!document.querySelector("button[aria-label=保存笔记]")?.disabled'),
    'timeout restores editor actions');
  assert.equal(await evaluate(opened.frame,'document.querySelector("#note-text").value'),'真实 Host 超时仍保留草稿😀');
  await writeNotes(opened.frame,original);
  await click(opened.frame,'button[aria-label="新建笔记"]');
  await click(opened.frame,'.note-confirm .confirm-actions button:last-child');
  await closeTool();
  result.operations.push('REAL_HOST_TIMEOUT_UNKNOWN_RESULT_PRESERVES_DRAFT');
}
async function pageAssociationCheck(){
  const url=process.env.OPENDESK_QN_PAGE_URL||'http://127.0.0.1:43111/demo-form.html';
  assert.equal((await fetch(url)).ok,true,'canonical real HTTP fixture must be served');
  const page=await call('Target.createTarget',{url});
  const opened=await openTool('quick-notes-react');
  const original=(await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true})).value;
  await click(opened.frame,'button[aria-label="更新网页信息"]');
  await until(()=>evaluate(opened.frame,'document.querySelector(".page-url")?.textContent==='+JSON.stringify(url)),
    'actual HTTP page context');
  await replaceText(opened.frame,'关联真实 HTTP 网页');
  await click(opened.frame,'#attach-page');
  await click(opened.frame,'button[aria-label="保存笔记"]');
  const saved=await until(async()=>{const value=await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true});
    return value.value?.find(n=>n.text==='关联真实 HTTP 网页'&&n.pageUrl===url);},'page association persisted');
  result.pageAssociation={url:saved.pageUrl,title:saved.pageTitle};
  await writeNotes(opened.frame,original);
  await closeTool();
  await call('Target.closeTarget',{targetId:page.targetId});
  result.operations.push('REAL_HTTP_PAGE_ASSOCIATION');
}
async function layoutAndZoomChecks(){
  const opened=await openTool('quick-notes-react');
  result.layouts=[];
  try{
    for(const width of [320,360,400,440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false},host);
      const layout=await until(()=>evaluate(opened.frame,'(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,'+
        'dpr:devicePixelRatio,save:!!document.querySelector("button[aria-label=保存笔记]"),'+
        'label:document.querySelector("#note-text")?.getAttribute("aria-label")}))()').then(x=>x.width===width?x:null),
        'native panel renderer width '+width);
      assert.ok(layout.scroll<=width+1,'no horizontal document overflow at '+width);
      assert.equal(layout.save,true);assert.equal(layout.label,'笔记内容');
      result.layouts.push(layout);
      const shot=await call('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(out,'react-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
    const baseline=await evaluate(host,'({dpr:devicePixelRatio,width:innerWidth})');
    await evaluate(bootstrapHost,'chrome.tabs.setZoom('+bootstrapTabId+',2)');
    const zoom=await until(()=>evaluate(host,'({dpr:devicePixelRatio,width:innerWidth})').then(x=>
      x.dpr>=baseline.dpr*1.9&&x.width<=baseline.width/1.9?x:null),'actual per-origin 200% browser zoom');
    result.zoom={factor:2,baseline,actual:zoom,method:'chrome.tabs.setZoom on same extension origin'};
    const layout=await evaluate(opened.frame,'({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    assert.ok(layout.scroll<=layout.width+1,'200% zoom document fits');
    const shot=await call('Page.captureScreenshot',{format:'png'},host);
    await writeFile(join(out,'react-200-percent.png'),Buffer.from(shot.data,'base64'));
  }finally{
    await evaluate(bootstrapHost,'chrome.tabs.setZoom('+bootstrapTabId+',1)');
    await call('Emulation.clearDeviceMetricsOverride',{},host);
  }
  await closeTool();
  result.operations.push('REAL_PANEL_320_360_400_440_AND_200_PERCENT');
}
async function websitePermissionOfflineCheck(){
  const settings=await call('Target.createTarget',{url:'chrome://extensions/?id='+extensionId});
  const settingsSession=await attach(settings.targetId);
  // Read and operate Chrome's own Site Access select, never a synthetic grant
  // or a Host boolean. The recursive lookup crosses only open WebUI roots.
  const accessScript=`(()=>{
    const selects=[];function scan(root){selects.push(...root.querySelectorAll('select'));
      for(const e of root.querySelectorAll('*'))if(e.shadowRoot)scan(e.shadowRoot);}
    scan(document);const select=selects.find(s=>[...s.options].some(o=>o.value==='ON_CLICK'));
    if(!select)return null;return {select,value:select.value,options:[...select.options].map(o=>o.value)};
  })()`;
  const options=await until(()=>evaluate(settingsSession,accessScript.replace(
    'return {select,value:','return {value:')),'Chrome native Site Access choices');
  const choose=async value=>{
    const index=options.options.indexOf(value);assert.ok(index>=0,'Chrome Site Access option '+value);
    await call('Target.activateTarget',{targetId:settings.targetId});
    await call('Page.bringToFront',{},settingsSession);
    // Standard select-option automation on Chrome's actual WebUI control.
    // Its real change handler must update native permissions; contains() below
    // independently checks that outcome, not the DOM value alone.
    await evaluate(settingsSession,accessScript.replace('return {select,value:',
      'select.value='+JSON.stringify(value)+';select.dispatchEvent(new Event("change",{bubbles:true}));return {value:'));
  };
  const contains=()=>evaluate(host,'chrome.permissions.contains({origins:["<all_urls>"]})');
  await choose('ON_CLICK');
  result.siteAccessChoice=await evaluate(settingsSession,accessScript.replace('return {select,value:','return {value:'));
  const settingsShot=await call('Page.captureScreenshot',{format:'png'},settingsSession);
  await writeFile(join(out,'chrome-site-access.png'),Buffer.from(settingsShot.data,'base64'));
  await until(async()=>await contains()===false,'Chrome actually withholds website access');
  const page=await call('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
  try{
    const opened=await openTool('quick-notes-react');
    const original=(await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true})).value;
    await click(opened.frame,'button[aria-label="更新网页信息"]');
    const info=await sdk(opened.frame,'currentPage.info',{});
    // currentPage.info exposes tabs metadata, not website content. Chrome's
    // separately granted tabs permission can still provide its title/URL.
    assert.equal(await contains(),false,'website access remains withheld');
    assert.equal(await evaluate(opened.frame,'document.querySelector("#attach-page").checked'),false);
    await replaceText(opened.frame,'无网页权限仍可离线保存');
    await click(opened.frame,'button[aria-label="保存笔记"]');
    await until(async()=> (await storedTexts('quick-notes-react'))?.includes('无网页权限仍可离线保存'),
      'offline save with native website permission withheld');
    const saved=(await sdk(opened.frame,'storage.get',{key:'notes',withEtag:true})).value;
    assert.equal(saved.find(n=>n.text==='无网页权限仍可离线保存').pageUrl,'');
    assert.equal(await contains(),false,'offline write cannot grant website access');
    await writeNotes(opened.frame,original);
    await closeTool();
    result.withheldWebsites={chromePermission:false,pageInfoStatus:info.status,offlineSave:true};
  }finally{
    await call('Target.activateTarget',{targetId:settings.targetId});
    await choose('ON_ALL_SITES');
    await until(contains,'Chrome website access restored in test profile');
    await call('Target.closeTarget',{targetId:page.targetId});
    await call('Target.closeTarget',{targetId:settings.targetId});
  }
  result.operations.push('REAL_CHROME_WITHHELD_WEBSITES_OFFLINE_SAVE');
}
async function uninstallReact(){
  await manageReact('settings');
  await until(()=>evaluate(host,'!document.querySelector("#sidebar-tool-display")?.hidden'),
    'React settings visible');
  await click(host,'#sidebar-tool-remove');
  await until(()=>evaluate(host,'!document.querySelector("#sidebar-tool-inline-remove")?.hidden'),
    'real uninstall confirmation');
  assert.ok(await persistedPackage('quick-notes-react'),'confirmation must precede removal');
  await click(host,'#sidebar-tool-inline-remove-cancel');
  assert.ok(await persistedPackage('quick-notes-react'),'cancel keeps installation');
  await click(host,'#sidebar-tool-remove');
  await click(host,'#sidebar-tool-inline-remove-confirm');
  const key=sidebarToolStorageKey('quick-notes-react');
  await until(async()=>{
    const pkg=await persistedPackage('quick-notes-react');
    const data=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(key)+
      ').then(x=>x['+JSON.stringify(key)+']??null)');
    return !pkg&&data===null;
  },'Host uninstall and per-ID storage cleanup');
  result.operations.push('REAL_HOST_UNINSTALL_REACT');
}
async function reopenVerify(id,text){
  const opened=await openTool(id);
  const existing=await until(async()=>evaluate(opened.frame,'document.querySelector("#note-text")?.value'),
    'restored '+id);
  assert.equal(existing,text,'reopening must read that tool ID private persisted notes');
  await closeTool();
  result.operations.push('REAL_SDK_RESTORED_'+id);
}
async function startHost(options){
  attached.clear();launchError=null;
  processChrome=spawn(process.env.CHROME_BIN||'chromium',options,{stdio:['ignore','ignore','pipe']});
  processChrome.on('error',error=>{launchError=error;});
  processChrome.stderr.on('data',data=>browserLog.push(String(data)));
  await connect();
  result.chrome=await call('Browser.getVersion');
  const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json')));
  const worker=await until(async()=>{
    const all=(await call('Target.getTargets')).targetInfos;
    return all.find(t=>t.type==='service_worker'&&t.url.endsWith('/'+manifest.background.service_worker));
  },'real extension service worker');
  extensionId=new URL(worker.url).host;
  result.extensionId=extensionId;
  const page=await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
  host=await attach(page.targetId);
  const bootstrap=host;
  bootstrapHost=bootstrap;
  bootstrapTabId=await evaluate(bootstrap,'chrome.tabs.getCurrent().then(t=>t.id)');
  const windowId=await evaluate(bootstrap,'chrome.windows.getCurrent().then(w=>w.id)');
  // CDP's userGesture flag supplies the browser gesture for opening its native
  // panel. Installation/approval still use real pointer events in product UI.
  const opened=await call('Runtime.evaluate',{
    expression:'chrome.sidePanel.open({windowId:'+JSON.stringify(windowId)+'})',
    userGesture:true,awaitPromise:true,returnByValue:true
  },bootstrap);
  if(opened.exceptionDetails)throw Error('REAL_SIDE_PANEL_OPEN '+
    (opened.exceptionDetails.exception?.description||opened.exceptionDetails.text));
  const context=await until(()=>evaluate(bootstrap,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>'+
    'x.documentUrl?.startsWith('+JSON.stringify('chrome-extension://'+extensionId+'/ui/tool.html')+')&&'+
    'new URL(x.documentUrl).searchParams.has("hostInstanceId"))||null)'),
    'genuine Chrome SIDE_PANEL context');
  const panel=await until(async()=>{
    const targets=(await call('Target.getTargets')).targetInfos;
    return targets.find(x=>x.targetId!==page.targetId&&x.url===context.documentUrl);
  },'native Side Panel CDP target');
  host=await attach(panel.targetId);
  result.hostContext={contextType:context.contextType,documentUrl:context.documentUrl,
    targetId:panel.targetId,headless:!process.env.OPENDESK_QN_HEADFUL,platform:process.platform};
  assert.equal(context.contextType,'SIDE_PANEL');
  await call('Page.enable',{},host);
  await until(()=>evaluate(host,
    '(()=>{const t=document.querySelector("#tab-tools"),l=document.querySelector("#extension-center-list"),s=document.querySelector("#extension-center-status"),i=document.querySelector("#extension-center-import"),m=document.querySelector("#extension-center-more");return document.readyState==="complete"&&!!t&&l?.isConnected&&l?.dataset.opendeskReactOwner==="extension-list"&&!!s&&!!i&&!!m})()'),
    'real React extension center controller fully connected');
  await click(host,'#tab-tools');
  await until(()=>evaluate(host,'!document.querySelector("#workbench-tools")?.hidden'),
    'Extension Center visible');
}
async function restartHost(options){
  const oldPid=processChrome.pid;
  const closed=new Promise(ok=>processChrome.once('close',ok));
  await call('Browser.close').catch(()=>{});
  await Promise.race([closed,delay(8000).then(()=>{throw Error('BROWSER_RESTART_EXIT_TIMEOUT');})]);
  socket.close();host=null;
  await rm(join(profile,'DevToolsActivePort'),{force:true});
  await startHost(options);
  assert.notEqual(processChrome.pid,oldPid,'full browser process must restart');
  result.restart={oldPid,newPid:processChrome.pid,sameProfile:true};
}
try{
  result.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  result.runnerSha256=hash(await readFile(new URL(import.meta.url)));
  const hostReport=await verifyPackage(extension);
  result.hostPackage={directory:extension,sha256:hostReport.packageHash,files:hostReport.files.length};
  const packages=await Promise.all(paths.map(async file=>{
    const bytes=await readFile(file);
    const pkg=validateSidebarToolPackage(JSON.parse(bytes));
    const sha=hash(bytes);
    assert.equal(sha,hash(Buffer.from(serializeSidebarToolPackage(pkg))),'canonical package bytes');
    result.packages.push({id:pkg.id,sha256:sha,bytes:bytes.length,version:pkg.version});
    return {file,id:pkg.id,title:pkg.title,version:pkg.version,sha};
  }));
  assert.deepEqual(packages.map(x=>x.id),['quick-notes','quick-notes-react']);
  profile=await mkdtemp(join(tmpdir(),'opendesk-r21-installed-'));
  const options=['--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--use-mock-keychain','--password-store=basic',
    '--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=0',
    '--disable-extensions-except='+extension,'--load-extension='+extension,
    ...(!process.env.OPENDESK_QN_HEADFUL?['--headless=new']:[]),'about:blank'];
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    options.unshift('--no-sandbox');
  await startHost(options);
  // Import React independently. Native original is generally a preinstall.
  for(const pkg of packages)await importTool(pkg);
  assert.ok(await persistedPackage('quick-notes'));
  assert.ok(await persistedPackage('quick-notes-react'));
  const beforeKeys=await evaluate(host,'chrome.storage.local.get(null).then(x=>Object.keys(x).filter(k=>'+
    'k.startsWith("opendesk.sidebar-tools.data.v1:")).sort())');
  result.beforeStorageKeys=beforeKeys;
  const native=await openTool('quick-notes');
  await saveText(native,'原生独立数据','quick-notes');
  await closeTool();
  const nativeDigest=await storageDigest('quick-notes');
  const react=await openTool('quick-notes-react');
  await saveText(react,'React 独立数据','quick-notes-react');
  await closeTool();
  const [nativeAfter,reactDigest]=await Promise.all([
    storageDigest('quick-notes'),storageDigest('quick-notes-react')]);
  assert.equal(nativeAfter,nativeDigest,'React write cannot modify native stored data');
  assert.notEqual(nativeDigest,reactDigest,'two independent data namespaces');
  await reopenVerify('quick-notes','原生独立数据');
  await reopenVerify('quick-notes-react','React 独立数据');
  const [nativeFinally,reactFinally]=await Promise.all([
    storageDigest('quick-notes'),storageDigest('quick-notes-react')]);
  assert.equal(nativeFinally,nativeDigest);
  assert.equal(reactFinally,reactDigest);
  result.dataIsolation='PASS';
  result.operations.push('REAL_SDK_ISOLATION','BOTH_INDEPENDENTLY_INSTALLED');
  await restartHost(options);
  await reopenVerify('quick-notes','原生独立数据');
  await reopenVerify('quick-notes-react','React 独立数据');
  assert.equal(await storageDigest('quick-notes'),nativeDigest);
  assert.equal(await storageDigest('quick-notes-react'),reactDigest);
  result.operations.push('REAL_BROWSER_FULL_RESTART_PERSISTENCE');
  await draftAndCapacityChecks();
  await unknownOutcomeCheck();
  await pageAssociationCheck();
  await websitePermissionOfflineCheck();
  // Optional historical diagnostics; not a core React UI delivery gate.
  result.layoutScope=process.env.OPENDESK_QN_LAYOUT_CHECKS==='1'?'OPTIONAL':'OUT_OF_SCOPE';
  if(result.layoutScope==='OPTIONAL')await layoutAndZoomChecks();
  // A genuine user-confirmed Host update from a controlled version fixture,
  // never a claim that a historical 1.0.1 release exists. Compiled JS/CSS
  // remains byte-identical, isolating installer + per-ID storage semantics.
  const upgrade=validateSidebarToolPackage({
    ...JSON.parse(await readFile(paths[1],'utf8')),version:'1.0.1'
  });
  const upgradeBytes=Buffer.from(serializeSidebarToolPackage(upgrade));
  const upgradeFile=join(profile,'quick-notes-react-update-fixture.opendesk-tool.json');
  await writeFile(upgradeFile,upgradeBytes);
  result.upgradeFixture={from:packages[1].version,to:upgrade.version,
    packageSha256:hash(upgradeBytes),historicalRelease:false,sameBusinessCode:true};
  await importTool({file:upgradeFile,id:upgrade.id,title:upgrade.title,
    version:upgrade.version,sha:hash(upgradeBytes)},{update:true});
  assert.equal(await storageDigest('quick-notes'),nativeDigest,'update must preserve native data');
  assert.equal(await storageDigest('quick-notes-react'),reactDigest,'update must preserve React data');
  await reopenVerify('quick-notes-react','React 独立数据');
  result.upgrade='PASS_REAL_HOST_VERSION_FIXTURE';
  result.operations.push('REAL_HOST_UPDATE_REACT');
  await invalidUpdateRetainsInstallation();
  await editReact();
  assert.equal(await storageDigest('quick-notes'),nativeDigest,'React edit must preserve native data');
  await disableRevokesOpenFrame();
  await toggleReact(true);
  await reopenVerify('quick-notes-react','React 已修改的独立数据');
  await deleteReact();
  assert.equal(await storageDigest('quick-notes'),nativeDigest,'React delete must not alter native data');
  await uninstallReact();
  await importTool(packages[1]);
  const reinstalled=await openTool('quick-notes-react');
  assert.equal(await evaluate(reinstalled.frame,'document.querySelector("#note-text").value'),'');
  assert.equal(await evaluate(reinstalled.frame,'document.querySelectorAll(".note-list button").length'),0);
  assert.equal(await storedTexts('quick-notes-react'),null,'reinstall must not restore removed notes');
  await closeTool();
  result.operations.push('REAL_HOST_REINSTALL_WITHOUT_DELETED_DATA');
  await uninstallReact();
  assert.equal(await storageDigest('quick-notes'),nativeDigest,'React uninstall must preserve native data');
  assert.ok(await persistedPackage('quick-notes'),'native package must remain installed');
  result.operations.push('NATIVE_PACKAGE_AND_DATA_UNCHANGED');
  assert.deepEqual(browserErrors,[],'No uncaught runtime errors from observed extension targets');
  assert.deepEqual(networkFailures,[],'No failed observed extension resources');
  assert.equal((await verifyPackage(extension)).packageHash,result.hostPackage.sha256,
    'same verified Host bytes throughout test');
  for(const file of paths){
    const bytes=await readFile(file),id=JSON.parse(bytes).id;
    assert.equal(hash(bytes),result.packages.find(p=>p.id===id)?.sha256,
      'tested installation candidate cannot drift: '+id);
  }
  result.macNativeSidePanel=process.platform==='darwin'&&process.env.OPENDESK_QN_HEADFUL?'PASS_AUTOMATED':'NOT_TESTED';
  result.status='PASS';
}catch(error){
  result.status='FAIL';result.error=String(error.stack||error);process.exitCode=1;
  if(host&&socket?.readyState===WebSocket.OPEN){
    try{result.failureDocument=await evaluate(host,'({url:location.href,body:document.body?.innerText.slice(0,3500)})');}
    catch{}
    try{
      result.hostReactOwnership=await evaluate(host,`(()=>{
        const list=document.querySelector("#extension-center-list");
        const center=document.querySelector("#extension-center");
        const app=document.querySelector("#opendesk-react-app");
        return {reactShellCount:document.querySelectorAll("#opendesk-react-app").length,
          centerCount:document.querySelectorAll("#extension-center").length,
          listCount:document.querySelectorAll("#extension-center-list").length,
          listOwner:list?.dataset.opendeskReactOwner||null,
          centerOwner:center?.dataset.opendeskReactOwner||null,
          listConnected:Boolean(list?.isConnected),
          shellContainsList:Boolean(app?.contains(list)),
          shellContainsCenter:Boolean(app?.contains(center)),
          bodyContainsList:Boolean(document.body.contains(list))};
      })()`);
    }catch{}

    try{
      const shot=await call('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));
    }catch{}
  }
}finally{
  result.errors=browserErrors;result.networkFailures=networkFailures;
  await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(join(out,'chrome.log'),browserLog.join(''));
  try{socket?.close();}catch{}
  try{
    await waitForChromeExit(processChrome);
    if(profile)await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:200});
  }catch(error){
    result.cleanupError=String(error.stack||error);
    if(result.status!=='FAIL'){
      result.status='FAIL';result.error='CHROME_CLEANUP_FAILED '+result.cleanupError;
      process.exitCode=1;
    }
  }
  console.log(JSON.stringify({status:result.status,checks:result.operations,
    dataIsolation:result.dataIsolation,output:out,error:result.error,
    failureDocument:result.status==='FAIL'?result.failureDocument:undefined},null,2));
}

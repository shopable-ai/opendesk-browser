// Real macOS Chrome for Testing smoke: reviewed install, native permission,
// actual HTTP image network, DNR readback, global switch, per-site bypass,
// Chrome worker recovery, tool disable/revoke, required DNR and uninstall;
// real page.mouse element selection and durable, site-scoped manual cosmetics.
// No mocked DNR, artificial rule insertion, synthetic click or storage seeding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,cp} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {verifyAdblockNativeRelease} from '../../scripts/verify-adblock-native-release.mjs';
import {runAdblockLayoutNative,runAdblockCloseoutNative,adblockSwitchSelector} from './helpers/adblock-layout-native.mjs';
import {attachVerifiedSidePanel} from './helpers/verified-side-panel-native.mjs';

const BIN=process.env.CHROME_BIN,ROOT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_ROOT||'dist/production');
const OUT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_EVIDENCE||'artifacts/adblock-r12-native');
const ENABLED=process.env.OPENDESK_ADBLOCK_NATIVE==='1';
const CLOSEOUT=process.env.OPENDESK_ADBLOCK_NATIVE_CLOSEOUT==='1';
const CORE_UPGRADE=process.env.OPENDESK_ADBLOCK_NATIVE_CORE_UPGRADE==='1';
const SOURCE_ROOT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_SOURCE_ROOT||'.');
const OLD_PACKAGE=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_OLD_PACKAGE||
  'examples/sidebar-tools/adblock/adblock.opendesk-tool.json');
const STORE='opendesk.adblock.state.v1',F=741000,L=741199;
const COSMETIC_STORE='opendesk.adblock.cosmetic.v1';
const MANUAL_CASES=['mouseSelection','immediateHide','storageReadback','refreshPersistence',
  'browserRestartPersistence','dynamicDom','spaNavigation','pageUndo','listRestore',
  'globalPauseResume','sitePauseResume','otherSiteIsolation'];
// A dedicated HTTP fixture, never an alternative AdBlock implementation. Only
// genuine button input changes its DOM/history; the extension owns all hiding.
const MANUAL_FIXTURE=`<!doctype html><meta charset="utf-8"><title>Manual cosmetic fixture</title>
<style>body{font:16px system-ui;margin:24px}#manual-ad-slot,#manual-undo-slot{box-sizing:border-box;width:280px;height:80px;padding:18px;background:#ffe3bd}#manual-normal{padding:12px}button{margin:8px 8px 8px 0;padding:10px}</style>
<h1>Manual cosmetic fixture ready</h1>
<div id="manual-ad-slot" class="ad-banner">A region selected by the user</div>
<div id="manual-undo-slot">A second region for page undo</div>
<p id="manual-normal">Normal content must remain visible</p>
<button id="manual-dynamic">Replace region dynamically</button>
<button id="manual-spa">Open SPA route</button>
<button id="manual-remove">Remove region</button><button id="manual-insert">Insert region</button>
<script>
window.manualFixtureEvents=[];window.manualFixtureGeneration=0;
for(const type of ['pointerdown','click'])window.addEventListener(type,event=>{
  const record={type:event.type,isTrusted:event.isTrusted,target:event.target.id,
    tag:event.target.tagName,ariaLabel:event.target.getAttribute('aria-label'),at:Date.now()};
  window.manualFixtureEvents.push(record);console.debug('ADBLOCK_MANUAL_INPUT '+JSON.stringify(record));
},true);
function replaceRegion(){const old=document.getElementById('manual-ad-slot');
  const next=document.createElement('div');next.id='manual-ad-slot';next.className='ad-banner';
  next.textContent='Replacement region '+(++window.manualFixtureGeneration);
  if(old)old.replaceWith(next);else document.querySelector('h1').after(next);}
document.getElementById('manual-dynamic').addEventListener('click',event=>{if(event.isTrusted)replaceRegion();});
document.getElementById('manual-spa').addEventListener('click',event=>{if(!event.isTrusted)return;
  const next=new URL(location.href);next.searchParams.set('route','next');
  history.pushState({route:'next'},'',next.href);replaceRegion();});
document.getElementById('manual-remove').addEventListener('click',event=>{if(event.isTrusted)document.getElementById('manual-ad-slot')?.remove();});
document.getElementById('manual-insert').addEventListener('click',event=>{if(event.isTrusted)replaceRegion();});
</script>`;
const nativeCallTrace=[];
const nativeCallTraceIds=new Set();
function connect(url){
  const ws=new WebSocket(url),waiting=new Map(),events=[];let serial=0;
  const ready=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const obj=JSON.parse(event.data),row=waiting.get(obj.id);
    if(!row){if(obj.method){events.push(obj);
      // Chrome may crash the attached SW target without closing the CDP socket.
      // Fail the pending command now rather than mislabeling it a generic timeout.
      if(obj.method==='Inspector.targetCrashed'&&obj.sessionId){
        for(const [requestId,pending] of waiting){
          if(pending.sessionId!==obj.sessionId)continue;
          waiting.delete(requestId);clearTimeout(pending.timeout);
          pending.reject(Error('CDP_TARGET_CRASHED '+pending.method+' '+obj.sessionId));
        }
      }
      if(obj.method==='Runtime.consoleAPICalled'){
        const value=obj.params.args?.[0]?.value;
        if(typeof value==='string'&&value.startsWith('ADBLOCK_NATIVE_CALL ')){
          const record=JSON.parse(value.slice(20));
          if(!nativeCallTraceIds.has(record.eventId)){
            nativeCallTraceIds.add(record.eventId);
            nativeCallTrace.push({sessionId:obj.sessionId,...record});
          }
        }
      }
    }return;}
    waiting.delete(obj.id);clearTimeout(row.timeout);
    obj.error?row.reject(Error(JSON.stringify(obj.error))):row.resolve(obj.result);
  };
  ws.onclose=()=>{for(const row of waiting.values()){clearTimeout(row.timeout);row.reject(Error('CDP closed'));}};
  return {ready,events,send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++serial,timeout=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},18000);
    waiting.set(id,{resolve,reject,timeout,method,sessionId});
    ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},close(){ws.close();}};
}
async function until(job,label,limit=22000){
  const end=Date.now()+limit;let last;
  while(Date.now()<end){
    try{const value=await job();if(value)return value;}catch(e){last=String(e);}
    await pause(170);
  }
  throw Error(label+' timed out'+(last?' - '+last.slice(0,300):''));
}
async function evaluate(c,s,expression){
  const reply=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);
  if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails).slice(0,500));
  return reply.result.value;
}
async function attach(c,targetId){
  const s=(await c.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await c.send('Runtime.enable',{},s);await c.send('Page.enable',{},s);
  await c.send('Network.enable',{},s);
  await evaluate(c,s,'('+observeNativeCalls.toString()+')()');
  return s;
}

/** Bind CDP to the actual Chrome Side Panel, never a second launcher tab.
 * Chrome 155 exposes the Side Panel as type=page and appends hostInstanceId
 * in the target URL, while runtime.getContexts may give a canonical URL.
 * Require BOTH a live SIDE_PANEL document and the shipped Side Panel DOM.
 */
async function attachActualPanel(c,context,excludeIds=[]){
  assert.ok(context?.documentId&&context?.documentUrl,
    'real Chrome SIDE_PANEL context must be observed before discovery');
  // The launcher can capture a canonical URL or an already-retired document.
  // The current SIDE_PANEL document authenticates itself after CDP attaches;
  // never pin the previous documentId across navigation/reopen.
  const extensionId=new URL(context.documentUrl).host;
  return attachVerifiedSidePanel({
    client:c,extensionId,excludeTargetIds:excludeIds,
    attachTarget:targetId=>attach(c,targetId),
    evaluate:(session,expression)=>evaluate(c,session,expression),
    until,
    onFailure:diagnostic=>console.error('ADBLOCK_NATIVE side-panel-identity-revalidation-failed '+
      JSON.stringify({initialContext:{documentId:context.documentId,
        documentUrl:context.documentUrl},...diagnostic}))
  });
}
async function attachActualReact(c,side){
  const url=await until(()=>evaluate(c,side,
    '(()=>{const n=document.querySelector("#sidebar-tool-frame");'+
    'const f=n?.querySelector("iframe");return n&&!n.hidden&&f&&f.getBoundingClientRect().height>0?f.src:null})()'),
    'visible installed React iframe',25000);
  const target=await until(async()=>(await c.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='iframe'&&x.url===url),
    'real isolated React iframe CDP target',25000);
  const session=await attach(c,target.targetId);
  await until(()=>evaluate(c,session,'!!document.querySelector(".adblock-app")'),
    'installed React root mounted',25000);
  await writeFile(path.join(OUT,'installed-react-dom.json'),JSON.stringify(await evaluate(c,session,
    '({url:location.href,switches:[...document.querySelectorAll("[data-slot=switch],input")].map(n=>'+
    '({tag:n.tagName,html:n.outerHTML}))})'),null,2));
  await until(()=>evaluate(c,session,
    '!!document.querySelector(".adblock-app")&&'+
    '!!document.querySelector('+JSON.stringify(reactSwitchSelector('全局广告拦截'))+')'),
    'installed React App and React Aria switch mounted',25000);
  await evaluate(c,session,`(()=>{
    if(globalThis.__adblockInputObserved)return;
    globalThis.__adblockInputObserved=true;
    for(const type of ['pointerdown','pointerup','keydown','keyup'])
      document.addEventListener(type,event=>{
        const target=event.target;
        const label=target?.closest?.('label,[data-slot="switch"]');
        const input=target?.matches?.('input')?target:label?.querySelector('input');
        console.debug('ADBLOCK_REACT_INPUT '+JSON.stringify({
          type:event.type,isTrusted:event.isTrusted,key:event.key??null,
          target:target?.outerHTML?.slice(0,1000),targetRole:target?.getAttribute?.('role'),
          targetAriaLabel:target?.getAttribute?.('aria-label'),
          inputRole:input?.getAttribute('role')??null,inputAriaLabel:input?.getAttribute('aria-label')??null,
          closestLabel:label?.getAttribute('aria-label')??null,at:Date.now()
        }));
      },{capture:true,passive:true});
  })()`);
  return session;
}
async function reloadFixture(c,session,label){
  const before=(await c.send('Page.getFrameTree',{},session)).frameTree.frame;
  await c.send('Page.reload',{ignoreCache:true},session);
  const after=await until(async()=>{
    const frame=(await c.send('Page.getFrameTree',{},session)).frameTree.frame;
    return frame.id===before.id&&frame.loaderId&&frame.loaderId!==before.loaderId?frame:null;
  },label+' new document loader');
  await until(()=>evaluate(c,session,'document.readyState==="complete"'),label+' complete');
  return {frameId:after.id,beforeLoaderId:before.loaderId,loaderId:after.loaderId};
}
function reactSwitchSelector(label){
  return adblockSwitchSelector(label);
}
async function reactSwitch(c,session,label){
  const selector=reactSwitchSelector(label);
  const state=await evaluate(c,session,
    '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
    'const input=n?.querySelector("input[role=switch]");'+
    'return n&&input?{on:input.checked,selected:n.hasAttribute("data-selected"),'+
    'disabled:input.disabled||n.hasAttribute("data-disabled")}:null;})()');
  if(state)assert.equal(state.on,state.selected,
    label+' native input.checked must agree with React selected state');
  return state;
}
async function operateReactControl(c,side,react,selector,description){
  await clickSandbox(c,side,react,selector);
  assert.equal(await evaluate(c,side,
    'document.getElementById("sidebar-tool-action-review")?.hidden!==false'),true,
    'Reviewed AdBlock '+description+' must not open another Host confirmation dialog');
}
// The reviewed first-party React tool uses the Host's single shared Back
// control. Its obsolete in-sandbox Back button is deliberately not rendered.
// Use real Chrome pointer input and prove the nested -> outer transition.
async function returnToAdblockOverview(c,side,react){
  await until(()=>evaluate(c,side,
    'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")==="返回上一级"'),
    'trusted AdBlock Host exposes nested Back');
  await click(c,side,'#sidebar-tool-back');
  await until(()=>evaluate(c,react,
    'document.querySelector(".adblock-control-row strong")?.textContent==="全局保护"'),
    'installed AdBlock React returns to overview');
  await until(()=>evaluate(c,side,
    'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")==="返回扩展列表"'),
    'trusted Host returns to outer Back state');
}

async function approveReactReview(c,side){
  await click(c,side,'#sidebar-tool-action-continue');
  await until(()=>evaluate(c,side,
    'document.getElementById("sidebar-tool-action-review")?.hidden===true'),
    'trusted Host review closes after Chrome Input approval');
}

// Observe actual Chrome calls without supplying permissions, results or gestures.
// Invoke the original synchronously so permissions.request retains user activation.
function observeNativeCalls(){
  if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.id||
    globalThis.__adblockNativeObserved)return;
  globalThis.__adblockNativeObserved=true;
  const record=value=>console.debug('ADBLOCK_NATIVE_CALL '+JSON.stringify({
    eventId:crypto.randomUUID(),at:new Date().toISOString(),url:location.href,...value}));
  record({kind:'context',extensionId:chrome.runtime.id,manifest:chrome.runtime.getManifest(),
    world:typeof document==='undefined'?'extension_worker':'trusted_document'});
  const errorValue=error=>({name:error?.name,code:error?.code,
    message:error?.message,stack:error?.stack});
  for(const [owner,name] of [[chrome.permissions,'contains'],[chrome.permissions,'request'],
    [chrome.permissions,'remove'],[chrome.runtime,'sendMessage'],
    [chrome.declarativeNetRequest,'getDynamicRules'],
    [chrome.declarativeNetRequest,'updateDynamicRules'],
    [chrome.storage?.local,'get'],[chrome.storage?.local,'set'],[chrome.tabs,'sendMessage']]){
    if(typeof owner?.[name]!=='function')continue;
    const original=owner[name];
    owner[name]=function(...args){
      const message=args.find(value=>value&&typeof value==='object');
      const observed=name==='sendMessage'?
        message?.operation?.startsWith('adblock.')||message?.protocol?.startsWith('opendesk.adblock.'):
        ['get','set'].includes(name)?JSON.stringify(args[0]??'').includes('opendesk.adblock.'):true;
      if(!observed)return Reflect.apply(original,this,args);
      const callId=crypto.randomUUID();
      record({kind:'call',name,callId,args:message??args[0],stack:new Error('native call').stack,
        userActivation:navigator.userActivation?.isActive});
      let result;
      try{result=Reflect.apply(original,this,args);}
      catch(error){record({kind:'throw',name,callId,error:errorValue(error)});throw error;}
      if(result&&typeof result.then==='function')result.then(
        value=>record({kind:'return',name,callId,result:value}),
        error=>record({kind:'reject',name,callId,error:errorValue(error)}));
      return result;
    };
  }
  chrome.runtime.onMessage.addListener((message,sender)=>{
    if(message?.protocol?.startsWith('opendesk.adblock.'))record({kind:'message',message,
      sender:{id:sender.id,url:sender.url,documentId:sender.documentId,frameId:sender.frameId,
        tabId:sender.tab?.id},stack:new Error('observed native message').stack});
    return undefined; // Observation only: never answer or retain the channel.
  });
  if(typeof document!=='undefined')for(const type of ['pointerdown','click'])document.addEventListener(type,event=>{
    const control=event.target.closest?.('#sidebar-tool-action-review button');
    if(control)record({kind:'input',type,isTrusted:event.isTrusted,
      control:control.getAttribute('aria-label'),disabled:control.disabled,
      checked:control.getAttribute('aria-checked'),stack:new Error('native input').stack});
  },true);
}
async function click(c,session,selector){
  // CDP Input is genuine Chrome pointer/wheel input. Do not use DOM .click(),
  // scrollIntoView(), synthetic events, or mutate styles/scrollTop to bypass
  // a hidden or unapproved control. The reviewed install button commonly sits
  // below the Side Panel's narrow, vertically scrollable viewport.
  let last=null,point;
  try{
    point=await until(async()=>{
      const p=await evaluate(c,session,
        '(()=>{const x=document.querySelector('+JSON.stringify(selector)+');'+
        'if(!x)return {missing:true};'+
        'const r=x.getBoundingClientRect(),mx=r.left+r.width/2,my=r.top+r.height/2;'+
        'const sc=document.querySelector("#workspace-content"),w=sc?.getBoundingClientRect();'+
        'const scroll=w?{top:w.top,bottom:w.bottom,x:Math.min(innerWidth-8,Math.max(8,w.left+w.width/2)),'+
        'y:Math.min(innerHeight-8,Math.max(8,w.top+w.height/2)),'+
        'scrollTop:sc.scrollTop,scrollHeight:sc.scrollHeight,clientHeight:sc.clientHeight}:null;'+
        'const hidden=!!x.closest("[hidden]"),styled=getComputedStyle(x);'+
        'const hit=!hidden&&!x.disabled&&r.width>0&&r.height>0&&mx>=0&&my>=0&&'+
        'mx<innerWidth&&my<innerHeight&&x.contains(document.elementFromPoint(mx,my));'+
        'return {x:mx,y:my,width:r.width,height:r.height,hidden,disabled:x.disabled,'+
        'display:styled.display,visibility:styled.visibility,hit,scroll};})()');
      last=p;
      if(p?.hit)return p;
      if(p?.hidden||p?.missing||p?.disabled||!p?.scroll)return false;
      const bounds=p.scroll;
      const movement=p.y>bounds.bottom-22?315:p.y<bounds.top+22?-315:0;
      if(movement!==0&&bounds.scrollHeight>bounds.clientHeight+2){
        await c.send('Input.dispatchMouseEvent',{
          type:'mouseWheel',x:bounds.x,y:bounds.y,deltaX:0,deltaY:movement},session);
        await pause(130);
      }
      return false;
    },'visible real input '+selector);
  }catch(error){
    const name='input-unreachable-'+Date.now();
    await writeFile(path.join(OUT,name+'.json'),JSON.stringify({selector,last,
      error:String(error.message||error),evidenceType:'read-only-DOM-geometry-and-native-wheel'},null,2)+'\n').catch(()=>{});
    await screenshot(c,session,name).catch(()=>{});
    throw error;
  }
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},session);
  for(const type of ['mousePressed','mouseReleased'])
    await c.send('Input.dispatchMouseEvent',
      {type,x:point.x,y:point.y,button:'left',clickCount:1},session);
}
async function screenshot(c,s,name){
  const value=await c.send('Page.captureScreenshot',{format:'png'},s);
  const bytes=Buffer.from(value.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function probe(c,s,url){
  const result=await evaluate(c,s,'(()=>new Promise(resolve=>{'+
    'const pic=new Image();let completed=false;'+
    'const end=(success,reason)=>{if(completed)return;completed=true;resolve({success,reason});};'+
    'pic.onload=()=>end(true,"loaded");pic.onerror=()=>end(false,"error");'+
    'setTimeout(()=>end(false,"timeout"),9000);'+
    'pic.src='+JSON.stringify(url)+';document.body.append(pic);}))()');
  const request=await until(()=>c.events.find(x=>x.sessionId===s&&
    x.method==='Network.requestWillBeSent'&&x.params.request.url===url),'native network request');
  const terminal=await until(()=>c.events.find(x=>x.sessionId===s&&
    x.params?.requestId===request.params.requestId&&
    ['Network.loadingFailed','Network.responseReceived'].includes(x.method)),'native network outcome');
  const p=terminal.params,r=p.response;
  return {...result,url,network:{event:terminal.method,requestId:p.requestId,type:p.type,
    ...(r?{status:r.status,fromDiskCache:r.fromDiskCache,fromServiceWorker:r.fromServiceWorker}:{}),
    ...(p.errorText?{errorText:p.errorText,blockedReason:p.blockedReason,canceled:p.canceled}:{})}};
}
async function getOwned(c,session){
  return evaluate(c,session,'(async()=>{'+
    'const all=await chrome.declarativeNetRequest.getDynamicRules();'+
    'const saved=await chrome.storage.local.get('+JSON.stringify(STORE)+');'+
    'return {state:saved['+JSON.stringify(STORE)+']||null,'+
    'owned:all.filter(x=>x.id>='+F+'&&x.id<='+L+'),'+
    'focus:all.filter(x=>x.id>=730000&&x.id<=730199)};})()');
}
async function sandboxDiagnostic(c,side,frame,selector,last,error){
  const name='sandbox-input-'+Date.now()+'-'+randomUUID();
  const shots=await Promise.all(['outer','inner'].map(async(label,index)=>{
    try{return {label,...await screenshot(c,index===0?side:frame,name+'-'+label)};}
    catch(error){return {label,error:String(error)};}
  }));
  const review=await evaluate(c,side,'(()=>{const x=document.querySelector("#sidebar-tool-action-review");'+
    'return {hidden:x?.hidden,text:x?.textContent,summary:document.querySelector("#sidebar-tool-action-summary")?.textContent};})()')
    .catch(error=>({error:String(error)}));
  await writeFile(path.join(OUT,name+'.json'),JSON.stringify({selector,last,review,screenshots:shots,
    error:String(error.message||error),evidenceType:'read-only-inner-and-outer-DOM-with-CDP-Input'},null,2)+'\n');
}
async function clickSandbox(c,side,frame,selector){
  let last=null;
  try{
    const point=await until(async()=>{
      const p=await evaluate(c,frame,`(()=>{
        const x=(globalThis.OpenDeskTool?.root||document).querySelector(${JSON.stringify(selector)});
        if(!x)return {missing:true};
        const r=x.getBoundingClientRect(),mx=r.left+r.width/2,my=r.top+r.height/2;
        let visible=r.width>0&&r.height>0;
        for(let node=x;node;node=node.parentElement||node.getRootNode().host){
          const style=getComputedStyle(node);
          if(node.hidden||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)visible=false;
        }
        const inViewport=mx>=0&&my>=0&&mx<innerWidth&&my<innerHeight;
        let hitNode=inViewport?document.elementFromPoint(mx,my):null;
        while(hitNode?.shadowRoot){
          const next=hitNode.shadowRoot.elementFromPoint(mx,my);
          if(!next||next===hitNode)break;hitNode=next;
        }
        const disabled=!!x.disabled||x.hasAttribute('data-disabled')||
          x.querySelector('input[role="switch"]')?.disabled===true;
        return {x:mx,y:my,rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},
          visible,disabled,inViewport,hit:visible&&!disabled&&inViewport&&x.contains(hitNode),
          hitNode:hitNode?{tag:hitNode.tagName,id:hitNode.id,role:hitNode.getAttribute('role')}:null};
      })()`);
      last={inner:p};
      if(p.missing)return false;
      const f=await evaluate(c,side,`(()=>{
        const frame=document.querySelector('#sidebar-tool-frame iframe');if(!frame)return {missing:true};
        const r=frame.getBoundingClientRect();let visible=r.width>0&&r.height>0;
        for(let node=frame;node;node=node.parentElement){
          const style=getComputedStyle(node);
          if(node.hidden||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)visible=false;
        }
        const scaleX=r.width/frame.offsetWidth,scaleY=r.height/frame.offsetHeight;
        const x=r.left+(frame.clientLeft+${p.x})*scaleX,y=r.top+(frame.clientTop+${p.y})*scaleY;
        const hitNode=document.elementFromPoint(x,y);
        return {x,y,rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},visible,
          hit:visible&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hitNode===frame,
          hitNode:hitNode?{tag:hitNode.tagName,id:hitNode.id,role:hitNode.getAttribute('role')}:null};
      })()`);
      last={inner:p,outer:f};
      if(p.hit&&f.hit)return {x:f.x,y:f.y};
      if(!p.visible||p.disabled||!f.visible)return false;
      const direction=p.y<0||f.y<0?-1:p.y>=p.viewport.height||f.y>=f.viewport.height?1:0;
      const left=Math.max(0,f.rect.left),right=Math.min(f.viewport.width,f.rect.right);
      const top=Math.max(0,f.rect.top),bottom=Math.min(f.viewport.height,f.rect.bottom);
      if(direction&&right>left&&bottom>top){
        await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:(left+right)/2,
          y:(top+bottom)/2,deltaX:0,deltaY:direction*230},side);
      }
      return false;
    },'visible sandbox control '+selector);
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point},side);
    for(const type of ['mousePressed','mouseReleased'])
      await c.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1},side);
    return last;
  }catch(error){
    await sandboxDiagnostic(c,side,frame,selector,last,error).catch(()=>{});
    throw error;
  }
}
test('macOS Chrome actual AdBlock DNR, manual cosmetics and network lifecycle',
  {skip:!ENABLED,timeout:680000},async t=>{
  assert.equal(process.platform,'darwin');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,'Chrome for Testing must exist');
  await mkdir(OUT,{recursive:true});
  const bytes=await readFile(path.join(ROOT,'official-tools/adblock/adblock.opendesk-tool.json'));
  const pkg=JSON.parse(bytes);
  if(CLOSEOUT)assert.ok(process.env.OPENDESK_ADBLOCK_NATIVE_ROOT&&
    process.env.OPENDESK_ADBLOCK_NATIVE_SOURCE_ROOT,
    'closeout requires explicitly frozen production and source roots');
  const oldBytes=CLOSEOUT?await readFile(OLD_PACKAGE):null;
  let deploymentParent,loadedRoot=ROOT,loadedManifest=JSON.parse(await readFile(path.join(ROOT,'manifest.json')));
  let loadedManifestSHA256=createHash('sha256').update(await readFile(path.join(ROOT,'manifest.json'))).digest('hex');
  let loadedArtifactPackageHash;
  if(CORE_UPGRADE){
    assert.ok(CLOSEOUT,'core upgrade uses the bounded closeout driver');
    assert.ok(process.env.OPENDESK_ADBLOCK_NATIVE_OLD_ROOT,'real old production root required');
    const oldRoot=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_OLD_ROOT);
    assert.deepEqual(await readFile(path.join(oldRoot,'official-tools/adblock/adblock.opendesk-tool.json')),oldBytes,
      'old runtime must ship the exact preserved 1.2.1 package');
    loadedArtifactPackageHash=(await packageFingerprint(oldRoot)).packageHash;
    loadedManifest=JSON.parse(await readFile(path.join(oldRoot,'manifest.json')));
    loadedManifestSHA256=createHash('sha256').update(await readFile(path.join(oldRoot,'manifest.json'))).digest('hex');
    deploymentParent=await mkdtemp(path.join(tmpdir(),'opendesk-adblock-deployment-'));
    loadedRoot=path.join(deploymentParent,'extension');
    try{await cp(oldRoot,loadedRoot,{recursive:true,errorOnExist:true,mode:fsConstants.COPYFILE_FICLONE});}
    catch(error){await rm(deploymentParent,{recursive:true,force:true});throw error;}
    assert.equal((await packageFingerprint(loadedRoot)).packageHash,loadedArtifactPackageHash,'complete old deployment copy');
  }
  if(CLOSEOUT){
    assert.equal(JSON.parse(oldBytes).id,'adblock');
    assert.equal(JSON.parse(oldBytes).version,'1.2.1','preserved old formal package required');
    assert.equal(pkg.version,'1.2.2','frozen candidate must be 1.2.2');
  }
  const adblockProject=path.join(SOURCE_ROOT,'examples/sidebar-tools/adblock');
  // Existing packer enforces the source-bound React build-ready receipt.
  const currentSourcePackage=await createSidebarToolPackage(adblockProject);
  const currentSourcePackageHash=await sidebarToolPackageHash(currentSourcePackage);
  const rootOfficialPackageHash=await sidebarToolPackageHash(pkg);
  assert.equal(currentSourcePackageHash,rootOfficialPackageHash,
    'ROOT official package must exactly match the current receipt-validated AdBlock project');
  const receiptBytes=await readFile(path.join(adblockProject,'dist/build-ready.json'));
  const buildReady=JSON.parse(receiptBytes);
  assert.ok(buildReady.sources&&Object.keys(buildReady.sources).length,
    'AdBlock receipt must bind product sources');
  const readReactSourceHashes=async()=>Object.fromEntries(await Promise.all(
    Object.keys(buildReady.sources).map(async file=>{
      const absolute=path.resolve(adblockProject,file);
      assert.ok(absolute.startsWith(adblockProject+path.sep),'receipt sources stay inside AdBlock project');
      return [file,createHash('sha256').update(await readFile(absolute)).digest('hex')];
    })));
  const reactSourceSHA256=await readReactSourceHashes();
  for(const [file,sha256] of Object.entries(reactSourceSHA256))
    assert.equal(sha256,buildReady.sources[file].sha256,'receipt matches current AdBlock source '+file);
  const readTrustedSourceHashes=async()=>{
    const files=[];
    for(const directory of ['trusted','rules']){
      for(const entry of await readdir(path.join(adblockProject,directory),{withFileTypes:true}))
        if(entry.isFile()&&/\.(js|json)$/.test(entry.name))files.push(directory+'/'+entry.name);
    }
    files.sort();
    for(const required of ['trusted/service.js','trusted/tool-host.js'])
      assert.ok(files.includes(required),'AdBlock trusted source evidence requires '+required);
    assert.ok(files.some(file=>file.startsWith('rules/')),'AdBlock rule sources must be recorded');
    return Object.fromEntries(await Promise.all(files.map(async file=>[file,
      createHash('sha256').update(await readFile(path.join(adblockProject,file))).digest('hex')])));
  };
  const trustedSourceSHA256=await readTrustedSourceHashes();
  const developmentUpdateBytes=await readFile(path.join(ROOT,'development-update.json'),'utf8')
    .catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const developmentUpdate=developmentUpdateBytes===null?null:JSON.parse(developmentUpdateBytes);
  if(developmentUpdate!==null)assert.ok(typeof developmentUpdate.revision==='string'&&developmentUpdate.revision,
    'development-update marker must contain its actual revision');
  const readTrustedArtifactBindings=async()=>{
    const bindings=[];
    for(const [compiled,source] of [['sw.js','trusted/service.js'],['ui/sidebar-tool-host.js','trusted/tool-host.js']]){
      const compiledBytes=await readFile(path.join(ROOT,compiled));
      const mapFile=compiled+'.map';
      const mapBytes=await readFile(path.join(ROOT,mapFile)).catch(error=>{
        if(error.code==='ENOENT'&&developmentUpdate===null)return null;
        throw error;
      });
      const binding={compiled,source,compiledSHA256:createHash('sha256').update(compiledBytes).digest('hex'),map:mapFile};
      if(mapBytes===null){
        bindings.push({...binding,status:'NOT_TESTED',reason:'Production source map absent'});
        continue;
      }
      const map=JSON.parse(mapBytes);
      const matches=map.sources.map((name,index)=>({name,index}))
        .filter(row=>row.name.replaceAll('\\','/').endsWith('/adblock/'+source));
      assert.equal(matches.length,1,'loaded artifact map must identify exactly one AdBlock '+source);
      const mappedSource=map.sourcesContent?.[matches[0].index];
      const currentSource=await readFile(path.join(adblockProject,source),'utf8');
      assert.equal(mappedSource,currentSource,'loaded ROOT source map must contain current AdBlock '+source);
      bindings.push({...binding,mapSHA256:createHash('sha256').update(mapBytes).digest('hex'),
        mappedSource:matches[0].name,sourceSHA256:createHash('sha256').update(currentSource).digest('hex'),status:'PASS'});
    }
    return bindings;
  };
  const trustedArtifactBindings=await readTrustedArtifactBindings();
  const sourceConfig=JSON.parse(await readFile(
    path.join(adblockProject,'tool.config.json'),'utf8'));
  assert.equal(pkg.id,'adblock');
  assert.equal(pkg.id,sourceConfig.id,'installed tool identity must match canonical source');
  assert.equal(pkg.version,sourceConfig.version,
    'official package must have the current reviewed tool version');
  const [runtimeBytes,manifestBytes]=await Promise.all([
    readFile(path.join(ROOT,'sw.js')),readFile(path.join(ROOT,'manifest.json'))]);
  const manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.manifest_version,3,'candidate must be an MV3 extension');
  assert.equal(manifest.background?.service_worker,'sw.js','candidate must use the reviewed worker entry');
  assert.ok(runtimeBytes.length>0,'candidate worker must not be empty');
  const report={candidate:process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),
    root:ROOT,deployedRoot:loadedRoot,driverSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    layoutHelperSHA256:createHash('sha256').update(await readFile(new URL('./helpers/adblock-layout-native.mjs',import.meta.url))).digest('hex'),
    artifactPackageHash:(await packageFingerprint(ROOT)).packageHash,
    swSHA256:createHash('sha256').update(runtimeBytes).digest('hex'),
    manifestSHA256:createHash('sha256').update(manifestBytes).digest('hex'),
    chromeBin:BIN,packageSHA256:createHash('sha256').update(bytes).digest('hex'),
    // An on-disk marker identifies artifact metadata, never a live WXT connection.
    env:'real-macos-chrome',environment:developmentUpdate===null?'DEVELOPMENT_MARKER_ABSENT':'DEVELOPMENT_MARKER_PRESENT',releaseReady:false,
    sourceChain:{project:adblockProject,currentSourcePackageHash,rootOfficialPackageHash,
      buildId:buildReady.buildId,receipt:'dist/build-ready.json',
      receiptSHA256:createHash('sha256').update(receiptBytes).digest('hex'),reactSourceSHA256,trustedSourceSHA256,
      trustedArtifactBindings,
      developmentUpdateRevision:developmentUpdate?.revision??null,sourceUnchanged:'NOT_TESTED'},
    manualCosmetic:'NOT_TESTED',
    manualCosmeticCases:MANUAL_CASES.map(id=>({id,status:'NOT_TESTED',evidence:{},error:null})),
    manualCosmeticTotals:{total:MANUAL_CASES.length,passed:0,failed:0,notTested:MANUAL_CASES.length,running:0},
    manualCosmeticEvidence:{schemaVersion:1,identity:{},storageKey:COSMETIC_STORE,
      inputDriver:'CDP Input.dispatchMouseEvent',fixtureSHA256:createHash('sha256').update(MANUAL_FIXTURE).digest('hex')},
    status:'NOT_TESTED',nativePermission:'NOT_TESTED',
    network:'NOT_TESTED',globalToggle:'NOT_TESTED',siteException:'NOT_TESTED',
    otherSite:'NOT_TESTED',iframe:'NOT_TESTED',nestedIframe:'NOT_TESTED',
    siteReviewDrift:'NOT_TESTED',siteScopeSwitch:'NOT_TESTED',closedPanel:'NOT_TESTED',
    restoreOneClick:'NOT_TESTED',workerStoppedDnr:'NOT_TESTED',
    workerRestart:'NOT_TESTED',browserRestart:'NOT_TESTED',upgrade:'NOT_TESTED',coexistence:'NOT_TESTED',priorityIsolation:'NOT_TESTED',
    physicalWidths:{status:'NOT_TESTED',requested:[320,360,400,480],
      reason:'This driver has no native Side Panel splitter adapter; viewport emulation does not prove physical width.'},
    revocation:'NOT_TESTED',uninstall:'NOT_TESTED',reinstall:'NOT_TESTED',cleanupErrors:[],checks:[],screenshots:[],evidenceErrors:[]};
  const preserve=async(file,data)=>{
    try{await writeFile(path.join(OUT,file),data);
      return {file,bytes:Buffer.byteLength(data),sha256:createHash('sha256').update(data).digest('hex')};}
    catch(error){
      const message=file+': '+String(error.message||error);
      report.evidenceErrors.push(message);console.error('ADBLOCK_EVIDENCE_FAILURE '+message);
    }
  };
  const note=(name,record)=>{report.checks.push({name,...record});console.log('ADBLOCK_NATIVE '+name+' '+JSON.stringify(record));};
  Object.assign(report.manualCosmeticEvidence.identity,Object.fromEntries([
    'candidate','driverSHA256','layoutHelperSHA256','artifactPackageHash','packageSHA256','swSHA256','manifestSHA256'
  ].map(key=>[key,report[key]])),{buildId:buildReady.buildId});
  const updateManualSummary=()=>{
    const cases=report.manualCosmeticCases;
    report.manualCosmeticTotals={total:cases.length,passed:cases.filter(x=>x.status==='PASS').length,
      failed:cases.filter(x=>x.status==='FAIL').length,notTested:cases.filter(x=>x.status==='NOT_TESTED').length,
      running:cases.filter(x=>x.status==='RUNNING').length};
    report.manualCosmetic=cases.some(x=>x.status==='FAIL')?'FAIL':
      cases.every(x=>x.status==='PASS')?'PASS':'NOT_TESTED';
  };
  let manualStorageSession=null,manualSession=null,manualOtherSession=null,manualMousePage=null;
  const manualStorage=()=>evaluate(client,manualStorageSession,
    'chrome.storage.local.get('+JSON.stringify([STORE,COSMETIC_STORE])+')');
  const manualDom=session=>evaluate(client,session,`(()=>{
    const region=document.querySelector('#manual-ad-slot'),normal=document.querySelector('#manual-normal');
    const inspect=node=>{if(!node)return null;const r=node.getBoundingClientRect(),s=getComputedStyle(node);
      return {connected:node.isConnected,display:s.display,visibility:s.visibility,rect:r.toJSON(),text:node.textContent,
        visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible'};};
    return {url:location.href,region:inspect(region),normal:inspect(normal),
      undoRegion:inspect(document.querySelector('#manual-undo-slot')),
      css:document.getElementById('opendesk-adblock-cosmetic')?.textContent??null,
      notice:document.querySelector('[data-opendesk-adblock-picker][role="status"]')?.textContent??null,
      events:window.manualFixtureEvents,generation:window.manualFixtureGeneration};
  })()`);
  const manualVisibility=async(hidden,label,session=manualSession)=>{
    const state=await until(async()=>{const value=await manualDom(session);
      return value.region?.connected&&value.normal?.visible&&
        (hidden?value.region.display==='none':value.region.visible)?value:null;
    },label);
    assert.equal(state.region.connected,true,'hiding/restoring must retain the actual DOM element');
    return state;
  };
  const manualSnapshot=async(row,phase='before')=>{
    if(!manualSession)return;
    const dom=await manualDom(manualSession),storage=await manualStorage();
    const identity=await evaluate(client,manualStorageSession,`(async()=>{
      const tabs=(await chrome.tabs.query({url:${JSON.stringify(dom.url)}})).filter(tab=>tab.url===${JSON.stringify(dom.url)});
      if(tabs.length!==1)throw Error('manual fixture must identify exactly one native Chrome tab');
      const frame=await chrome.webNavigation.getFrame({tabId:tabs[0].id,frameId:0});
      return {tabId:tabs[0].id,documentId:frame?.documentId,url:frame?.url};
    })()`);
    assert.equal(identity.url,dom.url,'manual readback belongs to the exact current document');
    assert.ok(identity.documentId,'Chrome top document ID required for manual evidence');
    const shot=await screenshot(client,manualSession,'manual-'+row.id+'-'+phase+'-page');report.screenshots.push(shot);
    return row.evidence[phase]={...identity,dom,storage,screenshot:shot};
  };
  const saveManualEvidence=async(row)=>{
    const file='manual-'+row.id+'-'+row.status.toLowerCase()+'.json',snapshots={};
    const attempt=async(label,job)=>{try{return await job();}catch(error){return {error:String(error.stack||error),label};}};
    snapshots.after=manualSession?await attempt('manual after snapshot',()=>manualSnapshot(row,'after')):null;
    snapshots.storage=await attempt('chrome.storage.local.get',manualStorage);
    snapshots.page=manualSession?await attempt('manual fixture DOM',()=>manualDom(manualSession)):null;
    snapshots.panel=manualPanelSession?await attempt('installed tool DOM',()=>evaluate(client,manualPanelSession,
      '({url:location.href,text:document.body.innerText,controls:[...document.querySelectorAll("button,input,summary")].map(el=>({tag:el.tagName,id:el.id,label:el.getAttribute("aria-label"),text:el.textContent?.trim(),disabled:el.disabled,value:el.value,visible:el.getClientRects().length>0}))})')):null;
    snapshots.otherPage=manualOtherSession?await attempt('other-site DOM',()=>manualDom(manualOtherSession)):null;
    const shots=[];
    for(const [label,session] of [['page',manualSession],['other-site',manualOtherSession],['panel',manualPanelSession]]){
      if(!session)continue;
      const shot=await attempt(label,()=>screenshot(client,session,'manual-'+row.id+'-'+row.status.toLowerCase()+'-'+label));
      if(shot.error)report.evidenceErrors.push('manual screenshot '+label+': '+shot.error);
      else{shots.push(shot);report.screenshots.push(shot);}
    }
    const traceFile='manual-'+row.id+'-native-call-trace.json';
    const trace=await preserve(traceFile,JSON.stringify(nativeCallTrace.slice(row.traceStart),null,2)+'\n');
    const artifact=await preserve(file,JSON.stringify({identity:report.manualCosmeticEvidence.identity,case:row.id,
      status:row.status,error:row.error,before:row.evidence.before,...snapshots,screenshots:shots,trace},null,2)+'\n');
    if(snapshots.storage.error)report.evidenceErrors.push('manual storage evidence: '+snapshots.storage.error);
    if(snapshots.after?.error)report.evidenceErrors.push('manual after snapshot: '+snapshots.after.error);
    Object.assign(row.evidence,{...artifact,file,screenshots:shots,traceFile,trace});
  };
  let manualPanelSession=null;
  const manualCase=async(id,job)=>{
    const row=report.manualCosmeticCases.find(x=>x.id===id);
    assert.ok(row,'declared manual case '+id);assert.equal(row.status,'NOT_TESTED','manual cases run once');
    Object.assign(row,{status:'RUNNING',startedAt:new Date().toISOString(),traceStart:nativeCallTrace.length});
    updateManualSummary();
    try{await manualSnapshot(row);Object.assign(row.evidence,await job(row));row.status='PASS';}
    catch(error){row.status='FAIL';row.error=String(error.stack||error);throw error;}
    finally{row.finishedAt=new Date().toISOString();updateManualSummary();
      await saveManualEvidence(row);note('manual-cosmetic-'+id,row);}
    return row;
  };
  // Reuse the owned Chrome CDP session for genuine pointer input. No separate
  // browser, Playwright runtime dependency, or fabricated DOM click is needed.
  const mousePage=async(targetId,attachedSession=null)=>{
    let session=attachedSession;
    if(!session){
      session=(await client.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
      await client.send('Runtime.enable',{},session);
      await client.send('Page.enable',{},session);
    }
    const target=await until(async()=>{
      const info=(await client.send('Target.getTargetInfo',{targetId})).targetInfo;
      if(info?.type!=='page'||!info.url?.startsWith('http'))return null;
      if(new URL(info.url).pathname!=='/manual')return null;
      return await evaluate(client,session,'location.href')===info.url?info:null;
    },'actual manual fixture document bound to exact CDP target');
    const point=async selector=>{
      const expression='(()=>{const n=document.querySelector('+JSON.stringify(selector)+');if(!n)return null;'+
        'const r=n.getBoundingClientRect(),s=getComputedStyle(n),x=r.left+r.width/2,y=r.top+r.height/2;'+
        'return {x,y,width:r.width,height:r.height,hit:n.contains(document.elementFromPoint(x,y)),'+
        'display:s.display,visibility:s.visibility};})()';
      const box=await evaluate(client,session,expression);
      assert.ok(box&&box.width>0&&box.height>0&&box.display!=='none'&&box.visibility==='visible',
        'visible fixture target '+selector);
      assert.equal(box.hit,true,'Chrome pointer must hit actual fixture target '+selector);
      return {x:box.x,y:box.y};
    };
    return {
      targetId,session,url:()=>target.url,point,
      async bringToFront(){
        const info=(await client.send('Target.getTargetInfo',{targetId})).targetInfo;
        assert.equal(info?.url,await evaluate(client,session,'location.href'),
          'do not activate an unrelated Chrome document');
        await client.send('Target.activateTarget',{targetId});
        await until(()=>evaluate(client,session,'document.visibilityState==="visible"'),
          'real Chrome fixture page visible after activation',5000);
      },
      locator:selector=>({hover:async()=>{
        const {x,y}=await point(selector);
        await client.send('Input.dispatchMouseEvent',
          {type:'mouseMoved',x,y,button:'none',pointerType:'mouse'},session);
      }})
    };
  };
  const mouseClick=async(page,selector)=>{
    const {x,y}=await page.point(selector);
    const dispatchedAt=Date.now();
    await client.send('Input.dispatchMouseEvent',
      {type:'mouseMoved',x,y,button:'none',pointerType:'mouse'},page.session);
    await client.send('Input.dispatchMouseEvent',
      {type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,pointerType:'mouse'},page.session);
    await client.send('Input.dispatchMouseEvent',
      {type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1,pointerType:'mouse'},page.session);
    const event=await until(async()=>{
      const value=await evaluate(client,page.session,'window.manualFixtureEvents.at(-1)');
      return value?.isTrusted&&value.type==='click'&&value.at>=dispatchedAt?value:null;
    },'actual trusted Chrome mouse click recorded by fixture',1500);
    assert.equal(event.target,selector.slice(1),
      'genuine pointer click must reach the selected fixture element');
    return {selector,x,y,driver:'CDP Input.dispatchMouseEvent',event};
  };
  const counts={ad:0,normal:0,frameAd:0,framePage:0},serverRequests=[];
  let port;
  const server=createServer((req,res)=>{
    const uri=new URL(req.url,'http://placeholder'),hostname=(req.headers.host||'').split(':')[0];
    serverRequests.push({at:new Date().toISOString(),hostname,path:uri.pathname,query:uri.search});
    res.setHeader('cache-control','no-store');res.setHeader('access-control-allow-origin','*');
    if(uri.pathname==='/manual'){
      res.setHeader('content-type','text/html;charset=utf-8');res.end(MANUAL_FIXTURE);return;
    }
    if(uri.pathname==='/page'){
      res.setHeader('content-type','text/html;charset=utf-8');
      res.end('<!doctype html><title>AdBlock controlled page</title><h1>Network fixture ready</h1>');
    }else if(uri.pathname==='/frame'){
      counts.framePage++;
      res.setHeader('content-type','text/html;charset=utf-8');
      const image='http://zedo.com:'+port+'/frame-pixel?nonce='+encodeURIComponent(uri.searchParams.get('n')||'');
      const child=uri.searchParams.get('child');
      res.end('<!doctype html><h1>iframe served</h1><img src="'+image+'">'+
        (child?'<iframe src="'+child.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>':''));
    }else if(uri.pathname==='/ad-pixel'||uri.pathname==='/frame-pixel'||uri.pathname==='/normal-pixel'){
      if(uri.pathname==='/frame-pixel'&&hostname==='zedo.com')counts.frameAd++;
      if(uri.pathname==='/ad-pixel'&&hostname==='zedo.com')counts.ad++;
      if(uri.pathname==='/normal-pixel')counts.normal++;
      res.setHeader('content-type','image/gif');
      res.end(Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64'));
    }else{res.statusCode=404;res.end('not found');}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'::',()=>{server.removeListener('error',reject);resolve();});
  });
  port=server.address().port;
  const page='http://127.0.0.1:'+port+'/page';
  const otherPage='http://localhost:'+port+'/page';
  const manualUrl='http://localhost:'+port+'/manual',manualOtherUrl='http://127.0.0.1:'+port+'/manual';
  const adUrl=()=> 'http://zedo.com:'+port+'/ad-pixel?nonce='+randomUUID();
  const normalUrl=()=> 'http://127.0.0.1:'+port+'/normal-pixel?nonce='+randomUUID();
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-adblock-r12-'));
  const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--password-store=basic','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--no-proxy-server','--remote-allow-origins=*',
    '--host-resolver-rules=MAP zedo.com 127.0.0.1, EXCLUDE localhost',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+loadedRoot,
    '--load-extension='+loadedRoot,'about:blank'];
  if(process.env.OPENDESK_ADBLOCK_CHROME_DIAGNOSTICS==='1')argv.unshift(
    '--enable-logging=stderr','--vmodule=*service_worker*=2,*devtools*=2,*declarative_net_request*=2,*ruleset*=2,*data_decoder*=2');
  report.browserSessions=[];
  const launch=()=>{
    const child=spawn(BIN,argv,{stdio:['ignore','ignore','pipe']});
    report.browserSessions.push({pid:child.pid,profile,root:loadedRoot,chromeBin:BIN,
      launchedAt:new Date().toISOString(),manifestSHA256:loadedManifestSHA256,
      artifactPackageHash:loadedArtifactPackageHash??report.artifactPackageHash});
    child.once('exit',(code,signal)=>Object.assign(
      report.browserSessions.find(session=>session.pid===child.pid),
      {exitedAt:new Date().toISOString(),code,signal}));
    return child;
  };
  const allCdpEvents=[],archivedSockets=new WeakSet();
  const archiveEvents=socket=>{
    if(!socket||archivedSockets.has(socket))return;
    const launchId=socket.launchId;
    for(const event of socket.events)allCdpEvents.push({...event,browserSession:launchId,launchId});
    archivedSockets.add(socket);
  };
  let chrome=launch(),client=null,errors='',passed=false;
  const capture=p=>p.stderr.on('data',chunk=>errors=(errors+chunk).slice(-300000));
  capture(chrome);
  t.after(async()=>{
    try{
      if(client&&!passed){
        try{
          const targets=(await client.send('Target.getTargets')).targetInfos;
          report.failedTargets=targets.map(x=>({type:x.type,url:x.url})).slice(0,20);
          for(const target of targets.filter(x=>x.url.includes('/sidepanel.html'))){
            try{
              const session=await attach(client,target.targetId);
              report.screenshots.push(await screenshot(client,session,'failure-'+target.targetId));
              const diagnostic=await evaluate(client,session,'(async()=>({url:location.href,text:document.body.innerText,'+
                'elements:[...document.querySelectorAll("#extension-center-list button,#sidebar-tool-preview,#sidebar-tool-install,#sidebar-tool-file-error,#notice")].map(x=>({id:x.id,text:x.textContent,hidden:x.hidden,disabled:x.disabled,rect:x.getBoundingClientRect().toJSON()})),'+
                'storage:await chrome.storage.local.get(null),permissions:await chrome.permissions.getAll(),'+
                'dynamic:await (async()=>{try{return await chrome.declarativeNetRequest?.getDynamicRules?.();}'+
                'catch(e){return {error:String(e)};}})()}))()');
              await writeFile(path.join(OUT,'failure-'+target.targetId+'.json'),JSON.stringify(diagnostic,null,2)+'\n');
            }catch(error){report.diagnosticError=String(error);}
          }
          const target=targets.find(x=>x.type==='service_worker'&&x.url.endsWith('/sw.js'));
          if(target){
            const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
            report.workerLocks=await evaluate(client,session,'navigator.locks.query()');
          }
        }catch{}
      }
      if(client)try{await client.send('Browser.close');}catch(error){
        // Chrome can close the transport before replying; verify process exit.
        try{await until(()=>chrome.exitCode!==null||chrome.signalCode!==null,'Chrome exit after close',5000);}
        catch{report.cleanupErrors.push('Browser.close: '+String(error));}
      }
      client?.close();
      if(chrome.exitCode===null&&chrome.signalCode===null){
        chrome.kill('SIGTERM');await pause(1200);
        if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
      }
      await until(()=>chrome.exitCode!==null||chrome.signalCode!==null,'cleanup Chrome process exited',5000);
    }catch(error){
      report.cleanupErrors.push(String(error.stack||error));
    }finally{
      // A Chrome shutdown failure must not leave the independent HTTP listener open.
      try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
      catch(error){report.cleanupErrors.push('HTTP server: '+String(error.stack||error));}
      // Never remove a profile while its owned Chrome process may still be using it.
      if(chrome.exitCode!==null||chrome.signalCode!==null){
        try{
          if(path.basename(profile).startsWith('opendesk-adblock-r12-')&&path.dirname(profile)===tmpdir())
            await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
          if(deploymentParent)await rm(deploymentParent,{recursive:true,force:true,maxRetries:3,retryDelay:200});
        }catch(error){report.cleanupErrors.push('Chrome profile: '+String(error.stack||error));}
      }else report.cleanupErrors.push('Chrome profile retained because its process has not exited');
      archiveEvents(client);
      await preserve('cdp-events.json',JSON.stringify(allCdpEvents,null,2)+'\n');
      const reactInputs=allCdpEvents.filter(event=>event.method==='Runtime.consoleAPICalled'&&
        event.params.args?.[0]?.value?.startsWith?.('ADBLOCK_REACT_INPUT '));
      await preserve('react-input-events.json',JSON.stringify(reactInputs,null,2)+'\n');
      report.wxtConnectionEvidence={
        // Report only raw console observations; metadata alone cannot prove a connection.
        rawEvents:allCdpEvents.filter(event=>event.method==='Runtime.consoleAPICalled'&&
          event.params.args?.some(arg=>typeof arg.value==='string'&&arg.value.includes('[WXT]')))
      };
      report.reactInputEvidence={events:reactInputs.length,
        trusted:reactInputs.filter(event=>JSON.parse(event.params.args[0].value.slice(20)).isTrusted===true).length};
      report.serverCounts=counts;
      await preserve('server-requests.json',JSON.stringify(serverRequests,null,2)+'\n');
      await preserve('native-call-trace.json',JSON.stringify(nativeCallTrace,null,2)+'\n');
      report.chromeErrorTail=errors.slice(-1000);
      await preserve('chrome-stderr.log',errors);
      if(!CLOSEOUT)updateManualSummary();
      const requiredNative=['nativePermission','network','globalToggle','siteException','otherSite','iframe',
        'closedPanel','workerRestart','browserRestart','revocation','uninstall','installedUiParity','siteScopeSwitch','restoreOneClick'];
      report.missingReleaseCoverage=requiredNative.filter(key=>report[key]!=='PASS');
      const eligible=passed&&report.cases?.manualCosmetic?.status==='PASS'&&
        report.missingReleaseCoverage.length===0&&report.evidenceErrors.length===0&&report.cleanupErrors.length===0;
      report.success=false;report.releaseReady=false;
      report.status=passed?'DEVELOPMENT_INCOMPLETE':'FAIL_OR_BLOCKED_NATIVE';
      // Only the unchanged release verifier can authorize a release PASS.
      // Original legacy manual cases alone are not its thirteen-step contract.
      if(eligible){
        try{
          const fingerprint=await packageFingerprint(ROOT);
          assert.equal(fingerprint.packageHash,report.artifactPackageHash);
          assert.ok(developmentUpdate===null&&!fingerprint.files.some(row=>row.path.endsWith('.map')||row.path==='development-update.json'));
          const evidenceFiles=new Map();
          for(const descriptor of [report.cases.manualCosmetic.evidence,...report.screenshots])
            evidenceFiles.set(descriptor.file,await readFile(path.join(OUT,descriptor.file)));
          const candidate={...report,environment:'PRODUCTION',status:'PASS',success:true,releaseReady:true};
          report.releaseVerification=verifyAdblockNativeRelease(candidate,{head:report.candidate,
            driver:await readFile(new URL(import.meta.url)),runtime:runtimeBytes,manifest:manifestBytes,
            packageBytes:bytes,artifactPackageHash:fingerprint.packageHash,evidenceFiles});
          Object.assign(report,{environment:'PRODUCTION',status:'PASS',success:true,releaseReady:true});
        }catch(error){report.releaseVerification={status:'FAIL',error:String(error.stack||error)};}
      }
      await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
      assert.notEqual(report.releaseVerification?.status,'FAIL',
        'release verification rejected the saved native report: '+(report.releaseVerification?.error||''));
      assert.equal(report.cleanupErrors.length,0,'Native cleanup must succeed');
      assert.equal(report.evidenceErrors.length,0,'raw evidence writes must succeed');
    }
  });
  async function connected(){
    const debugPort=await until(async()=>{
      const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
      const port=Number(source?.split('\n')[0]);return port>0?port:null;
    },'native Chrome CDP port',30000);
    const raw=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version')).json();
    const socket=connect(raw.webSocketDebuggerUrl);socket.launchId=report.browserSessions.length;await socket.ready;
    return {socket,version:raw.Browser};
  }
  let first=await connected();
  client=first.socket;report.chrome=first.version;
  const id=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'actual loaded extension',20000);
  report.extensionId=id;
  const worker=(await client.send('Target.getTargets')).targetInfos.find(x=>x.type==='service_worker'&&x.url==='chrome-extension://'+id+'/sw.js');
  assert.ok(worker?.targetId,'real extension Worker target must exist before DNR verification');
  // macOS CFT 155 may crash an attached MV3 Worker on Runtime.evaluate.
  // Probe that path only when explicitly diagnosing DevTools. The normal
  // acceptance run MUST still exercise the actual installed Host, DNR API,
  // network interception, revocation, upgrade and real readbacks below.
  // This distinction prevents an inspector crash from blocking observation
  // while never treating Target.getTargets as evidence that DNR works.
  report.workerInspectionMode=process.env.OPENDESK_ADBLOCK_INSPECT_WORKER==='1'
    ?'CDP_WORKER_DIAGNOSTIC':'NON_INTRUSIVE_NATIVE_BUSINESS';
  if(report.workerInspectionMode==='CDP_WORKER_DIAGNOSTIC'){
    const workerSession=(await client.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
    await client.send('Runtime.enable',{},workerSession);
    // Separate read-only worker health from the existing observation install.
    // Neither probe authorizes or writes Chrome state; release gates stay intact.
    // Diagnose an actual Inspector.targetCrashed without reclassifying it as SW sleep.
    // The about:blank CDP control is diagnostic only, never a substitute for DNR.
    async function recordWorkerCrash(stage,error){
      const diagnostic={stage,error:String(error),chromePid:chrome.pid,
        chromeProcessAlive:chrome.exitCode===null&&chrome.signalCode===null,
        workerEvents:client.events.filter(event=>event.sessionId===workerSession).slice(-30),
        browserCrashes:client.events.filter(event=>event.method==='Target.targetCrashed').slice(-10),
        chromeErrorTail:errors.slice(-12000),
        crashpadReports:await readdir(path.join(profile,'Crashpad','reports')).catch(()=>[])};
      try{diagnostic.targets=(await client.send('Target.getTargets')).targetInfos
        .map(({targetId,type,url,attached})=>({targetId,type,url,attached}));}
      catch(e){diagnostic.targetsError=String(e);}
      let controlTargetId=null,controlSession=null;
      try{
        controlTargetId=(await client.send('Target.createTarget',{url:'about:blank'})).targetId;
        controlSession=(await client.send('Target.attachToTarget',{targetId:controlTargetId,flatten:true})).sessionId;
        await client.send('Runtime.enable',{},controlSession);
        const response=await client.send('Runtime.evaluate',
          {expression:'1+1',awaitPromise:false,returnByValue:true},controlSession);
        diagnostic.controlPage={status:response.result?.value===2?'PASS':'FAIL',result:response.result?.value};
      }catch(e){diagnostic.controlPage={status:'FAIL',error:String(e)};}
      finally{
        if(controlSession)await client.send('Target.detachFromTarget',{sessionId:controlSession}).catch(()=>{});
        if(controlTargetId)await client.send('Target.closeTarget',{targetId:controlTargetId}).catch(()=>{});
      }
      report.workerCrashDiagnostic=diagnostic;
      await preserve('cdp-worker-crash-diagnostic.json',JSON.stringify(diagnostic,null,2)+'\n');
      console.error('ADBLOCK_CDP_CRASH_DIAGNOSTIC '+JSON.stringify({
        stage,chromeProcessAlive:diagnostic.chromeProcessAlive,controlPage:diagnostic.controlPage,
        crashpadReports:diagnostic.crashpadReports}));
    }
    const probeWorker=async(stage,expression,{awaitPromise=true}={})=>{
      const entry={stage,targetId:worker.targetId,sessionId:workerSession};
      report.workerInspectorChecks??=[];
      try{
        const reply=await client.send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true},workerSession);
        if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails).slice(0,500));
        const value=reply.result.value;
        Object.assign(entry,{status:'PASS',...(stage==='read-only-context'?{result:value}:{})});
        report.workerInspectorChecks.push(entry);
        return value;
      }catch(error){
        Object.assign(entry,{status:'FAIL',error:String(error),
          targetCrashed:client.events.some(event=>event.sessionId===workerSession&&
            event.method==='Inspector.targetCrashed')});
        report.workerInspectorChecks.push(entry);
        await recordWorkerCrash(stage,error).catch(diagnosticError=>{
          report.workerCrashDiagnosticError=String(diagnosticError);
        });
        throw error;
      }
    };
    // A scalar with and without awaitPromise separates target startup from
    // the inspector's Promise-awaiter and the extension-context identity read.
    assert.equal(await probeWorker('cdp-scalar-no-await','1+1',{awaitPromise:false}),2);
    assert.equal(await probeWorker('cdp-scalar-await','1+1'),2);
    const workerIdentity=await probeWorker('read-only-context','({url:location.href,extensionId:chrome.runtime.id})');
    assert.equal(workerIdentity?.extensionId,id,'native worker identity must match the installed extension');
    await probeWorker('native-call-observer','('+observeNativeCalls.toString()+')()');
    }else{
    report.workerInspectorChecks=[{stage:'registered-worker-target',status:'PASS',
      targetId:worker.targetId,type:worker.type,url:worker.url,source:'Target.getTargets',
      inspectedWithRuntimeEvaluate:false}];
    // Real business checks (and an independent manifest identity read) follow;
    // no Worker Runtime.evaluate or injected console instrumentation occurs.
  }
  const visit=await client.send('Target.createTarget',{url:page});
  let site=await attach(client,visit.targetId);
  await until(()=>evaluate(client,site,'document.querySelector("h1")?.textContent==="Network fixture ready"'),'first-party fixture');
  const baseline=await probe(client,site,adUrl());
  assert.equal(baseline.success,true,'without AdBlock approval, actual ad host request must load');
  assert.equal(counts.ad,1,'real HTTP server must receive the before sample');
  assert.equal((await probe(client,site,normalUrl())).success,true);
  note('uninstalled-baseline',{adRequests:counts.ad,normalRequests:counts.normal,ad:baseline});

  const ui=await client.send('Target.createTarget',
    {url:'chrome-extension://'+id+'/sidepanel.html?hostInstanceId='+randomUUID()});
  let uid=await attach(client,ui.targetId);
  await until(()=>evaluate(client,uid,'!!document.querySelector("#catalog-open-dev-sidebar")'),
    'extension native launcher');
  assert.deepEqual(await evaluate(client,uid,'chrome.runtime.getManifest()'),loadedManifest,
    'actually loaded extension manifest must match complete deployment');
  await click(client,uid,'#catalog-open-dev-sidebar');
  const context=await until(async()=>{
    const entries=await evaluate(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return entries.find(x=>x.documentUrl?.includes('/sidepanel.html?hostInstanceId=')&&x.documentId)||null;
  },'actual Side Panel document');
  // A Chrome SIDE_PANEL context may use a canonical URL, while the actual
  // page target appends ?hostInstanceId=... . Require document-local context proof.
  note('side-panel-context-targets',{context,
    contexts:await evaluate(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})'),
    targets:(await client.send('Target.getTargets')).targetInfos.map(({targetId,type,url})=>({targetId,type,url}))});
  const initialPanel=await attachActualPanel(client,context,[ui.targetId]);
  let panel=initialPanel.target,sid=initialPanel.session;
  report.nativePanel={documentId:initialPanel.context.documentId,contextUrl:initialPanel.context.documentUrl,
    targetId:panel.targetId,targetUrl:panel.url,targetType:panel.type,
    identity:initialPanel.identity};
  await click(client,sid,'#tab-tools');
  // The R4 extension center is the only visible installation surface. The
  // historical discovery button still exists in markup but is CSS-hidden.
  await until(()=>evaluate(client,sid,'!document.querySelector("#workbench-tools").hidden'),
    'real Extension Center tab is selected');
  if(CLOSEOUT){
    report.verificationScope=CORE_UPGRADE?'ADBLOCK_CORE_121_SETTINGS_UPGRADE_122_PICKER_ACTIONS':
      'ADBLOCK_CLOSEOUT_AB_UPGRADE_MANUAL_ICONS_CHROME_ZOOM';
    report.closeout={status:'RUNNING',oldPackage:{file:OLD_PACKAGE,version:'1.2.1',
      sha256:createHash('sha256').update(oldBytes).digest('hex')},sourceRoot:SOURCE_ROOT};
    await runAdblockCloseoutNative({client,hostSession:sid,launcherSession:uid,
      evaluate,click,clickSandbox,screenshot,until,attach,attachActualReact,
      reactSwitch,requestReactReview,approveReactReview,reloadFixture,
      mousePage,mouseClick,probe,getOwned,report,preserve,packageHash:sidebarToolPackageHash,
      oldPackage:OLD_PACKAGE,oldBytes,candidatePackage:path.join(ROOT,'official-tools/adblock/adblock.opendesk-tool.json'),
      candidateBytes:bytes,manifest,manualUrl,manualOtherUrl,adUrl,
      candidateOnly:process.env.OPENDESK_ADBLOCK_NATIVE_CANDIDATE_ONLY==='1',coreOnly:CORE_UPGRADE,
      runtimeIdentity:()=>({extensionId:id,profile,root:loadedRoot,
        artifactPackageHash:loadedArtifactPackageHash??report.artifactPackageHash}),
      upgradeRuntime:CORE_UPGRADE?async()=>{
        const prior=chrome;
        await client.send('Browser.close').catch(()=>{});
        await until(()=>prior.exitCode!==null||prior.signalCode!==null,'old Chrome exited before complete upgrade',25000);
        archiveEvents(client);client.close();client=null;
        await rm(path.join(profile,'DevToolsActivePort'),{force:true});
        // Owned copy only: never modify either frozen artifact or shared dev output.
        await rm(loadedRoot,{recursive:true});await cp(ROOT,loadedRoot,{recursive:true,errorOnExist:true,mode:fsConstants.COPYFILE_FICLONE});
        loadedArtifactPackageHash=(await packageFingerprint(loadedRoot)).packageHash;
        assert.equal(loadedArtifactPackageHash,report.artifactPackageHash,'entire new artifact deployed byte for byte');
        loadedManifest=manifest;loadedManifestSHA256=report.manifestSHA256;chrome=launch();capture(chrome);
        const next=await connected();client=next.socket;
        const nextId=await until(async()=>{
          const targets=(await client.send('Target.getTargets')).targetInfos;
          return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url.split('/')[2];
        },'upgraded extension worker',25000);
        assert.equal(nextId,id,'same extension ID across complete artifact upgrade');
        const workerSource=async()=>{
          const target=(await client.send('Target.getTargets')).targetInfos.find(x=>x.type==='service_worker'&&x.url==='chrome-extension://'+id+'/sw.js');
          if(!target)return null;
          const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
          await client.send('Runtime.enable',{},session);await client.send('Debugger.enable',{},session);
          const script=await until(()=>client.events.findLast(e=>e.sessionId===session&&e.method==='Debugger.scriptParsed'&&e.params.url===target.url),'loaded SW script');
          const source=await client.send('Debugger.getScriptSource',{scriptId:script.params.scriptId},session);
          return {targetId:target.targetId,session,sha256:createHash('sha256').update(source.scriptSource).digest('hex')};
        };
        const beforeReload=await until(workerSource,'worker script before unpacked reload');
        report.runtimeUpgrade={method:'same path/Profile full deployment + chrome.runtime.reload',
          beforeReloadSHA256:beforeReload.sha256,expectedSHA256:report.swSHA256};
        const managerTarget=await client.send('Target.createTarget',{url:'chrome://extensions/'});
        const managerSession=await attach(client,managerTarget.targetId);
        await until(()=>evaluate(client,managerSession,'!!globalThis.chrome?.developerPrivate'),'Chrome extension manager ready');
        const devToggle=()=>evaluate(client,managerSession,`(()=>{
          const n=document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-toolbar')?.shadowRoot?.querySelector('#devMode');
          if(!n)return null;const r=n.getBoundingClientRect();return {checked:n.checked,disabled:n.disabled,
            x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
        const toggle=await until(devToggle,'Chrome developer mode control');
        if(!toggle.checked){
          assert.equal(toggle.disabled,false);assert.ok(toggle.width>0&&toggle.height>0);
          await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:toggle.x,y:toggle.y},managerSession);
          await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:toggle.x,y:toggle.y},managerSession);
          await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:toggle.x,y:toggle.y},managerSession);
          await until(async()=>(await devToggle())?.checked,'owned Profile developer mode enabled through Chrome UI');
        }
        report.runtimeUpgrade.developerMode={before:toggle,after:await devToggle(),input:'CDP trusted mouse on Chrome extensions toolbar'};
        // Chrome can retain the old registered worker across a same-version
        // unpacked path replacement. Use its normal reload, then verify code.
        await evaluate(client,beforeReload.session,'chrome.runtime.reload()').catch(()=>{});
        await until(async()=>!(await client.send('Target.getTargets')).targetInfos.some(x=>x.targetId===beforeReload.targetId),'old registered worker retired');
        await until(async()=>{
          const entries=await evaluate(client,managerSession,'chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true})');
          const entry=entries.find(x=>x.id===id);
          report.runtimeUpgrade.extensionManager=entry;
          return entry?.state==='ENABLED';
        },'same extension enabled after normal reload');
        const target=await client.send('Target.createTarget',
          {url:'chrome-extension://'+id+'/sidepanel.html?hostInstanceId='+randomUUID()});
        uid=await attach(client,target.targetId);
        await until(()=>evaluate(client,uid,'!!document.querySelector("#catalog-open-dev-sidebar")'),'upgraded launcher after normal unpacked reload');
        const actualWorker=await until(workerSource,'new registered worker source');
        report.runtimeUpgrade.afterReloadSHA256=actualWorker.sha256;
        assert.equal(actualWorker.sha256,report.swSHA256,'actual registered worker must execute the new artifact bytes');
        await evaluate(client,actualWorker.session,'('+observeNativeCalls.toString()+')()');
        await client.send('Target.closeTarget',{targetId:managerTarget.targetId});
        assert.deepEqual(await evaluate(client,uid,'chrome.runtime.getManifest()'),manifest,'new loaded manifest matches candidate');
        await click(client,uid,'#catalog-open-dev-sidebar');
        const context=await until(async()=>{
          const contexts=await evaluate(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
          return contexts.find(x=>x.documentUrl?.includes('/sidepanel.html?hostInstanceId=')&&x.documentId);
        },'upgraded real Side Panel');
        const nextPanel=await attachActualPanel(client,context,[target.targetId]);
        sid=nextPanel.session;panel=nextPanel.target;
        await click(client,sid,'#tab-tools');
        return {client,hostSession:sid,launcherSession:uid};
      }:null});
    assert.equal((await packageFingerprint(ROOT)).packageHash,report.artifactPackageHash,'frozen artifact unchanged');
    assert.deepEqual(await readReactSourceHashes(),reactSourceSHA256,'frozen React sources unchanged');
    assert.deepEqual(await readTrustedSourceHashes(),trustedSourceSHA256,'frozen trusted sources unchanged');
    assert.deepEqual(await readFile(OLD_PACKAGE),oldBytes,'old formal 1.2.1 package remains unchanged');
    assert.equal(createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),report.driverSHA256);
    assert.equal(createHash('sha256').update(await readFile(new URL('./helpers/adblock-layout-native.mjs',import.meta.url))).digest('hex'),report.layoutHelperSHA256);
    report.sourceChain.sourceUnchanged='PASS';
    report.closeout.status='DEVELOPMENT_PASS';passed=true;return;
  }
  // The Extension Center intentionally keeps Catalog-only applications out of
  // the default Installed scope. Discovery requires a real user scope change.
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="available"]');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-search');
  await client.send('Input.insertText',{text:'广告拦截'},sid);
  const official='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="main"]';
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+
    JSON.stringify(official)+');return !!b&&!b.disabled})()'),
    'official optional AdBlock in user-selected available scope');
  await click(client,sid,official);
  await until(()=>evaluate(client,sid,
    '!!document.querySelector("#extension-center-detail [data-ec-detail-action=install]")'),
    'official AdBlock detail requires review');
  await click(client,sid,'#extension-center-detail [data-ec-detail-action="install"]');
  await until(()=>evaluate(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'review fixed AdBlock');
  await click(client,sid,'#sidebar-tool-install');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="smart"]');
  // The filter popover stays open until dismissed; it overlays the actual row
  // and would make a synthesized element.click() wrongly appear successful.
  await click(client,sid,'#extension-center-more');
  const installed='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="main"]';
  const openInstalled=async session=>{
    await until(()=>evaluate(client,session,'(()=>{'+
    'const tools=document.querySelector("#workbench-tools"),importing=document.querySelector("#sidebar-tool-import");'+
    'const file=document.querySelector("#sidebar-tool-file"),close=document.querySelector("#sidebar-tool-import-close");'+
    'return !!tools&&!tools.hidden&&!!importing&&importing.hidden&&!!file&&!file.disabled&&!!close&&!close.disabled;})()'),
    'trusted Host installation finishes and Tools route is visible');
    await until(()=>evaluate(client,session,'(()=>{const list=document.querySelector("#extension-center-list");'+
      'const b=document.querySelector('+JSON.stringify(installed)+'),row=b?.closest("li");'+
      'return list?.getAttribute("aria-busy")==="false"&&!!row&&'+
      'row.getAttribute("aria-busy")!=="true"&&!!b&&!b.disabled&&b.getAttribute("aria-label")==="打开「广告拦截」";})()'),
      'installed AdBlock list and row finish refreshing before a single real Open click');
    await click(client,session,installed);
  };
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+
    JSON.stringify(installed)+');return !!b&&!b.disabled&&b.getAttribute("aria-label")==="打开「广告拦截」"})()'),
    'reviewed official AdBlock installed and directly runnable in the unified list');
  await openInstalled(sid);
  const installedIdentity=await evaluate(client,uid,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1",'+
    '"opendesk.sidebar-tools.revocation-epochs.v1"]).then(x=>({tool:x["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="adblock"),'+
    'epoch:x["opendesk.sidebar-tools.revocation-epochs.v1"]?.adblock??null}))');
  assert.equal(await sidebarToolPackageHash(installedIdentity.tool),await sidebarToolPackageHash(pkg));
  report.installedIdentity={packageHash:await sidebarToolPackageHash(installedIdentity.tool),epoch:installedIdentity.epoch,version:installedIdentity.tool.version};
  report.packageIdentity={root:ROOT,artifactPackageHash:report.artifactPackageHash,swSHA256:report.swSHA256,manifestSHA256:report.manifestSHA256,
    packageSHA256:report.packageSHA256,manifestVersion:manifest.version,manifestName:manifest.name,
    loadedManifestMatched:true,installedPackageHash:report.installedIdentity.packageHash};
  note('loaded-candidate-identity',report.packageIdentity);
  // Source-identical candidate -> real installed opaque iframe -> React Aria.
  // This never opens a standalone preview and never grants Chrome permissions.
  const react=await attachActualReact(client,sid);
  const chromePermission=await evaluate(client,uid,
    'chrome.permissions.contains({permissions:["declarativeNetRequestWithHostAccess"]})');
  assert.equal(manifest.permissions.includes('declarativeNetRequestWithHostAccess'),true,
    'current Manifest requires DNR and cannot be tested as an optional grant');
  assert.equal(chromePermission,true,'actual loaded Chrome extension must own its mandatory DNR permission');
  report.nativePermission='PASS';
  const installedToolbar=await evaluate(client,sid,'(()=>{'+
    'const title=document.getElementById("sidebar-tool-title");'+
    'const frame=document.getElementById("sidebar-tool-frame");'+
    'const settings=document.getElementById("sidebar-tool-settings-open");'+
    'const remove=document.getElementById("sidebar-tool-remove");'+
    'return {title:title?.textContent?.trim(),frameVisible:!!frame&&!frame.hidden,'+
    'settingsVisible:!!settings&&!settings.hidden,'+
    'removeVisible:!!remove&&!remove.hidden};})()');
  assert.equal(installedToolbar.title,'广告拦截');
  assert.equal(installedToolbar.frameVisible,true,'installed React must not be hidden as the retired native view');
  assert.equal(installedToolbar.settingsVisible,true);
  assert.equal(installedToolbar.removeVisible,true);
  report.installedUiParity='PASS';
  note('installed-react-ui-parity',installedToolbar);
  report.screenshots.push(await screenshot(client,sid,'adblock-installed-react-on'));
  if(process.env.OPENDESK_ADBLOCK_NATIVE_MANUAL_LAYOUT==='1'){
    await writeFile(path.join(OUT,'manual-layout-ready.json'),JSON.stringify({
      profile,extensionId:id,panelTargetId:panel.targetId,reactSession:react,root:ROOT},null,2)+'\n');
    await until(async()=>{try{return (await readFile(path.join(OUT,'manual-layout-continue'),'utf8')).trim()==='continue';}
      catch{return false;}},'native physical splitter review',180000);
  }
  // The host toolbar Settings message navigates the installed React product,
  // not a detached, retired native AdBlock screen.
  await click(client,sid,'#sidebar-tool-settings-open');
  // In shared-navigation mode React does not render its retired inner
  // “设置说明” header or inner Back button. Verify the actual settings
  // content AND Host-owned title after the trusted toolbar gesture.
  await until(async()=>{
    const [title,settings]=await Promise.all([
      evaluate(client,sid,'document.getElementById("sidebar-tool-title")?.textContent.trim()'),
      evaluate(client,react,'(()=>{const app=document.querySelector(".adblock-app");'+
        'return !!app&&app.textContent.includes("过滤范围")&&'+
        '[...app.querySelectorAll("button")].some(b=>b.textContent.trim()==="管理网站例外");})()')
    ]);
    return title==='广告拦截设置'&&settings;
  },'trusted toolbar opens installed React settings');
  // Exercise the only user-visible Back arrow in the real Side Panel.
  await click(client,sid,'#sidebar-tool-back');
  await until(async()=>{
    const [title,overview]=await Promise.all([
      evaluate(client,sid,'document.getElementById("sidebar-tool-title")?.textContent.trim()'),
      evaluate(client,react,'document.querySelector(".adblock-app")?.textContent.includes("全局保护")')
    ]);
    return title==='广告拦截'&&overview;
  },'trusted Host Back returns installed React overview');
  note('react-installed-settings-navigation',{opened:true,returned:true});

  const globalLabel='全局广告拦截';
  const globalSelector=reactSwitchSelector('全局广告拦截');
  const currentSelector=reactSwitchSelector('当前网站广告过滤');
  // The reviewed official installation automatically applies basic DNR.
  const enabled=await until(async()=>{
    const result=await getOwned(client,uid);
    const ui=await reactSwitch(client,react,globalLabel);
    return result.state?.enabled===true&&result.owned.some(x=>x.id===F)&&ui?.on?result:null;
  },'real React ON from installation, Chrome DNR readback',25000);
  assert.equal(enabled.owned.find(x=>x.id===F).condition.domainType,'thirdParty');
  const beforeBlock=counts.ad;
  const blocked=await probe(client,site,adUrl());
  assert.equal(blocked.success,false,'real Chrome must block matching network image');
  assert.equal(blocked.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  assert.equal(counts.ad,beforeBlock,'blocked ad MUST NOT reach local HTTP server');
  assert.equal((await probe(client,site,normalUrl())).success,true);
  report.network='PASS';note('real-react-network-block',{
    request:blocked,adServerHits:counts.ad,ownedRules:enabled.owned.map(x=>x.id)});

  await operateReactControl(client,sid,react,globalSelector,'关闭全局过滤');
  await until(async()=>{
    const r=await getOwned(client,uid),ui=await reactSwitch(client,react,globalLabel);
    return r.state?.enabled===false&&r.owned.length===0&&ui&&!ui.on;
  },'React OFF and real DNR removal');
  const paused=await probe(client,site,adUrl());
  assert.equal(paused.success,true,'real HTTP ad request must resume after OFF');
  await operateReactControl(client,sid,react,globalSelector,'开启全局过滤');
  await until(async()=>{
    const r=await getOwned(client,uid),ui=await reactSwitch(client,react,globalLabel);
    return r.state?.enabled===true&&r.owned.some(x=>x.id===F)&&ui?.on;
  },'React re-enable and DNR readback');
  const reblocked=await probe(client,site,adUrl());
  assert.equal(reblocked.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  report.globalToggle='PASS';note('react-global-off-on',{paused,reblocked});

  // Use the real tab/window selection; the sandbox may never choose the host
  // from a stale status snapshot or from an untrusted request payload.
  const activateFixture=async()=>{
    await evaluate(client,uid,'(async()=>{const t=(await chrome.tabs.query({url:'+JSON.stringify(page)+'}))[0];'+
      'if(!t)throw Error("page tab unavailable");await chrome.tabs.update(t.id,{active:true});'+
      'await chrome.windows.update(t.windowId,{focused:true});return t.id;})()');
  };
  await activateFixture();
  note('active-site-native-window',await evaluate(client,sid,
    '(async()=>({window:await chrome.windows.getCurrent(),'+
    'contexts:await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}),'+
    'tabs:await chrome.tabs.query({active:true})}))()'));
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),
    'real current-site identity from Chrome');
  const currentLabel='当前网站广告过滤';
  await until(async()=>{
    const x=await reactSwitch(client,react,currentLabel);return x&&!x.disabled&&x.on;
  },'React site switch enabled for the current HTTP website');
  // Real tab changes are scoped: a B toggle cannot silently pause site A.
  const scopeBefore=await getOwned(client,uid);
  const reviewOther=await client.send('Target.createTarget',{url:otherPage});
  const reviewOtherSession=await attach(client,reviewOther.targetId);
  await until(()=>evaluate(client,reviewOtherSession,
    'document.querySelector("h1")?.textContent==="Network fixture ready"'),
    'website B ready for cross-tab site scope');
  await evaluate(client,uid,'(async()=>{const t=(await chrome.tabs.query({url:'+JSON.stringify(otherPage)+'}))[0];'+
    'if(!t)throw Error("website B tab unavailable");await chrome.tabs.update(t.id,{active:true});'+
    'await chrome.windows.update(t.windowId,{focused:true});return t.id;})()');
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-host")?.textContent.trim()==="localhost"'),
    'React reflects active site B');
  await operateReactControl(client,sid,react,currentSelector,'site B pause');
  await until(async()=>{const status=await getOwned(client,uid);
    return status.state?.exceptions?.includes('localhost')&&
      !status.state.exceptions.includes('127.0.0.1')?status:null;},
    'one click pauses only site B');
  await operateReactControl(client,sid,react,currentSelector,'site B restore');
  await until(async()=>{const status=await getOwned(client,uid);
    return status.state?.exceptions?.length===0?status:null;},
    'one click restores B without changing A');
  assert.deepEqual(scopeBefore.state?.exceptions,[]);
  report.siteScopeSwitch='PASS';
  note('trusted-active-tab-site-scope',{siteA:'127.0.0.1',siteB:'localhost',
    exceptionsRestored:true});
  await client.send('Target.closeTarget',{targetId:reviewOther.targetId});
  await activateFixture();
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),
    'website A identity restored after rejected review');
  await until(async()=>{const x=await reactSwitch(client,react,currentLabel);
    return x&&!x.disabled&&x.on;},'website A remains filtered after rejected review');
  await operateReactControl(client,sid,react,currentSelector,'关闭 127.0.0.1 的广告过滤');
  await until(async()=>{
    const r=await getOwned(client,uid),ui=await reactSwitch(client,react,currentLabel);
    return r.state?.exceptions?.includes('127.0.0.1')&&
      r.owned.some(x=>x.action?.type==='allowAllRequests')&&ui&&!ui.on;
  },'real website A exception, allowAllRequests and React readback');
  note('fixture-reload',await reloadFixture(client,site,'real page A refresh after exception'));
  const allowed=await probe(client,site,adUrl());
  assert.equal(allowed.success,true,'site A exception must permit matching third-party ad');
  report.siteException='PASS';note('real-react-site-exception',{host:'127.0.0.1',allowed});

  const other=await client.send('Target.createTarget',{url:otherPage});
  const otherSession=await attach(client,other.targetId);
  await until(()=>evaluate(client,otherSession,
    'document.querySelector("h1")?.textContent==="Network fixture ready"'),
    'real website B');
  const otherBlocked=await probe(client,otherSession,adUrl());
  assert.equal(otherBlocked.network.errorText,'net::ERR_BLOCKED_BY_CLIENT',
    'website B must continue blocking despite A exception');
  report.otherSite='PASS';note('website-b-stays-blocked',{host:'localhost',otherBlocked});
  const frameBefore=counts.frameAd;
  await evaluate(client,site,'(()=>{const f=document.createElement("iframe");f.src='+
    JSON.stringify('http://localhost:'+port+'/frame?n='+randomUUID())+
    ';document.body.append(f);return true;})()');
  await until(()=>counts.framePage>0,'actual descendant iframe page requested');
  await until(()=>counts.frameAd>frameBefore,'real descendant iframe request exempted');
  report.iframe='PASS';note('nested-iframe-exception',{framePageHits:counts.framePage,adHits:counts.frameAd});
  const nestedNonce=randomUUID(),outerNonce=randomUUID(),nestedProbeNonce=randomUUID();
  const innerUrl='http://localhost:'+port+'/frame?n='+nestedNonce;
  const outerUrl='http://zedo.com:'+port+'/frame?n='+outerNonce+'&child='+encodeURIComponent(innerUrl);
  await evaluate(client,site,'(()=>{const f=document.createElement("iframe");f.src='+
    JSON.stringify(outerUrl)+';document.body.append(f);return true;})()');
  await until(()=>serverRequests.some(x=>x.hostname==='zedo.com'&&x.path==='/frame'&&
    new URLSearchParams(x.query).get('n')===outerNonce)&&serverRequests.some(x=>
    x.hostname==='localhost'&&x.path==='/frame'&&new URLSearchParams(x.query).get('n')===nestedNonce),
    'both cross-origin iframe levels reach the HTTP server with distinct nonces');
  const innerTarget=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='iframe'&&x.url===innerUrl),'real second-level cross-origin iframe target');
  const innerSession=await attach(client,innerTarget.targetId);
  await until(()=>evaluate(client,innerSession,'document.readyState==="complete"'),
    'second-level cross-origin document ready');
  const tree=(await client.send('Page.getFrameTree',{},site)).frameTree;
  const outerTarget=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='iframe'&&x.url===outerUrl),'real first-level cross-origin iframe target');
  const outerSession=await attach(client,outerTarget.targetId);
  // OOPIFs may be omitted from their parent's Page tree. Resolve each actual
  // owner element in the parent target rather than assuming a flattened tree.
  const outerTree=(await client.send('Page.getFrameTree',{},outerSession)).frameTree;
  const innerTree=(await client.send('Page.getFrameTree',{},innerSession)).frameTree;
  const frameOwner=async(parentSession,frameId,url)=>{
    const owner=await client.send('DOM.getFrameOwner',{frameId},parentSession);
    const {node}=await client.send('DOM.describeNode',{backendNodeId:owner.backendNodeId},parentSession);
    assert.equal(node.nodeName,'IFRAME','cross-origin frame must have a real parent iframe');
    const attrs=Object.fromEntries(Array.from({length:node.attributes.length/2},
      (_,i)=>node.attributes.slice(i*2,i*2+2)));
    assert.equal(attrs.src,url,'parent iframe src must match the exact child document');
    return {frameId,backendNodeId:owner.backendNodeId,attributes:attrs};
  };
  assert.equal(outerTree.frame.url,outerUrl);
  assert.equal(innerTree.frame.url,innerUrl);
  const outerOwner=await frameOwner(site,outerTree.frame.id,outerUrl);
  const innerOwner=await frameOwner(outerSession,innerTree.frame.id,innerUrl);
  const nestedImage='http://zedo.com:'+port+'/frame-pixel?nonce='+nestedProbeNonce;
  const nestedHits=()=>serverRequests.filter(x=>x.hostname==='zedo.com'&&x.path==='/frame-pixel'&&
    new URLSearchParams(x.query).get('nonce')===nestedProbeNonce).length;
  assert.equal(nestedHits(),0,'nested probe nonce must not have any earlier HTTP hits');
  const nestedRequest=await probe(client,innerSession,nestedImage);
  assert.equal(nestedRequest.success,true,'two cross-origin levels inherit website A exception');
  assert.equal(nestedRequest.network.status,200);
  assert.equal(nestedHits(),1,'exact nested CDP request nonce must reach HTTP server once');
  report.nestedIframe='PASS';
  note('two-level-cross-origin-iframe-exception',{outerUrl,innerUrl,outerNonce,nestedNonce,
    probeNonce:nestedProbeNonce,request:nestedRequest,httpHits:nestedHits(),
    frameTree:tree,outerTree,innerTree,outerOwner,innerOwner});


  await activateFixture();
  await until(async()=>{
    const x=await reactSwitch(client,react,currentLabel);return x&&!x.on;
  },'site A React switch reflects exception');
  await clickSandbox(client,sid,react,'button.adblock-link');
  const restoreSelector='button[aria-label="恢复 127.0.0.1 的广告过滤"]';
  await until(()=>evaluate(client,react,
    'document.querySelector('+JSON.stringify(restoreSelector)+')?.disabled===false'),
    'installed React exception list offers website A restore');
  report.screenshots.push(await screenshot(client,sid,'adblock-installed-react-exceptions'));
  const beforeRestore=await getOwned(client,uid);
  const sortedRules=rules=>[...rules].sort((a,b)=>a.id-b.id);
  assert.ok(beforeRestore.state?.exceptions?.includes('127.0.0.1'));
  await operateReactControl(client,sid,react,restoreSelector,'exception-list restore');
  await until(async()=>{
    const r=await getOwned(client,uid);
    return r.state?.exceptions?.length===0&&
      JSON.stringify(sortedRules(r.owned))===JSON.stringify(sortedRules(enabled.owned))?r:null;
  },'real React restoration and Chrome DNR readback');
  report.restoreOneClick='PASS';
  note('fixture-reload',await reloadFixture(client,site,'site A reload after restore'));
  assert.equal((await probe(client,site,adUrl())).network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  note('react-site-restored',{exceptions:0});

  await returnToAdblockOverview(client,sid,react);
  // Genuine Side Panel keyboard input must traverse into the React Aria input.
  // Do not invoke input.focus() or synthesize DOM keyboard events.
  let focused=false;
  await until(async()=>{
    const value=await reactSwitch(client,react,'全局广告拦截');
    return value&&!value.disabled;
  },'overview React global switch ready for physical Tab');
  for(let i=0;i<60;i++){
    if(await evaluate(client,react,
      'document.activeElement?.closest('+JSON.stringify(globalSelector)+')!==null')){focused=true;break;}
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
      {type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sid);
  }
  assert.equal(focused,true,'physical Tab must reach installed React global switch');
  for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
    {type,key:' ',code:'Space',windowsVirtualKeyCode:32},sid);
  await until(()=>evaluate(client,sid,
    'document.getElementById("sidebar-tool-action-review")?.hidden!==false'),
    'Space OFF needs no second approval');
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===false&&r.owned.length===0;},'Space OFF removes real rules');
  assert.equal((await probe(client,site,adUrl())).success,true);
  await until(()=>evaluate(client,react,
    '(()=>{const n=document.querySelector('+JSON.stringify(globalSelector)+');'+
    'return !!n&&!n.hasAttribute("data-disabled");})()'),
    'React switch action completes');
  // One more physical Tab/Space cycle may be needed because trusted review
  // moves focus back to the Side Panel; never force focus from JavaScript.
  focused=false;
  await until(async()=>{
    const value=await reactSwitch(client,react,'全局广告拦截');
    return value&&!value.disabled;
  },'overview React global switch ready for physical Tab');
  for(let i=0;i<60;i++){
    if(await evaluate(client,react,
      'document.activeElement?.closest('+JSON.stringify(globalSelector)+')!==null')){focused=true;break;}
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
      {type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sid);
  }
  assert.equal(focused,true,'React Aria remains keyboard reachable after OFF');
  for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
    {type,key:' ',code:'Space',windowsVirtualKeyCode:32},sid);
  await until(()=>evaluate(client,sid,
    'document.getElementById("sidebar-tool-action-review")?.hidden!==false'),
    'Space ON needs no second approval');
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===true&&r.owned.some(x=>x.id===F);},'Space ON restores DNR');
  assert.equal((await probe(client,site,adUrl())).network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  note('react-keyboard-tab-space',{keyboardTrusted:true,noExtraApproval:true});

  // The native Side Panel can close; DNR belongs to the extension worker.
  await client.send('Target.closeTarget',{targetId:panel.targetId});
  const sideClosed=await until(async()=>!(await client.send('Target.getTargets')).targetInfos
    .some(x=>x.targetId===panel.targetId),'Side Panel target closed');
  assert.equal(sideClosed,true);
  assert.equal((await probe(client,site,adUrl())).success,false);
  report.closedPanel='PASS';
  await client.send('ServiceWorker.enable',{},uid);
  const workerUrl='chrome-extension://'+id+'/sw.js';
  const beforeWorker=await getOwned(client,uid);
  const runningWorker=(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='service_worker'&&x.url===workerUrl);
  assert.ok(runningWorker,'a live extension worker must exist before the stop test');
  const beforeWorkerSession=(await client.send('Target.attachToTarget',
    {targetId:runningWorker.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},beforeWorkerSession);
  const workerContext=async session=>until(()=>client.events
    .filter(x=>x.sessionId===session&&x.method==='Runtime.executionContextCreated')
    .map(x=>x.params.context).find(x=>x.uniqueId&&x.auxData?.isDefault!==false),
    'real worker Runtime execution context');
  const beforeWorkerContext=await workerContext(beforeWorkerSession);
  const stoppedEventStart=client.events.length;
  await client.send('ServiceWorker.stopAllWorkers',{},uid);
  await until(async()=>!(await client.send('Target.getTargets')).targetInfos
    .some(x=>x.type==='service_worker'&&x.url===workerUrl),'actual extension worker target disappears after stop');
  const stoppedRequest=await probe(client,site,adUrl());
  assert.equal(stoppedRequest.success,false,
    'Chrome DNR survives its service worker being stopped');
  assert.equal(stoppedRequest.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  report.workerStoppedDnr='PASS';
  assert.equal((await client.send('Target.getTargets')).targetInfos
    .some(x=>x.type==='service_worker'&&x.url===workerUrl),false,
    'worker must remain stopped until the authenticated status message wakes it');
  const stoppedVersions=await until(()=>{
    const versions=client.events.slice(stoppedEventStart)
      .filter(x=>x.sessionId===uid&&x.method==='ServiceWorker.workerVersionUpdated')
      .flatMap(x=>x.params.versions)
      .filter(x=>x.scriptURL===workerUrl&&x.runningStatus==='stopped');
    return versions.length?versions:null;
  },'Chrome reports the extension worker stopped before wake');
  const wakeEventStart=client.events.length;
  // Use the shipped, authenticated read-only status protocol from the real
  // extension host. A DNR-only network probe cannot prove worker recovery.
  const statusMessage={protocol:'opendesk.adblock.v1',toolId:'adblock',operation:'adblock.status',
    payload:{},packageHash:report.installedIdentity.packageHash,installEpoch:report.installedIdentity.epoch};
  const recoveredStatus=await evaluate(client,uid,
    'chrome.runtime.sendMessage('+JSON.stringify(statusMessage)+')');
  assert.equal(recoveredStatus?.ok,true,'new worker must answer the authenticated AdBlock status request');
  assert.equal(recoveredStatus.data.installed,true);
  assert.equal(recoveredStatus.data.toolEnabled,true);
  assert.equal(recoveredStatus.data.enabled,true);
  assert.equal(recoveredStatus.data.permissions?.dnr,true);
  assert.equal(recoveredStatus.data.rules?.verified,true);
  assert.deepEqual([...recoveredStatus.data.rules.ruleIds].sort((a,b)=>a-b),
    beforeWorker.owned.map(rule=>rule.id).sort((a,b)=>a-b));
  assert.deepEqual(recoveredStatus.data.exceptions,[]);
  const recoveredWorker=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='service_worker'&&x.url===workerUrl),'new worker target after status wake request');
  // Chrome can reuse targetId (and versionId) across stop/wake. Runtime
  // uniqueId identifies the actual execution context rather than the target.
  const runningVersions=await until(()=>{
    const versions=client.events.slice(wakeEventStart)
      .filter(x=>x.sessionId===uid&&x.method==='ServiceWorker.workerVersionUpdated')
      .flatMap(x=>x.params.versions).filter(x=>x.scriptURL===workerUrl&&
        x.runningStatus==='running'&&stoppedVersions.some(v=>v.versionId===x.versionId));
    return versions.length?versions:null;
  },'same registered worker version transitions from stopped to running');
  const recoveredWorkerSession=(await client.send('Target.attachToTarget',
    {targetId:recoveredWorker.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},recoveredWorkerSession);
  const recoveredWorkerContext=await workerContext(recoveredWorkerSession);
  await evaluate(client,recoveredWorkerSession,'('+observeNativeCalls.toString()+')()');
  assert.notEqual(recoveredWorkerContext.uniqueId,beforeWorkerContext.uniqueId,
    'wake must rebuild the real worker Runtime execution context');
  const afterWorker=await getOwned(client,uid);
  assert.deepEqual(afterWorker.state,beforeWorker.state,'worker recovery must preserve durable filtering intent');
  assert.deepEqual(sortedRules(afterWorker.owned),sortedRules(beforeWorker.owned));
  assert.deepEqual(sortedRules(afterWorker.focus),sortedRules(beforeWorker.focus));
  const recoveredRequest=await probe(client,site,adUrl());
  assert.equal(recoveredRequest.success,false,'actual filtering must still work after worker service recovery');
  assert.equal(recoveredRequest.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  report.workerRecovery={beforeTargetId:runningWorker.targetId,afterTargetId:recoveredWorker.targetId,
    stoppedVersions,runningVersions,beforeWorkerContext,recoveredWorkerContext,
    request:statusMessage,response:recoveredStatus,stoppedRequest,recoveredRequest};
  report.workerRestart='PASS';
  note('actual-worker-stop-wake-and-service-recovery',report.workerRecovery);

  // Reopen through the original launcher after the worker-only lifecycle test.
  await click(client,uid,'#catalog-open-dev-sidebar');
  const beforeRestartContext=await until(()=>evaluate(client,uid,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x.find(c=>'+
    'c.documentUrl?.includes("/sidepanel.html")&&c.documentId))'),'Side Panel reopened before restart');
  const beforeRestartPanel=await attachActualPanel(client,beforeRestartContext,[ui.targetId]);
  sid=beforeRestartPanel.session;
  await click(client,sid,'#tab-tools');
  await openInstalled(sid);
  const beforeRestartReact=await attachActualReact(client,sid);
  manualStorageSession=uid;manualPanelSession=sid;
  const manualRule={host:'localhost',selector:'#manual-ad-slot'};
  const expectedManual={version:1,entries:[manualRule]};
  const pickerSelector='button[aria-label="在当前网页中点击选择要隐藏的元素"]';
  Object.assign(report.manualCosmeticEvidence.identity,{extensionId:id,installedIdentity:report.installedIdentity});
  const activateManual=async reactSession=>{
    await manualMousePage.bringToFront();
    await until(()=>evaluate(client,reactSession,
      'document.querySelector(".adblock-host")?.textContent.trim()==="localhost"'),
      'installed React targets the real manual fixture host');
    await until(()=>evaluate(client,reactSession,
      'document.querySelector('+JSON.stringify(pickerSelector)+')?.disabled===false'),
      'installed React manual picker ready');
  };
  const pickManual=async(reactSession,selector='#manual-ad-slot')=>{
    await activateManual(reactSession);
    const regionKey=selector==='#manual-ad-slot'?'region':'undoRegion';
    await until(async()=>{const dom=await manualDom(manualSession);return dom[regionKey]?.visible;},
      'region visible before actual user selection');
    await clickSandbox(client,sid,reactSession,pickerSelector);
    await until(()=>evaluate(client,reactSession,
      'document.querySelector(".adblock-pick-panel button")?.textContent.trim()==="取消选择"'),
      'trusted Host acknowledges the new picker before moving the page pointer');
    await manualMousePage.bringToFront();
    await manualMousePage.locator(selector).hover();
    await until(()=>evaluate(client,manualSession,
      '!!document.querySelector("[data-opendesk-adblock-picker]")'),
      'actual isolated-world page picker entered selection mode');
    assert.equal(await evaluate(client,manualSession,
      '[...document.querySelectorAll("[data-opendesk-adblock-picker]")].some(node=>node.textContent.trim())'),false,
      'the page picker must only display its blue frame, without text controls');
    assert.equal(await evaluate(client,sid,
      'document.getElementById("sidebar-tool-action-review")?.hidden'),true,
      'manual selection has no secondary approval dialog');
    const dispatchedAt=Date.now(),input=await mouseClick(manualMousePage,selector);
    const hidden=await until(async()=>{const value=await manualDom(manualSession);
      return value[regionKey]?.connected&&value[regionKey].display==='none'&&value.normal?.visible?value:null;
    },'single real mouse selection immediately hides the element',1500);
    const hiddenObservedAt=Date.now();
    assert.ok(hidden.events.some(event=>event.isTrusted&&event.target===selector.slice(1)&&event.at>=dispatchedAt),
      'fixture must record a genuine trusted Chrome page click');
    return {input,dispatchedAt,hiddenObservedAt,elapsedMs:hiddenObservedAt-dispatchedAt,hidden};
  };
  let firstManualSelection;
  await manualCase('mouseSelection',async row=>{
    const target=await client.send('Target.createTarget',{url:manualUrl+'?visit='+randomUUID()});
    manualSession=await attach(client,target.targetId);manualMousePage=await mousePage(target.targetId,manualSession);
    await until(()=>evaluate(client,manualSession,
      'document.querySelector("h1")?.textContent==="Manual cosmetic fixture ready"'),'manual fixture ready');
    assert.equal((await manualStorage())[COSMETIC_STORE],undefined,'fresh profile has no seeded manual rules');
    await manualSnapshot(row);
    firstManualSelection=await pickManual(beforeRestartReact);
    return {targetId:target.targetId,url:manualMousePage.url(),...firstManualSelection};
  });
  await manualCase('immediateHide',async()=>{
    assert.ok(firstManualSelection.elapsedMs<=1500,'single click must hide within 1500ms, without reload or confirmation');
    return {maxElapsedMs:1500,...firstManualSelection};
  });
  await manualCase('storageReadback',async()=>{
    const storage=await until(async()=>{const value=await manualStorage();
      return value[COSMETIC_STORE]?.entries?.some(entry=>entry.host===manualRule.host&&
        entry.selector===manualRule.selector)?value:null;
    },'Chrome local storage contains the actual selected rule');
    assert.deepEqual(storage[COSMETIC_STORE],expectedManual,'exact hostname and safe selected CSS persisted');
    return {storage};
  });
  await manualCase('refreshPersistence',async()=>{
    const reload=await reloadFixture(client,manualSession,'saved manual rule refresh');
    const dom=await manualVisibility(true,'saved manual rule reapplies to a fresh document');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    return {reload,dom,profile,browserSession:report.browserSessions.length};
  });
  // P0-4 owns the default native splitter/Chrome zoom adapter and its cleanup.
  // Supply the owned browser PID and existing extension tab session; cells
  // without proven native geometry/zoom remain NOT_TESTED in the helper.
  await runAdblockLayoutNative({client,hostSession:sid,reactSession:beforeRestartReact,
    evaluate,click,clickSandbox,screenshot,until,report,chromePid:chrome.pid,zoomSession:uid});
  await activateFixture();
  await until(()=>evaluate(client,beforeRestartReact,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),'restart exception targets A');
  await until(async()=>{const value=await reactSwitch(client,beforeRestartReact,currentLabel);
    return value&&!value.disabled&&value.on;},'A filtered before restart exception');
  await operateReactControl(client,sid,beforeRestartReact,currentSelector,'关闭 127.0.0.1 的广告过滤');
  const beforeRestart=await until(async()=>{const value=await getOwned(client,uid);
    return value.state?.enabled===true&&value.state.exceptions?.includes('127.0.0.1')&&
      value.owned.some(rule=>rule.action?.type==='allowAllRequests')?value:null;
  },'approved A exception durable before restart');
  report.beforeRestart=beforeRestart;
  note('before-browser-restart',beforeRestart);
  const manualBeforeRestartRow={id:'browserRestartPersistence',evidence:{}};
  await manualSnapshot(manualBeforeRestartRow);
  const prior=chrome;
  await client.send('Browser.close').catch(()=>{});
  await until(()=>prior.exitCode!==null||prior.signalCode!==null,'real Chrome browser exited',25000);
  archiveEvents(client);
  client.close();client=null;
  manualSession=null;manualMousePage=null;
  await rm(path.join(profile,'DevToolsActivePort'),{force:true});
  chrome=launch();capture(chrome);
  first=await connected();client=first.socket;
  const idAgain=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'extension after actual full Chrome restart',25000);
  assert.equal(idAgain,id,'extension ID must not change across restart');
  const restartWorker=(await client.send('Target.getTargets')).targetInfos
    .find(target=>target.type==='service_worker'&&target.url==='chrome-extension://'+id+'/sw.js');
  const restartWorkerSession=(await client.send('Target.attachToTarget',
    {targetId:restartWorker.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},restartWorkerSession);
  await evaluate(client,restartWorkerSession,'('+observeNativeCalls.toString()+')()');
  const uiAgain=await client.send('Target.createTarget',
    {url:'chrome-extension://'+id+'/sidepanel.html?hostInstanceId='+randomUUID()});
  const again=await attach(client,uiAgain.targetId);
  const persisted=await until(async()=>{const r=await getOwned(client,again);
    return r.state?.enabled===true&&r.state.exceptions?.includes('127.0.0.1')&&
      r.owned.some(rule=>rule.action?.type==='allowAllRequests')?r:null;},'persistent A exception after Chrome restart');
  assert.deepEqual(persisted.state,beforeRestart.state,'restart preserves exact durable state');
  assert.deepEqual(sortedRules(persisted.owned),sortedRules(beforeRestart.owned),'restart preserves exact owned rules');
  assert.deepEqual(sortedRules(persisted.focus),sortedRules(beforeRestart.focus),'restart preserves unrelated rules');
  const visitAgain=await client.send('Target.createTarget',{url:page});
  const pageAgain=await attach(client,visitAgain.targetId);
  await until(()=>evaluate(client,pageAgain,'document.querySelector("h1")?.textContent==="Network fixture ready"'),'restarted HTTP page');
  const restartReload=await reloadFixture(client,pageAgain,'restart A exception');
  const restartAUrl=adUrl(),restartANonce=new URL(restartAUrl).searchParams.get('nonce');
  const restartA=await probe(client,pageAgain,restartAUrl);
  const hits=nonce=>serverRequests.filter(row=>row.hostname==='zedo.com'&&row.path==='/ad-pixel'&&
    new URLSearchParams(row.query).get('nonce')===nonce).length;
  assert.equal(restartA.success,true,'A exception allows fresh network after restart');
  assert.equal(hits(restartANonce),1,'A exact nonce reaches HTTP server once');
  const restartBTarget=await client.send('Target.createTarget',{url:otherPage});
  const restartBSession=await attach(client,restartBTarget.targetId);
  await until(()=>evaluate(client,restartBSession,'document.querySelector("h1")?.textContent==="Network fixture ready"'),
    'restart B fixture ready');
  const restartBUrl=adUrl(),restartBNonce=new URL(restartBUrl).searchParams.get('nonce');
  const restartB=await probe(client,restartBSession,restartBUrl);
  assert.equal(restartB.success,false,'B remains filtered after restart');
  assert.equal(restartB.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  assert.equal(hits(restartBNonce),0,'B exact nonce never reaches HTTP server');
  report.afterRestart={state:persisted,reload:restartReload,A:{url:restartAUrl,request:restartA,httpHits:hits(restartANonce)},
    B:{url:restartBUrl,request:restartB,httpHits:hits(restartBNonce)}};
  report.browserRestart='PASS';note('actual-chrome-restart',{sameExtensionId:idAgain,...report.afterRestart});

  // REQUIRED manifest DNR is not a user-removable optional permission.
  // Exercise the actual product lifecycle from Extension Center UI instead.
  assert.equal(await evaluate(client,again,
    'chrome.permissions.contains({permissions:["declarativeNetRequestWithHostAccess"]})'),true);
  report.revocation='NOT_APPLICABLE_MANDATORY_DNR';
  report.revocationMigration={
    requiredPermission:'declarativeNetRequestWithHostAccess',
    replacement:'toolDisable + toolRestore + staleIframe + uninstall',
    commonVerifier:'R1.0 must replace optional-DNR revocation acceptance',
    status:'PENDING_COMMON_VERIFIER_MIGRATION'};
  await click(client,again,'#catalog-open-dev-sidebar');
  const resumedContext=await until(()=>evaluate(client,again,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x.find(c=>'+
    'c.documentUrl?.includes("/sidepanel.html")&&c.documentId))'),
    'real Side Panel exists after Chrome restart');
  const resumedPanel=await attachActualPanel(client,resumedContext,[uiAgain.targetId]);
  sid=resumedPanel.session;
  await click(client,sid,'#tab-tools');
  await openInstalled(sid);
  const resumedReact=await attachActualReact(client,sid);
  await until(async()=>{
    const current=await reactSwitch(client,resumedReact,'全局广告拦截');
    return current?.on&&!current.disabled;
  },'installed React and DNR ON after actual Chrome restart');
  report.screenshots.push(await screenshot(client,sid,'react-after-real-chrome-restart'));

  manualStorageSession=again;manualPanelSession=sid;
  await manualCase('browserRestartPersistence',async row=>{
    row.evidence.before=manualBeforeRestartRow.evidence.before;
    assert.equal(report.browserSessions.length,2,'manual persistence must use the real full Chrome restart');
    assert.notEqual(report.browserSessions[0].pid,report.browserSessions[1].pid);
    assert.ok(report.browserSessions[0].exitedAt,'original Chrome process must have exited');
    assert.equal(report.browserSessions[0].profile,report.browserSessions[1].profile,'restart uses same durable profile');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual,'Chrome restart preserves exact manual state');
    const target=await client.send('Target.createTarget',{url:manualUrl+'?visit='+randomUUID()});
    manualSession=await attach(client,target.targetId);manualMousePage=await mousePage(target.targetId,manualSession);
    const dom=await manualVisibility(true,'new document auto-hides after actual Chrome process restart');
    assert.equal(dom.events.length,0,'restart recovery must not need another page selection');
    return {targetId:target.targetId,dom,browserSessions:report.browserSessions.map(x=>({...x})),storage:await manualStorage()};
  });
  await manualCase('dynamicDom',async()=>{
    const before=await manualDom(manualSession);
    const input=await mouseClick(manualMousePage,'#manual-dynamic');
    await until(async()=>{const dom=await manualDom(manualSession);
      return dom.generation===before.generation+1&&dom.region.text!==before.region.text;
    },'real fixture button replaces matching DOM element');
    const dom=await manualVisibility(true,'new matching DOM region inherits saved CSS');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    return {input,before,dom};
  });
  await manualCase('spaNavigation',async()=>{
    const before=(await client.send('Page.getFrameTree',{},manualSession)).frameTree.frame;
    const generation=(await manualDom(manualSession)).generation;
    const input=await mouseClick(manualMousePage,'#manual-spa');
    const dom=await until(async()=>{const value=await manualDom(manualSession);
      return new URL(value.url).searchParams.get('route')==='next'&&value.generation===generation+1?value:null;
    },'real SPA button changes history and route content');
    const after=(await client.send('Page.getFrameTree',{},manualSession)).frameTree.frame;
    assert.equal(after.id,before.id);assert.equal(after.loaderId,before.loaderId,'SPA must not reload its document');
    await manualVisibility(true,'SPA replacement remains hidden with normal content intact');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    return {input,dom,beforeLoaderId:before.loaderId,afterLoaderId:after.loaderId};
  });
  await manualCase('pageUndo',async()=>{
    const selection=await pickManual(resumedReact,'#manual-undo-slot');
    const selected=await until(async()=>{const storage=await manualStorage();
      return storage[COSMETIC_STORE]?.entries?.length===2?storage:null;
    },'second genuine selection persisted before page undo');
    assert.ok(selected[COSMETIC_STORE].entries.some(x=>x.host==='localhost'&&x.selector==='#manual-undo-slot'));
    const undoSelector='.adblock-pick-panel button';
    await until(()=>evaluate(client,resumedReact,
      'document.querySelector('+JSON.stringify(undoSelector)+')?.textContent.trim()==="撤销"'),
      'installed sidebar offers undo after the storage readback');
    assert.equal(await evaluate(client,manualSession,
      '!!document.querySelector("[data-opendesk-adblock-picker][role=status]")'),false,
      'saved selection must not add a webpage toast or undo control');
    await clickSandbox(client,sid,resumedReact,undoSelector);
    const input={surface:'installed-sidebar',driver:'CDP Input'};
    const dom=await until(async()=>{const value=await manualDom(manualSession);
      return value.undoRegion?.connected&&value.undoRegion.visible&&value.region?.display==='none'&&value.normal?.visible?value:null;
    },'page undo restores only the last hidden region');
    await until(async()=>{const value=await manualStorage();return value[COSMETIC_STORE]?.entries?.length===1;},
      'page undo permanently deletes only the second rule');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    const reload=await reloadFixture(client,manualSession,'page undo durability');
    const fresh=await until(async()=>{const value=await manualDom(manualSession);
      return value.undoRegion?.visible&&value.region?.display==='none'&&value.normal?.visible?value:null;
    },'page undo remains restored across refresh');
    return {selection,input,dom,reload,fresh};
  });
  await manualCase('listRestore',async()=>{
    await activateManual(resumedReact);
    await clickSandbox(client,sid,resumedReact,'.adblock-manual-actions button:nth-child(2)');
    const restore='button[aria-label="永久删除屏蔽规则：#manual-ad-slot"]';
    await until(()=>evaluate(client,resumedReact,
      'document.querySelector('+JSON.stringify(restore)+')?.disabled===false'),'installed React lists the exact saved rule');
    await clickSandbox(client,sid,resumedReact,restore);
    const dom=await manualVisibility(false,'installed list restore displays existing page region');
    await until(async()=>{const value=await manualStorage();return value[COSMETIC_STORE]?.entries?.length===0;},
      'installed list restoration deletes local rule');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],{version:1,entries:[]});
    await until(()=>evaluate(client,resumedReact,
      'document.querySelector(".adblock-empty")?.textContent.includes("本站尚无手动屏蔽区域")'),
      'installed list displays persisted empty state');
    const reload=await reloadFixture(client,manualSession,'installed list restoration durability');
    const fresh=await manualVisibility(false,'list restoration remains visible after refresh');
    await returnToAdblockOverview(client,sid,resumedReact);
    return {dom,reload,fresh};
  });
  await manualCase('globalPauseResume',async()=>{
    const selection=await pickManual(resumedReact);
    await until(async()=>{const value=await manualStorage();return value[COSMETIC_STORE]?.entries?.length===1;},
      'fresh manual selection is durable before global pause');
    await until(()=>evaluate(client,resumedReact,
      '!document.querySelector('+JSON.stringify(globalSelector)+')?.hasAttribute("data-disabled")'),
      'React is ready for global pause');
    await operateReactControl(client,sid,resumedReact,globalSelector,'关闭全局过滤');
      await until(async()=>{const value=await getOwned(client,again);return value.state?.enabled===false&&value.owned.length===0;},
      'global pause removes network protection');
    const paused=await manualVisibility(false,'global pause releases manual CSS immediately');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual,'pause retains saved manual rule');
    await operateReactControl(client,sid,resumedReact,globalSelector,'开启全局过滤');
      await until(async()=>{const value=await getOwned(client,again);return value.state?.enabled===true&&value.owned.length>0;},
      'global protection resumes');
    const resumed=await manualVisibility(true,'global resume reapplies saved manual rule');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    return {selection,paused,resumed};
  });
  await manualCase('sitePauseResume',async()=>{
    await activateManual(resumedReact);
    await operateReactControl(client,sid,resumedReact,currentSelector,'关闭 localhost 的广告过滤');
      await until(async()=>{const value=await getOwned(client,again);return value.state?.exceptions?.includes('localhost');},
      'localhost exception persisted');
    const paused=await manualVisibility(false,'website exception releases manual CSS');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual,'website pause retains manual rule');
    await operateReactControl(client,sid,resumedReact,currentSelector,'恢复 localhost 的广告过滤');
      await until(async()=>{const value=await getOwned(client,again);return !value.state?.exceptions?.includes('localhost');},
      'localhost exception removed');
    const resumed=await manualVisibility(true,'website resume restores saved hiding');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual);
    return {paused,resumed};
  });
  await manualCase('otherSiteIsolation',async()=>{
    const target=await client.send('Target.createTarget',{url:manualOtherUrl});
    manualOtherSession=await attach(client,target.targetId);
    const otherMouse=await mousePage(target.targetId,manualOtherSession);await otherMouse.bringToFront();
    await until(()=>evaluate(client,resumedReact,
      'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),'installed React follows other site');
    // Remove A's existing DNR exception while testing isolation. Otherwise a
    // paused site would hide an accidental cross-host cosmetic rule leak.
    await until(async()=>{const value=await reactSwitch(client,resumedReact,currentLabel);
      return value&&!value.disabled&&!value.on;},'other website currently excepted');
    await operateReactControl(client,sid,resumedReact,currentSelector,'恢复 127.0.0.1 的广告过滤');
      const protectedOther=await until(async()=>{const value=await getOwned(client,again);
      return value.state?.enabled===true&&!value.state.exceptions.includes('127.0.0.1')&&value.owned.length>0?value:null;
    },'other website protection enabled during isolation check');
    const otherDom=await manualVisibility(false,'same selector stays visible on protected other hostname',manualOtherSession);
    assert.equal(otherDom.css,null,'other hostname receives no manual CSS');
    const protectedScreenshot=await screenshot(client,manualOtherSession,'manual-otherSiteIsolation-protected-other-site');
    report.screenshots.push(protectedScreenshot);
    const ownDom=await manualVisibility(true,'saved hostname remains hidden when another site is active');
    assert.deepEqual((await manualStorage())[COSMETIC_STORE],expectedManual,'other site cannot inherit saved host rule');
    const reload=await reloadFixture(client,manualOtherSession,'protected other site isolation refresh');
    await manualVisibility(false,'other hostname remains visible after refresh',manualOtherSession);
    // Leave the surrounding DNR scenarios in their original A-exception state.
    await operateReactControl(client,sid,resumedReact,currentSelector,'关闭 127.0.0.1 的广告过滤');
      await until(async()=>{const value=await getOwned(client,again);return value.state?.exceptions?.includes('127.0.0.1');},
      'original DNR exception restored after isolation check');
    assert.deepEqual(sortedRules((await getOwned(client,again)).owned),sortedRules(persisted.owned),
      'manual coverage preserves surrounding DNR rule expectations');
    return {targetId:target.targetId,protectedOther,otherDom,ownDom,reload,protectedScreenshot};
  });

  // The installed row menu calls the unchanged trusted Host using a real
  // React event.nativeEvent. No scripting/storage mutation stands in for this.
  const rowMore='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="more"]';
  const rowToggle='#extension-center-row-menu button[data-ec-context-action="toggle"]';
  const toggleInstalled=async expectedText=>{
    await until(()=>evaluate(client,sid,
      '(()=>{const row=document.querySelector('+JSON.stringify(rowMore)+');'+
      'return row&&!row.disabled&&row.getBoundingClientRect().height>0})()'),
      'installed row management is actionable');
    await click(client,sid,rowMore);
    await until(()=>evaluate(client,sid,
      'document.querySelector('+JSON.stringify(rowToggle)+')?.textContent.includes('+JSON.stringify(expectedText)+')'),
      'real installed row toggle says '+expectedText);
    await click(client,sid,rowToggle);
  };
  await click(client,sid,'#sidebar-tool-back');
  await toggleInstalled('停用');
  const disabledState=await until(async()=>{
    const current=await getOwned(client,again);
    return current.owned.length===0?current:null;
  },'trusted Host disables AdBlock and removes only its DNR rules');
  const unblockedAfterDisable=await probe(client,pageAgain,adUrl());
  assert.equal(unblockedAfterDisable.success,true,
    'disabled AdBlock tool must release matching third-party ad requests');
  const focusBefore=beforeWorker.focus;
  assert.deepEqual(disabledState.focus,focusBefore,
    'stopping AdBlock cannot mutate Stay Focus owned DNR');
  await until(()=>evaluate(client,sid,
    '(()=>{const f=document.querySelector("#sidebar-tool-frame");'+
    'return !f||f.hidden||!f.querySelector("iframe")})()'),
    'old installed React iframe is detached after disable');
  report.toolDisable='PASS';report.toolRevocation='PASS';
  note('real-installed-tool-disabled',{rules:disabledState.owned.length,
    ad:unblockedAfterDisable,focusPreserved:true});
  await toggleInstalled('启用');
  await until(async()=>{
    const current=await getOwned(client,again);
    return current.owned.length===0?current:null;
  },'tool restore does not auto-create adblock rules');
  await openInstalled(sid);
  const restoredReact=await attachActualReact(client,sid);
  await until(async()=>{
    const current=await reactSwitch(client,restoredReact,'全局广告拦截');
    return current&&!current.disabled&&!current.on;
  },'re-enabled tool shows actual React filtering OFF until deliberate opt-in');
  report.toolRestore='PASS';
  assert.equal((await probe(client,pageAgain,adUrl())).success,true,
    're-enabling the tool must not implicitly start ad filtering');
  note('real-tool-reenabled-no-automatic-filtering',{requiresNewReactConsent:true});

  // Uninstall from the same installed Host controls. Never bypass ownership,
  // write the Chrome storage registry, or edit DNR rules from test code.
  await click(client,sid,'#sidebar-tool-remove');
  await until(()=>evaluate(client,sid,
    'document.querySelector("#sidebar-tool-inline-remove-confirm")?.hidden===false'),
    'real uninstall approval control is visible');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(()=>evaluate(client,again,
    '(async()=>{const all=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1",'+
    JSON.stringify(STORE)+']);return !all["opendesk.sidebar-tools.installed.v1"]?.some(x=>x.id==="adblock")&&'+
    '!Object.hasOwn(all,'+JSON.stringify(STORE)+');})()'),
    'installed tool registry and AdBlock data erased after Host uninstall');
  const afterUninstall=await getOwned(client,again);
  assert.equal(afterUninstall.owned.length,0,'uninstall must clear owned Chrome DNR');
  assert.deepEqual(afterUninstall.focus,focusBefore,'uninstall must preserve Stay Focus rules');
  const uninstalledNetwork=await probe(client,pageAgain,adUrl());
  assert.equal(uninstalledNetwork.success,true,'uninstalled AdBlock cannot continue filtering network');
  report.uninstall='PASS';
  note('real-installed-react-uninstalled',{ad:uninstalledNetwork,ownedRules:0});
  report.screenshots.push(await screenshot(client,sid,'react-after-uninstall'));
  // Reinstall the identical official candidate through Available and the same Host review.
  await click(client,sid,'#tab-tools');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="available"]');
  await click(client,sid,'#extension-center-more');
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+JSON.stringify(official)+');return !!b&&!b.disabled})()'),
    'uninstalled AdBlock available for reinstall');
  await click(client,sid,official);
  await until(()=>evaluate(client,sid,'!!document.querySelector("#extension-center-detail [data-ec-detail-action=install]")'),
    'same official candidate reinstall detail');
  await click(client,sid,'#extension-center-detail [data-ec-detail-action="install"]');
  await until(()=>evaluate(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'reinstall Host review');
  await click(client,sid,'#sidebar-tool-install');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="smart"]');
  await click(client,sid,'#extension-center-more');
  await openInstalled(sid);
  const reinstalledReact=await attachActualReact(client,sid);
  const reinstalledTool=await evaluate(client,again,
    'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>x["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="adblock"))');
  assert.ok(reinstalledTool,'Host registry contains reinstalled tool');
  const reinstallHash=await sidebarToolPackageHash(reinstalledTool);
  assert.equal(reinstallHash,report.installedIdentity.packageHash,'reinstall uses identical formal package');
  assert.equal(reinstalledTool.version,report.installedIdentity.version,'reinstall preserves candidate version');
  const reinstalledState=await until(async()=>{
    const state=await getOwned(client,again);
    const ui=await reactSwitch(client,reinstalledReact,'全局广告拦截');
    return state.state?.enabled===true&&state.owned.some(rule=>rule.id===F)&&ui?.on?state:null;
  },'fresh reviewed reinstall automatically enables basic DNR');
  assert.deepEqual(reinstalledState.state.exceptions,[],'reinstall must not restore old exceptions');
  assert.deepEqual(reinstalledState.focus,focusBefore,'reinstall keeps unrelated rules');
  const reinstallUrl=adUrl(),reinstallNonce=new URL(reinstallUrl).searchParams.get('nonce');
  const reinstallNetwork=await probe(client,pageAgain,reinstallUrl);
  assert.equal(reinstallNetwork.network.errorText,'net::ERR_BLOCKED_BY_CLIENT',
    'reinstall auto-on filters matching requests');
  assert.equal(hits(reinstallNonce),0,'filtered request must not reach HTTP server');
  report.reinstall='PASS';
  report.reinstallEvidence={packageHash:reinstallHash,version:reinstalledTool.version,globalOn:true,
    state:reinstalledState,network:reinstallNetwork,url:reinstallUrl,httpHits:hits(reinstallNonce)};
  note('real-reinstall',report.reinstallEvidence);
  // Real high-priority Stay Focus policy must override the approved AdBlock exception.
  report.priorityIsolation='NOT_TESTED';
  await client.send('Target.activateTarget',{targetId:visitAgain.targetId});
  await client.send('Page.bringToFront',{},pageAgain);
  await until(()=>evaluate(client,reinstalledReact,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),'coexistence active site settled before review');
  await until(async()=>{const value=await reactSwitch(client,reinstalledReact,'全局广告拦截');
    return value&&!value.disabled&&value.on;},'coexistence remains enabled after reinstall');
  await until(()=>evaluate(client,reinstalledReact,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),'coexistence actual active website A');
  await operateReactControl(client,sid,reinstalledReact,currentSelector,'关闭 127.0.0.1 的广告过滤');
  const coexistAdblock=await until(async()=>{const value=await getOwned(client,again);
    return value.state?.enabled&&value.state.exceptions?.includes('127.0.0.1')&&
      value.owned.some(rule=>rule.id===741001&&rule.action?.type==='allowAllRequests'&&rule.priority===2)?value:null;
  },'AdBlock A exception rule priority 2 exists before Stay Focus');
  // Storage/DNR readback can win the race with the first-party React Host's
  // busy=false acknowledgement. A Back during that in-flight transaction
  // correctly refuses to leave, so wait for the actual control to settle.
  await until(async()=>{
    const site=await reactSwitch(client,reinstalledReact,currentLabel);
    return site&&!site.disabled&&!site.on?site:null;
  },'installed AdBlock React site exception transaction fully settled');
  // After uninstall/reinstall the trusted React tool may restore its nested
  // settings route. One real Back navigates inside the app; the next Back
  // exits to the Extension Center. Never assume the first Back always exits.
  let backLevel=await evaluate(client,sid,
    'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")');
  note('coexistence-back-before-exit',{backLevel,toolVisible:await evaluate(client,sid,
    'document.querySelector("#sidebar-tool-display")?.hidden===false')});
  if(backLevel==='返回上一级'){
    await returnToAdblockOverview(client,sid,reinstalledReact);
    backLevel=await evaluate(client,sid,
      'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")');
  }
  if(backLevel==='返回上一页'){
    await click(client,sid,'#sidebar-tool-back');
    await until(()=>evaluate(client,sid,
      'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")==="返回扩展列表"'),
      'trusted tool settings close before returning to extensions');
    backLevel='返回扩展列表';
  }
  assert.equal(backLevel,'返回扩展列表','the real Host must expose outer Back before leaving app');
  await click(client,sid,'#sidebar-tool-back');
  const backResult=await evaluate(client,sid,
    '(()=>({displayHidden:document.querySelector("#sidebar-tool-display")?.hidden===true,'+
    'backLabel:document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label"),'+
    'actionReviewVisible:document.querySelector("#sidebar-tool-action-review")?.hidden===false,'+
    'actionSummary:document.querySelector("#sidebar-tool-action-summary")?.textContent?.slice(0,150),'+
    'notice:document.querySelector("#sidebar-tool-notice")?.textContent?.slice(0,150)}))()');
  note('coexistence-back-after-click',backResult);
  assert.equal(backResult.actionReviewVisible,false,
    'a completed AdBlock site toggle must not demand unsaved-content confirmation');
  await until(()=>evaluate(client,sid,
    'document.querySelector("#sidebar-tool-display")?.hidden===true'),
    'installed AdBlock returned to extension management');
  await click(client,sid,'#tab-tools');
  // The React Extension Center can restore the previously selected AdBlock
  // detail after leaving the tool. Its list toolbar is correctly hidden until
  // the user presses the real detail Back button. Do not click a hidden menu.
  if(await evaluate(client,sid,
    'document.querySelector("#extension-center-detail")?.hidden===false'))
    await click(client,sid,'#extension-center-back');
  await until(()=>evaluate(client,sid,
    'document.querySelector("#extension-center-list-view")?.hidden===false&&'+
    'document.querySelector("#workbench-tools")?.hidden===false'),
    'visible React Extension Center list after exiting installed app');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="available"]');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-search');
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},sid);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},sid);
  await client.send('Input.insertText',{text:'专注'},sid);
  assert.equal(await evaluate(client,sid,'document.querySelector("#extension-center-search").value'),'专注');
  const focusAvailable='[data-extension-key="app:stay-focus"][data-extension-action="main"]';
  await until(()=>evaluate(client,sid,'!!document.querySelector('+JSON.stringify(focusAvailable)+')'),'Stay Focus Available');
  await click(client,sid,focusAvailable);
  await click(client,sid,'#extension-center-detail [data-ec-detail-action="install"]');
  await until(()=>evaluate(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'Stay Focus package review');
  await click(client,sid,'#sidebar-tool-install');
  await click(client,sid,'#extension-center-more');
  await click(client,sid,'#extension-center-menu [data-ec-scope="smart"]');
  await click(client,sid,'#extension-center-more');
  const focusInstalled='[data-extension-key="app:stay-focus"][data-extension-action="main"]';
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+JSON.stringify(focusInstalled)+');'+
    'return !!b&&!b.disabled&&b.getAttribute("aria-label")?.startsWith("打开「")})()'),'installed Stay Focus open control');
  await click(client,sid,focusInstalled);
  const focusFrameUrl=await until(()=>evaluate(client,sid,
    '(()=>{const host=document.querySelector("#sidebar-tool-frame"),frame=host?.querySelector("iframe");'+
    'return host&&!host.hidden&&frame&&frame.getBoundingClientRect().height>0?frame.src:null})()'),'actual Stay Focus iframe URL');
  const focusTarget=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(target=>target.type==='iframe'&&target.url===focusFrameUrl),'actual Stay Focus iframe target');
  const focusFrame=await attach(client,focusTarget.targetId);
  const settingsExpanded=await until(()=>evaluate(client,sid,
    'document.querySelector("#sidebar-tool-settings-open")?.getAttribute("aria-expanded")'),'Stay Focus settings toggle');
  if(settingsExpanded!=='true')await click(client,sid,'#sidebar-tool-settings-open');
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector("#stay-focus-enable-native");'+
    'return !!b&&!b.disabled&&b.getClientRects().length>0})()'),'Stay Focus native permission button');
  await click(client,sid,'#stay-focus-enable-native');
  const focusStore='opendesk.stay-focus.state.v1';
  const focusState=()=>evaluate(client,again,'chrome.storage.local.get('+JSON.stringify(focusStore)+')'+
    '.then(x=>x['+JSON.stringify(focusStore)+']||null)');
  // A real permission prompt or product failure must fail this chain, never seed approval.
  await until(()=>evaluate(client,again,
    'chrome.permissions.contains({permissions:["idle","declarativeNetRequestWithHostAccess"]})'),
    'real Stay Focus Chrome permissions granted');
  await until(async()=>{const value=await focusState();return value?.enabled&&value.authorizedHash?value:null;},
    'Stay Focus durable native enablement');
  if(await evaluate(client,sid,'document.querySelector("#sidebar-tool-settings-open")?.getAttribute("aria-expanded")==="true"'))
    await click(client,sid,'#sidebar-tool-settings-open');
  await until(()=>evaluate(client,sid,'document.querySelector("#sidebar-tool-settings-open")?.getAttribute("aria-expanded")==="false"'),
    'Stay Focus settings collapsed');
  await until(()=>evaluate(client,focusFrame,'!!document.querySelector(".sf")'),'current Stay Focus React UI mounted');
  await clickSandbox(client,sid,focusFrame,'button[aria-label="添加自定义网站"]');
  const focusHost='.sf-editor input[placeholder="例如 youtube.com"]';
  await clickSandbox(client,sid,focusFrame,focusHost);
  await until(()=>evaluate(client,focusFrame,'document.activeElement===document.querySelector('+JSON.stringify(focusHost)+')'),'Stay Focus native input focus');
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},sid);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},sid);
  await client.send('Input.insertText',{text:'127.0.0.1'},sid);
  assert.equal(await evaluate(client,focusFrame,'document.querySelector('+JSON.stringify(focusHost)+').value'),'127.0.0.1');
  assert.equal(await evaluate(client,focusFrame,'document.querySelectorAll(".sf-editor select")[1].value'),'limit','keep native default mode');
  const finishFocusAction=async(label,readback)=>until(async()=>{
    const reviewVisible=await evaluate(client,sid,
      'document.querySelector("#sidebar-tool-action-review")?.hidden===false');
    if(reviewVisible)await approveReactReview(client,sid);
    return readback();
  },label);
  await clickSandbox(client,sid,focusFrame,'.sf-editor .sf-actions button');
  await finishFocusAction('real Stay Focus A site saved',async()=>{
    const value=await focusState();return value?.sites?.find(site=>site.host==='127.0.0.1'&&site.enabled&&site.mode==='limit');
  });
  await clickSandbox(client,sid,focusFrame,'.sf-advanced > summary');
  const focusSessionButton='.sf-advanced .sf-setting:last-child button';
  assert.equal(await evaluate(client,focusFrame,'document.querySelector('+JSON.stringify(focusSessionButton)+').textContent'),'屏蔽 25 分钟');
  await clickSandbox(client,sid,focusFrame,focusSessionButton);
  const focusActive=await finishFocusAction('real nonempty high-priority Focus redirects',async()=>{
    const value=await getOwned(client,again);
    return value.focus.length>0&&value.focus.some(rule=>rule.action?.type==='redirect'&&rule.priority>2)?value:null;
  });
  assert.deepEqual(sortedRules(focusActive.owned),sortedRules(coexistAdblock.owned),'Focus start preserves all AdBlock rules');
  assert.ok(focusActive.owned.some(rule=>rule.id===741001&&rule.priority===2&&rule.action.type==='allowAllRequests'));
  const focusNonce=randomUUID(),focusUrl=page+'?nonce='+focusNonce;
  const focusHits=nonce=>serverRequests.filter(row=>row.hostname==='127.0.0.1'&&row.path==='/page'&&
    new URLSearchParams(row.query).get('nonce')===nonce).length;
  const focusEventStart=client.events.length;
  const focusNavigation=await client.send('Page.navigate',{url:focusUrl},pageAgain);
  const blockedSessionUrl=await until(()=>evaluate(client,pageAgain,
    'location.href.startsWith('+JSON.stringify('chrome-extension://'+id+'/stay-focus/blocked-session.html')+')?location.href:null'),
    'actual Stay Focus session page overrides AdBlock A exception');
  assert.equal(new URL(blockedSessionUrl).pathname,'/stay-focus/blocked-session.html');
  assert.equal(focusHits(focusNonce),0,'Focus redirect prevents exact A nonce reaching HTTP');
  report.coexistenceEvidence={rules:focusActive,nonce:focusNonce,url:focusUrl,blockedSessionUrl,
    navigation:focusNavigation,httpHits:focusHits(focusNonce),
    networkEvents:client.events.slice(focusEventStart).filter(event=>event.sessionId===pageAgain&&
      (event.method.startsWith('Network.')||event.method==='Page.frameNavigated'))};
  // Exercise actual AdBlock cleanup while another app owns nonempty rules.
  await click(client,sid,'#sidebar-tool-back');
  await click(client,sid,'#extension-center-search');
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},sid);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},sid);
  await client.send('Input.insertText',{text:'广告拦截'},sid);
  await toggleInstalled('停用');
  await until(()=>evaluate(client,again,
    'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>'+
    'x["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="adblock")?.enabled===false)'),
    'AdBlock is durably disabled during active Focus');
  const focusAfterDisable=await until(async()=>{const value=await getOwned(client,again);
    return value.owned.length===0?value:null;},'AdBlock disable clears only AdBlock rules');
  assert.deepEqual(sortedRules(focusAfterDisable.focus),sortedRules(focusActive.focus),
    'AdBlock disable preserves every active Focus rule');
  const disabledFocusNonce=randomUUID(),disabledFocusUrl=page+'?nonce='+disabledFocusNonce;
  const disabledFocusLoader=(await client.send('Page.getFrameTree',{},pageAgain)).frameTree.frame.loaderId;
  const disabledFocusNavigation=await client.send('Page.navigate',{url:disabledFocusUrl},pageAgain);
  await until(async()=>{
    const frame=(await client.send('Page.getFrameTree',{},pageAgain)).frameTree.frame;
    return frame.loaderId!==disabledFocusLoader&&await evaluate(client,pageAgain,
      'location.origin==='+JSON.stringify('chrome-extension://'+id)+'&&'+
      'location.pathname==="/stay-focus/blocked-session.html"');
  },
    'fresh A navigation still Focus redirected after AdBlock disable');
  assert.equal(focusHits(disabledFocusNonce),0,'disabled AdBlock cleanup cannot release Focus-blocked A nonce');
  report.coexistenceEvidence.afterAdblockDisable={rules:focusAfterDisable,nonce:disabledFocusNonce,
    url:disabledFocusUrl,navigation:disabledFocusNavigation,httpHits:focusHits(disabledFocusNonce),
    blockedUrl:await evaluate(client,pageAgain,'location.href')};
  await click(client,sid,rowMore);
  await click(client,sid,'#extension-center-row-menu button[data-ec-context-action="settings"]');
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector("#sidebar-tool-remove");'+
    'return b&&!b.disabled&&b.getClientRects().length>0})()'),'disabled AdBlock Host uninstall control');
  await click(client,sid,'#sidebar-tool-remove');
  await until(()=>evaluate(client,sid,'document.querySelector("#sidebar-tool-inline-remove-confirm")?.hidden===false'),
    'AdBlock uninstall confirmation during active Focus');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(()=>evaluate(client,again,
    '(async()=>{const x=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1",'+JSON.stringify(STORE)+']);'+
    'return !x["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==="adblock")&&!Object.hasOwn(x,'+JSON.stringify(STORE)+');})()'),
    'AdBlock uninstall removes registry entry and data during active Focus');
  const focusAfterUninstall=await getOwned(client,again);
  assert.equal(focusAfterUninstall.owned.length,0,'uninstalled AdBlock owns no rules');
  assert.deepEqual(sortedRules(focusAfterUninstall.focus),sortedRules(focusActive.focus),
    'AdBlock uninstall preserves every active Focus rule');
  const uninstalledFocusNonce=randomUUID(),uninstalledFocusUrl=page+'?nonce='+uninstalledFocusNonce;
  const uninstalledFocusLoader=(await client.send('Page.getFrameTree',{},pageAgain)).frameTree.frame.loaderId;
  const uninstalledFocusNavigation=await client.send('Page.navigate',{url:uninstalledFocusUrl},pageAgain);
  await until(async()=>{
    const frame=(await client.send('Page.getFrameTree',{},pageAgain)).frameTree.frame;
    return frame.loaderId!==uninstalledFocusLoader&&await evaluate(client,pageAgain,
      'location.origin==='+JSON.stringify('chrome-extension://'+id)+'&&'+
      'location.pathname==="/stay-focus/blocked-session.html"');
  },
    'fresh A navigation still Focus redirected after AdBlock uninstall');
  assert.equal(focusHits(uninstalledFocusNonce),0,'AdBlock uninstall cannot release Focus-blocked A nonce');
  report.coexistenceEvidence.afterAdblockUninstall={rules:focusAfterUninstall,nonce:uninstalledFocusNonce,
    url:uninstalledFocusUrl,navigation:uninstalledFocusNavigation,httpHits:focusHits(uninstalledFocusNonce),
    blockedUrl:await evaluate(client,pageAgain,'location.href')};
  // Reopen the existing Focus installation; AdBlock remains uninstalled.
  await click(client,sid,'#tab-tools');
  await click(client,sid,'#extension-center-search');
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},sid);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},sid);
  await client.send('Input.insertText',{text:'专注'},sid);
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+JSON.stringify(focusInstalled)+');'+
    'return !!b&&!b.disabled&&b.getAttribute("aria-label")?.startsWith("打开「")})()'),'existing Focus installation open after cleanup');
  await click(client,sid,focusInstalled);
  const resumedFocusUrl=await until(()=>evaluate(client,sid,
    '(()=>{const h=document.querySelector("#sidebar-tool-frame"),f=h?.querySelector("iframe");'+
    'return h&&!h.hidden&&f&&f.getBoundingClientRect().height>0?f.src:null})()'),'resumed actual Focus iframe');
  const resumedFocusTarget=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(target=>target.type==='iframe'&&target.url===resumedFocusUrl),'resumed Focus iframe target');
  const resumedFocusFrame=await attach(client,resumedFocusTarget.targetId);
  await until(()=>evaluate(client,resumedFocusFrame,'!!document.querySelector(".sf-advanced")'),'resumed Focus React root');
  if(!await evaluate(client,resumedFocusFrame,'document.querySelector(".sf-advanced").open'))
    await clickSandbox(client,sid,resumedFocusFrame,'.sf-advanced > summary');
  await until(()=>evaluate(client,resumedFocusFrame,'(()=>{const b=document.querySelector('+JSON.stringify(focusSessionButton)+');'+
    'return b&&!b.disabled&&b.textContent==="提前结束"})()'),'resumed actual Focus stop button');
  await clickSandbox(client,sid,resumedFocusFrame,focusSessionButton);
  const focusStopped=await finishFocusAction('Focus stop removes its owned rules',async()=>{
    const value=await getOwned(client,again);return value.focus.length===0?value:null;
  });
  assert.equal(focusStopped.owned.length,0,'Focus stop cannot revive uninstalled AdBlock rules');
  const afterFocusNonce=randomUUID(),afterFocusUrl=page+'?nonce='+afterFocusNonce;
  const afterFocusNavigation=await client.send('Page.navigate',{url:afterFocusUrl},pageAgain);
  assert.ok(afterFocusNavigation.loaderId,'allowed A navigation must produce a loader');
  await until(async()=>{const current=(await client.send('Page.getFrameTree',{},pageAgain)).frameTree.frame;
    return current.loaderId===afterFocusNavigation.loaderId&&await evaluate(client,pageAgain,
      'location.href==='+JSON.stringify(afterFocusUrl)+'&&document.readyState==="complete"&&'+
      'document.querySelector("h1")?.textContent==="Network fixture ready"');},'A real HTTP page allowed after Focus stop');
  assert.equal(focusHits(afterFocusNonce),1,'Focus stop restores exact nonce HTTP access');
  report.coexistenceEvidence.afterStop={rules:focusStopped,url:afterFocusUrl,nonce:afterFocusNonce,
    navigation:afterFocusNavigation,httpHits:focusHits(afterFocusNonce),adblockInstalled:false};
  report.coexistence='PASS';report.priorityIsolation='PASS';
  note('real-stay-focus-priority-isolation',report.coexistenceEvidence);
  assert.equal((await packageFingerprint(ROOT)).packageHash,report.artifactPackageHash,
    'loaded artifact bytes must remain stable through actual Native test');
  assert.equal(createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),report.driverSHA256,
    'native driver must remain the same SHA through actual Native test');
  assert.equal(createHash('sha256').update(await readFile(new URL('./helpers/adblock-layout-native.mjs',import.meta.url))).digest('hex'),
    report.layoutHelperSHA256,'installed React matrix helper must remain the same SHA through Native');
  // Product phases ran. The separate common release gate remains fail-closed
  // until it migrates "revocation" away from an OPTIONAL DNR model.
  const finalReactSourceSHA256=await readReactSourceHashes();
  assert.deepEqual(finalReactSourceSHA256,reactSourceSHA256,'AdBlock React sources must remain unchanged through Native');
  const finalTrustedSourceSHA256=await readTrustedSourceHashes();
  assert.deepEqual(finalTrustedSourceSHA256,trustedSourceSHA256,
    'AdBlock trusted and rules sources must remain unchanged through Native');
  report.sourceChain.finalTrustedSourceSHA256=finalTrustedSourceSHA256;
  const finalTrustedArtifactBindings=await readTrustedArtifactBindings();
  assert.deepEqual(finalTrustedArtifactBindings,trustedArtifactBindings,
    'loaded AdBlock compiled JS and source maps must remain unchanged through Native');
  report.sourceChain.finalTrustedArtifactBindings=finalTrustedArtifactBindings;
  assert.equal(createHash('sha256').update(await readFile(path.join(adblockProject,'dist/build-ready.json'))).digest('hex'),
    report.sourceChain.receiptSHA256,'AdBlock build-ready receipt must remain unchanged through Native');
  assert.equal(await sidebarToolPackageHash(await createSidebarToolPackage(adblockProject)),currentSourcePackageHash,
    'receipt-validated AdBlock package must remain identical at completion');
  report.sourceChain.finalReactSourceSHA256=finalReactSourceSHA256;
  report.sourceChain.sourceUnchanged='PASS';
  updateManualSummary();
  assert.equal(report.manualCosmetic,'PASS','all declared manual cosmetic cases must complete');
  assert.deepEqual(report.manualCosmeticTotals,{total:MANUAL_CASES.length,passed:MANUAL_CASES.length,
    failed:0,notTested:0,running:0},'complete manual cosmetic case accounting');
  report.manualCosmeticEvidence.candidateUnchanged='PASS';
  const observedInputs=[...allCdpEvents,...client.events].filter(event=>
    event.method==='Runtime.consoleAPICalled'&&event.params.args?.[0]?.value?.startsWith?.('ADBLOCK_REACT_INPUT '))
    .map(event=>JSON.parse(event.params.args[0].value.slice(20)));
  assert.ok(observedInputs.some(event=>event.isTrusted===true&&event.type==='pointerdown'&&
    event.inputRole==='switch'&&['全局广告拦截','当前网站广告过滤'].includes(event.inputAriaLabel)),
    'actual trusted pointerdown must target the global or current-site React switch');
  assert.ok(observedInputs.some(event=>event.isTrusted===true&&event.type==='keydown'&&event.key===' '&&
    event.inputRole==='switch'&&event.inputAriaLabel==='全局广告拦截'),
    'actual trusted Space keydown must target the global React switch');
  passed=true;
});

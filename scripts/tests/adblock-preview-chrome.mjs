#!/usr/bin/env node
// Real headless Chrome interactions against source-bound OFFLINE AdBlock preview.
// This is not an installed Chrome extension, DNR/network, or native Mac acceptance.
// ADBLOCK_VISUAL_ONLY=1 / ADBLOCK_INTERACTION_ONLY=1 select bounded rechecks.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildPreview} from '../preview/build-preview.mjs';

const output=resolve(process.argv[2]||'artifacts/preview-chrome');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'adblock-preview-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
const chromeClosed=new Promise(ok=>chrome.once('close',ok));
let launchError;chrome.on('error',e=>{launchError=e;});
let socket,seq=0,mediaTheme='light',activePreview;
const pending=new Map(),contexts=new Map(),errors=[],network=[];
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={},sessionId=null){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},18000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v);},fail(e){clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function stopChrome(){
  if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGTERM');
  let timer;
  const closed=await Promise.race([chromeClosed.then(()=>true),
    new Promise(ok=>{timer=setTimeout(()=>ok(false),5000);})]);
  clearTimeout(timer);
  if(!closed){
    chrome.kill('SIGKILL');
    const forced=await Promise.race([chromeClosed.then(()=>true),
      new Promise(ok=>{timer=setTimeout(()=>ok(false),5000);})]);
    clearTimeout(timer);
    assert.ok(forced,'own Chrome must exit before its profile can be removed');
  }
}
async function connect(){
  let port=0;
  for(let i=0;i<100;i++){
    if(launchError)throw launchError;
    if(chrome.exitCode!==null)throw Error('Chrome exited early '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}
    catch{}
    if(port)break;
    await delay(100);
  }
  assert.ok(port,'Chrome DevTools endpoint is required');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page target missing');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data),session=row.sessionId||null;
    if(row.id&&pending.has(row.id)){
      const callback=pending.get(row.id);pending.delete(row.id);
      if(row.error)callback.fail(Error(row.error.message));else callback.ok(row.result);
    }
    if(row.method==='Runtime.executionContextCreated'){
      const c=row.params.context;
      contexts.set((session||'root')+':'+c.id,{contextId:c.id,session});
    }else if(row.method==='Runtime.executionContextDestroyed'){
      contexts.delete((session||'root')+':'+row.params.executionContextId);
    }else if(row.method==='Runtime.executionContextsCleared'){
      for(const k of contexts.keys())if(k.startsWith((session||'root')+':'))contexts.delete(k);
    }else if(row.method==='Target.attachedToTarget'){
      const s=row.params.sessionId;
      void Promise.all([cdp('Runtime.enable',{},s),cdp('Network.enable',{},s),
        cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:mediaTheme}]},s)])
        .catch(e=>errors.push('child context: '+e.message));
    }else if(row.method==='Network.requestWillBeSent'){
      if(/^https?:/i.test(row.params.request?.url||''))network.push(row.params.request.url);
    }else if(row.method==='Runtime.exceptionThrown'){
      errors.push(row.params.exceptionDetails?.exception?.description||
        row.params.exceptionDetails?.text||'uncaught Chrome script exception');
    }
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Page.bringToFront');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expression,ctx=null){
  const row=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,
    ...(ctx?{contextId:ctx.contextId}:{})},ctx?.session||null);
  if(row.exceptionDetails)throw Error(row.exceptionDetails.exception?.description||
    row.exceptionDetails.text||'Runtime.evaluate exception');
  return row.result?.value;
}
async function poll(fn,label){
  let last='';
  for(let i=0;i<110;i++){
    try{const value=await fn();if(value)return value;}catch(e){last=e.message;}
    await delay(65);
  }
  throw Error('UI did not reach '+label+(last?': '+last:''));
}
// The iframe always mounts the actual Vite-compiled App.jsx; the outer shell
// supplies only inert confirmation prompts. No deprecated native/restore DOM.
async function open(scenario,width=360,theme='light'){
  const built=await buildPreview({tool:'adblock',surface:'side-panel',
    scenario,theme,width,height:760,
    out:join(output,'previews',`${scenario}-${width}-${theme}.html`)});
  if(process.env.GITHUB_SHA)assert.equal(built.sourceCommit,process.env.GITHUB_SHA,'preview frozen source revision');
  if(outcome.sourceCommit)assert.equal(built.sourceCommit,outcome.sourceCommit,'consistent preview source revision');
  outcome.sourceCommit=built.sourceCommit;
  mediaTheme=theme;
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
  contexts.clear();errors.length=0;network.length=0;
  await cdp('Emulation.setDeviceMetricsOverride',{
    width:760,height:1050,deviceScaleFactor:1,mobile:false
  });
  await cdp('Page.navigate',{url:pathToFileURL(built.output).href});
  const ctx=await poll(async()=>{
    for(const row of contexts.values()){
      try{
        if(await evaluate('Boolean(globalThis.OpenDeskTool&&document.querySelector(".adblock-app [data-slot=switch]"))',row))
          return row;
      }catch{}
    }
    return null;
  },scenario+' compiled React iframe');
  await poll(async()=>(await child(ctx)).switches.length===2,
    'React global and website switches');
  assert.equal(await evaluate('matchMedia("(prefers-color-scheme:dark)").matches',ctx),theme==='dark','actual iframe OS theme media');
  await emulate(ctx,theme);
  await evaluate('document.addEventListener("pointerup",e=>{(window.__driverPointers??=[]).push({trusted:e.isTrusted,pointerType:e.pointerType,target:e.target.closest("button,label,input")?.outerHTML,x:e.clientX,y:e.clientY});if(window.__driverPointers.length>20)window.__driverPointers.shift();},true)',ctx);
  await evaluate('document.addEventListener("keydown",e=>{(window.__driverKeys??=[]).push({trusted:e.isTrusted,key:e.key,code:e.code,target:e.target.outerHTML.slice(0,300)});if(window.__driverKeys.length>20)window.__driverKeys.shift();},true)',ctx);
  activePreview={built,ctx};
  return activePreview;
}
async function parent(){
  return evaluate('('+function(){
    const frame=document.getElementById('opendesk-preview-frame');
    const title=document.getElementById('sidebar-tool-title');
    const dialog=document.getElementById('od-preview-adblock-restore-dialog');
    return {
      frame:!!frame,frameHeight:frame?.getBoundingClientRect().height||0,
      sandbox:frame?.getAttribute('sandbox'),title:title?.textContent.trim(),
      dialog:dialog?.open||false,
      dialogText:dialog?.textContent||'',
      feedback:document.getElementById('od-preview-adblock-feedback')?.textContent||'',
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      duplicateLegacyHost:!!document.querySelector('#od-preview-adblock-host .adblock-native-head')
    };
  }.toString()+')()');
}
async function child(ctx){
  return evaluate('('+function(){
    const app=document.querySelector('.adblock-app');
    const switches=[...document.querySelectorAll('.adblock-app [data-slot=switch]')]
      .map(row=>({
        label:row.querySelector('input')?.getAttribute('aria-label'),
        selected:row.querySelector('input')?.checked,
        disabled:row.querySelector('input')?.disabled,
        wrapperSelected:row.hasAttribute('data-selected'),
        wrapperDisabled:row.hasAttribute('data-disabled'),
        width:row.getBoundingClientRect().width
      }));
    return {
      mounted:!!app,
      switches,
      status:app?.querySelector('.adblock-state')?.textContent.trim()||'',
      notice:app?.querySelector('.adblock-notice')?.textContent.trim()||'',
      noticeError:app?.querySelector('.adblock-notice')?.getAttribute('data-error')||'',
      exceptions:[...document.querySelectorAll('.adblock-exception strong')]
        .map(row=>row.textContent),
      restoreDisabled:[...document.querySelectorAll('.adblock-exception button')]
        .map(row=>row.disabled),
      empty:!!document.querySelector('.adblock-empty'),
      nav:app?.querySelector('.adblock-link')?.textContent.trim()||'',
      headings:[...document.querySelectorAll('.adblock-page-head strong')]
        .map(row=>row.textContent),
      hasUnsafeImage:!!app?.querySelector('img[src="x"]'),
      text:app?.textContent||'',
      overflow:document.documentElement.scrollWidth>innerWidth+1
    };
  }.toString()+')()',ctx);
}
function selected(state,label){
  const row=state.switches.find(s=>s.label===label);
  assert.ok(row,'React switch has accessible label: '+label+' '+JSON.stringify(state.switches));
  assert.equal(typeof row.selected,'boolean','native input checked state');
  assert.equal(row.selected,row.wrapperSelected,'React Aria selected/readback consistency');
  assert.equal(row.disabled,row.wrapperDisabled,'React Aria disabled/readback consistency');
  return row;
}
async function pointer(x,y){
  assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0,'CDP click coordinates');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
}
async function clickOuter(selector){
  const position=await evaluate('('+function(sel){
    const item=document.querySelector(sel);
    if(!item)throw Error('Missing outer control '+sel);
    item.scrollIntoView({block:'nearest',inline:'nearest'});
    const r=item.getBoundingClientRect();
    if(r.width<4||r.height<4)throw Error('Hidden outer control '+sel);
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }.toString()+')('+JSON.stringify(selector)+')');
  await pointer(position.x,position.y);
}
async function openSettings(){
  const visibleSettings=await evaluate('(()=>{const el=document.getElementById("sidebar-tool-settings-open");return !!el?.getClientRects().length&&!el.hidden;})()');
  if(visibleSettings){await clickOuter('#sidebar-tool-settings-open');return;}
  const menu=await evaluate('('+function(){
    const buttons=[...document.querySelectorAll('.sidebar-tool-view-head button')];
    const visible=buttons.filter(el=>!el.hidden&&el.getClientRects().length&&!el.disabled);
    const trigger=visible.find(el=>el.getAttribute('aria-haspopup')==='menu'||
      /更多|More/i.test(el.getAttribute('aria-label')||el.title));
    return {id:trigger?.id,controls:buttons.map(el=>({id:el.id,
      label:el.getAttribute('aria-label'),hidden:el.hidden,visible:!!el.getClientRects().length}))};
  }.toString()+')()');
  assert.ok(menu.id,'Preview has no visible Settings/overflow path: '+JSON.stringify(menu.controls));
  await clickOuter('#'+menu.id);
  const item=await poll(()=>evaluate('('+function(){
    return [...document.querySelectorAll('[role=menuitem], [role=menu] button')]
      .find(el=>el.getClientRects().length&&/设置|Settings/i.test(el.getAttribute('aria-label')||el.textContent))?.id;
  }.toString()+')()'),'visible Settings menu item');
  await clickOuter('#'+item);
}
async function reactPosition(selector,ctx,{allowDisabled=false}={}){
  await evaluate('('+function(sel,allow){
    const target=document.querySelector(sel);
    const item=target?.matches('input[role=switch]')?target.closest('label'):target;
    if(!item)throw Error('Missing compiled React control '+sel);
    if(!allow&&(target.disabled||item.hasAttribute('data-disabled')))
      throw Error('Disabled React target '+sel);
    item.scrollIntoView({block:'nearest',inline:'nearest'});
  }.toString()+')('+JSON.stringify(selector)+','+allowDisabled+')',ctx);
  await evaluate('document.getElementById("opendesk-preview-frame").scrollIntoView({block:"nearest"})');
  await evaluate('new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))',ctx);
  const [frame,inside]=await Promise.all([
    evaluate('document.getElementById("opendesk-preview-frame").getBoundingClientRect().toJSON()'),
    evaluate('('+function(sel){
      const target=document.querySelector(sel);
      const r=(target.matches('input[role=switch]')?target.closest('label'):target).getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
    }.toString()+')('+JSON.stringify(selector)+')',ctx)
  ]);
  assert.ok(inside.width>=4&&inside.height>=4,'visible compiled React target: '+selector);
  assert.ok(inside.x>=0&&inside.x<frame.width&&inside.y>=0&&inside.y<frame.height,
    'target must be inside the real iframe viewport: '+selector);
  return {x:frame.x+inside.x,y:frame.y+inside.y};
}
async function clickReact(selector,ctx,options){
  const p=await reactPosition(selector,ctx,options);await pointer(p.x,p.y);
}
async function touchReact(selector,ctx,options){
  const p=await reactPosition(selector,ctx,options);
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:1,radiusY:1,id:1}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function key(key){
  const code={Tab:9,Enter:13,' ':32,Escape:27}[key];
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key===' '?'Space':key,
    windowsVirtualKeyCode:code,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:
      key===' '?{text:' ',unmodifiedText:' '}: {})});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code:key===' '?'Space':key,
    windowsVirtualKeyCode:code});
}
async function tabTo(selector,ctx){
  for(let i=0;i<55;i++){
    await key('Tab');
    if(await evaluate('document.hasFocus()&&document.activeElement?.matches('+JSON.stringify(selector)+')',ctx))return;
  }
  throw Error('Keyboard Tab did not reach '+selector);
}
async function screenshot(name){
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(join(output,'adblock-react-'+name+'.png'),Buffer.from(shot.data,'base64'));
}
async function hoverReact(selector,ctx){
  const p=await reactPosition(selector,ctx,{allowDisabled:true});
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await delay(180);
}
async function evidence(name,ctx,built){
  const computed=await evaluate('('+function(){
    const selectors=['.adblock-app','.adblock-muted','.adblock-help',
      '.od-button--primary','.adblock-selector-input','.adblock-rule-actions--icons button',
      '[data-slot=switch]'];
    const rows=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(el=>{
      const c=getComputedStyle(el),r=el.getBoundingClientRect();
      return {selector,html:el.outerHTML,text:el.textContent,rect:r.toJSON(),
        color:c.color,background:c.backgroundColor,border:c.borderColor,
        outline:c.outlineColor,outlineWidth:c.outlineWidth,fontSize:c.fontSize,
        fontWeight:c.fontWeight,opacity:c.opacity,transition:c.transition,
        hover:el.matches(':hover'),disabled:el.disabled,
        tokens:Object.fromEntries(['--od-line','--od-input-border','--od-brand',
          '--od-brand-ink','--od-negative','--od-negative-bg'].map(k=>[k,c.getPropertyValue(k).trim()]))};
    }));
    return {focused:document.hasFocus(),active:document.activeElement?.outerHTML,keyEvents:window.__driverKeys||[],pointerEvents:window.__driverPointers||[],styleOrder:[...document.styleSheets].map((s,i)=>({index:i,tag:s.ownerNode.tagName,
      id:s.ownerNode.id,tail:s.ownerNode.textContent.slice(-180)})),
      darkMedia:matchMedia('(prefers-color-scheme:dark)').matches,
      switchDOM:[...document.querySelectorAll('[data-slot=switch]')].map(x=>x.outerHTML),rows};
  }.toString()+')()',ctx);
  await screenshot(name);
  await writeFile(join(output,'adblock-react-'+name+'.json'),JSON.stringify({
    scope:'OFFLINE_MOCK_REACT_PREVIEW_NOT_INSTALLED_CHROME_NOT_NATIVE_DNR',
    built,state:await child(ctx),computed},null,2)+'\n');
}
function offlineSafety(){
  assert.deepEqual(network,[],'offline preview must not make HTTP(S) requests');
  assert.deepEqual(errors,[],'Chrome must not report uncaught iframe/script exceptions');
}
// All measurements belong to the source-built mock iframe, never installed Chrome.
async function audit(ctx,{touch=false}={}){
  return evaluate('('+function(coarse){
    const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility==='visible';
    const rgba=s=>{
      const n=s.match(/[\d.]+/g)?.map(Number);
      if(!n||n.length<3)throw Error('Unsupported computed color '+s);
      return [...n.slice(0,3),n[3]??1];
    };
    const over=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1];
    // Transparent html/body use the browser's system Canvas (dark is not white).
    const probe=document.createElement('span');probe.style.color='Canvas';
    document.body.append(probe);const canvas=rgba(getComputedStyle(probe).color);probe.remove();
    const bg=el=>{
      const stack=[];for(let p=el;p;p=p.parentElement)stack.unshift(rgba(getComputedStyle(p).backgroundColor));
      return stack.reduce((b,a)=>over(a,b),canvas);
    };
    const lum=a=>a.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
      .reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const id=el=>el.getAttribute('aria-label')||el.id||el.textContent.trim().slice(0,80)||el.className;
    const checks=[],targets=[],motion=[];
    const add=(kind,el,value,minimum,extra={})=>checks.push({kind,target:id(el),ratio:value,minimum,
      pass:value+.001>=minimum,...extra});
    for(const el of document.querySelectorAll('.adblock-app *')){
      if(!visible(el)||el.closest('[disabled],[data-disabled]'))continue;
      const c=getComputedStyle(el),back=bg(el);
      if(el.matches('button,[data-slot=switch],svg'))motion.push({target:id(el),
        transition:c.transitionDuration,animation:c.animationDuration});
      const ownText=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
      if(ownText){
        const large=parseFloat(c.fontSize)>=24||parseFloat(c.fontSize)>=18.667&&Number(c.fontWeight)>=700;
        add('text',el,ratio(over(rgba(c.color),back),back),large?3:4.5,
          {foreground:c.color,background:back,text:ownText.slice(0,80)});
      }
      if(el.matches('svg'))add('icon',el.parentElement,ratio(over(rgba(c.color),back),back),3);
      if(el.matches('.adblock-selector-input')){
        const edge=over(rgba(c.borderTopColor),back),outside=bg(el.parentElement);
        add('required-input-boundary',el,Math.min(ratio(edge,back),ratio(edge,outside)),3,
          {border:c.borderTopColor,inside:back,outside});
      }
      if(el.matches('[data-slot=switch]')){
        const outside=bg(el.parentElement),border=over(rgba(c.borderTopColor),back);
        add('required-switch-boundary',el.querySelector('input'),
          Math.max(parseFloat(c.borderTopWidth)?ratio(border,outside):1,ratio(back,outside)),3);
      }
      if(el.matches(':focus-visible')&&parseFloat(c.outlineWidth)>0)
        add('focus-outline',el,ratio(over(rgba(c.outlineColor),bg(el.parentElement)),bg(el.parentElement)),3);
    }
    if(coarse){
      for(const el of document.querySelectorAll('.adblock-app button,.adblock-app summary,.adblock-app input')){
        if(!visible(el)||el.disabled)continue;
        // React Aria's 1px input delegates pointer activation to its real label.
        const target=el.closest('label')||el,r=target.getBoundingClientRect();
        targets.push({target:id(el),width:r.width,height:r.height,
          recommended44:r.width>=44&&r.height>=44});
      }
      // WCAG 2.5.8 permits 24px target spacing. Keep the stronger 44px result separate.
      for(let i=0;i<targets.length;i++){
        const el=[...document.querySelectorAll('.adblock-app button,.adblock-app summary,.adblock-app input')]
          .filter(el=>visible(el)&&!el.disabled)[i];
        const r=(el.closest('label')||el).getBoundingClientRect();
        const a={x:r.x+r.width/2,y:r.y+r.height/2,w:Math.max(24,r.width),h:Math.max(24,r.height)};
        targets[i].minimum24OrSpacing=(r.width>=24&&r.height>=24)||
          [...document.querySelectorAll('.adblock-app button,.adblock-app summary,.adblock-app input')]
            .filter(other=>other!==el&&visible(other)&&!other.disabled).every(other=>{
              const b=(other.closest('label')||other).getBoundingClientRect();
              return Math.abs(a.x-b.x-b.width/2)>=(a.w+Math.max(24,b.width))/2||
                Math.abs(a.y-b.y-b.height/2)>=(a.h+Math.max(24,b.height))/2;
            });
      }
    }
    return {dark:matchMedia('(prefers-color-scheme:dark)').matches,
      coarse:matchMedia('(pointer:coarse)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,
      viewport:innerWidth,layoutWidth:document.documentElement.clientWidth,
      rootCSSWidth:getComputedStyle(document.documentElement).width,
      cssZoom:getComputedStyle(document.documentElement).zoom,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      checks,targets,motion,canvas};
  }.toString()+')('+touch+')',ctx);
}
async function emulate(ctx,theme,{touch=false,reduced=false}={}){
  const sessions=[...new Set([null,ctx.session||null])];
  for(const session of sessions){
    await cdp('Emulation.setEmulatedMedia',{features:[
      {name:'prefers-color-scheme',value:theme},
      {name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]},session);
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1},session);
  }
}
const ACTIONS='.adblock-rule-actions--icons';
const action=title=>ACTIONS+' button[title="'+title+'"]';
async function enableSite(ctx){
  await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,'global readback');
  await clickReact(SITE,ctx);
  await poll(async()=>(await parent()).dialog,'site enable review');
  await clickOuter('#od-preview-adblock-restore-accept');
  await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,'site enabled');
}
async function history(ctx){
  await poll(()=>evaluate('!document.querySelector(".adblock-manual-actions button:nth-child(2)").disabled',ctx),'history action unlocked');
  await clickReact('.adblock-manual-actions button:nth-child(2)',ctx);
  await poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(ACTIONS)+'))',ctx),'rule history');
  await poll(()=>evaluate('!document.querySelector('+JSON.stringify(action('定位'))+').disabled',ctx),'inspected rule');
}
async function visualChecks(report){
  const results=[];
  const capture=async(name,ctx,built,options={})=>{
    const measured=await audit(ctx,options);
    await evidence(name,ctx,built);
    results.push({name,width:built.viewport.width,theme:built.theme,
      uiSha256:built.uiSha256,sourceCommit:built.sourceCommit,...measured});
    await writeFile(join(output,'adblock-visual-audit.json'),JSON.stringify({
      scope:'OFFLINE_MOCK_REACT_PREVIEW_NOT_INSTALLED_CHROME_NOT_NATIVE_DNR',
      zoomMethod:'CSS zoom:2 on iframe documentElement; logical reflow proxy, NOT Chrome browser page zoom or pageScaleFactor',
      browserPageZoom:'NOT_TESTED',results},null,2)+'\n');
  };
  for(const width of [320,360,400,440])for(const theme of ['light','dark']){
    const {ctx,built}=await open('success',width,theme);
    await emulate(ctx,theme);
    await enableSite(ctx);
    assert.equal((await parent()).overflow,false,'preview shell overflow '+width+'/'+theme);
    await capture('responsive-'+width+'-'+theme,ctx,built);
    await history(ctx);
    const icons=await evaluate('('+function(){
      return [...document.querySelectorAll('.adblock-rule-actions--icons button')].map(el=>({
        title:el.title,label:el.getAttribute('aria-label'),svg:!!el.querySelector('svg'),
        rect:el.getBoundingClientRect().toJSON()}));
    }.toString()+')()',ctx);
    assert.deepEqual(icons.map(x=>x.title),['定位','临时显示','编辑','删除规则'],'four fixed action meanings/order');
    assert.ok(icons.every(x=>x.svg&&x.label),'every icon has a visible SVG and accessible label');
    await capture('history-'+width+'-'+theme,ctx,built);
    await clickReact(action('编辑'),ctx);
    await capture('edit-'+width+'-'+theme,ctx,built);
    // Explicitly requested 200% reflow probe. Never report this as Chrome page zoom.
    await evaluate('document.documentElement.style.zoom="2"',ctx);
    await capture('css-zoom-200-'+width+'-'+theme,ctx,built);
    await evaluate('document.documentElement.style.zoom=""',ctx);
    await emulate(ctx,theme,{touch:true,reduced:true});
    const coarse=await audit(ctx,{touch:true});
    assert.equal(coarse.coarse,true,'actual coarse pointer media');
    assert.equal(coarse.reducedMotion,true,'actual reduced motion media');
    await capture('coarse-reduced-'+width+'-'+theme,ctx,built,{touch:true});
    await hoverReact(action('删除规则'),ctx);
    await capture('delete-hover-'+width+'-'+theme,ctx,built);
    await clickReact('.adblock-back',ctx);
    await capture('coarse-overview-'+width+'-'+theme,ctx,built,{touch:true});
    await touchReact('.adblock-pick-trigger',ctx);
    await poll(async()=>(await child(ctx)).text.includes('正在选择网页区域'),'touch picker active');
    await capture('coarse-picker-'+width+'-'+theme,ctx,built,{touch:true});
    await touchReact('.adblock-pick-panel button',ctx);
    await poll(async()=>!(await child(ctx)).text.includes('正在选择网页区域'),'touch picker cancelled');
    offlineSafety();
    report.push({scenario:'visual-audit',width,theme,uiSha256:built.uiSha256,
      checks:['four-fixed-icons','light-dark-actual-media','CSS-zoom-200-reflow-proxy',
        'coarse-target-measurements','trusted-touch-picker-cancel','reduced-motion-media','computed-contrast']});
  }
  const failures=results.flatMap(r=>[
    ...(r.overflow?[{name:r.name,kind:'horizontal-overflow'}]:[]),
    ...r.checks.filter(c=>!c.pass).map(c=>({name:r.name,...c})),
    ...(r.reducedMotion?r.motion.filter(m=>[m.transition,m.animation].some(value=>
      value.split(',').some(duration=>parseFloat(duration)>0.01)))
      .map(m=>({name:r.name,kind:'reduced-motion',...m})):[]),
    ...r.targets.filter(t=>!t.minimum24OrSpacing).map(t=>({name:r.name,kind:'touch-minimum',...t}))]);
  const minimumContrast=Object.fromEntries(['text','icon','required-input-boundary','required-switch-boundary']
    .map(kind=>{
      const measured=results.flatMap(r=>r.checks.filter(c=>c.kind===kind).map(c=>({...c,cell:r.name})))
        .sort((a,b)=>a.ratio-b.ratio);
      return [kind,measured[0]];
    }));
  const matrix=[320,360,400,440].flatMap(width=>['light','dark'].map(theme=>{
    const cells=results.filter(r=>r.width===width&&r.theme===theme);
    const cellFailures=failures.filter(f=>cells.some(c=>c.name===f.name));
    return {width,theme,status:cellFailures.length?'FAIL':'PASS',captures:cells.length,
      uiSha256:cells[0]?.uiSha256,checks:[
        'overview','history-four-icons','editor','CSS-zoom-200-reflow-proxy',
        'coarse-reduced-motion','delete-hover','coarse-overview','coarse-picker'],
      touch44Advisories:cells.flatMap(c=>c.targets.filter(t=>!t.recommended44)
        .map(t=>({cell:c.name,...t}))),failures:cellFailures};
  }));
  Object.assign(outcome,{matrix,minimumContrast});
  const visualReport=JSON.parse(await readFile(join(output,'adblock-visual-audit.json'),'utf8'));
  await writeFile(join(output,'adblock-visual-audit.json'),JSON.stringify({
    ...visualReport,status:failures.length?'FAIL':'PASS',matrix,minimumContrast,failures},null,2)+'\n');
  console.log('ADBLOCK_VISUAL_FINDINGS '+failures.length+' (see adblock-visual-audit.json)');
  return failures;
}
async function interactionChecks(report){
  const {ctx,built}=await open('success');
  await emulate(ctx,'light');await enableSite(ctx);await history(ctx);
  // Tab and native Enter must open the editor and make its input reachable.
  await tabTo(action('编辑'),ctx);await key('Enter');
  await poll(()=>evaluate('document.querySelector(".adblock-advanced").open',ctx),'keyboard editor open');
  await evaluate('new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))',ctx);
  const entry=await evaluate('({active:document.activeElement.outerHTML,focusedInput:document.activeElement.id==="adblock-selector-input",value:document.querySelector("#adblock-selector-input").value})',ctx);
  await evidence('keyboard-edit-entry',ctx,built);
  await key('Escape');
  await evaluate('new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))',ctx);
  const escaped=await evaluate('!document.querySelector(".adblock-advanced-body>label").textContent.includes("修改")',ctx);
  const restoredFocus=await evaluate('document.activeElement.matches('+JSON.stringify(action('编辑'))+')',ctx);
  await writeFile(join(output,'adblock-keyboard-entry.json'),JSON.stringify({entry,escaped,restoredFocus},null,2)+'\n');
  console.log('ADBLOCK_KEYBOARD_EDITOR '+JSON.stringify({focusedInput:entry.focusedInput,escaped,restoredFocus}));
  if(!escaped)await clickReact('.adblock-advanced-body .adblock-rule-actions button:last-child',ctx);
  await clickReact(action('编辑'),ctx);
  await poll(()=>evaluate('document.activeElement.id==="adblock-selector-input"',ctx),'first pointer edit focuses input');
  await clickReact(action('编辑'),ctx);
  await evaluate('new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))',ctx);
  const repeatedEdit=await evaluate('({focusedInput:document.activeElement.id==="adblock-selector-input",value:document.querySelector("#adblock-selector-input").value,active:document.activeElement.outerHTML})',ctx);
  await evidence('repeated-edit-focus',ctx,built);
  await writeFile(join(output,'adblock-repeated-edit.json'),JSON.stringify(repeatedEdit,null,2)+'\n');
  console.log('ADBLOCK_REPEATED_EDIT '+JSON.stringify({focusedInput:repeatedEdit.focusedInput,value:repeatedEdit.value}));
  await clickReact('.adblock-advanced-body .adblock-rule-actions button:last-child',ctx);
  // Space activates a real React Aria input; no synthetic click or DOM state write.
  await clickReact('.adblock-back',ctx);await tabTo(GLOBAL,ctx);await key(' ');
  await poll(async()=>(await parent()).dialog,'keyboard switch review');
  await key('Escape');await poll(async()=>!(await parent()).dialog,'keyboard dialog escape');
  assert.equal(selected(await child(ctx),'全局广告拦截').selected,true,'cancel keeps checked state');
  await history(ctx);await tabTo(action('临时显示'),ctx);await key('Enter');
  await poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(action('重新隐藏'))+'))',ctx),'keyboard temporarily visible');
  await key(' ');
  await poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(action('临时显示'))+'))',ctx),'keyboard re-hidden');
  await tabTo(action('定位'),ctx);await key('Enter');
  await poll(()=>evaluate('document.getElementById("native-promo").classList.contains("is-located")'),'keyboard locate target');
  await tabTo(action('删除规则'),ctx);
  const focus=await audit(ctx);await evidence('keyboard-delete-focus',ctx,built);
  assert.ok(focus.checks.some(c=>c.kind==='focus-outline'),'visible keyboard focus outline');
  assert.ok(focus.checks.filter(c=>c.kind==='focus-outline').every(c=>c.pass),'focus outline contrast');
  await emulate(ctx,'light',{touch:true});
  await touchReact(action('定位'),ctx);
  await poll(()=>evaluate('document.getElementById("native-promo").classList.contains("is-located")'),'touch locate');
  await touchReact(action('临时显示'),ctx);
  await poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(action('重新隐藏'))+'))',ctx),'touch temporarily visible');
  await touchReact(action('重新隐藏'),ctx);
  await poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(action('临时显示'))+'))',ctx),'touch re-hidden');
  await touchReact(action('编辑'),ctx);
  await poll(()=>evaluate('document.querySelector(".adblock-advanced-body>label").textContent.includes("修改")',ctx),'touch editor');
  await touchReact('.adblock-advanced-body .adblock-rule-actions button:last-child',ctx);
  await touchReact(action('删除规则'),ctx);
  await poll(()=>evaluate('!document.querySelector(".adblock-rule")',ctx),'touch permanent deletion');
  await clickReact('.adblock-back',ctx);await touchReact('.adblock-pick-trigger',ctx);
  await poll(async()=>(await child(ctx)).text.includes('正在选择网页区域'),'touch repick');
  await clickOuter('#native-promo');
  await poll(async()=>(await child(ctx)).text.includes('已隐藏并保存'),'repicked original rule');
  await history(ctx);
  // Revocation arrives through the existing mock protocol and must lock all four controls.
  await evaluate('document.getElementById("opendesk-preview-frame").contentWindow.postMessage({type:"opendesk.preview.adblock.state",enabled:true,granted:false,exceptions:[]},"*")');
  await poll(()=>evaluate('[...document.querySelectorAll('+JSON.stringify(ACTIONS+' button')+')].every(b=>b.disabled)',ctx),'four disabled actions after revocation');
  const before=await evaluate('document.querySelector(".adblock-rule").textContent',ctx);
  for(const title of ['定位','临时显示','编辑','删除规则'])await clickReact(action(title),ctx,{allowDisabled:true});
  await emulate(ctx,'light',{touch:true});
  for(const title of ['定位','临时显示','编辑','删除规则'])await touchReact(action(title),ctx,{allowDisabled:true});
  await key('Enter');await key(' ');
  assert.equal((await parent()).dialog,false,'disabled controls never ask for a write');
  assert.equal(await evaluate('document.querySelector(".adblock-rule").textContent',ctx),before,'disabled controls preserve rule');
  await tabTo('.adblock-back',ctx);await key('Tab');
  assert.equal(await evaluate('document.activeElement.matches('+JSON.stringify(ACTIONS+' button')+')',ctx),false,'Tab skips disabled icons');
  await evidence('disabled-actions',ctx,built);offlineSafety();
  report.push({scenario:'keyboard-touch-disabled',uiSha256:built.uiSha256,entry,escaped,restoredFocus,repeatedEdit,
    checks:['Tab-Enter-editor','Space-React-Aria-switch','keyboard-review-Escape',
      'keyboard-locate','keyboard-show-hide','visible-focus','revocation-locks-four-icons',
      'enabled-touch-locate-show-hide-edit-delete','Tab-skips-disabled-icons',
      'disabled-native-pointer-touch-keyboard-no-write']});
  assert.equal(entry.focusedInput,true,'keyboard edit must focus its input');
  assert.equal(entry.value,'#native-promo','editor preserves existing selector');
  assert.equal(escaped,true,'Escape must cancel editing');
  assert.equal(restoredFocus,true,'Escape restores focus to the original edit icon');
  assert.equal(repeatedEdit.focusedInput,true,'repeated edit of the same rule must focus its input');
}
const GLOBAL='[data-slot="switch"] input[aria-label="全局广告拦截"]';
const SITE='[data-slot="switch"] input[aria-label="当前网站广告过滤"]';
const report=[],outcome={
  scope:'OFFLINE_MOCK_REACT_PREVIEW_NOT_INSTALLED_CHROME_NOT_NATIVE_DNR',
  visualStatus:'NOT_RUN',functionalStatus:'NOT_RUN',browserPageZoom:'NOT_TESTED'
};
const functionalFailures=[];
outcome.functionalFailures=functionalFailures;
async function functionalCase(name,work){
  try{await work();}catch(error){
    functionalFailures.push({scenario:name,failure:String(error?.stack||error)});
    if(activePreview)await evidence('failure-'+name,activePreview.ctx,activePreview.built);
    console.error('ADBLOCK_SCENARIO_FAIL '+name+': '+error.message);
  }
}
try{
  await connect();
  outcome.browser=await cdp('Browser.getVersion');
  const runtimeURL=new URL('../../dist/production/sidebar-shared-ui.js',import.meta.url);
  outcome.sharedRuntime={path:fileURLToPath(runtimeURL),
    sha256:createHash('sha256').update(await readFile(runtimeURL)).digest('hex')};
  outcome.verificationDriver={path:fileURLToPath(import.meta.url),
    sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    stage:'POST_FREEZE_VERIFICATION_DRIVER_ONLY'};
  if(process.env.ADBLOCK_EVIDENCE_ONLY==='1'){
    for(const theme of ['light','dark']){
      const {ctx,built}=await open('success',360,theme);
      await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,'baseline native input');
      await evidence('before-'+theme+'-overview',ctx,built);
      await clickReact(SITE,ctx);
      await poll(async()=>(await parent()).dialog,'baseline site enable');
      await clickOuter('#od-preview-adblock-restore-accept');
      await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,'baseline site enabled');
      await evidence('before-'+theme+'-enabled',ctx,built);
      await clickReact('.adblock-manual-actions button:nth-child(2)',ctx);
      await poll(()=>evaluate('Boolean(document.querySelector(".adblock-rule-actions--icons button"))',ctx),'baseline history');
      await clickReact('.adblock-rule-actions--icons button:nth-child(3)',ctx);
      await evidence('before-'+theme+'-history-edit',ctx,built);
      const del='.adblock-rule-actions--icons button:nth-child(4)';
      await hoverReact(del,ctx);
      await evidence('before-'+theme+'-delete-hover',ctx,built);
    }
  }else{
  if(process.env.ADBLOCK_INTERACTION_ONLY!=='1')outcome.visualStatus='RUNNING';
  const visualFailures=process.env.ADBLOCK_INTERACTION_ONLY==='1'?[]:await visualChecks(report);
  if(process.env.ADBLOCK_INTERACTION_ONLY!=='1')outcome.visualStatus=visualFailures.length?'FAIL':'PASS';
  if(process.env.ADBLOCK_VISUAL_ONLY!=='1'){
    outcome.functionalStatus='RUNNING';
    await functionalCase('keyboard-touch-disabled',()=>interactionChecks(report));
    outcome.functionalStatus=functionalFailures.length?'FAIL':'KEYBOARD_TOUCH_DISABLED_PASS_OTHER_SCENARIOS_NOT_RUN';
  }
  if(process.env.ADBLOCK_VISUAL_ONLY!=='1'&&process.env.ADBLOCK_INTERACTION_ONLY!=='1'){
  outcome.functionalStatus='RUNNING';
  await functionalCase('success-settings',async()=>{
    const {ctx,built}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'initial verified global state');
    const initial=await child(ctx),shell=await parent();
    assert.equal(shell.title,'广告拦截');
    assert.equal(shell.sandbox,'allow-scripts');
    assert.equal(shell.duplicateLegacyHost,false);
    assert.equal(shell.overflow,false);
    assert.equal(initial.overflow,false);
    assert.equal(selected(initial,'当前网站广告过滤').selected,false);
    assert.match(initial.nav,/已停用的网站\s*1/);
    await screenshot('overview');
    await clickReact('.adblock-link',ctx);
    await poll(async()=>(await child(ctx)).exceptions.length===1,'React exception page');
    assert.deepEqual((await child(ctx)).exceptions,['news.example.com']);
    await screenshot('exceptions');
    // Confirmations run in the trusted-preview OUTER document only.
    await clickReact('.adblock-exception button',ctx);
    await poll(async()=>(await parent()).dialog,'restore confirm');
    assert.deepEqual((await child(ctx)).restoreDisabled,[true],
      'the pending React operation must suppress duplicate submissions');
    // An unmatched forged message must never replace the real approval.
    await evaluate("window.parent.postMessage({type:'opendesk.preview.adblock.review-decision',requestId:999,accepted:true},'*')",ctx);
    assert.equal((await parent()).dialog,true);
    await screenshot('restore-confirmation');
    await clickOuter('#od-preview-adblock-restore-cancel');
    await poll(async()=>!(await parent()).dialog,'restore cancellation');
    await poll(async()=>((await child(ctx)).restoreDisabled[0]===false),
      'cancelled operation unlocked');
    assert.deepEqual((await child(ctx)).exceptions,['news.example.com'],
      'cancelling does not alter saved mock state');
    await clickReact('.adblock-exception button',ctx);
    await poll(async()=>(await parent()).dialog,'restore second confirmation');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>(await child(ctx)).empty,'React restore readback');
    await screenshot('restored');
    await clickReact('.adblock-back',ctx);
    await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,
      'website filter restored');
    // Actual CDP pointer events exercise both global and site React Aria switches.
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'site exception confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>!selected(await child(ctx),'当前网站广告过滤').selected,
      'site exception readback');
    assert.match((await child(ctx)).nav,/已停用的网站\s*1/);
    await clickReact(GLOBAL,ctx);
    await poll(async()=>(await parent()).dialog,'global disable confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>!selected(await child(ctx),'全局广告拦截').selected,
      'global disable readback');
    await clickReact(GLOBAL,ctx);
    await poll(async()=>(await parent()).dialog,'global enable confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'global enable readback');
    offlineSafety();
    report.push({scenario:'success-controls',sourceCommit:built.sourceCommit,
      uiSha256:built.uiSha256,checks:[
        'compiled-react-mounted','real-CDP-pointer-React-Aria-controls',
        'restore-accept','restore-cancel','pending-duplicate-locked',
        'global-disable-enable','site-exception','opaque-sandbox',
        'offline-no-network','forged-review-ignored']});
    await openSettings();
    await poll(async()=>(await child(ctx)).headings.includes('设置说明'),
      'React settings navigation from toolbar');
    await screenshot('settings');
    await clickReact('.adblock-back',ctx);
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'React settings back to overview');
    offlineSafety();
    report.push({scenario:'settings',sourceCommit:built.sourceCommit,
      uiSha256:built.uiSha256,checks:['visible-toolbar-settings-back','offline-no-network']});
  });
  // R2.4: real pointer clicks into the compiled JSX and simulated target webpage.
  {
    const {ctx,built}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,'picker ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'filtering approval');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,'site enabled');
    const hidden=()=>evaluate('document.getElementById("promo-sidebar").classList.contains("is-hidden")');
    const pick=async()=>{
      await clickReact('.adblock-manual-actions button:first-child',ctx);
      await poll(async()=>(await child(ctx)).text.includes('正在选择网页区域'),'picker active');
      await clickOuter('#promo-sidebar');
      await poll(hidden,'one-click hide');
      await poll(async()=>(await child(ctx)).text.includes('已隐藏并保存'),'saved receipt');
    };
    await pick();
    await clickReact('.adblock-pick-panel button',ctx);
    await poll(async()=>!(await hidden()),'side panel undo');
    await pick();
    await clickReact('.adblock-manual-actions button:nth-child(2)',ctx);
    const row='.adblock-rule:has(.adblock-selector[title="#promo-sidebar"])';
    const found=()=>evaluate('Boolean(document.querySelector('+JSON.stringify(row)+'))',ctx);
    await poll(found,'persistent history');
    await poll(()=>evaluate('!document.querySelector('+JSON.stringify(row+' .adblock-rule-actions button:first-child')+').disabled',ctx),'history match count');
    await clickReact(row+' .adblock-rule-actions button:first-child',ctx);
    await poll(()=>evaluate('document.getElementById("promo-sidebar").classList.contains("is-located")'),'locate highlight');
    await delay(2600);
    await poll(hidden,'locate auto restores hide');
    await clickReact(row+' .adblock-rule-actions button:nth-child(2)',ctx);
    await poll(async()=>!(await hidden()),'temporarily visible');
    await clickReact(row+' .adblock-rule-actions button:nth-child(2)',ctx);
    await poll(hidden,'re-hidden');
    await clickReact(row+' .adblock-rule-actions button:nth-child(4)',ctx);
    await poll(async()=>!(await hidden()),'permanently restored');
    await poll(async()=>!(await found()),'rule removed from history');
    await screenshot('r24-picker-history');
    offlineSafety();
    report.push({scenario:'r24-picker-history',uiSha256:built.uiSha256,
      checks:['one-click-hide','undo','history','locate','temporary-show',
        're-hide','delete','offline']});
  }
  // Browser-delivered external state change during an unconfirmed write.
  // The 8+ second wait is deliberate: a stale request must not target the
  // newly active site, even when the old preview confirmation remains open.
  {
    const {ctx}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'navigation race ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'delayed site confirmation');
    await delay(8200);
    await evaluate('('+function(){
      document.getElementById('opendesk-preview-frame').contentWindow.postMessage({
        type:'opendesk.preview.adblock.state',enabled:true,granted:true,
        exceptions:['news.example.com'],currentHost:'video.example.com'
      },'*');
    }.toString()+')()');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>{
      const view=await child(ctx);
      return view.text.includes('video.example.com')&&
        selected(view,'当前网站广告过滤').selected===true&&
        /已停用的网站\s*1/.test(view.nav);
    },'old page write must not cross into new site');
    const switched=await child(ctx);
    assert.doesNotMatch(switched.notice,/Chrome 已确认|设置已由 Chrome 确认/,
      'a late confirmation must never appear as old-site success');
    assert.match(switched.text,/video\.example\.com/);
    offlineSafety();
    report.push({scenario:'delayed-page-switch',checks:[
      '8-second-pending-confirmation','old-site-write-rejected',
      'new-site-readback','no-replayed-write','offline-not-DNR']});
  }
  {
    const {ctx}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'permission race ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'permission-revocation confirmation');
    await evaluate('('+function(){
      document.getElementById('opendesk-preview-frame').contentWindow.postMessage({
        type:'opendesk.preview.adblock.state',enabled:true,granted:false,
        exceptions:['news.example.com']
      },'*');
    }.toString()+')()');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>{
      const view=await child(ctx);
      return view.status.includes('过滤权限不可用')&&
        selected(view,'当前网站广告过滤').disabled===true;
    },'revoked permission cannot complete pending write');
    assert.match((await child(ctx)).nav,/已停用的网站\s*1/);
    offlineSafety();
    report.push({scenario:'revoked-during-confirmation',checks:[
      'permission-rechecked-on-accept','no-write-after-revocation',
      'readback-disables-controls','offline-not-DNR']});
  }
  {
    const {ctx}=await open('untrusted');
    await clickReact('.adblock-link',ctx);
    await poll(async()=>(await child(ctx)).exceptions.length===1,'malicious text');
    const state=await child(ctx);
    assert.match(state.exceptions[0],/<img src=x onerror=alert\(1\)>/);
    assert.equal(state.hasUnsafeImage,false,'untrusted domain must remain text only');
    await screenshot('untrusted');
    offlineSafety();report.push({scenario:'untrusted',checks:['inert-text','no-xss']});
  }
  for(const scenario of ['empty','error','loading','permission-denied']){
    const {ctx}=await open(scenario);
    await poll(async()=>{
      const x=await child(ctx);
      return scenario==='loading'?x.status.includes('正在核对 Chrome'):
        scenario==='error'?x.notice.includes('离线状态读取错误'):
        x.status.includes('过滤权限不可用');
    },scenario+' state');
    const view=await child(ctx);
    assert.equal(selected(view,'全局广告拦截').disabled,true,
      'unknown/missing permission cannot enable without trusted Host: '+scenario);
    assert.equal(selected(view,'当前网站广告过滤').disabled,true);
    await screenshot(scenario);
    offlineSafety();
    report.push({scenario,checks:['honest-disabled-state','no-fake-DNR-authority']});
  }
  outcome.functionalStatus=functionalFailures.length?'FAIL':'PASS';
  }
  await writeFile(join(output,'adblock-preview-chrome.json'),
    JSON.stringify({...outcome,status:visualFailures.length||functionalFailures.length?'FAIL':'OFFLINE_REACT_CHROME_DOM_PASS_NOT_NATIVE_DNR',
      source:'compiled App.jsx via Vite',visualFailures,checks:report},null,2)+'\n');
  assert.equal(visualFailures.length,0,'computed visual/target findings require owner review (adblock-visual-audit.json)');
  assert.equal(functionalFailures.length,0,'functional scenarios failed (adblock-preview-chrome.json)');
  console.log('ADBLOCK_PREVIEW_CHROME_PASS_REAL_REACT_DOM_NOT_NATIVE '+report.length);
  }
}catch(e){
  if(outcome.visualStatus==='RUNNING')outcome.visualStatus='FAIL';
  if(outcome.functionalStatus==='RUNNING')outcome.functionalStatus='FAIL';
  await writeFile(join(output,'adblock-preview-chrome.json'),JSON.stringify({
    ...outcome,status:'FAIL',failure:String(e?.stack||e),checks:report},null,2)+'\n');
  await writeFile(join(output,'adblock-failure.txt'),String(e?.stack||e));
  if(activePreview)try{await evidence('failure',activePreview.ctx,activePreview.built);}catch{}
  console.error('ADBLOCK_PREVIEW_CHROME_FAIL '+(e?.stack||e));
  process.exitCode=1;
}finally{
  try{socket?.close();}catch{}
  let cleanupFailure;
  try{
    await stopChrome();
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }catch(e){
    cleanupFailure=e.message;
    console.error('ADBLOCK_PREVIEW_CLEANUP_FAIL '+e.message);process.exitCode=1;
  }
  const reportPath=join(output,'adblock-preview-chrome.json');
  const saved=await readFile(reportPath,'utf8').then(JSON.parse).catch(()=>({...outcome,status:'EVIDENCE_CAPTURED'}));
  await writeFile(reportPath,JSON.stringify({...saved,cleanupStatus:cleanupFailure?'FAIL':'PASS',
    ...(cleanupFailure?{status:'FAIL',cleanupFailure}:{})},null,2)+'\n');
}

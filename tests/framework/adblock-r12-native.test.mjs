// Real macOS Chrome for Testing smoke: reviewed install, native permission,
// actual HTTP image network, DNR readback, global switch, per-site bypass,
// Chrome worker recovery, tool disable/revoke, required DNR and uninstall.
// No mocked DNR, artificial rule insertion, synthetic click or storage seeding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const BIN=process.env.CHROME_BIN,ROOT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_ROOT||'dist/production');
const OUT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_EVIDENCE||'artifacts/adblock-r12-native');
const ENABLED=process.env.OPENDESK_ADBLOCK_NATIVE==='1';
const STORE='opendesk.adblock.state.v1',F=741000,L=741199;
const nativeCallTrace=[];
const nativeCallTraceIds=new Set();
function connect(url){
  const ws=new WebSocket(url),waiting=new Map(),events=[];let serial=0;
  const ready=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const obj=JSON.parse(event.data),row=waiting.get(obj.id);
    if(!row){if(obj.method){events.push(obj);if(events.length>5000)events.shift();
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
    waiting.set(id,{resolve,reject,timeout});
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
    'Chrome must report a real SIDE_PANEL document');
  const expected=new URL(context.documentUrl);
  return until(async()=>{
    const targets=(await c.send('Target.getTargets')).targetInfos
      .filter(x=>!excludeIds.includes(x.targetId)&&
        (x.type==='page'||x.type==='other')&&x.url?.startsWith(expected.origin+expected.pathname));
    for(const target of targets){
      try{
        const session=await attach(c,target.targetId);
        const realPanel=await evaluate(c,session,
          '!!document.querySelector("#tab-tools")&&!!document.querySelector("#sidebar-tool-frame")');
        if(realPanel)return {target,session};
      }catch{/* An unready target is not proof of a Side Panel. */}
    }
    return null;
  },'real Side Panel CDP target with verified panel DOM',25000);
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
  await until(()=>evaluate(c,session,
    '!!document.querySelector(".adblock-app")&&'+
    '!!document.querySelector("[role=switch][aria-label=\\"全局广告拦截\\"]")'),
    'installed React App and React Aria switch mounted',25000);
  return session;
}
async function reactSwitch(c,session,label){
  return evaluate(c,session,
    '(()=>{const input=document.querySelector("[role=switch][aria-label="+'+
    JSON.stringify(label)+
    '+"]");return input?{on:input.checked===true||input.getAttribute("aria-checked")==="true",'+
    'disabled:input.disabled===true||input.getAttribute("aria-disabled")==="true"}:null;})()');
}
async function requestReactReview(c,side,react,selector,expectedCopy){
  await clickSandbox(c,side,react,selector);
  const review=await until(()=>evaluate(c,side,
    '(()=>{const panel=document.getElementById("sidebar-tool-action-review");'+
    'if(!panel||panel.hidden)return null;return {'+
    'summary:document.getElementById("sidebar-tool-action-summary")?.textContent,'+
    'button:document.getElementById("sidebar-tool-action-continue")?.textContent};})()'),
    'trusted Host approval review for real React input');
  assert.ok(review.summary?.includes(expectedCopy),
    'review must describe the exact React operation: '+JSON.stringify(review));
  return review;
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
  if(typeof document==='undefined'||location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.id||
    globalThis.__adblockNativeObserved)return;
  globalThis.__adblockNativeObserved=true;
  const record=value=>console.debug('ADBLOCK_NATIVE_CALL '+JSON.stringify({
    eventId:crypto.randomUUID(),at:new Date().toISOString(),url:location.href,...value}));
  record({kind:'context',extensionId:chrome.runtime.id,manifest:chrome.runtime.getManifest(),
    world:'trusted_document'});
  const errorValue=error=>({name:error?.name,code:error?.code,
    message:error?.message,stack:error?.stack});
  for(const [owner,name] of [[chrome.permissions,'contains'],[chrome.permissions,'request'],
    [chrome.permissions,'remove'],[chrome.runtime,'sendMessage'],
    [chrome.declarativeNetRequest,'getDynamicRules'],
    [chrome.declarativeNetRequest,'updateDynamicRules']]){
    if(typeof owner?.[name]!=='function')continue;
    const original=owner[name];
    owner[name]=function(...args){
      const message=args.find(value=>value&&typeof value==='object');
      const observed=name!=='sendMessage'||message?.operation?.startsWith('adblock.');
      if(!observed)return Reflect.apply(original,this,args);
      const callId=crypto.randomUUID();
      record({kind:'call',name,callId,args:message,stack:new Error('native call').stack,
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
  for(const type of ['pointerdown','click'])document.addEventListener(type,event=>{
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
        return {x:mx,y:my,rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},
          visible,disabled:!!x.disabled,inViewport,hit:visible&&!x.disabled&&inViewport&&x.contains(hitNode),
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
test('macOS Chrome actual AdBlock DNR and network lifecycle',
  {skip:!ENABLED,timeout:680000},async t=>{
  assert.equal(process.platform,'darwin');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,'Chrome for Testing must exist');
  await mkdir(OUT,{recursive:true});
  const bytes=await readFile(path.join(ROOT,'official-tools/adblock/adblock.opendesk-tool.json'));
  const pkg=JSON.parse(bytes);
  const sourceConfig=JSON.parse(await readFile(
    path.resolve('examples/sidebar-tools/adblock/tool.config.json'),'utf8'));
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
    root:ROOT,driverSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    artifactPackageHash:(await packageFingerprint(ROOT)).packageHash,
    swSHA256:createHash('sha256').update(runtimeBytes).digest('hex'),
    manifestSHA256:createHash('sha256').update(manifestBytes).digest('hex'),
    chromeBin:BIN,packageSHA256:createHash('sha256').update(bytes).digest('hex'),
    env:'real-macos-chrome',status:'NOT_TESTED',nativePermission:'NOT_TESTED',
    network:'NOT_TESTED',globalToggle:'NOT_TESTED',siteException:'NOT_TESTED',
    otherSite:'NOT_TESTED',iframe:'NOT_TESTED',closedPanel:'NOT_TESTED',
    restoreCancellation:'NOT_TESTED',workerStoppedDnr:'NOT_TESTED',
    workerRestart:'NOT_TESTED',browserRestart:'NOT_TESTED',upgrade:'NOT_TESTED',coexistence:'NOT_TESTED',
    physicalWidths:{status:'NOT_TESTED',requested:[320,360,400,480],
      reason:'This driver has no native Side Panel splitter adapter; viewport emulation does not prove physical width.'},
    revocation:'NOT_TESTED',uninstall:'NOT_TESTED',checks:[],screenshots:[],evidenceErrors:[]};
  const preserve=async(file,data)=>{
    try{await writeFile(path.join(OUT,file),data);}
    catch(error){
      const message=file+': '+String(error.message||error);
      report.evidenceErrors.push(message);console.error('ADBLOCK_EVIDENCE_FAILURE '+message);
    }
  };
  const note=(name,record)=>{report.checks.push({name,...record});console.log('ADBLOCK_NATIVE '+name+' '+JSON.stringify(record));};
  const counts={ad:0,normal:0,frameAd:0,framePage:0},serverRequests=[];
  let port;
  const server=createServer((req,res)=>{
    const uri=new URL(req.url,'http://placeholder'),hostname=(req.headers.host||'').split(':')[0];
    serverRequests.push({at:new Date().toISOString(),hostname,path:uri.pathname,query:uri.search});
    res.setHeader('cache-control','no-store');res.setHeader('access-control-allow-origin','*');
    if(uri.pathname==='/page'){
      res.setHeader('content-type','text/html;charset=utf-8');
      res.end('<!doctype html><title>AdBlock controlled page</title><h1>Network fixture ready</h1>');
    }else if(uri.pathname==='/frame'){
      counts.framePage++;
      res.setHeader('content-type','text/html;charset=utf-8');
      const image='http://zedo.com:'+port+'/frame-pixel?nonce='+encodeURIComponent(uri.searchParams.get('n')||'');
      res.end('<!doctype html><h1>iframe served</h1><img src="'+image+'">');
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
  const adUrl=()=> 'http://zedo.com:'+port+'/ad-pixel?nonce='+randomUUID();
  const normalUrl=()=> 'http://127.0.0.1:'+port+'/normal-pixel?nonce='+randomUUID();
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-adblock-r12-'));
  const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--password-store=basic','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--no-proxy-server','--remote-allow-origins=*',
    '--host-resolver-rules=MAP zedo.com 127.0.0.1, EXCLUDE localhost',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+ROOT,
    '--load-extension='+ROOT,'about:blank'];
  if(process.env.OPENDESK_ADBLOCK_CHROME_DIAGNOSTICS==='1')argv.unshift(
    '--enable-logging=stderr','--vmodule=*declarative_net_request*=2,*ruleset*=2,*data_decoder*=2');
  report.browserSessions=[];
  const launch=()=>{
    const child=spawn(BIN,argv,{stdio:['ignore','ignore','pipe']});
    report.browserSessions.push({pid:child.pid,profile,root:ROOT,chromeBin:BIN,
      launchedAt:new Date().toISOString(),manifestSHA256:report.manifestSHA256});
    child.once('exit',(code,signal)=>Object.assign(
      report.browserSessions.find(session=>session.pid===child.pid),
      {exitedAt:new Date().toISOString(),code,signal}));
    return child;
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
      if(client)await preserve('cdp-events.json',JSON.stringify(client.events,null,2)+'\n');
      if(client)try{await client.send('Browser.close');}catch{}
      client?.close();
      if(chrome.exitCode===null&&chrome.signalCode===null){
        chrome.kill('SIGTERM');await pause(1200);
        if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
      }
      await new Promise(resolve=>server.close(resolve));
      if(path.basename(profile).startsWith('opendesk-adblock-r12-')&&path.dirname(profile)===tmpdir())
        await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
    }finally{
      report.serverCounts=counts;
      await preserve('server-requests.json',JSON.stringify(serverRequests,null,2)+'\n');
      await preserve('native-call-trace.json',JSON.stringify(nativeCallTrace,null,2)+'\n');
      report.chromeErrorTail=errors.slice(-1000);
      await preserve('chrome-stderr.log',errors);
      report.success=passed&&report.evidenceErrors.length===0;
      report.status=report.success?'PASS':'FAIL_OR_BLOCKED_NATIVE';
      await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
      assert.equal(report.evidenceErrors.length,0,'raw evidence writes must succeed');
    }
  });
  async function connected(){
    const debugPort=await until(async()=>{
      const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
      const port=Number(source?.split('\n')[0]);return port>0?port:null;
    },'native Chrome CDP port',30000);
    const raw=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version')).json();
    const socket=connect(raw.webSocketDebuggerUrl);await socket.ready;
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
  const workerSession=(await client.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},workerSession);
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
  assert.deepEqual(await evaluate(client,uid,'chrome.runtime.getManifest()'),manifest,
    'actually loaded extension manifest must match ROOT/manifest.json');
  await click(client,uid,'#catalog-open-dev-sidebar');
  const context=await until(async()=>{
    const entries=await evaluate(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return entries.find(x=>x.documentUrl?.includes('/sidepanel.html')&&x.documentId)||null;
  },'actual Side Panel document');
  // A Chrome SIDE_PANEL context may use a canonical URL, while the actual
  // page target appends ?hostInstanceId=... . Check panel DOM before binding.
  const initialPanel=await attachActualPanel(client,context,[ui.targetId]);
  let panel=initialPanel.target,sid=initialPanel.session;
  report.nativePanel={documentId:context.documentId,contextUrl:context.documentUrl,
    targetId:panel.targetId,targetUrl:panel.url,targetType:panel.type};
  await click(client,sid,'#tab-tools');
  // The R4 extension center is the only visible installation surface. The
  // historical discovery button still exists in markup but is CSS-hidden.
  await until(()=>evaluate(client,sid,'!document.querySelector("#workbench-tools").hidden'),
    'real Extension Center tab is selected');
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
  const installed='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="primary"]';
  const openInstalled=async session=>{
    await until(()=>evaluate(client,session,'(()=>{const list=document.querySelector("#extension-center-list");'+
      'const b=document.querySelector('+JSON.stringify(installed)+'),row=b?.closest("li");'+
      'return list?.getAttribute("aria-busy")==="false"&&!!row&&'+
      'row.getAttribute("aria-busy")!=="true"&&!!b&&!b.disabled&&b.textContent.trim()==="打开";})()'),
      'installed AdBlock list and row finish refreshing before a single real Open click');
    await click(client,session,installed);
  };
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+
    JSON.stringify(installed)+');return !!b&&!b.disabled&&b.textContent.trim()==="打开"})()'),
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
  report.screenshots.push(await screenshot(client,sid,'adblock-installed-react-off'));
  if(process.env.OPENDESK_ADBLOCK_NATIVE_MANUAL_LAYOUT==='1'){
    await writeFile(path.join(OUT,'manual-layout-ready.json'),JSON.stringify({
      profile,extensionId:id,panelTargetId:panel.targetId,reactSession:react,root:ROOT},null,2)+'\n');
    await until(async()=>{try{return (await readFile(path.join(OUT,'manual-layout-continue'),'utf8')).trim()==='continue';}
      catch{return false;}},'native physical splitter review',180000);
  }
  // The host toolbar Settings message navigates the installed React product,
  // not a detached, retired native AdBlock screen.
  await click(client,sid,'#sidebar-tool-settings-open');
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-app")?.textContent.includes("设置说明")'),
    'trusted toolbar opens installed React settings');
  await clickSandbox(client,sid,react,'button[aria-label="返回广告拦截概览"]');
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-app")?.textContent.includes("全局保护")'),
    'React settings return to real overview');
  note('react-installed-settings-navigation',{opened:true,returned:true});

  const globalLabel='全局广告拦截';
  const globalSelector='label.od-shared-switch:has([role="switch"][aria-label="全局广告拦截"])';
  const currentSelector='label.od-shared-switch:has([role="switch"][aria-label="当前网站广告过滤"])';
  await until(async()=>{
    const x=await reactSwitch(client,react,globalLabel);return x&&!x.disabled&&!x.on;
  },'installed React starts with global protection OFF');
  const beforeEnable=await getOwned(client,uid);
  assert.equal(beforeEnable.owned.length,0,'fresh install must not auto-block');
  assert.equal((await probe(client,site,adUrl())).success,true,'fresh installation must allow the ad before opt-in');
  await requestReactReview(client,sid,react,globalSelector,'开启全局过滤');
  assert.equal((await getOwned(client,uid)).owned.length,0,
    'React requesting approval must not write DNR early');
  await approveReactReview(client,sid);
  const enabled=await until(async()=>{
    const result=await getOwned(client,uid);
    const ui=await reactSwitch(client,react,globalLabel);
    return result.state?.enabled===true&&result.owned.some(x=>x.id===F)&&ui?.on?result:null;
  },'real React ON, trusted Host, Chrome DNR readback',25000);
  assert.equal(enabled.owned.find(x=>x.id===F).condition.domainType,'thirdParty');
  const beforeBlock=counts.ad;
  const blocked=await probe(client,site,adUrl());
  assert.equal(blocked.success,false,'real Chrome must block matching network image');
  assert.equal(blocked.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  assert.equal(counts.ad,beforeBlock,'blocked ad MUST NOT reach local HTTP server');
  assert.equal((await probe(client,site,normalUrl())).success,true);
  report.network='PASS';note('real-react-network-block',{
    request:blocked,adServerHits:counts.ad,ownedRules:enabled.owned.map(x=>x.id)});

  await requestReactReview(client,sid,react,globalSelector,'关闭全局过滤');
  await approveReactReview(client,sid);
  await until(async()=>{
    const r=await getOwned(client,uid),ui=await reactSwitch(client,react,globalLabel);
    return r.state?.enabled===false&&r.owned.length===0&&ui&&!ui.on;
  },'React OFF and real DNR removal');
  const paused=await probe(client,site,adUrl());
  assert.equal(paused.success,true,'real HTTP ad request must resume after OFF');
  await requestReactReview(client,sid,react,globalSelector,'开启全局过滤');
  await approveReactReview(client,sid);
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
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-host")?.textContent.trim()==="127.0.0.1"'),
    'real current-site identity from Chrome');
  const currentLabel='当前网站广告过滤';
  await until(async()=>{
    const x=await reactSwitch(client,react,currentLabel);return x&&!x.disabled&&x.on;
  },'React site switch enabled for the current HTTP website');
  await requestReactReview(client,sid,react,currentSelector,'关闭 127.0.0.1 的广告过滤');
  await approveReactReview(client,sid);
  await until(async()=>{
    const r=await getOwned(client,uid),ui=await reactSwitch(client,react,currentLabel);
    return r.state?.exceptions?.includes('127.0.0.1')&&
      r.owned.some(x=>x.action?.type==='allowAllRequests')&&ui&&!ui.on;
  },'real website A exception, allowAllRequests and React readback');
  await client.send('Page.reload',{ignoreCache:true},site);
  await until(()=>evaluate(client,site,'document.readyState==="complete"'),
    'real page A refresh after exception');
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
  const beforeRestoreRules=await evaluate(client,uid,'chrome.declarativeNetRequest.getDynamicRules()');
  const sortedRules=rules=>[...rules].sort((a,b)=>a.id-b.id);
  await requestReactReview(client,sid,react,restoreSelector,'恢复 127.0.0.1 的广告过滤');
  assert.deepEqual(await getOwned(client,uid),beforeRestore,'review cannot restore without trusted click');
  await click(client,sid,'#sidebar-tool-action-cancel');
  await until(()=>evaluate(client,sid,'document.getElementById("sidebar-tool-action-review")?.hidden===true'),
    'Cancel closes trusted Host review');
  await until(()=>evaluate(client,react,
    'document.querySelector(".adblock-notice")?.textContent.includes("已取消")'),
    'React displays user cancellation without claiming a write');
  const cancelled=await getOwned(client,uid);
  assert.deepEqual(cancelled.state,beforeRestore.state,'Cancel preserves stored exceptions');
  assert.deepEqual(sortedRules(await evaluate(client,uid,'chrome.declarativeNetRequest.getDynamicRules()')),
    sortedRules(beforeRestoreRules),'Cancel leaves all Chrome DNR rules unchanged');
  await client.send('Page.reload',{ignoreCache:true},site);
  await until(()=>evaluate(client,site,'document.readyState==="complete"'),
    'site A reload after cancel');
  assert.equal((await probe(client,site,adUrl())).success,true,
    'cancelled restore must not suppress website A exception');
  report.restoreCancellation='PASS';
  await requestReactReview(client,sid,react,restoreSelector,'恢复 127.0.0.1 的广告过滤');
  await approveReactReview(client,sid);
  await until(async()=>{
    const r=await getOwned(client,uid);
    return r.state?.exceptions?.length===0&&r.owned.length===1?r:null;
  },'real React restoration and Chrome DNR readback');
  await client.send('Page.reload',{ignoreCache:true},site);
  await until(()=>evaluate(client,site,'document.readyState==="complete"'),
    'site A reload after restore');
  assert.equal((await probe(client,site,adUrl())).network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  note('react-site-restored',{exceptions:0});

  await clickSandbox(client,sid,react,'button[aria-label="返回广告拦截概览"]');
  // Genuine Side Panel keyboard input must traverse into the React Aria input.
  // Do not invoke input.focus() or synthesize DOM keyboard events.
  let focused=false;
  for(let i=0;i<60;i++){
    if(await evaluate(client,react,
      'document.activeElement?.getAttribute("aria-label")==="全局广告拦截"')){focused=true;break;}
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
      {type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sid);
  }
  assert.equal(focused,true,'physical Tab must reach installed React global switch');
  for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
    {type,key:' ',code:'Space',windowsVirtualKeyCode:32},sid);
  await until(()=>evaluate(client,sid,
    'document.getElementById("sidebar-tool-action-review")?.hidden===false'),
    'Space on React Aria Switch requests trusted review');
  await approveReactReview(client,sid);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===false&&r.owned.length===0;},'Space OFF removes real rules');
  assert.equal((await probe(client,site,adUrl())).success,true);
  await until(()=>evaluate(client,react,
    'document.querySelector("[role=switch][aria-label=\\"全局广告拦截\\"]")?.disabled===false'),
    'React switch action completes');
  // One more physical Tab/Space cycle may be needed because trusted review
  // moves focus back to the Side Panel; never force focus from JavaScript.
  focused=false;
  for(let i=0;i<60;i++){
    if(await evaluate(client,react,
      'document.activeElement?.getAttribute("aria-label")==="全局广告拦截"')){focused=true;break;}
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
      {type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sid);
  }
  assert.equal(focused,true,'React Aria remains keyboard reachable after OFF');
  for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',
    {type,key:' ',code:'Space',windowsVirtualKeyCode:32},sid);
  await until(()=>evaluate(client,sid,
    'document.getElementById("sidebar-tool-action-review")?.hidden===false'),
    'Space ON requests trusted review');
  await approveReactReview(client,sid);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===true&&r.owned.some(x=>x.id===F);},'Space ON restores DNR');
  assert.equal((await probe(client,site,adUrl())).network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  note('react-keyboard-tab-space',{keyboardTrusted:true,hostReviewed:true});

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
  const stoppedVersions=client.events.slice(stoppedEventStart)
    .filter(x=>x.sessionId===uid&&x.method==='ServiceWorker.workerVersionUpdated')
    .flatMap(x=>x.params.versions).filter(x=>x.scriptURL===workerUrl&&x.runningStatus==='stopped');
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
  assert.deepEqual(recoveredStatus.data.rules.ruleIds,[F]);
  assert.deepEqual(recoveredStatus.data.exceptions,[]);
  const recoveredWorker=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.type==='service_worker'&&x.url===workerUrl),'new worker target after status wake request');
  assert.notEqual(recoveredWorker.targetId,runningWorker.targetId,'wake must create a new worker target');
  const afterWorker=await getOwned(client,uid);
  assert.deepEqual(afterWorker.state,beforeWorker.state,'worker recovery must preserve durable filtering intent');
  assert.deepEqual(sortedRules(afterWorker.owned),sortedRules(beforeWorker.owned));
  assert.deepEqual(sortedRules(afterWorker.focus),sortedRules(beforeWorker.focus));
  const recoveredRequest=await probe(client,site,adUrl());
  assert.equal(recoveredRequest.success,false,'actual filtering must still work after worker service recovery');
  assert.equal(recoveredRequest.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
  report.workerRecovery={beforeTargetId:runningWorker.targetId,afterTargetId:recoveredWorker.targetId,
    stoppedVersions,request:statusMessage,response:recoveredStatus,stoppedRequest,recoveredRequest};
  report.workerRestart='PASS';
  note('actual-worker-stop-wake-and-service-recovery',report.workerRecovery);

  const prior=chrome;
  await client.send('Browser.close').catch(()=>{});
  await until(()=>prior.exitCode!==null||prior.signalCode!==null,'real Chrome browser exited',25000);
  client.close();client=null;
  await rm(path.join(profile,'DevToolsActivePort'),{force:true});
  chrome=launch();capture(chrome);
  first=await connected();client=first.socket;
  const idAgain=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'extension after actual full Chrome restart',25000);
  assert.equal(idAgain,id,'extension ID must not change across restart');
  const uiAgain=await client.send('Target.createTarget',
    {url:'chrome-extension://'+id+'/sidepanel.html?hostInstanceId='+randomUUID()});
  const again=await attach(client,uiAgain.targetId);
  const persisted=await until(async()=>{const r=await getOwned(client,again);
    return r.state?.enabled===true&&r.owned.length===1?r:null;},'persistent DNR after Chrome restart');
  const visitAgain=await client.send('Target.createTarget',{url:page});
  const pageAgain=await attach(client,visitAgain.targetId);
  await until(()=>evaluate(client,pageAgain,'document.querySelector("h1")?.textContent==="Network fixture ready"'),'restarted HTTP page');
  assert.equal((await probe(client,pageAgain,adUrl())).success,false,'real filtering survives browser restart');
  report.browserRestart='PASS';note('actual-chrome-restart',{sameExtensionId:idAgain,owned:persisted.owned.length});

  // Simulates user revoking an optional permission through Chrome's API.
  // The native permission is removed, not merely a mocked storage flag.
  const revoked=await evaluate(client,again,
    'chrome.permissions.remove({permissions:["declarativeNetRequestWithHostAccess"]})');
  assert.equal(revoked,true,'actual Chrome optional permission must be removable');
  await until(async()=>{
    const state=await evaluate(client,again,'chrome.storage.local.get('+JSON.stringify(STORE)+')');
    return state?.[STORE]?.enabled===false?state:null;
  },'worker handles native permission removal');
  report.revocation='PASS_STATE_AND_NATIVE_PERMISSION';
  note('native-permission-revoked',{adblockIntent:false});
  const revokedStatus=await evaluate(client,again,
    'chrome.runtime.sendMessage('+JSON.stringify(statusMessage)+')');
  assert.equal(revokedStatus?.ok,true);
  assert.equal(revokedStatus.data.permissions.dnr,false);
  assert.equal(revokedStatus.data.rules.verified,false);
  assert.equal(revokedStatus.data.restartRequired,true,
    'lost DNR access must expose unconfirmed matcher cleanup until browser restart');
  report.revocationStatus=revokedStatus;
  await click(client,again,'#catalog-open-dev-sidebar');
  const revokedContext=await until(()=>evaluate(client,again,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x.find(c=>c.documentUrl.includes("/sidepanel.html")))'),
    'Side Panel after native revocation');
  const revokedPanel=await until(async()=>(await client.send('Target.getTargets')).targetInfos
    .find(x=>x.url===revokedContext.documentUrl),'revoked Side Panel target');
  sid=await attach(client,revokedPanel.targetId);
  await click(client,sid,'#tab-tools');await openInstalled(sid);
  const warning=await until(()=>evaluate(client,sid,
    '(()=>{const n=document.querySelector("#sidebar-tool-adblock-native");'+
    'return n?.textContent.includes("权限已撤销")&&n.textContent.includes("停止过滤尚未确认")?n.textContent:null;})()'),
    'actual trusted UI warns that revocation has not confirmed network cleanup');
  report.revocationWarning=warning;
  report.screenshots.push(await screenshot(client,sid,'native-permission-revoked-restart-warning'));
  const revocationSamples=[];
  const revokedRequest=await until(async()=>{
    const request=await probe(client,pageAgain,adUrl());
    revocationSamples.push({at:new Date().toISOString(),...request});
    report.revocationSamples=revocationSamples;
    return request.success?request:null;
  },'native permission removal propagates to actual network requests',12000);
  assert.equal(revokedRequest.success,true,'native permission revocation must actually restore network');
  report.revocation='PASS';
  note('revoked-network-restored',{request:revokedRequest,adServerHits:counts.ad});
  // Native revocation may make DNR API inaccessible; do not infer removal
  // of persisted rule bytes without native network and re-grant evidence.

  // Existing installed tools must uninstall through shipped UI, not by writing
  // directly into storage or mocking onRemoved.
  await click(client,again,'#catalog-open-dev-sidebar');
  const ctx=await until(async()=>{
    const contexts=await evaluate(client,again,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(x=>x.documentUrl?.includes('/sidepanel.html')&&x.documentId);
  },'reopened Side Panel for uninstallation');
  const target=await until(async()=>{const all=(await client.send('Target.getTargets')).targetInfos;
    return all.find(x=>x.url===ctx.documentUrl)||null;},'reopened Side Panel target');
  sid=await attach(client,target.targetId);
  await click(client,sid,'#tab-tools');
  await openInstalled(sid);
  await click(client,sid,'#sidebar-tool-remove');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(()=>evaluate(client,again,
    '(async()=>{const all=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1",'+
    JSON.stringify(STORE)+']);return !all["opendesk.sidebar-tools.installed.v1"]?.some(x=>x.id==="adblock")&&'+
    '!Object.hasOwn(all,'+JSON.stringify(STORE)+');})()'), 'actual uninstall and data cleared');
  assert.equal((await probe(client,pageAgain,adUrl())).success,true,
    'after native permission removal and uninstall real requests must load');
  report.uninstall='PASS';
  assert.equal((await packageFingerprint(ROOT)).packageHash,report.artifactPackageHash,
    'loaded artifact bytes must remain stable through Native acceptance');
  passed=true;
  note('uninstall-clears-product-data',{stillInstalled:false,realNetworkRestored:true});
  report.screenshots.push(await screenshot(client,sid,'adblock-final-uninstalled'));
});

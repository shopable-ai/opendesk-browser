#!/usr/bin/env node
// Real ToolHost + real presentation store/CSS. Controller callbacks below are fixtures.
// Own headless CFT only; never attaches to an existing browser or installs an extension.
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, rm, mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, dirname, join, relative, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, stop} from 'esbuild';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
// Optional CI output directory; relative paths follow the caller's cwd.
const out=resolve(process.argv[2] || join(root,'artifacts/prompt-shortcuts-r42-local/host'));
const binary=process.env.CHROME_BIN || join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={kind:'REAL_TOOLHOST_CHROMIUM_SIMULATED_CONTROLLER',startedAt:new Date().toISOString(),
  scope:{real:['ToolHost','createSidebarToolsView','TrustedConversationWorkspace','existing CSS'],simulated:['controller state/actions','AI controller with no provider request'],installedAcceptance:'NOT_TESTED',nativeCUA:'NOT_USED; URL-denial bypass prohibited',zoom:'CSS zoom 2 plus separately labeled 200% effective viewport (half CSS viewport, DPR 2); neither is native browser chrome zoom'},checks:[],scenes:[],screenshots:{},errors:[]};
let child,exitPromise,server,cdp,profile,session;
class CDP {
  constructor(ws){this.ws=ws;this.seq=0;this.pending=new Map();
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    ws.addEventListener('close',()=>this.closePending());
  }
  closePending(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}this.pending.clear();}
  call(method,params={},sid){return new Promise((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method));},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
}
const call=(m,p)=>cdp.call(m,p,session);
async function evaluate(fn,...args){const r=await call('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function settle(){await evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
function check(name,pass,evidence){report.checks.push({name,category:name.includes('css-zoom-200')?'diagnostic':'gate',pass:!!pass,evidence});if(!pass)console.log('FAIL '+name);}
async function click(selector){const r=await evaluate(s=>{const n=document.querySelector(s);if(!n||!n.getClientRects().length||n.closest('[hidden],[inert]'))throw Error('Not visible '+s);n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...r});await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});await settle();}
async function key(key,shift=false){const code={Tab:9,Escape:27,Enter:13}[key];await call('Input.dispatchKeyEvent',{type:key==='Enter'?'keyDown':'rawKeyDown',key,code:key,windowsVirtualKeyCode:code,...(key==='Enter'?{text:'\r'}:{}),modifiers:shift?8:0});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code,modifiers:shift?8:0});await settle();}
const visible=selector=>evaluate(s=>{const n=document.querySelector(s);return !!n&&!n.closest('[hidden]')&&!!n.getClientRects().length;},selector);
const focus=selector=>evaluate(s=>document.querySelector(s).focus(),selector);
const focused=()=>evaluate(()=>document.activeElement.id||document.activeElement.getAttribute('aria-label'));
async function screenshot(name){const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(data,'base64');await writeFile(join(out,name+'.png'),bytes);report.screenshots[name+'.png']=sha(bytes);}
async function geometry(){return evaluate(()=>{
  const vis=n=>n.getClientRects().length&&!n.closest('[hidden]');
  const rect=n=>{const r=n.getBoundingClientRect();return {id:n.id||n.getAttribute('aria-label')||n.tagName,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
  const head=document.querySelector('.sidebar-tool-view-head');
  const controls=[...head.querySelectorAll('button')].filter(vis).map(rect);
  const title=rect(document.querySelector('#sidebar-tool-title'));
  const peers=[title,...controls],overlaps=[];
  for(let i=0;i<peers.length;i++)for(let j=i+1;j<peers.length;j++){
    const a=peers[i],b=peers[j];
    if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&
       Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push([a.id,b.id]);
  }
  const escaped=[...document.querySelectorAll('button,strong,[role="dialog"]')]
    .filter(vis).map(rect).filter(r=>r.x< -1||r.right>innerWidth+1);
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
  const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
  const tooltipOwner=document.querySelector('#sidebar-tool-settings-open');
  const focusTooltip={focusVisible:Boolean(tooltipOwner?.matches(':focus-visible')),
    content:tooltipOwner?getComputedStyle(tooltipOwner,'::after').content:null};
  return {focusTooltip,innerWidth,scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,zoom:getComputedStyle(document.body).zoom,
    coarse:matchMedia('(pointer:coarse)').matches,controls,title,rows:[],menu:null,
    overlaps,rowOverlaps:[],escaped,duplicates};
});}
const entry=`
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {ToolHost} from './src/ui/react/tabs/tool-host.tsx';
import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
import {TrustedConversationWorkspace} from './src/ui/react/components/conversation.tsx';
import './src/ui/design-tokens.css';
import './src/ui/design-system.css';
import './src/ui/tool-shell.css';
import './src/ui/cloud-hosting.css';
import './src/ui/extension-center.css';
import './src/ui/react/components/conversation-dock.css';
const h=React.createElement,view=createSidebarToolsView(),events=[];
window.fixture={view,events};
const patch=(id,values)=>view.patch('sidebar-tool-'+id,values);
for(const id of ['cookie-permissions','bookmark-permissions'])patch(id,{hidden:true});
patch('display',{hidden:false});patch('title',{textContent:'提示词快捷工具 · 长标题共享 Host 回归'});
for(const id of ['primary-action','secondary-action','settings-open','visibility','context-menu','remove'])patch(id,{hidden:false,disabled:false});
patch('primary-action',{data:{action:'new'}});patch('secondary-action',{data:{action:'transfer'}});
patch('inline-remove-text',{textContent:'仅模拟 controller：确认不会卸载真实扩展。'});
const record=(id,e)=>events.push({id,type:e.type,trusted:e.isTrusted,constructor:e.constructor.name});
for(const id of ['primary-action','secondary-action','settings-open','visibility','context-menu','remove','inline-remove-cancel','inline-remove-confirm','back','open-tab'])view.bind('sidebar-tool-'+id,'click',e=>{
 record(id,e);
 if(id==='settings-open'){patch('settings-view',{hidden:!view.fields['sidebar-tool-settings-view'].hidden});patch('settings-open',{attributes:{'aria-expanded':String(!view.fields['sidebar-tool-settings-view'].hidden)}});}
 if(id==='visibility'||id==='context-menu'){const f=view.fields['sidebar-tool-'+id];patch(id,{attributes:{'aria-pressed':String(f.attributes['aria-pressed']!=='true')}});}
 if(id==='remove')patch('inline-remove',{hidden:false});
 if(id==='inline-remove-cancel'||id==='inline-remove-confirm')patch('inline-remove',{hidden:true});
});
const ai={readSession:()=>({}),saveSession(){},request(){throw Error('Provider requests forbidden in fixture');}};
function Ai(){const [target,setTarget]=React.useState(null);React.useLayoutEffect(()=>setTarget(document.getElementById('sidebar-tool-chat-slot')),[]);return target?createPortal(h(TrustedConversationWorkspace,{controller:ai,headerTarget:target,renderBusiness:()=>null}),view.runtime.frameRoot):null;}
createRoot(document.getElementById('opendesk-react-app')).render(h(React.Fragment,null,h(ToolHost,{view}),h(Ai)));
`;
try{
  if(process.env.CDP_PORT)throw Error('CDP_PORT forbidden: own headless browser only');
  if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim()!=='main')throw Error('main required');
  await mkdir(out,{recursive:true});
  const compiledSources={};
  const sourceIdentityPlugin={name:'record-compiled-source-bytes',setup(builder){
    builder.onLoad({filter:/\.(?:tsx?|js|css)$/},async({path})=>{
      if(!path.startsWith(join(root,'src')+'/'))return;
      const bytes=await readFile(path);compiledSources[relative(root,path)]=sha(bytes);
      return {contents:bytes,loader:extname(path).slice(1)};
    });
  }};
  const result=await build({plugins:[sourceIdentityPlugin],stdin:{contents:entry,resolveDir:root,loader:'jsx'},bundle:true,write:false,outdir:out,entryNames:'harness',format:'iife',platform:'browser',jsx:'transform',metafile:true,define:{'process.env.NODE_ENV':'"production"'}});
  report.sources=Object.fromEntries(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('src/')).map(path=>{if(!compiledSources[path])throw Error('Unrecorded compiled input '+path);return [path,compiledSources[path]];}));
  report.scriptSHA256=sha(await readFile(fileURLToPath(import.meta.url)));
  report.harnessSHA256=Object.fromEntries(result.outputFiles.map(f=>[f.path.slice(out.length+1),sha(f.contents)]));
  report.head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  for(const file of result.outputFiles)await writeFile(file.path,file.contents);
  await writeFile(join(out,'entry.jsx'),entry);
  await writeFile(join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Real Host / simulated controller</title><link rel="stylesheet" href="harness.css"><body><div id="opendesk-react-app" class="opendesk-react-app"></div><script src="harness.js"></script></body></html>');
  server=createServer(async(req,res)=>{const file={'/':'index.html','/harness.js':'harness.js','/harness.css':'harness.css'}[req.url];if(!file){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(out,file)));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  profile=await mkdtemp(join(out,'profile-'));
  // Fixture-only Linux CI parity with r111/r113; never an installed environment.
  report.launchFlags=['--headless=new','--disable-dev-shm-usage',...(process.platform==='linux'?['--no-sandbox']:[]),'--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
  report.platform=process.platform;
  child=spawn(binary,report.launchFlags,{stdio:['ignore','ignore','pipe']});
  let launchError;child.once('error',e=>{launchError=e;});let stderr='';child.stderr.on('data',d=>{stderr+=d;});exitPromise=new Promise(r=>child.once('exit',r));
  let port;for(let i=0;i<100;i++){if(launchError)throw launchError;if(child.exitCode!==null)throw Error('CFT exited '+stderr);try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}if(port)break;await pause(100);}if(!port)throw Error('CFT startup timeout '+stderr);
  const discovery=await(await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(10000)})).json();
  const ws=new WebSocket(discovery.webSocketDebuggerUrl);await new Promise((r,j)=>{const timer=setTimeout(()=>{ws.close();j(Error('CDP handshake timeout'));},15000);ws.addEventListener('open',()=>{clearTimeout(timer);r();},{once:true});ws.addEventListener('error',e=>{clearTimeout(timer);j(e);},{once:true});});cdp=new CDP(ws);
  report.browser={binary,pid:child.pid,...await cdp.call('Browser.getVersion')};
  const {targetId}=await cdp.call('Target.createTarget',{url:'about:blank'});({sessionId:session}=await cdp.call('Target.attachToTarget',{targetId,flatten:true}));
  await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:400,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<100;i++){if(await evaluate(()=>!!document.querySelector('#sidebar-tool-chat-slot button')))break;await pause(50);}await settle();
  check('real runtime nodes attached',await evaluate(()=>fixture.view.runtime.frameRoot.id==='sidebar-tool-frame'&&fixture.view.runtime.settingsControl.id==='sidebar-tool-settings-open'));
  check('one AI slot and real AI portal trigger',await evaluate(()=>document.querySelectorAll('#sidebar-tool-chat-slot').length===1&&document.querySelectorAll('#sidebar-tool-chat-slot button').length===1));
  await click('#sidebar-tool-primary-action');await click('#sidebar-tool-secondary-action');
  const managementIds=await evaluate(()=>[...document.querySelectorAll(
    '.sidebar-tool-header-actions button')].filter(node=>node.getClientRects().length&&!node.closest('[hidden]')).map(node=>node.id));
  check('two direct trusted management icon buttons',
    managementIds.join(',')==='sidebar-tool-settings-open,sidebar-tool-remove',managementIds);
  check('no retired overflow trigger',await evaluate(()=>!document.getElementById('sidebar-tool-more-open')));
  check('enable switch is in Settings, not the header',
    await evaluate(()=>!!document.getElementById('sidebar-tool-enable')&&
      !document.querySelector('.sidebar-tool-header-actions #sidebar-tool-enable')));
  await focus('#sidebar-tool-settings-open');await key('Enter');
  check('Enter opens trusted Settings directly',await visible('#sidebar-tool-settings-view'));
  for(const id of ['visibility','context-menu']){
    const prior=await evaluate(id=>document.getElementById('sidebar-tool-'+id).getAttribute('aria-pressed'),id);
    await click('#sidebar-tool-'+id);
    check(id+' toggles within Settings',await evaluate((id,prior)=>
      document.getElementById('sidebar-tool-'+id).getAttribute('aria-pressed')===String(prior!=='true'),id,prior));
  }
  await click('#sidebar-tool-settings-open');
  check('Settings icon closes trusted Settings',!(await visible('#sidebar-tool-settings-view')));
  await focus('#sidebar-tool-settings-open');await key('Tab');
  check('Tab from Settings reaches Uninstall',(await focused())==='sidebar-tool-remove');
  await key('Tab',true);
  check('Shift Tab returns to Settings',(await focused())==='sidebar-tool-settings-open');
  await click('#sidebar-tool-remove');
  check('remove opens real dialog, initial cancel focus',
    await visible('.od-uninstall-dialog')&&(await focused())==='sidebar-tool-inline-remove-cancel');
  await screenshot('uninstall-dialog');
  await key('Tab');check('dialog Tab reaches confirm',(await focused())==='sidebar-tool-inline-remove-confirm');
  await key('Tab');check('dialog Tab wraps to close',(await focused())==='关闭卸载确认');
  await key('Tab',true);check('dialog Shift Tab wraps to confirm',(await focused())==='sidebar-tool-inline-remove-confirm');
  await key('Escape');
  check('dialog Escape cancels and restores Uninstall icon',
    !(await visible('.od-uninstall-dialog'))&&(await focused())==='sidebar-tool-remove');
  await click('#sidebar-tool-remove');await click('#sidebar-tool-inline-remove-confirm');
  check('fixture confirm closes dialog',!(await visible('.od-uninstall-dialog')));
  await click('#sidebar-tool-chat-slot button');
  check('AI slot opens real dock',await visible('#opendesk-conversation-dock'));
  await click('[aria-label="收起对话"]');
  check('AI close returns focus to trigger',(await focused())==='AI 对话');
  await evaluate(()=>fixture.view.patch('sidebar-tool-title',{textContent:'另一个工具 · 切换身份'}));
  await settle();
  check('tool title change retains the two direct management icons',
    await evaluate(()=>document.querySelectorAll('.sidebar-tool-header-actions button').length===2));
  for(const width of [320,360,400,440])for(const coarse of [false,true])
    for(const mode of ['baseline','css-zoom-200','effective-viewport-200']){
    const zoom=mode==='css-zoom-200'?2:1;
    const layoutWidth=mode==='effective-viewport-200'?width/2:width;
    const layoutHeight=mode==='effective-viewport-200'?450:900;
    const id=width+'-'+(coarse?'coarse':'fine')+'-'+mode;
    await call('Emulation.setDeviceMetricsOverride',{
      width:layoutWidth,height:layoutHeight,
      deviceScaleFactor:mode==='effective-viewport-200'?2:1,mobile:false});
    await call('Emulation.setTouchEmulationEnabled',{enabled:coarse,maxTouchPoints:1});
    await evaluate(z=>{document.body.style.zoom=String(z);},zoom);await settle();
    const pointerPark={x:layoutWidth-10,y:layoutHeight-10};
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...pointerPark});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pointerPark});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pointerPark});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...pointerPark});
    await pause(700);await settle();
    const g=await geometry();
    report.scenes.push({id,mode,physicalWidth:width,layoutWidth,layoutHeight,
      pointerPark,tooltipSettleMs:700,...g});
    check(id+' unique IDs',g.duplicates.length===0,g.duplicates);
    check(id+' no horizontal overflow',g.scrollWidth<=layoutWidth+1&&
      g.bodyScrollWidth<=layoutWidth+1&&g.escaped.length===0,
      {scrollWidth:g.scrollWidth,bodyScrollWidth:g.bodyScrollWidth,escaped:g.escaped});
    check(id+' no header action overlaps',g.overlaps.length===0,g.overlaps);
    check(id+' media emulation correct',g.coarse===coarse,{coarse:g.coarse,zoom:g.zoom});
    if(coarse)check(id+' coarse targets >=44 CSS px',
      g.controls.every(r=>r.w/zoom>=43.9&&r.h/zoom>=43.9),g.controls);
    await screenshot(id);report.scenes.at(-1).screenshot=id+'.png';
  }
  await evaluate(()=>{document.body.style.zoom='1';});
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await call('Emulation.setDeviceMetricsOverride',{
    width:400,height:900,deviceScaleFactor:1,mobile:false});await settle();
  await evaluate(()=>fixture.view.patch('sidebar-tool-remove',{disabled:true}));await settle();
  check('disabled remove cannot dispatch',await evaluate(()=>{
    const before=fixture.events.length;
    document.getElementById('sidebar-tool-remove').click();
    fixture.view.dispatch('sidebar-tool-remove','click',new MouseEvent('click'));
    return fixture.events.length===before;
  }));
  await evaluate(()=>{
    for(const id of ['settings-open','remove'])
      fixture.view.patch('sidebar-tool-'+id,{hidden:true});
  });await settle();
  check('management icons hidden when both actions unavailable',
    !(await visible('.sidebar-tool-header-actions')));
  await evaluate(()=>fixture.view.patch('sidebar-tool-settings-open',{hidden:false}));
  await settle();
  check('available Settings icon remains reachable',
    await visible('.sidebar-tool-header-actions'));
  await evaluate(()=>fixture.view.patch('sidebar-tool-display',{hidden:true}));
  await settle();
  check('hiding Host also hides management icons',
    !(await visible('.sidebar-tool-header-actions')));
  await evaluate(()=>fixture.view.patch('sidebar-tool-display',{hidden:false}));
  await settle();
  check('returning to Host restores available management icon',
    await visible('.sidebar-tool-header-actions'));
  const events=await evaluate(()=>fixture.events);report.dispatches=events;
  for(const id of ['primary-action','secondary-action','settings-open','visibility',
    'context-menu','remove','inline-remove-cancel','inline-remove-confirm'])
    check(id+' receives original trusted browser event',
      events.some(e=>e.id===id&&e.trusted),events.filter(e=>e.id===id));
  const expectedCounts={'primary-action':1,'secondary-action':1,
    'settings-open':2,visibility:1,'context-menu':1,remove:2,
    'inline-remove-cancel':1,'inline-remove-confirm':1};
  check('each direct action dispatches exactly once per real gesture',
    Object.entries(expectedCounts).every(([id,count])=>
      events.filter(e=>e.id===id).length===count),events);
  for(const id of ['primary-action','secondary-action','settings-open','visibility','context-menu','remove','inline-remove-cancel','inline-remove-confirm'])check(id+' receives original trusted browser event',events.some(e=>e.id===id&&e.trusted),events.filter(e=>e.id===id));
  check('ordinary actions dispatched exactly once', ['primary-action','secondary-action','settings-open','visibility','context-menu','inline-remove-cancel','inline-remove-confirm'].every(id=>events.filter(e=>e.id===id).length===1),events);
  const drift=[];for(const [path,hash]of Object.entries(report.sources))if(sha(await readFile(join(root,path)))!==hash)drift.push(path);check('source inputs unchanged during run',drift.length===0,drift);
}catch(e){report.errors.push(String(e.stack||e));}
finally{
  stop();if(cdp){cdp.ws.close();cdp.closePending();}
  if(child&&child.exitCode===null&&!child.signalCode){child.kill('SIGTERM');await Promise.race([exitPromise,pause(4000)]);if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await exitPromise;}}
  if(profile){try{await rm(profile,{recursive:true,force:true,maxRetries:3});report.ownedProfileRemoved=true;}catch(e){report.errors.push('Owned profile cleanup: '+e.message);}}
  if(server)await new Promise(r=>server.close(r));
  report.finishedAt=new Date().toISOString();report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,scenes:report.scenes.length};
  report.summary.gates={checks:report.checks.filter(c=>c.category==='gate').length,failed:report.checks.filter(c=>c.category==='gate'&&!c.pass).length};
  report.summary.diagnostics={checks:report.checks.filter(c=>c.category==='diagnostic').length,failed:report.checks.filter(c=>c.category==='diagnostic'&&!c.pass).length};
  report.gatePassed=report.summary.gates.failed===0&&report.scenes.length===24;
  report.runtimePassed=report.errors.length===0;
  report.nativeAcceptance='NOT_TESTED';
  report.result=report.gatePassed&&report.runtimePassed?'PASS':'FAIL';
  // CSS zoom diagnostics never establish native acceptance or control CI success.
  process.exitCode=report.gatePassed&&report.runtimePassed?0:1;
  await mkdir(out,{recursive:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(out,'findings.md'),[
    '# Shared Host Chromium regression',
    'Result: '+report.result+'; '+report.summary.passed+'/'+report.summary.checks+' checks passed, '+report.summary.failed+' failed; '+report.scenes.length+' scenes.',
    'HEAD: '+report.head+'; script SHA256: '+report.scriptSHA256,
    'Real ToolHost / createSidebarToolsView / shared conversation components and existing CSS, bundled by esbuild. Controller callbacks and AI controller are fixtures; no provider, extension installation, Native or CUA acceptance.',
    'Widths: 320/360/400/440. Fine and CDP coarse emulation. CSS zoom 200% and half CSS viewport + DPR 2 are separately labeled; neither proves native browser zoom.',
    'AI trigger actual class: sidebar-tool-icon-action od-icon-button od-conversation-frame-trigger (inside #sidebar-tool-chat-slot). Current checks exercise the two direct Host icons with 320/360/400/440 widths and coarse pointer emulation. CSS zoom scenes are diagnostics and do not determine gate result.',
    'Geometry and interaction conclusions apply only to checks executed in report.json; omitted scenes are NOT_TESTED. Original trusted events, Settings navigation, direct icon focus, remove confirm/cancel, AI portal and responsive geometry are measured there.',
    'Input TSX/JS/CSS SHA256, output bundle hashes, screenshot hashes and source drift check are in report.json. Dev WAR allowlist, candidate package promotion and parallel files were not touched.',
    'Gate summary: '+JSON.stringify(report.summary.gates)+'; diagnostic summary: '+JSON.stringify(report.summary.diagnostics),
    'Failed checks:',...report.checks.filter(c=>!c.pass).map(c=>'- ['+c.category+'] '+c.name),...report.errors.map(e=>'- Harness error: '+e)
  ].join('\n')+'\n');
  console.log(JSON.stringify({result:report.result,...report.summary,errors:report.errors,report:join(out,'report.json')},null,2));
}

#!/usr/bin/env node
// Formal React JSX browser regression with a mock Host. NOT INSTALLED / NOT NATIVE.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'projects/bookmark-manager/preview/react/.opendesk-preview/chrome-evidence');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(out,'chrome-profile-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),contexts=new Map(),network=[],exceptions=[];
let socket,seq=0;
function cdp(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},25000);
    pending.set(id,{ok(value){clearTimeout(timer);ok(value)},fail(error){clearTimeout(timer);fail(error)}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}
    await delay(100);
  }
  assert.ok(port,'Chrome debugging port must be accessible');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(item=>item.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page target');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data),session=row.sessionId||null;
    if(row.id&&pending.has(row.id)){
      const done=pending.get(row.id);pending.delete(row.id);
      if(row.error)done.fail(Error(row.error.message));else done.ok(row.result);
    }
    if(row.method==='Runtime.executionContextCreated'){
      const ctx=row.params.context;
      contexts.set((session||'root')+':'+ctx.id,{contextId:ctx.id,session});
    }
    if(row.method==='Runtime.executionContextDestroyed')
      contexts.delete((session||'root')+':'+row.params.executionContextId);
    if(row.method==='Runtime.executionContextsCleared')
      for(const key of contexts.keys())if(key.startsWith((session||'root')+':'))contexts.delete(key);
    if(row.method==='Target.attachedToTarget'){
      const nested=row.params.sessionId;
      void Promise.all([cdp('Runtime.enable',{},nested),cdp('Network.enable',{},nested)])
        .catch(error=>exceptions.push('Nested context '+error.message));
    }
    if(row.method==='Network.requestWillBeSent'&&/^https?:/i.test(row.params.request?.url||''))
      network.push(row.params.request.url);
    if(row.method==='Runtime.exceptionThrown')
      exceptions.push(row.params.exceptionDetails?.exception?.description||
        row.params.exceptionDetails?.text||'Script exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expr,ctx){
  const response=await cdp('Runtime.evaluate',{expression:expr,
    contextId:ctx.contextId,returnByValue:true,awaitPromise:true},ctx.session);
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||
    response.exceptionDetails.text||'Sandbox evaluation exception');
  return response.result?.value;
}

async function waitFor(fn,label,limit=120){
 for(let i=0;i<limit;i++){try{const value=await fn();if(value)return value}catch{}await delay(85)}
 throw Error('Timeout: '+label);
}
async function findReactFrame(){
 return waitFor(async()=>{
  for(const ctx of [...contexts.values()]){
   try{if(await evaluate("Boolean(globalThis.__BookmarkReactPreview?.version==='R3.0.4' && document.querySelector('.bm-tree-row'))",ctx))return ctx}catch{}
  }
  return null;
 },'React iframe mounted',150);
}
async function outerContext(){
 return waitFor(async()=>{
  for(const ctx of [...contexts.values()]){
   try{if(await evaluate("Boolean(document.getElementById('od-preview-bookmark-lab') && document.getElementById('opendesk-preview-frame'))",ctx))return ctx}catch{}
  }
  return null;
 },'outer Side Panel shell');
}
const expr=code=>'(async()=>{'+code+'})()';
async function invoke(ctx,code){return evaluate(expr(code),ctx)}
async function until(ctx,code,label,limit=110){return waitFor(()=>invoke(ctx,'return Boolean('+code+')'),label,limit)}
async function screenshot(name,clip){
 const reply=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});
 await writeFile(join(out,name),Buffer.from(reply.data,'base64'));
}
async function setInput(ctx,id,value){
 return invoke(ctx,
  "const el=document.getElementById("+JSON.stringify(id)+");if(!el)throw Error('Missing input '+"
  +JSON.stringify(id)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,"
  +JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));return el.value;");
}

async function assertDetailContrast(ctx,label){
 const colors=await invoke(ctx,"const e=document.querySelector('a.bm-detail-url');return {foreground:getComputedStyle(e).color,background:getComputedStyle(document.querySelector('.bm-preview-pane')).backgroundColor}");
 const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const levels=[luminance(colors.foreground),luminance(colors.background)].sort((a,b)=>a-b);
 const ratio=(levels[1]+.05)/(levels[0]+.05);
 assert.ok(ratio>=4.5,'detail URL contrast '+label+' '+JSON.stringify({...colors,ratio}));
 return {...colors,ratio};
}
async function assertIconCentered(ctx,selector,label,{shared=false,coarse=false}={}){
  const results=await invoke(ctx,"return [...document.querySelectorAll("+JSON.stringify(selector)+")].map(el=>{"+
    "const svg=el.querySelector('svg'),a=el.getBoundingClientRect(),b=svg?.getBoundingClientRect(),style=getComputedStyle(el);"+
    "return {tag:el.tagName,type:el.getAttribute('type'),label:el.getAttribute('aria-label'),shared:el.classList.contains('od-icon-button'),"+
    "rowTitle:el.matches('.bm-row-more')?el.closest('[data-node-id]').title:null,"+
    "width:a.width,height:a.height,svgWidth:b?.width,svgHeight:b?.height,hidden:svg?.getAttribute('aria-hidden'),"+
    "dx:b?(b.left+b.width/2)-(a.left+a.width/2):null,dy:b?(b.top+b.height/2)-(a.top+a.height/2):null,padding:style.paddingLeft};});");
  assert.ok(results.length,label+' must render icon buttons');
  for(const result of results){
    assert.equal(result.tag,'BUTTON',label+' must render a native button');
    assert.equal(result.type,'button',label+' must not submit a form');
    assert.ok(result.width>0&&result.height>0&&result.svgWidth>0&&result.svgHeight>0,label+' must contain a rendered SVG');
    assert.equal(result.hidden,'true',label+' decorative SVG must be hidden from assistive technology');
    if(shared){
      assert.equal(result.shared,true,label+' must render the shared IconButton');
      assert.ok(result.label?.trim(),label+' shared IconButton must render aria-label');
      if(result.rowTitle!==null)assert.equal(result.label,'操作 '+result.rowTitle,label+' label must identify its row');
    }
    assert.ok(Math.abs(result.dx)<=0.6&&Math.abs(result.dy)<=0.6,
      label+' SVG must be centered in its button: '+JSON.stringify(result));
    assert.equal(result.padding,'0px',label+' must not inherit host button padding');
    if(coarse)assert.ok(result.width>=44&&result.height>=44,label+' coarse pointer target must be at least 44px: '+JSON.stringify(result));
  }
}
async function setFrameViewport(ctx,outer,width,zoom=1){
  // The legacy shell URL helper silently ignores 320/440. Measure the iframe,
  // including the host gutter, rather than treating its query string as proof.
  await invoke(outer,"const device=document.querySelector('.preview-device'),frame=document.getElementById('opendesk-preview-frame');"+
    "const gutter=device.clientWidth-frame.clientWidth;device.style.width="+JSON.stringify(width*zoom)+"+gutter+'px';device.style.maxWidth='none';return true;");
  await invoke(ctx,"document.documentElement.style.zoom="+JSON.stringify(String(zoom))+";await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;");
  const actual=await invoke(ctx,"const app=document.querySelector('.bm-app');return {innerWidth,layoutWidth:app.offsetWidth,renderedWidth:app.getBoundingClientRect().width,zoom:Number(getComputedStyle(document.documentElement).zoom)};");
  assert.equal(actual.innerWidth,width*zoom,'actual iframe viewport '+width+' at '+zoom+'x');
  assert.equal(actual.layoutWidth,width,'actual App layout viewport '+width+' at '+zoom+'x');
  assert.ok(Math.abs(actual.renderedWidth-width*zoom)<=0.6,'actual App rendered width '+JSON.stringify(actual));
  assert.equal(actual.zoom,zoom,'CSS document zoom must actually apply');
  return actual;
}
async function assertTopbarGeometry(ctx,outer,label,{coarse=false}={}){
  // Hit testing uses viewport coordinates: bring both the frame and toolbar
  // onscreen before measuring, so host scrolling cannot mimic horizontal loss.
  await invoke(outer,"document.getElementById('opendesk-preview-frame').scrollIntoView({block:'start',inline:'nearest'});return true;");
  await invoke(ctx,"document.querySelector('.bm-topbar').scrollIntoView({block:'start',inline:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;");
  await assertIconCentered(ctx,'.bm-topbar .bm-icon-btn',label,{shared:true,coarse});
  const geometry=await invoke(ctx,"const app=document.querySelector('.bm-app'),bar=document.querySelector('.bm-topbar'),a=app.getBoundingClientRect(),t=bar.getBoundingClientRect();"+
    "return {overflow:app.scrollWidth-app.clientWidth,actions:[...bar.querySelectorAll('.bm-icon-btn')].map(el=>{"+
    "const b=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);"+
    "return {label:el.getAttribute('aria-label'),complete:b.left>=Math.max(0,a.left,t.left)-0.6&&b.right<=Math.min(innerWidth,a.right,t.right)+0.6&&b.top>=Math.max(0,t.top)-0.6&&b.bottom<=Math.min(innerHeight,t.bottom)+0.6,"+
    "hittable:!el.disabled&&getComputedStyle(el).visibility==='visible'&&!!hit&&el.contains(hit),svgInside:s.left>=b.left-0.6&&s.right<=b.right+0.6&&s.top>=b.top-0.6&&s.bottom<=b.bottom+0.6};})};");
  assert.ok(geometry.overflow<=1,'no App horizontal overflow '+label+' '+JSON.stringify(geometry));
  assert.deepEqual(geometry.actions.map(action=>action.label),['新建书签','新建文件夹','收藏当前页','刷新书签'],'all four business actions '+label);
  for(const action of geometry.actions){
    assert.equal(action.complete,true,'complete top action '+label+' '+JSON.stringify(action));
    assert.equal(action.hittable,true,'hittable top action '+label+' '+JSON.stringify(action));
    assert.equal(action.svgInside,true,'SVG stays inside top action '+label+' '+JSON.stringify(action));
  }
  return geometry;
}
async function assertTreeGeometry(ctx,label,zoom=1){
  const rows=await invoke(ctx,"return [...document.querySelectorAll('.bm-tree-row')].map(el=>({id:el.dataset.nodeId,height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,cssHeight:getComputedStyle(el).height,position:getComputedStyle(el).position}));");
  assert.ok(rows.length>1&&rows.length<90,label+' virtual DOM must be populated and bounded');
  for(let i=0;i<rows.length;i++){
    assert.equal(rows[i].cssHeight,'44px',label+' actual row height '+rows[i].id);
    assert.equal(rows[i].position,'absolute',label+' must exercise virtual rows');
    assert.ok(Math.abs(rows[i].height/zoom-44)<=0.1,label+' rendered row height '+JSON.stringify(rows[i]));
    if(i)assert.ok(Math.abs((rows[i].top-rows[i-1].top)/zoom-44)<=0.1,label+' virtual row stride must remain 44px');
  }
}
async function assertRowVisible(ctx,id,label){
  const actual=await invoke(ctx,"const tree=document.querySelector('[role=tree]'),row=document.getElementById("+JSON.stringify('bm-treeitem-'+id)+");if(!row)return null;const a=tree.getBoundingClientRect(),b=row.getBoundingClientRect();return {active:tree.getAttribute('aria-activedescendant'),focused:document.activeElement===tree,top:b.top-a.top,bottom:a.bottom-b.bottom};");
  assert.ok(actual,label+' row must be mounted');
  assert.ok(actual.top>=-0.6&&actual.bottom>=-0.6,label+' row must be fully inside tree viewport: '+JSON.stringify(actual));
  return actual;
}
const previewPath=resolve(process.env.BOOKMARK_REACT_PREVIEW_HTML||'projects/bookmark-manager/preview/index.html');
const html=await readFile(previewPath,'utf8');
assert.match(html,/sandbox="allow-scripts"/);
assert.doesNotMatch(html,/sandbox="[^"]*allow-same-origin/);
const manifest=JSON.parse(html.match(/id="opendesk-preview-manifest">([^<]+)<\/script>/)[1]);
assert.equal(manifest.reactRuntime,true);
assert.equal(manifest.formalEntry,true,'Regression must mount actual formal.jsx');
assert.equal(manifest.hostAdapter,'MOCK_HOST_ADAPTER');
assert.equal(manifest.nativeVerified,false,'Mock Host is not Native evidence');
const widths=[320,360,400,440,960];
const report=[],geometryReport=[],toolbarReport=[];
let browserInfo={},currentCase=null;
async function click(ctx,sel){
 const q=JSON.stringify(sel);
 return invoke(ctx,"const n=document.querySelector("+q+");if(!n)throw Error('no '+ "+q+");n.click();return true");
}
async function openMenu(ctx,id){
 // Search resets tree scrolling; flush its render/scroll events before opening
 // a menu, since the tree intentionally closes menus when it scrolls.
 await invoke(ctx,"await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true");
 await click(ctx,'[data-node-id="'+id+'"] .bm-row-more');
 await until(ctx,"!!document.querySelector('[data-testid=\"action-menu\"]')",'menu '+id);
}
async function choose(ctx,index){
 return invoke(ctx,"const el=document.querySelectorAll('[data-testid=\"action-menu\"] [role=\"menuitem\"]')["+index+"];if(!el)throw Error('missing menu choice');el.click();return true");
}
const gone=async(ctx,sel,label)=>until(ctx,"!document.querySelector("+JSON.stringify(sel)+")",label);
try{
 await connect();
 browserInfo=await cdp('Browser.getVersion');
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
 await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
 for(const width of widths){
  currentCase={width,mode:'light-fine-100'};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1350,height:1100,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:pathToFileURL(previewPath).href+'?width='+width});
  const ctx=await findReactFrame();
  const outer=await outerContext();
  await setFrameViewport(ctx,outer,width);
  await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,159')",'initial data '+width);
   const hostButton=await invoke(ctx,"const b=document.createElement('button');document.querySelector('.bm-app').append(b);const s=getComputedStyle(b),value=[s.paddingLeft,s.minHeight];b.remove();return value;");
   assert.deepEqual(hostButton,['12px','34px'],'preview must include actual trusted host button defaults '+width);
   await assertIconCentered(ctx,'.bm-topbar .bm-icon-btn','topbar icon '+width,{shared:true});
   await assertIconCentered(ctx,'.bm-disclosure:not(.is-placeholder)','tree folder chevron '+width);
   await assertIconCentered(ctx,'.bm-row-more','tree row action '+width,{shared:true});
  assert.deepEqual(await invoke(ctx,"return [...document.querySelectorAll('.bm-topbar .bm-icon-btn')].map(el=>el.getAttribute('aria-label'))"),['新建书签','新建文件夹','收藏当前页','刷新书签'],'shared topbar labels '+width);

  // Formal sandbox feasibility is not an admitted ToolHost. Framework Chat
  // is intentionally unavailable here; real admitted preview runs separately.
  assert.equal(await invoke(ctx,"return !!document.querySelector('.bm-topbar [aria-label=对话],.od-conversation-frame-trigger')"),false,
    'standalone sandbox has no trusted Chat trigger '+width);
  assert.equal(await invoke(ctx,"return !!document.querySelector('#opendesk-conversation-dock')"),false,
    'standalone sandbox must never mount a trusted shared Dock '+width);
  await assertTreeGeometry(ctx,'initial tree '+width);
  const originalHeight=await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)");
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-inspector')===null"),true);
  // A coarse-pointer device must not show a noisy ellipsis on every idle row.
  const idleMenus=await invoke(ctx,"return [...document.querySelectorAll('.bm-tree-row:not(.is-selected) .bm-row-more')].slice(3,9).map(el=>Number(getComputedStyle(el).opacity))");
  assert.ok(idleMenus.length>0&&idleMenus.every(value=>value<0.1),'idle rows hide action controls until selection, hover or keyboard focus');

  assert.equal(await invoke(ctx,"return document.querySelectorAll('.bm-topbar .bm-create-actions .bm-icon-btn[aria-label]').length"),2,'accessible icon-only create controls '+width);
  assert.equal(await invoke(ctx,"return !document.querySelector('.bm-tools .bm-create-actions')"),true,'search-only toolbar '+width);
  await screenshot('bookmark-r304-'+width+'-list.png');
  // R3.0.4 accessibility regression: real tree key events and virtual offscreen scrolling.
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant')==='bm-treeitem-2651'",'End reaches last visible row '+width);
  assert.equal(await invoke(ctx,"return !!document.getElementById(document.querySelector('[role=tree]').getAttribute('aria-activedescendant'))"),true,'End active node mounted');
  const last=await assertRowVisible(ctx,'2651','End last item '+width);
  assert.equal(last.active,'bm-treeitem-2651','End active descendant matches last item');
  assert.equal(last.focused,true,'End keeps keyboard focus in tree');
  await assertTreeGeometry(ctx,'End tree '+width);
  await invoke(ctx,"document.querySelector('[role=tree]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[data-testid=bookmark-preview] .bm-detail-title span')?.textContent.includes('模拟书签 2152')",'last item keyboard activation '+width);
  await click(ctx,'.bm-preview-close');
  await gone(ctx,'[data-testid="bookmark-preview"]','last keyboard preview closes '+width);
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant')==='bm-treeitem-1'",'Home reaches first row '+width);
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.scrollTop=t.scrollHeight;t.dispatchEvent(new Event('scroll',{bubbles:true}));return true");
  await until(ctx,"!!document.getElementById(document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant'))",'offscreen scroll retains real active-descendant '+width);
  assert.ok(await invoke(ctx,"return document.querySelectorAll('.bm-tree-row').length<90"),'virtual DOM bounded at '+width);
  assert.equal(await invoke(ctx,"const a=document.querySelector('[role=treeitem]');return Boolean(a?.getAttribute('aria-posinset')&&a?.getAttribute('aria-setsize'))"),true,'treeitem positional metadata');
  await screenshot('bookmark-r304-'+width+'-keyboard.png');
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.scrollTop=0;t.dispatchEvent(new Event('scroll',{bubbles:true}));return true");
  await until(ctx,"!!document.querySelector('[data-node-id=\"100\"]')",'restore tree position '+width);
  await click(ctx,'[data-node-id="100"]');
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-preview\"]')",'one click preview '+width);
   await assertIconCentered(ctx,'.bm-preview-close','detail close '+width,{shared:true});
   await assertIconCentered(ctx,'.bm-preview-action','detail action '+width,{shared:true});
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-sheet\"]')"),false,'readonly is nonmodal');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"]')?.getAttribute('aria-modal')"),width<740?'true':null,'responsive modal semantics');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"]')?.getAttribute('role')"),width<740?'dialog':'complementary','responsive preview role');
  if(width<740){
   const insets=await invoke(ctx,"const app=document.querySelector('.bm-app').getBoundingClientRect(),pane=document.querySelector('.bm-preview-pane').getBoundingClientRect();return [Math.round(pane.left-app.left),Math.round(app.right-pane.right),Math.round(app.bottom-pane.bottom)]");
   assert.deepEqual(insets,[12,12,12],'approved floating pane insets');
  }
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-detail-title')?.textContent.includes('OpenDesk 产品资料')"),true,'one click shows correct bookmark');
  assert.equal(await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)"),originalHeight,'preview does not reflow list');
  const directLink=await invoke(ctx,"const a=document.querySelector('[data-testid=bookmark-preview] a.bm-detail-url');return a?{url:a.getAttribute('href'),target:a.target,rel:a.rel,text:a.querySelector('span')?.textContent,icon:!!a.querySelector('svg')}:null");
  assert.ok(directLink?.url?.startsWith('https://')||directLink?.url?.startsWith('http://'),'HTTP(S) anchor is directly clickable');
  assert.equal(directLink.target,'_blank');
  assert.ok(directLink.rel.includes('noopener')&&directLink.rel.includes('noreferrer')&&directLink.icon&&directLink.text);
  await screenshot('bookmark-r304-'+width+'-preview.png');
  if(width<740){
   await click(ctx,'.bm-preview-backdrop');
   await gone(ctx,'[data-testid="bookmark-preview"]','backdrop closes floating preview');
   await click(ctx,'[data-node-id="100"]');
   await until(ctx,"!!document.querySelector('[data-testid=bookmark-preview]')",'reopen preview after backdrop');
  }
  const five=await invoke(ctx,"return [...document.querySelectorAll('.bm-tree-row')].filter(row=>!row.hasAttribute('aria-expanded')).slice(0,5).map(x=>x.dataset.nodeId)");
  assert.equal(five.length,5);
  for(const id of five){
   if(width<740)await click(ctx,'.bm-preview-close');
   await click(ctx,'[data-node-id="'+id+'"] .bm-node-title');
   assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=bookmark-preview] .bm-detail-title span')?.textContent"),await invoke(ctx,"return document.querySelector("+JSON.stringify('[data-node-id="'+id+'"] .bm-node-title')+")?.textContent"),'five bookmark clicks switch readonly previews '+id);
  }
  if(width===400)await screenshot('bookmark-r304-400-switch.png');
  const expandedBefore=await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"]')?.getAttribute('aria-expanded')");
  await click(ctx,'[data-node-id="10"] .bm-node-title');
  await until(ctx,"document.querySelector('[data-node-id=\"10\"]')?.getAttribute('aria-expanded')!=="+JSON.stringify(expandedBefore),'folder row toggles '+width);
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=bookmark-preview]')"),false,'folder row navigates without readonly overlay');
  await click(ctx,'[data-node-id="10"] .bm-node-title');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"]')?.getAttribute('aria-expanded')"),expandedBefore,'folder row reopens');
  await click(ctx,'[data-node-id="10"] .bm-disclosure');
  assert.notEqual(await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"]')?.getAttribute('aria-expanded')"),expandedBefore,'chevron independently toggles');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=bookmark-preview]')"),false,'chevron never opens preview');
  await click(ctx,'[data-node-id="10"] .bm-disclosure');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"]')?.getAttribute('aria-expanded')"),expandedBefore,'chevron restores expansion');
  if(width===400)await screenshot('bookmark-r304-400-folder.png');
  await openMenu(ctx,'10');
  await choose(ctx,0);
  await until(ctx,"!!document.querySelector('[data-testid=bookmark-preview]')",'folder detail remains in explicit menu');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=bookmark-preview] .bm-detail-title span')?.textContent"),'设计资料','folder menu readonly details');
  await click(ctx,'.bm-preview-close');
  await click(ctx,'[data-node-id="100"] .bm-node-title');
  if(width===960){
   assert.equal(await invoke(ctx,"const a=document.querySelector('.bm-explorer').getBoundingClientRect(),b=document.querySelector('.bm-preview-pane').getBoundingClientRect();return b.left>=a.right-1"),true,'wide right-hand details');
   await screenshot('bookmark-r304-960-split.png');
  }
  assert.equal(await invoke(ctx,"return document.documentElement.scrollWidth<=innerWidth+1"),true,'no horizontal overflow');
  const offset=await invoke(ctx,"return document.querySelector('.bm-tree-scroll').scrollTop");
  await click(ctx,'.bm-preview-close');
  await gone(ctx,'[data-testid="bookmark-preview"]','close readonly details');
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-tree-scroll').scrollTop"),offset,'close does not jump scroll');
  await openMenu(ctx,'100');
  await choose(ctx,0);
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-preview\"]')",'menu view reuses responsive preview');
  await click(ctx,'[data-testid="bookmark-preview"] [aria-label="编辑"]');
  await until(ctx,"!!document.getElementById('bm-edit-url')",'preview enters existing editor');
   await assertIconCentered(ctx,'.bm-sheet-close','editor close '+width,{shared:true});
   assert.deepEqual(await invoke(ctx,"const s=getComputedStyle(document.querySelector('.bm-field label'));return [s.marginTop,s.marginBottom]"),['0px','0px'],'editor label must not inherit host margins');
   assert.equal(await invoke(ctx,"return getComputedStyle(document.querySelector('.bm-search-wrap input')).minHeight"),'0px','search input must fit 36px toolbar');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-sheet\"]')"),true,'editor stays a modal Sheet');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-sheet\"] [data-testid=\"bookmark-editor\"] #bm-edit-url')"),true,'real bookmark editor is inside the Sheet '+width);
  const readonlySheetSelectors=['.bm-sheet .bm-readonly','.bm-sheet .bm-detail-title','.bm-sheet .bm-detail-title span','.bm-sheet .bm-detail-path','.bm-sheet .bm-detail-url'];
  const readonlySheetCounts=await invoke(ctx,"return "+JSON.stringify(readonlySheetSelectors)+".map(selector=>document.querySelectorAll(selector).length)");
  for(let i=0;i<readonlySheetSelectors.length;i++)assert.equal(readonlySheetCounts[i],0,'unreachable readonly Sheet selector '+readonlySheetSelectors[i]+' '+width);
  await screenshot('bookmark-r304-'+width+'-preview-edit.png');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','preview edit cancel');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-preview\"]')"),true,'cancel restores readonly details');
  await openMenu(ctx,'100');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-url')",'edit from row menu');
  await setInput(ctx,'bm-edit-name','草稿取消就退出');
  await screenshot('bookmark-r304-'+width+'-edit.png');
  assert.equal(await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)"),originalHeight,'edit overlay no tree reflow');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel directly');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"confirm-dialog\"]')"),false,'no unsaved prompt');
  // Dirty draft: explicit Cancel is immediate, X requires keep/discard confirmation.
  await openMenu(ctx,'100');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-name')",'dirty X editing '+width);
  await setInput(ctx,'bm-edit-name','离开需要确认');
  await click(ctx,'.bm-sheet-close');
  await until(ctx,"!!document.querySelector('[data-testid=\\\"confirm-dialog\\\"]')",'dirty X confirmation '+width);
  const confirmScrim=await invoke(ctx,"const dialog=document.querySelector('[data-testid=\"confirm-dialog\"]'),scrim=dialog?.closest('.bm-scrim');return scrim?{zIndex:getComputedStyle(scrim).zIndex,dialogs:scrim.querySelectorAll('[data-testid=\"confirm-dialog\"]').length}:null");
  assert.deepEqual(confirmScrim,{zIndex:'42',dialogs:1},'actual confirmation scrim uses the winning z-index 42 '+width);
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\\\"confirm-dialog\\\"] button')?.textContent"),'继续编辑');
  await click(ctx,'[data-testid="confirm-dialog"] button:first-child');
  await gone(ctx,'[data-testid="confirm-dialog"]','continue editing');
  assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name')?.value"),'离开需要确认');
  await click(ctx,'.bm-sheet-close');
  await click(ctx,'[data-testid="confirm-dialog"] button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','explicitly discard');
  await setInput(ctx,'bm-search','模拟书签 2152');
  await until(ctx,"!!document.querySelector('[data-node-id=\"2651\"]')",'last tree node search');
   await assertIconCentered(ctx,'.bm-search-wrap button','clear search '+width,{shared:true});
  await click(ctx,'[data-node-id="2651"] .bm-node-title');
  await until(ctx,"document.querySelector('[data-testid=\"bookmark-preview\"] .bm-detail-title span')?.textContent.includes('模拟书签 2152')",'one click search result');
  await openMenu(ctx,'2651');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-url')",'edit searched');
  await setInput(ctx,'bm-edit-name','模拟书签 2152 改名');
  await setInput(ctx,'bm-edit-url','https://example.org/react-edited');
  await click(ctx,'[data-testid="bookmark-save"]');
  await gone(ctx,'[data-testid="bookmark-sheet"]','save and verify');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-preview\"]')"),true,'save readback returns readonly');
  assert.equal(await invoke(ctx,"return !!document.querySelector('.bm-notice')"),true,'readback success status');
  await setInput(ctx,'bm-search','');
  await until(ctx,"!!document.querySelector('[data-node-id=\"100\"]')",'clear search');
  await click(ctx,'[data-node-id="10"]');
  await click(ctx,'.bm-create-actions button:first-child');
  await until(ctx,"!!document.getElementById('bm-edit-url')",'new bookmark type');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel empty create');
  await click(ctx,'.bm-create-actions button:nth-child(2)');
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-editor\"]')",'new folder');
  assert.equal(await invoke(ctx,"return !document.getElementById('bm-edit-url')"),true);
  await setInput(ctx,'bm-edit-name','脏草稿无需确认');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel dirty create');
  assert.equal(await invoke(ctx,"return !document.querySelector('[data-testid=\"confirm-dialog\"]')"),true);
   await click(ctx,'[data-node-id="10"]');
   await openMenu(ctx,'100');
   assert.equal(await invoke(ctx,"return document.querySelector('[data-node-id=\"100\"]')?.getAttribute('aria-selected')"),'true','menu and target match');
   assert.match(await invoke(ctx,"return document.querySelector('[data-testid=\"action-menu\"]')?.textContent"),/删除/);
   // The real Chrome Host displays the ONE authoritative deletion review.
   // Keep this bookmark for the later rename/move/unknown-write scenarios.
   await screenshot('bookmark-r304-'+width+'-delete-menu.png');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"confirm-dialog\"]')"),false);
   assert.equal(await invoke(ctx,"return document.activeElement!==document.body"),true,'menu keeps focus');
  await openMenu(ctx,'100');
  await invoke(ctx,"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true");
  await gone(ctx,'[data-testid="action-menu"]','Escape menu');
  if(width===400){
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('extra-folders');return true");
   await click(ctx,'button[aria-label="刷新书签"]');
   await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,289')",'130 extra folders');
   await openMenu(ctx,'100');
   await choose(ctx,1);
   await until(ctx,"!!document.getElementById('bm-edit-name')",'edit before folder picker');
   await click(ctx,'.bm-parent-line .bm-text-button');
   await until(ctx,"!!document.getElementById('bm-folder-search')",'folder picker open');
    await assertIconCentered(ctx,'.bm-picker .bm-close','picker close '+width,{shared:true});
   await setInput(ctx,'bm-folder-search','性能文件夹 0130');
   await until(ctx,"document.querySelectorAll('.bm-picker-item').length===1",'130 folder query');
   await screenshot('bookmark-r304-400-folder-picker.png');
   await invoke(ctx,"document.querySelector('.bm-picker-item').focus();return true");
   await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'},ctx.session);
   await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},ctx.session);
   await gone(ctx,'[data-testid="folder-picker"]','native Enter chooses the target folder');
   await click(ctx,'.bm-editor-actions button:last-child');
   await gone(ctx,'[data-testid="bookmark-sheet"]','cancel pending move without warning');
   await openMenu(ctx,'100');
   await choose(ctx,1);
   await until(ctx,"!!document.getElementById('bm-edit-name')",'failure edit');
   await setInput(ctx,'bm-edit-name','失败后保留输入');
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('write-fail');return true");
   await click(ctx,'[data-testid="bookmark-save"]');
   await until(ctx,"!!document.querySelector('.bm-sheet-error')",'inline error');
   assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name').value"),'失败后保留输入');
   await screenshot('bookmark-r304-400-failure.png');
   await click(ctx,'.bm-editor-actions button:last-child');
   await gone(ctx,'[data-testid="bookmark-sheet"]','cancel failed draft'); 
   // Simulate an indeterminate write: both Close and Cancel must ask before discarding.
   await openMenu(ctx,'100');
   await choose(ctx,1);
   await until(ctx,"!!document.getElementById('bm-edit-name')",'edit before unknown write');
   await setInput(ctx,'bm-edit-name','结果未知仍保留草稿');
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('write-unknown');return true");
   await click(ctx,'[data-testid="bookmark-save"]');
   await until(ctx,"!!document.querySelector('.bm-warning')",'unknown save warning');
   assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name').value"),'结果未知仍保留草稿');
   await click(ctx,'.bm-sheet-close');
   await until(ctx,"!!document.querySelector('[data-testid=confirm-dialog]')",'unknown X confirmation');
   assert.match(await invoke(ctx,"return document.querySelector('[data-testid=confirm-dialog]').textContent"),/写入结果未知/);
   await screenshot('bookmark-r304-400-unknown-draft.png');
   await click(ctx,'[data-testid="confirm-dialog"] button:first-child');
   await gone(ctx,'[data-testid="confirm-dialog"]','continue unknown editing');
   assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name').value"),'结果未知仍保留草稿');
   await click(ctx,'.bm-editor-actions button:last-child');
   await until(ctx,"!!document.querySelector('[data-testid=confirm-dialog]')",'unknown Cancel confirmation');
   await click(ctx,'[data-testid="confirm-dialog"] button:last-child');
   await gone(ctx,'[data-testid="bookmark-sheet"]','explicitly discard unknown draft');
  }
  if(width===400){
   await setInput(ctx,'bm-search','产品研究');
   await until(ctx,"!!document.querySelector('[data-node-id=\"11\"] .bm-search-highlight')",'search folder highlight');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-node-id=\"2\"]')"),true,'search reveals matching ancestor path');
   await screenshot('bookmark-r304-400-search-results.png');
   await click(ctx,'[data-node-id="11"] .bm-node-title');
   await until(ctx,"document.getElementById('bm-search').value===''",'folder search result returns to tree');
   await until(ctx,"document.querySelector('[data-node-id=\"11\"]')?.getAttribute('aria-expanded')==='true'",'folder result expands and scrolls into view');
   await assertRowVisible(ctx,'11','searched folder reveal uses 44px stride');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=bookmark-preview]')"),false,'search folder navigation stays list-first');
   await screenshot('bookmark-r304-400-search-folder-drilldown.png');
  }
   // R3.3 removed the duplicate React delete dialog. The mock Host still
   // requires one operation-bound review; cancel and pending must not mutate.
   await click(ctx,'button[aria-label="刷新书签"]');
   await until(ctx,"!document.querySelector('button[aria-label=\"刷新书签\"]')?.disabled",'reconcile unknown before delete');
   await setInput(ctx,'bm-search','https://example.org/preview');
   await until(ctx,"!!document.querySelector('[data-node-id=\"100\"]')",'known delete target');
   await openMenu(ctx,'100');
   await choose(ctx,3);
   await until(ctx,"!!document.querySelector('[data-testid=mock-host-review]')",'one mock Host review');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=confirm-dialog]')"),false,'no duplicate React delete confirmation');
   assert.equal(await invoke(ctx,"return (await OpenDeskSDK.browser.bookmarks.get({id:'100'})).length"),1,'pending Host review preserves bookmark');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.mutations"),[],'no mutation before Host approval');
   await click(ctx,'[data-testid="mock-host-review"] [data-action="cancel"]');
   await gone(ctx,'[data-testid="mock-host-review"]','cancel mock Host review');
   await until(ctx,"!document.querySelector('button[aria-label=\"刷新书签\"]')?.disabled",'cancel releases delete busy guard');
   assert.equal(await invoke(ctx,"return (await OpenDeskSDK.browser.bookmarks.get({id:'100'})).length"),1,'cancel leaves original bookmark');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.mutations"),[],'cancel causes no mutation');
   await openMenu(ctx,'100');
   await choose(ctx,3);
   await until(ctx,"!!document.querySelector('[data-testid=mock-host-review]')",'retry requires fresh Host review');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=confirm-dialog]')"),false,'retry has no second React confirmation');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.mutations"),[],'retry still awaits approval');
   await screenshot('bookmark-r304-'+width+'-mock-host-review.png');
   await click(ctx,'[data-testid="mock-host-review"] [data-action="approve"]');
   await until(ctx,"!document.querySelector('[data-node-id=\"100\"]')",'delete mock readback');
   await gone(ctx,'[data-testid="mock-host-review"]','approved review closes once');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"confirm-dialog\"]')"),false,'no duplicate React deletion confirmation');
   assert.match(await invoke(ctx,"return document.querySelector('.bm-notice')?.textContent||''"),/已删除/);
   assert.deepEqual(await invoke(ctx,"return await OpenDeskSDK.browser.bookmarks.get({id:'100'})"),[],'deleted bookmark readback');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.reviews.map(({operation,id,status})=>({operation,id,status}))"),[
    {operation:'remove',id:'100',status:'cancelled'},
    {operation:'remove',id:'100',status:'approved'}],'exactly one Host review per delete attempt');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.mutations"),[{operation:'remove',id:'100'}],'single approved bookmark mutation');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.calls"),{remove:2,prepareRemoveTree:0,removeTree:0},'no duplicate delete dispatch');
   await screenshot('bookmark-r304-'+width+'-delete.png');
   // Non-empty folder deletion must retain the existing prepare/ticket flow,
   // with one Host approval for the entire operation.
   await setInput(ctx,'bm-search','设计资料');
   await until(ctx,"!!document.querySelector('[data-node-id=\"10\"]')",'folder delete target');
   const descendants=await invoke(ctx,"const tree=await BookmarkR2Service.create(OpenDeskSDK.browser).load();return BookmarkR2Model.descendantSignatures(tree,'10').map(row=>JSON.parse(row)[0])");
   assert.ok(descendants.length>0,'non-empty folder exercises guarded recursive deletion');
   await openMenu(ctx,'10');await choose(ctx,3);
   await until(ctx,"!!document.querySelector('[data-testid=mock-host-review]')",'single recursive Host review');
   assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=confirm-dialog]')"),false,'no duplicate recursive React confirmation');
   assert.equal(await invoke(ctx,"return (await OpenDeskSDK.browser.bookmarks.get({id:'10'})).length"),1,'pending review preserves folder');
   assert.equal(await invoke(ctx,"return __BookmarkMockHost.mutations.length"),1,'recursive mutation waits for approval');
   await click(ctx,'[data-testid="mock-host-review"] [data-action="approve"]');
   await until(ctx,"!document.querySelector('[data-node-id=\"10\"]')",'recursive delete readback');
   assert.deepEqual(await invoke(ctx,"return await OpenDeskSDK.browser.bookmarks.get({id:'10'})"),[],'deleted folder readback');
   assert.equal(await invoke(ctx,"const ids="+JSON.stringify(descendants)+";return (await Promise.all(ids.map(id=>OpenDeskSDK.browser.bookmarks.get({id})))).flat().length"),0,'all descendants removed');
   assert.deepEqual(await invoke(ctx,"return __BookmarkMockHost.calls"),{remove:2,prepareRemoveTree:1,removeTree:1},'one prepare and one ticketed removal');
   const host=await invoke(ctx,"return __BookmarkMockHost");
   assert.deepEqual(host.reviews.map(({operation,id,status})=>({operation,id,status})),[
    {operation:'remove',id:'100',status:'cancelled'},
    {operation:'remove',id:'100',status:'approved'},
    {operation:'prepareRemoveTree',id:'10',status:'approved'}],'no second review between prepare and removeTree');
   assert.deepEqual(host.mutations,[{operation:'remove',id:'100'},{operation:'removeTree',id:'10'}]);
  report.push({width,treeHeight:originalHeight,noPersistentInspector:true,mockHost:host,passed:['one-click-preview','five-click-five-previews','folder-row-toggle','folder-disclosure','folder-menu-details','nonmodal-preview','view-detail-on-demand','direct-cancel','edit-no-tree-jump','save-readback','search-2159','create-types','single-host-review-no-react-confirm','host-cancel-preserves-bookmark','ticketed-recursive-delete','focus-restore','menu-Escape',...(width===400?['folder-130','failure-preserve','unknown-draft-safety','search-folder-drilldown']:[])]});
 }
 // Reuse formal.jsx and its existing Host fixture. These cases exercise only
 // affected controls/virtualization, without repeating CRUD or adding mock UI.
 for(const mode of [
  {name:'dark',dark:true,coarse:false,zoom:1},
  {name:'coarse',dark:false,coarse:true,zoom:1},
  {name:'zoom-200',dark:false,coarse:false,zoom:2}
 ])for(const width of widths){
  currentCase={width,mode:mode.name};
  const label=mode.name+' '+width;
  await cdp('Emulation.setDeviceMetricsOverride',{width:1350*mode.zoom,height:1100*mode.zoom,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:mode.dark?'dark':'light'}]});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:mode.coarse,...(mode.coarse?{maxTouchPoints:1}:{})});
  await cdp('Page.navigate',{url:pathToFileURL(previewPath).href+'?width='+width});
  const ctx=await findReactFrame(),outer=await outerContext();
  if(ctx.session){
   await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:mode.dark?'dark':'light'}]},ctx.session);
   await cdp('Emulation.setTouchEmulationEnabled',{enabled:mode.coarse,...(mode.coarse?{maxTouchPoints:1}:{})},ctx.session);
  }
  const viewport=await setFrameViewport(ctx,outer,width,mode.zoom);
  await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,159')",'initial data '+label);
  const media=await invoke(ctx,"const s=getComputedStyle(document.documentElement);return {dark:matchMedia('(prefers-color-scheme:dark)').matches,coarse:matchMedia('(pointer:coarse)').matches,colorScheme:s.colorScheme,paper:s.getPropertyValue('--od-paper').trim(),darkPaper:s.getPropertyValue('--od-dark-paper').trim()};");
  assert.equal(media.dark,mode.dark,'actual dark media '+label);
  assert.equal(media.coarse,mode.coarse,'actual pointer media '+label);
  assert.equal(media.colorScheme,mode.dark?'dark':'light','actual native control color scheme '+label);
  if(mode.dark)assert.equal(media.paper,media.darkPaper,'canonical dark tokens '+label);
  const options={shared:true,coarse:mode.coarse};
  await assertIconCentered(ctx,'.bm-icon-btn','topbar '+label,options);
  await assertIconCentered(ctx,'.bm-disclosure:not(.is-placeholder)','disclosure '+label,{coarse:mode.coarse});
  await assertIconCentered(ctx,'.bm-row-more','row action '+label,options);
  await assertTreeGeometry(ctx,'initial '+label,mode.zoom);
  await invoke(ctx,"const t=document.querySelector('[role=tree]');t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant')==='bm-treeitem-2651'",'last keyboard item '+label);
  const last=await assertRowVisible(ctx,'2651','last keyboard item '+label);
  assert.equal(last.active,'bm-treeitem-2651','last active descendant '+label);
  assert.equal(last.focused,true,'tree retains keyboard focus '+label);
  await assertTreeGeometry(ctx,'last '+label,mode.zoom);
  await invoke(ctx,"document.querySelector('[role=tree]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[data-testid=bookmark-preview] .bm-detail-title span')?.textContent.includes('模拟书签 2152')",'keyboard preview '+label);
  await assertIconCentered(ctx,'.bm-preview-close','preview close '+label,options);
  await assertIconCentered(ctx,'.bm-preview-action','preview action '+label,options);
  await assertDetailContrast(ctx,label);
  if(mode.name==='dark'&&width===400){
   await setFrameViewport(ctx,outer,960);
   await until(ctx,"document.querySelector('[data-testid=bookmark-preview]')?.getAttribute('role')==='complementary'",'open preview follows desktop breakpoint');
   await setFrameViewport(ctx,outer,400);
   await until(ctx,"document.querySelector('[data-testid=bookmark-preview]')?.getAttribute('aria-modal')==='true'&&document.querySelector('.bm-preview-pane')?.contains(document.activeElement)",'open preview restores modal focus at narrow breakpoint');
  }
  await screenshot('bookmark-r304-'+width+'-'+mode.name+'.png');
  await click(ctx,'[data-testid="bookmark-preview"] [aria-label="编辑"]');
  await until(ctx,"!!document.getElementById('bm-edit-url')",'editor '+label);
  await assertIconCentered(ctx,'.bm-sheet-close','editor close '+label,options);
  const editorActions=await invoke(ctx,"return [...document.querySelectorAll('.bm-editor-actions button')].map(b=>({className:b.className,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}));");
  assert.equal(editorActions.length,2,'one save and one cancel '+label);
  assert.ok(Math.abs(editorActions[0].width-editorActions[1].width)<=0.6,'editor actions share available width '+label+' '+JSON.stringify(editorActions));
  assert.ok(Math.abs(editorActions[0].height-editorActions[1].height)<=0.6,'editor actions share height '+label+' '+JSON.stringify(editorActions));
  assert.match(editorActions[0].className,/\bbm-button--primary\b/,'shared save retains local primary styles '+label);
  if(mode.coarse){
   for(const action of editorActions)assert.ok(action.height>=44,'coarse editor actions retain 44px targets '+label);
   assert.ok(await invoke(ctx,"return document.querySelector('.bm-parent-line .bm-text-button').getBoundingClientRect().height>=44"),'coarse folder change retains 44px target '+label);
  }
  await click(ctx,'.bm-parent-line .bm-text-button');
  await until(ctx,"!!document.getElementById('bm-folder-search')",'picker '+label);
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-picker-list').getAttribute('role')"),'group','folder destinations retain native button keyboard semantics '+label);
  await assertIconCentered(ctx,'.bm-picker .bm-close','picker close '+label,options);
  await click(ctx,'.bm-picker .bm-close');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel editor '+label);
  await setInput(ctx,'bm-search','产品研究');
  await until(ctx,"!!document.querySelector('[data-node-id=\"11\"] .bm-search-highlight')",'search '+label);
  await assertIconCentered(ctx,'.bm-search-wrap button','search clear '+label,options);
  await click(ctx,'[data-node-id="11"] .bm-node-title');
  await until(ctx,"document.getElementById('bm-search').value===''&&document.querySelector('[data-node-id=\"11\"]')?.getAttribute('aria-expanded')==='true'",'folder reveal '+label);
  await assertRowVisible(ctx,'11','searched folder reveal '+label);
  assert.equal(await invoke(ctx,"const app=document.querySelector('.bm-app');return app.scrollWidth<=app.clientWidth+1"),true,'no App horizontal overflow '+label);
  geometryReport.push({width,mode:mode.name,viewport,media,zoomMethod:mode.zoom===2?'CSS_DOCUMENT_ZOOM_NOT_BROWSER_PAGE_ZOOM':'none',passed:['shared-native-button-labels','svg-center-0.6px','44px-row-height-and-stride','last-item-visible-keyboard-activation','search-folder-visible',...(mode.coarse?['44px-coarse-targets']:[])]});
 }
 assert.equal(geometryReport.length,widths.length*3,'all five widths must exercise dark, coarse and 200% CSS document zoom');
 // A real 360px panel at native 200% exposes 180 CSS px. Exercise that layout
 // directly; this is bounded Mock Host coverage, not native page-zoom evidence.
 for(const coarse of [false,true]){
  const width=180,label='toolbar '+width+' '+(coarse?'coarse':'fine');
  currentCase={width,mode:coarse?'toolbar-coarse':'toolbar-fine'};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1350,height:1100,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  const touch={enabled:coarse,...(coarse?{maxTouchPoints:1}:{})};
  await cdp('Emulation.setTouchEmulationEnabled',touch);
  await cdp('Page.navigate',{url:pathToFileURL(previewPath).href+'?width='+width});
  const ctx=await findReactFrame(),outer=await outerContext();
  if(ctx.session){
   await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]},ctx.session);
   await cdp('Emulation.setTouchEmulationEnabled',touch,ctx.session);
  }
  const viewport=await setFrameViewport(ctx,outer,width);
  await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,159')",'initial data '+label);
  assert.equal(await invoke(ctx,"return matchMedia('(pointer:coarse)').matches"),coarse,'actual pointer media '+label);
  const geometry=await assertTopbarGeometry(ctx,outer,label,{coarse});
  toolbarReport.push({width,coarse,viewport,geometry,zoomMethod:'EFFECTIVE_CSS_WIDTH_NOT_NATIVE_PAGE_ZOOM'});
 }
 assert.equal(toolbarReport.length,2,'180px toolbar must exercise fine and coarse pointers');
 assert.deepEqual(network,[],'no network requests');
 assert.deepEqual(exceptions,[],'no browser JS exceptions');
 const crypto=await import('node:crypto');
 await writeFile(join(out,'bookmark-r304-interaction.json'),JSON.stringify({kind:'CHROMIUM_FORMAL_REACT_MOCK_HOST',nativeVerified:false,installed:false,browser:browserInfo.product,manifest,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),report,geometryReport,toolbarReport},null,2));
 console.log('R304_REACT_CHROMIUM_PASS '+JSON.stringify({report,geometryReport,toolbarReport}));
}catch(e){
 await writeFile(join(out,'bookmark-r304-failure.txt'),String(e?.stack||e));
 await writeFile(join(out,'bookmark-r304-failure.json'),JSON.stringify({
  kind:'CHROMIUM_FORMAL_REACT_MOCK_HOST',nativeVerified:false,
  error:String(e?.stack||e),currentCase,geometryReport,toolbarReport,exceptions,network},null,2));
 console.error(e);process.exitCode=1;
}finally{
 try{socket?.close()}catch{}
 try{chrome.kill('SIGTERM')}catch{}
 await delay(180);
 try{await rm(profile,{recursive:true,force:true})}catch{}
}

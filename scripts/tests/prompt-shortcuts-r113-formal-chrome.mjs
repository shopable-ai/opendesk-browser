#!/usr/bin/env node
// The installed Sidebar Tool's exact packaged HTML, CSS and JS in real Chrome,
// paired with a deterministic in-page HOST MOCK. This is NOT installed Chrome.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../build-sidebar-tool.mjs';

const out=resolve(process.argv[2]||'artifacts/prompt-shortcuts-r113-formal-chrome');
await mkdir(out,{recursive:true});
const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
assert.equal(pkg.id,'prompt-shortcuts');
const config=JSON.parse(await readFile('examples/sidebar-tools/prompt-shortcuts/tool.config.json','utf8'));
assert.equal(pkg.version,config.version,'formal candidate must match the current tool manifest');
assert.equal(pkg.scripts?.length,1);
assert.equal(pkg.scripts[0].name,'trusted/model.js');
// Read the SAME offline raster from the original full preview as browser fixture.
// Official model still validates genuine HTTPS URLs; no data: is stored or exported.
const previewSource=await readFile('examples/sidebar-tools/prompt-shortcuts/preview/index.html','utf8');
const fixtureMarker="const PREVIEW_OFFLINE_PNG='data:image/png;base64,";
const fixtureIndex=previewSource.indexOf(fixtureMarker);
assert(fixtureIndex>=0,'original source-bound preview image exists');
const rasterFixture=previewSource.slice(fixtureIndex+fixtureMarker.length).split("'")[0];
assert(rasterFixture.length>500,'PNG fixture has real raster content');
const escaped=source=>source.replace(/<\/script/gi,'<\\/script').replace(/<\/style/gi,'<\\/style');
const bridge=String.raw`
(()=>{
  const KEY='opendesk-r113-formal-chromium-fixture',SITES_KEY='opendesk-r20-formal-sites';
  const ASSETS_KEY='opendesk-r39-formal-mock-assets';
  const initial={value:null,etag:'a'.repeat(64),revision:0};
  const read=()=>JSON.parse(localStorage.getItem(KEY)||'null')||initial;
  const readAssets=()=>JSON.parse(localStorage.getItem(ASSETS_KEY)||'{}');
  const readSites=()=>JSON.parse(localStorage.getItem(SITES_KEY)||'null')||{value:null,etag:'b'.repeat(64),revision:0};
  globalThis.OpenDeskTool={
    root:document.querySelector('main.ps'),
    setState(state){globalThis.__toolState=state;},
    async request(operation,payload){
      if(operation==='prompt.page.context')return {status:'available',origin:'https://fixture.example',path:'/chat'};
      if(operation==='prompt.page.check')return {valid:true,containerMatches:1,editorMatches:1,editorType:'textarea'};
      if(operation==='storage.get'&&payload?.key==='sites'){
        const item=readSites();return {value:item.value,etag:item.etag};
      }
      if(operation==='storage.set'&&payload?.key==='sites'){
        const previous=readSites();
        if(payload?.ifMatch!==previous.etag)throw Error('site revision conflict');
        const revision=previous.revision+1,etag=String(revision).padStart(64,'b');
        localStorage.setItem(SITES_KEY,JSON.stringify({value:payload.value,etag,revision}));
        return {saved:true,etag};
      }
      // Formal production JS + controlled persistent MOCK_HOST, never installed Chrome.
      if(operation==='prompt.asset.put'){
        if(!['image/png','image/jpeg','image/webp'].includes(payload?.mime)||
           typeof payload?.dataUrl!=='string'||
           !payload.dataUrl.startsWith('data:'+payload.mime+';base64,'))
          throw Object.assign(Error('Invalid mock image'),{code:'E_PROMPT_ASSET'});
        const bytes=atob(payload.dataUrl.split(',')[1]).length;
        if(bytes<12||bytes>65536)throw Object.assign(Error('Asset exceeds limit'),{code:'E_IMAGE_LIMIT'});
        const items=readAssets(),existing=Object.entries(items).find(([,item])=>
          item.mime===payload.mime&&item.dataUrl===payload.dataUrl);
        const id=existing?.[0]||'psa_'+Array.from(crypto.getRandomValues(new Uint8Array(16)),
          b=>b.toString(16).padStart(2,'0')).join('');
        if(!existing){
          localStorage.setItem(ASSETS_KEY,JSON.stringify({...items,
            [id]:{mime:payload.mime,dataUrl:payload.dataUrl,bytes}}));
          if(readAssets()[id]?.bytes!==bytes)throw Error('Mock asset readback failed');
        }
        return {id,mime:payload.mime,bytes};
      }
      if(operation==='prompt.asset.get'){
        const item=readAssets()[payload?.id];
        if(!item)throw Object.assign(Error('Mock asset missing'),{code:'E_IMAGE_MISSING'});
        return {...item};
      }
      if(operation==='prompt.asset.remove'){
        if(read().value?.items?.some(item=>item.imageAssetId===payload?.id))
          throw Object.assign(Error('Image is referenced'),{code:'E_IMAGE_REFERENCED'});
        const items=readAssets(),removed=Object.hasOwn(items,payload?.id);
        if(removed){
          delete items[payload.id];localStorage.setItem(ASSETS_KEY,JSON.stringify(items));
        }
        return {removed};
      }
      if(operation==='storage.get'){
        if(payload?.key!=='library'||payload?.withEtag!==true)throw Error('unexpected read shape');
        const item=read();
        return {value:item.value,etag:item.etag};
      }
      if(operation==='storage.set'){
        const previous=read();
        if(payload?.key!=='library'||payload?.ifMatch!==previous.etag)
          throw Object.assign(Error('Concurrent storage revision'),{code:'E_STORAGE_CONFLICT'});
        const revision=previous.revision+1;
        const etag=String(revision).padStart(64,'0');
        localStorage.setItem(KEY,JSON.stringify({value:payload.value,etag,revision}));
        return {saved:true,etag};
      }
      throw Error('Unsupported fixture operation: '+operation);
    }
  };
  globalThis.OpenDeskSDK={browser:{launch:{consume:async()=>null}}};
  globalThis.__readFormalToolStore=read;
  globalThis.__readFormalSiteStore=readSites;
  globalThis.__readFormalAssets=readAssets;
})();
`;
const documentHtml='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>FORMAL SOURCE / MOCK HOST / NOT INSTALLED</title>'+
  '<style>'+escaped(pkg.css)+'</style></head><body>'+
  pkg.html+'<script>'+escaped(bridge)+'</script>'+
  pkg.scripts.map(s=>'<script>'+escaped(s.code)+'</script>').join('')+
  '<script>'+escaped(pkg.js)+'</script></body></html>';
const server=createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(documentHtml);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'prompt-shortcuts-formal-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,seq=0;
const outstanding=new Map(),jsErrors=[];
const report={kind:'FORMAL_PACKAGED_UI_REAL_CHROMIUM_SIMULATED_HOST',installedExtension:false,
  liveChatGPT:false,version:pkg.version,candidateSource:pkg.id,
  packageSHA256:createHash('sha256').update(encodeSidebarToolPackage(pkg)).digest('hex'),scenes:[]};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function rpc(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{outstanding.delete(id);fail(Error('CDP timeout '+method));},16000);
    outstanding.set(id,{ok(value){clearTimeout(timeout);ok(value);},
      fail(error){clearTimeout(timeout);fail(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await sleep(100);
  }
  assert(port,'Chrome debugging port not found');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Fetch.requestPaused'){
      const target=m.params.request.url;
      void rpc('Fetch.fulfillRequest',{
        requestId:m.params.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'no-store'}],
        body:target.endsWith('/bad.png')?'bm90LWEtcG5n':rasterFixture
      }).catch(error=>jsErrors.push('Controlled HTTPS image response: '+error.message));
      return;
    }
    if(m.method==='Runtime.exceptionThrown')
      jsErrors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text);
    if(!m.id||!outstanding.has(m.id))return;
    const callback=outstanding.get(m.id);outstanding.delete(m.id);
    if(m.error)callback.fail(Error(m.error.message));else callback.ok(m.result);
  });
  await rpc('Page.enable');await rpc('Runtime.enable');
}
async function evaluate(expression){
  const value=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function poll(expression,label){
  for(let i=0;i<100;i++){
    if(await evaluate(expression))return;
    await sleep(75);
  }
  throw Error('Not ready: '+label);
}
async function click(selector){
  const rect=await evaluate('('+function(s){
    const el=document.querySelector(s);
    if(!el||el.disabled||el.closest('[hidden]'))throw Error('Missing visible button '+s);
    el.scrollIntoView({block:'nearest'});
    const r=el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
  }.toString()+')('+JSON.stringify(selector)+')');
  assert(rect.width>0&&rect.height>0,'visible '+selector);
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],
    ['mouseReleased',{button:'left',clickCount:1}]])
    await rpc('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,...extra});
}
async function fill(selector,value){
  return evaluate('('+function(s,v){
    const el=document.querySelector(s);
    if(!el)throw Error('Missing input '+s);
    el.value=v;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
}
async function screenshot(name){
  const png=await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(png.data,'base64'));
}
async function view(){
  return evaluate('('+function(){
    const $=s=>document.querySelector(s),body=$('#ps-body'),clip=$('.ps-card-preview');
    return {count:$('.ps-list-caption')?.textContent||'',
      visibleCards:document.querySelectorAll('.ps-card').length,
      indexVisible:!$('#ps-index').hidden,formVisible:!$('#ps-edit').hidden,
      settingsExpanded:$('#ps-toggle-settings').getAttribute('aria-expanded'),
      settingsHidden:$('#ps-setting-fields').hidden,
      bodyRows:body.rows,bodyHeight:Math.round(body.getBoundingClientRect().height),
      bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,
      clamp:clip?getComputedStyle(clip).webkitLineClamp:null,
      width:document.documentElement.clientWidth,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      itemBodies:(globalThis.__readFormalToolStore()?.value?.items||[]).map(x=>x.body),
      countText:$('#ps-count')?.textContent,
      error:$('#ps-error')?.textContent,
      status:$('#ps-status')?.textContent};
  }.toString()+')()');
}
async function width(n){
  await rpc('Emulation.setDeviceMetricsOverride',
    {width:n,height:850,deviceScaleFactor:1,mobile:false});
}
async function run(){
  await connect();await width(400);
  await rpc('Page.navigate',{url});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled','ready');
  let x=await view();
  assert.equal(x.visibleCards,0);
  await click('#ps-new');
  x=await view();assert.equal(x.formVisible,true);assert.equal(x.settingsExpanded,'true');
  assert.equal(x.bodyRows,3);
  await screenshot('formal-create-400px');
  await fill('#ps-body','你好');
  await click('#ps-save');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden&&document.querySelectorAll(".ps-card").length===1',
    'saved 你好 list');
  x=await view();
  assert.deepEqual(x.itemBodies,['你好']);
  assert.equal(x.countText,'1 个 · 1 个启用');
  const buttonStyle=await evaluate('('+function(){
    const use=getComputedStyle(document.querySelector('.ps-card-use'));
    // The compact header's New icon is intentionally transparent too. Compare
    // with the actual primary Save control, not a second quiet header action.
    const primary=getComputedStyle(document.querySelector('#ps-save'));
    return {useBackground:use.backgroundColor,useColor:use.color,
      primaryBackground:primary.backgroundColor};
  }.toString()+')()');
  assert.notEqual(buttonStyle.useBackground,buttonStyle.primaryBackground,
    'a full-body shortcut must not inherit visually dominant blue primary fill');
  assert.notEqual(buttonStyle.useColor,buttonStyle.useBackground,'prompt text must be legible');
  report.contentFirstControlStyle=buttonStyle;
  await screenshot('formal-saved-400px');
  await rpc('Page.reload',{ignoreCache:true});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled&&document.querySelectorAll(".ps-card").length===1',
    'persisted after reload');
  x=await view();assert.deepEqual(x.itemBodies,['你好']);
  report.helloSaveAndReload=true;report.uniqueCount=x.visibleCards;
  // Opening the saved card must display read-only detail, not write or copy.
  const beforeDetail=await evaluate('globalThis.__readFormalToolStore().revision');
  await click('.ps-card-use');
  assert.equal(await evaluate('!document.querySelector("#ps-detail").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#ps-detail-body").textContent'),'你好');
  assert.equal(await evaluate('document.querySelector("#ps-edit").hidden'),true);
  assert.equal(await evaluate('globalThis.__readFormalToolStore().revision'),beforeDetail);
  await screenshot('r44-formal-detail-400px');
  await click('#ps-detail-back');
  assert.equal(await evaluate('document.querySelector("#ps-detail").hidden'),true);
  assert.equal(await evaluate('document.activeElement?.dataset.action'),'detail');
  report.r44ReadOnlyDetail=true;

  // Real Chromium drives the formal website-settings UI against a bounded
  // deterministic Host mock; this is not a real website or extension install.
  await click('#ps-sites-open');
  await poll('!document.querySelector("#ps-sites-panel").hidden','site settings');
  await click('#ps-site-current');
  await poll('document.querySelector("#ps-site-origin").textContent==="https://fixture.example"',
    'site origin');
  await fill('#ps-site-container','main');
  await fill('#ps-site-editor','textarea');
  await click('#ps-site-test');
  await poll('document.querySelector("#ps-site-verified").textContent.includes("验证成功")',
    'dual-selector validation');
  await screenshot('formal-two-selectors-400px');
  await click('#ps-site-save');
  await poll('document.querySelectorAll(".ps-site-row").length===1','site persist');
  assert.equal((await evaluate('globalThis.__readFormalSiteStore().value.rules[0].editorSelector')),
    'textarea');
  await rpc('Page.reload',{ignoreCache:true});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled',
    'site settings reload');
  await click('#ps-sites-open');
  await poll('document.querySelectorAll(".ps-site-row").length===1','site recovery after refresh');
  for(const n of [320,360,380,400,440]){
    await width(n);
    x=await view();
    assert.equal(x.horizontalOverflow,false,'site list overflow '+n);
    await screenshot('formal-sites-'+n+'px');
    report.scenes.push({width:n,form:'sites',overflow:x.horizontalOverflow,
      screenshot:'formal-sites-'+n+'px.png'});
  }
  report.siteSettingsMockHost={saved:true,recoveredAfterReload:true,installed:false};
  await click('#ps-sites-open');
  for(const n of [320,360,380,400,440]){
    await width(n);
    x=await view();assert.equal(x.horizontalOverflow,false,'formal list overflow '+n);
    assert.equal(x.clamp,'2');
    await screenshot('formal-list-'+n+'px');
    report.scenes.push({width:n,form:'list',overflow:x.horizontalOverflow,screenshot:'formal-list-'+n+'px.png'});
  }
  // R1.17 acceptance: exercise THE FORMAL BUNDLED UI in real Chromium,
  // not just the independent preview, across the complete Side Panel width range.
  for(const n of [320,360,380,400,440]){
    await width(n);
    const initial=await evaluate('('+function(){
      const buttons=[...document.querySelectorAll('.ps-card-actions button')];
      return {count:buttons.length,actions:buttons.map(b=>b.dataset.action),
        hasIcons:buttons.every(b=>b.querySelector('svg')&&b.textContent.trim()===''&&b.title&&b.getAttribute('aria-label'))};
    }.toString()+')()');
    assert.equal(initial.count,2,'each card has quick copy and More, never fixed text-width controls');
    assert.deepEqual(initial.actions,['quick-copy','more']);
    assert.equal(Boolean(initial.hasIcons),true);
    const beforeMenu=await evaluate('('+function(){
      const c=document.querySelector('.ps-card'),u=c.querySelector('.ps-card-use'),t=c.querySelector('.ps-card-preview');
      return {width:u.getBoundingClientRect().width,textWidth:t.getBoundingClientRect().width,
        cardHeight:c.getBoundingClientRect().height,clamp:getComputedStyle(t).webkitLineClamp,body:t.textContent};
    }.toString()+')()');
    await click('.ps-card-actions button[data-action="more"]');
    const menu=await evaluate('('+function(){
      const buttons=[...document.querySelectorAll('.ps-card-actions button,.ps-more button')];
      const c=document.querySelector('.ps-card'),u=c.querySelector('.ps-card-use'),t=c.querySelector('.ps-card-preview');
      return {actions:buttons.map(b=>b.dataset.action),
        iconOnly:buttons.every(b=>b.textContent.trim()===''&&!!b.querySelector('svg')&&!!b.title&&!!b.getAttribute('aria-label')),
        geometry:(()=>{const bar=document.querySelector('.ps-more'),controls=[...bar.querySelectorAll('button')];
          const rects=controls.map(button=>button.getBoundingClientRect()),css=getComputedStyle(bar);
          return {six:rects.length===6,exactSquares:rects.every(r=>Math.abs(r.width-40)<=1&&Math.abs(r.height-40)<=1),
            twoRows:rects.slice(0,3).every(r=>Math.abs(r.top-rects[0].top)<=1)&&rects.slice(3).every(r=>r.top>rects[0].top+20),
            absolute:css.position==='absolute',columns:css.gridTemplateColumns.split(' ').length};})(),
        unchanged:{width:u.getBoundingClientRect().width,textWidth:t.getBoundingClientRect().width,
          cardHeight:c.getBoundingClientRect().height,clamp:getComputedStyle(t).webkitLineClamp,body:t.textContent},
        overlay:getComputedStyle(c.querySelector('.ps-card-actions')).position,
        hasHorizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
        expanded:document.querySelector('.ps-card-actions button[data-action="more"]')?.getAttribute('aria-expanded')};
    }.toString()+')()');
    assert.deepEqual(menu.actions,['quick-copy','more','edit','toggle','up','down','copy','delete']);
    assert.equal(menu.iconOnly,true);
    assert.deepEqual(menu.geometry,{six:true,exactSquares:true,twoRows:true,absolute:true,columns:3});
    assert.deepEqual(menu.unchanged,beforeMenu,'hover and More must not alter card body width, lines or height');
    assert.equal(menu.overlay,'absolute');
    assert.equal(menu.hasHorizontalOverflow,false,'management menu overflow '+n);
    assert.equal(menu.expanded,'true');
    await screenshot('formal-icon-actions-'+n+'px');
    report.scenes.push({width:n,form:'icon-actions',overflow:menu.hasHorizontalOverflow,
      screenshot:'formal-icon-actions-'+n+'px.png'});
    await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',
      windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',
      windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await poll('!document.querySelector(".ps-more")','Esc closes icon actions');
    assert.equal(await evaluate('document.activeElement===document.querySelector(".ps-card-actions button[data-action=more]")'),
      true,'Escape must restore focus to More');
  }
  report.iconOnlyFormalActions=true;
  await click('#ps-new');
  await fill('#ps-body','批量保存测试');
  await click('#ps-save-next');
  await poll('document.querySelector("#ps-edit")&&!document.querySelector("#ps-edit").hidden&&'+
    'document.querySelector("#ps-body").value===""','save-and-continue form reset');
  assert.deepEqual((await view()).itemBodies,['你好','批量保存测试']);
  assert.equal(await evaluate('document.activeElement===document.querySelector("#ps-body")'),true,
    'new draft receives keyboard focus only after acknowledged save');
  await click('#ps-cancel');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden',
    'batch cancel to list');
  report.saveAndContinueMockHost=true;
  await click('#ps-new');
  assert.equal((await view()).settingsExpanded,'true');
  await click('#ps-toggle-settings');
  assert.equal((await view()).settingsExpanded,'false');
  await fill('#ps-body',Array.from({length:100},(_,i)=>'正文第'+i+'行').join('\n'));
  x=await view();
  assert.equal(x.settingsHidden,true,'typing must not reopen collapsed optional fields');
  assert.equal(x.bodyRows,3);
  assert(x.bodyScrollHeight>x.bodyClientHeight,'hundred-line body must scroll internally');
  for(const n of [320,360,380,400,440]){
    await width(n);x=await view();
    assert.equal(x.horizontalOverflow,false,'formal form overflow '+n);
    await screenshot('formal-long-body-'+n+'px');
    report.scenes.push({width:n,form:'100-lines',overflow:x.horizontalOverflow,screenshot:'formal-long-body-'+n+'px.png'});
  }
  await click('#ps-cancel');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden',
    'R1.9.5 ordinary unsaved form directly returns without an extra confirmation');
  assert.equal(await evaluate('document.querySelector("#ps-leave")===null'),true,
    'old unsaved warning must not return');
  await rpc('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await screenshot('formal-dark-440px');
  report.darkScreenshot='formal-dark-440px.png';
  // R3.5: real packaged UI path: new image, decoded preview, failed HTTPS
  // response fallback, recovery, save/reopen, global size persistence.
  // This is controlled HTTPS response in actual Chromium, not public CDN.
  await rpc('Fetch.enable',{patterns:[{
    urlPattern:'https://fixture.opendesk.invalid/*',resourceType:'Image',requestStage:'Request'
  }]});
  await click('#ps-new');
  await fill('#ps-body','图片按钮正式源码测试：完整提示词正文');
  await evaluate('document.querySelector("#ps-appearance-image").click()');
  await evaluate('document.querySelector("#ps-image-source-url").click()');
  await fill('#ps-image-url','https://fixture.opendesk.invalid/bad.png');
  await poll('document.querySelector("#ps-image-preview")?.textContent?.length>0 && '+
    '!document.querySelector("#ps-image-preview").classList.contains("has-image")',
    'formal live image invalid response falls back to short label');
  assert.match(await evaluate('document.querySelector("#ps-image-help").textContent'),/失败/);
  await fill('#ps-image-url','https://fixture.opendesk.invalid/ok.png');
  await poll('document.querySelector("#ps-image-preview img")?.naturalWidth>0',
    'formal live HTTPS image actually decoded');
  const imagePreview=await evaluate('(()=>{const img=document.querySelector("#ps-image-preview img");'+
    'const h=document.querySelector("#ps-image-preview"),r=h.getBoundingClientRect();return {'+
    'naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,width:r.width,height:r.height,'+
    'visible:r.width>0&&r.height>0,objectFit:getComputedStyle(img).objectFit};})()');
  assert(imagePreview.naturalWidth>0&&imagePreview.naturalHeight>0&&imagePreview.visible);
  assert.equal(imagePreview.objectFit,'contain');
  assert(Math.abs(imagePreview.width-68)<.6&&Math.abs(imagePreview.height-48)<.6);
  await screenshot('r35-formal-live-image-preview');
  await click('#ps-save');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden&&'+
    'document.querySelectorAll(".ps-card").length===3',
    'formal tool persists a new image prompt');
  await poll('document.querySelector(".ps-glyph.has-image img")?.naturalWidth>0',
    'saved image prompt renders a decoded thumbnail');
  await screenshot('r35-formal-image-saved');
  const beforeSize=await evaluate('globalThis.__readFormalToolStore().value.settings.imageSize');
  assert.equal(beforeSize,'large');
  const imageSizes=[];
  for(const [size,w,h] of [['compact',48,40],['standard',56,44],['large',68,48]]){
    const sizeSelector=JSON.stringify('#ps-image-size-setting [data-image-size="'+size+'"]');
    await evaluate('(()=>{const b=document.querySelector('+sizeSelector+');if(!b)throw Error("missing size dot");b.click();})()');
    await poll('globalThis.__readFormalToolStore().value.settings.imageSize==='+JSON.stringify(size),
      'formal Host CAS persists global image size '+size);
    const row=await evaluate('({size:document.querySelector("#ps-image-size").value,'+
      'thumbWidth:document.querySelector(".ps-glyph.has-image").getBoundingClientRect().width,'+
      'thumbHeight:document.querySelector(".ps-glyph.has-image").getBoundingClientRect().height})');
    assert.equal(row.size,size);
    assert(Math.abs(row.thumbWidth-48)<.6&&Math.abs(row.thumbHeight-38)<.6,
      'formal list thumbnails remain compact while web buttons change size');
    imageSizes.push({size,width:w,height:h,compactListThumbnail:row});
  }
  await rpc('Page.reload',{ignoreCache:true});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled&&'+
    'document.querySelectorAll(".ps-card").length===3','formal reloaded image data');
  assert.equal(await evaluate('globalThis.__readFormalToolStore().value.settings.imageSize'),'large');
  await poll('document.querySelector(".ps-glyph.has-image img")?.naturalWidth>0',
    'image remains visibly decoded after reload');
  report.r35Image={controlledHttps:true,publicInternetNotTested:true,actualPreview:imagePreview,
    savedAndRecovered:true,sizesPersisted:imageSizes,installedExtension:false};
  await rpc('Fetch.disable');

  // R3.9: use the native CDP file-input API with the exact packaged UI and
  // a bounded LOCAL_STORAGE mock Host. This proves real decoding and reloading,
  // but does NOT claim that an installed Trusted Host was exercised.
  const inputPath=join(out,'r39-upload-source.png');
  await writeFile(inputPath,Buffer.from(rasterFixture,'base64'));
  await width(400);
  await click('#ps-new');
  await fill('#ps-body','R3.9 正式图片上传保存读回');
  await evaluate('document.querySelector("#ps-appearance-image").click()');
  await evaluate('document.querySelector("#ps-image-source-local").click()');
  await rpc('DOM.enable');
  const documentNode=(await rpc('DOM.getDocument',{depth:1})).root.nodeId;
  const fileNode=(await rpc('DOM.querySelector',
    {nodeId:documentNode,selector:'#ps-image-file'})).nodeId;
  assert(fileNode,'formal original file selector exists');
  await rpc('DOM.setFileInputFiles',{nodeId:fileNode,files:[inputPath]});
  await evaluate('document.querySelector("#ps-image-file").dispatchEvent(new Event("change",{bubbles:true}))');
  await poll('document.querySelector("#ps-image-help").textContent.includes("资源库")',
    'real PNG decoded, compressed and stored by MOCK_HOST');
  const localPreview=await evaluate('(()=>{const img=document.querySelector("#ps-image-preview img");'+
    'return {naturalWidth:img?.naturalWidth||0,naturalHeight:img?.naturalHeight||0,'+
    'objectFit:img?getComputedStyle(img).objectFit:""};})()');
  assert(localPreview.naturalWidth>0&&localPreview.naturalHeight>0);
  assert.equal(localPreview.objectFit,'contain');
  await screenshot('r39-formal-local-upload');
  await click('#ps-save');
  await poll('globalThis.__readFormalToolStore().value?.items?.length===4',
    'saved local image prompt into mock Host');
  const assetId=await evaluate('globalThis.__readFormalToolStore().value.items.find('+
    'row=>row.body==="R3.9 正式图片上传保存读回").imageAssetId');
  assert.match(assetId,/^psa_[a-f0-9]{32}$/);
  assert.equal(await evaluate('Object.keys(globalThis.__readFormalAssets()).length'),1);
  await rpc('Page.reload',{ignoreCache:true});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled',
    'formal local image reload');
  await poll('document.querySelector("#ps-list .ps-card:last-child .ps-glyph.has-image img")?.naturalWidth>0',
    'real PNG loaded from persistent mock Host after reload');
  assert.equal(await evaluate('globalThis.__readFormalToolStore().value.items.find('+
    'row=>row.body==="R3.9 正式图片上传保存读回").imageAssetId'),assetId);
  assert.equal(await evaluate('Object.keys(globalThis.__readFormalAssets()).length'),1);
  await screenshot('r39-formal-local-reloaded');
  await click('#ps-list .ps-card:last-child .ps-card-actions button[data-action="more"]');
  await click('#ps-list .ps-card:last-child .ps-more button[data-action="delete"]');
  await click('#ps-list .ps-card:last-child .ps-confirm .od-button--danger');
  await poll('globalThis.__readFormalToolStore().value.items.length===3',
    'mock Host deletion committed');
  await poll('Object.keys(globalThis.__readFormalAssets()).length===0',
    'mock Host unused local image cleaned after delete');
  report.r39LocalImageMockHost={pngDecoded:true,preview:localPreview,
    storedId:assetId,recoveredAfterReload:true,cleanedAfterDelete:true,installedExtension:false};
  assert.equal(jsErrors.length,0,'formal JavaScript console exceptions: '+jsErrors.join(' | '));
  report.consoleExceptions=jsErrors;report.result='PASS';
  console.log('PROMPT_SHORTCUTS_FORMAL_CHROMIUM_PASS',JSON.stringify(report));
}
try{await run();}
catch(error){report.result='FAIL';report.error=String(error?.stack||error);console.error(report.error);process.exitCode=1;}
finally{
  report.consoleExceptions=jsErrors;
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  try{socket?.close();}catch{}
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}

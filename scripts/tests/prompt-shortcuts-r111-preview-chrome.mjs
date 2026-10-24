#!/usr/bin/env node
// Real Chromium against committed offline HTML. NOT an installed extension or ChatGPT acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'artifacts/prompt-shortcuts-r111-preview');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'prompt-shortcuts-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',['--headless=new','--no-sandbox',
  '--disable-gpu','--disable-dev-shm-usage','--no-first-run',
  '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
let socket,seq=0;
const pending=new Map(),fileChooserEvents=[],report={kind:'REAL_CHROME_OFFLINE_PREVIEW_ONLY',installedExtension:false,scenes:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
  let port=0;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;await sleep(100);
  }
  assert(port,'Chrome debugging port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const response=JSON.parse(event.data);
    if(response.method==='Page.fileChooserOpened'){fileChooserEvents.push(response.params);return;}
    if(!response.id||!pending.has(response.id))return;
    const cb=pending.get(response.id);pending.delete(response.id);
    if(response.error)cb.fail(Error(response.error.message));else cb.ok(response.result);
  });
  await call('Page.enable');await call('Runtime.enable');await call('Page.bringToFront');
}
function call(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('timeout '+method))},18000);
    pending.set(id,{ok(x){clearTimeout(timeout);ok(x);},fail(e){clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evalChrome(expression){
  const res=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(res.exceptionDetails)throw Error(res.exceptionDetails.exception?.description||res.exceptionDetails.text);
  return res.result?.value;
}
async function poll(expression,label){
  for(let n=0;n<90;n++){if(await evalChrome(expression))return;await sleep(65);}
  throw Error('Not ready: '+label);
}
async function click(selector){
  const rect=await evalChrome('('+function(s){
    const b=document.querySelector(s);
    if(!b||b.disabled)throw Error('Missing enabled button '+s);
    b.scrollIntoView({block:'nearest'});
    const r=b.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
  }.toString()+')('+JSON.stringify(selector)+')');
  assert(rect.width>0&&rect.height>0,'visible '+selector);
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],
    ['mouseReleased',{button:'left',clickCount:1}]])
    await call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,...extra});
}
async function reloadPreview(){
  const previousTimeOrigin=await evalChrome('performance.timeOrigin');
  await call('Page.reload',{ignoreCache:true});
  // Saved prompt controls in an old document are not evidence that reload finished.
  await poll('performance.timeOrigin!=='+JSON.stringify(previousTimeOrigin)+
    '&&document.readyState==="complete"','reloaded offline HTML document');
}
async function pressKey(key,code,virtualKey,modifiers=0){
  for(const type of ['keyDown','keyUp'])
    await call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:virtualKey,
      nativeVirtualKeyCode:virtualKey,modifiers});
}
async function waitPreviewRail(){
  await poll('document.querySelector("#pageRail .page-shortcut")?.isConnected',
    'direct saved prompts in offline HTML rail');
  assert.equal(await evalChrome('document.querySelector("#pageRail .starter-toggle")===null && '+
    'document.querySelector("#pageRail .nav-preview")===null'),true,
    'OD launcher and transcript top/bottom arrows are deleted');
}
async function shot(name){
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
}
// R3.5: a DOM <img> and CSS variable are NOT evidence of actual pixels.
async function r35ImageEvidence(){
  return evalChrome('('+function(){
    const rail=document.querySelector('#pageRail');
    const img=rail?.querySelector('img[data-preview-fixture="offline-png"]');
    const b=img?.closest('button'),r=b?.getBoundingClientRect(),i=img?.getBoundingClientRect();
    const style=b&&getComputedStyle(b);
    const colors=new Set();
    if(img?.complete&&img.naturalWidth>0&&img.naturalHeight>0){
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      for(let p=0;p<pixels.length;p+=64)
        colors.add(pixels[p]+','+pixels[p+1]+','+pixels[p+2]+','+pixels[p+3]);
    }
    return {size:rail?.dataset.imageSize,complete:img?.complete??false,
      naturalWidth:img?.naturalWidth||0,naturalHeight:img?.naturalHeight||0,
      colors:colors.size,objectFit:img&&getComputedStyle(img).objectFit,
      width:r?.width||0,height:r?.height||0,
      visible:!!(r&&r.width>0&&r.height>0&&i?.width>0&&i.height>0&&
        style.display!=='none'&&style.visibility==='visible'&&
        !rail.hidden&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight)};
  }.toString()+')()');
}
async function r35Screenshot(name){
  const clip=await evalChrome('('+function(){
    const b=document.querySelector('#pageRail img[data-preview-fixture]')?.closest('button');
    if(!b)throw Error('Cannot crop: missing visible image button');
    const r=b.getBoundingClientRect();
    return {x:Math.max(0,Math.floor(r.x-10)),y:Math.max(0,Math.floor(r.y-10)),
      width:Math.ceil(r.width+20),height:Math.ceil(r.height+20),scale:1};
  }.toString()+')()');
  const result=await call('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});
  const png=Buffer.from(result.data,'base64');
  assert(png.byteLength>800,'actual image button screenshot not blank');
  await writeFile(join(out,name+'.png'),png);
}
async function r35ChooseSize(value){
  await evalChrome('('+function(size){
    const button=document.querySelector('#imageSizeGroup button[data-image-size="'+size+'"]');
    if(!button)throw Error('missing actual image size button: '+size);
    button.click();
  }.toString()+')('+JSON.stringify(value)+')');
}
async function state(){
  return evalChrome('('+function(){
    const q=x=>document.querySelector(x);
    const card=q('.prompt-card'),panel=q('#sidepanel'),text=q('.prompt-content');
    return {cards:document.querySelectorAll('.prompt-card').length,
      firstContent:text?.textContent,clamp:getComputedStyle(text).webkitLineClamp,
      firstButton:q('.prompt-use')?.getAttribute('aria-label'),
      width:Math.round(panel.getBoundingClientRect().width),
      overflow:panel.scrollWidth>panel.clientWidth+1,
      draft:q('#mockDraft').value,notice:q('#panelStatus').textContent,
      kind:q('#panelStatus').dataset.kind,
      editing:!q('#formView').hidden,leaving:Boolean(q('#leaveConfirm')&&!q('#leaveConfirm').hidden),
      shapeInputs:document.querySelectorAll('input[name="shape"]').length,
      copyDialog:Boolean(q('#copyFallback')),
      iconRadius:getComputedStyle(card.querySelector('.prompt-icon')).borderRadius};
  }.toString()+')()');
}
async function run(){
  await connect();
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(resolve('examples/sidebar-tools/prompt-shortcuts/preview/index.html')).href});
  await poll('document.readyState==="complete"&&document.querySelectorAll(".prompt-card").length===3','three first-install demo cards');
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail .page-shortcut").length'),3,
    'default webpage rail contains exactly three saved prompt buttons');
  await click('#pageRail .page-shortcut:nth-child(1)');
  await poll('document.querySelector("#mockDraft").value.includes("浏览器插件定制开发需求")',
    'first-run button directly inserts the stored prompt');
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail .page-shortcut").length'),3,
    'insertion must not add OD, transcript arrows or management controls');
  await evalChrome('document.querySelector("#mockDraft").value=""');
  await evalChrome('(()=>{const select=document.querySelector("#previewDataScenario");select.value="empty";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await poll('document.querySelectorAll(".prompt-card").length===0','genuine intentionally empty library');
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail .page-shortcut").length'),0,
    'empty library has no synthetic launcher or navigation buttons');
  assert.equal(await evalChrome('document.querySelector("#pageRail").hidden'),true,
    'empty rail stays visually hidden');
  await evalChrome('(()=>{const select=document.querySelector("#previewDataScenario");select.value="legacy";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await poll('document.querySelectorAll(".prompt-card").length===4','legacy four cards');
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail .page-shortcut").length'),4,
    'legacy four prompts are directly visible without an OD button');
  await waitPreviewRail();
  await poll('document.querySelector("#pageRail img[data-preview-fixture]")?.naturalWidth>0',
    'R3.5 offline example image decoded');
  report.r35ImageEvidence=[];
  for(const [size,dims,name] of [
    ['large',[68,48],'r35-image-large'],
    ['compact',[48,40],'r35-image-compact'],
    ['standard',[56,44],'r35-image-standard'],
    ['large',[68,48],'r35-image-large-restored']]){
    await r35ChooseSize(size);
    const image=await r35ImageEvidence();
    assert.equal(image.size,size);
    assert(image.complete&&image.naturalWidth>0&&image.naturalHeight>0,'decoded PNG must be visible');
    assert(image.colors>10,'image must contain real multi-colored raster content');
    assert(image.visible,'decoded image must be visible inside Chromium viewport');
    assert.equal(image.objectFit,'contain','do not crop image content');
    assert(Math.abs(image.width-dims[0])<.6&&Math.abs(image.height-dims[1])<.6,
      'real rendered button dimensions: '+size);
    report.r35ImageEvidence.push(image);
    await r35Screenshot(name);
  }
  assert(new Set(report.r35ImageEvidence.map(x=>x.width+'x'+x.height)).size===3,
    'three distinct pixel-measured sizes required');
  await shot('r35-full-original-mixed-text-and-image');
  await evalChrome('(()=>{const draft=document.querySelector("#mockDraft");draft.value="原草稿";draft.setSelectionRange(draft.value.length,draft.value.length);})()');
  await waitPreviewRail();
  await click('#pageRail .page-shortcut:nth-child(1)');
  await poll('document.querySelector("#mockDraft").value.includes("不改变原意")',
    'legacy text insertion directly from prompt button');
  const textInsert=await evalChrome('document.querySelector("#mockDraft").value');
  await waitPreviewRail();
  await click('#pageRail .page-shortcut:nth-child(2)');
  await poll('document.querySelector("#mockDraft").value.includes("重要依据")',
    'legacy image insertion directly from prompt button');
  const imageInsert=await evalChrome('document.querySelector("#mockDraft").value');
  assert(textInsert.includes('原草稿')&&textInsert.includes('不改变原意'));
  assert(imageInsert.includes('原草稿')&&imageInsert.includes('重要依据'));
  assert(!imageInsert.includes('images.unsplash.com'),'only prompt text is inserted');
  report.r35PromptInsert=true;
  await r35ChooseSize('standard');
  await reloadPreview();
  await waitPreviewRail();
  await poll('document.querySelector("#pageRail img[data-preview-fixture]")?.naturalWidth>0',
    'offline image must recover after reload');
  const persisted=await r35ImageEvidence();
  assert.equal(persisted.size,'standard');
  assert(Math.abs(persisted.width-56)<.6&&Math.abs(persisted.height-44)<.6,
    'refresh must retain the selected pixel dimensions');
  report.r35ReloadSizePersisted=true;
  await r35ChooseSize('large');
  let x=await state();
  assert.equal(x.cards,4);assert.equal(x.clamp,'2');assert(x.firstContent.includes('\n1. '));
  assert(x.firstButton.startsWith('使用完整提示词'));
  assert.equal(x.copyDialog,false);assert.equal(x.shapeInputs,0);
  // R1.16 all SVG icons come from inline source with accessible button names.
  const icons=await evalChrome('('+function(){
    const a=document.querySelector('#addButton');
    const ids=['addButton','hostBack','hostSettings','hostMore','hostChat','themeButton','resetButton'];
    const named=ids.map(id=>({id,button:document.getElementById(id),svg:document.getElementById(id)?.querySelector('svg use')}));
    const r=a.getBoundingClientRect();
    return {symbols:document.querySelectorAll('.od-icon-sprite symbol').length,
      names:named.map(x=>({id:x.id,name:x.button?.getAttribute('aria-label'),href:x.svg?.getAttribute('href')})),
      addVisibleText:a.textContent.trim(),addBounds:{width:r.width,height:r.height},
      cardButtons:document.querySelector('.prompt-card').querySelectorAll('.prompt-actions button').length};
  }.toString()+')()');
  assert(icons.symbols>=15);
  assert.equal(icons.addVisibleText,'');
  assert(icons.addBounds.width>=30&&icons.addBounds.width<=36&&icons.addBounds.height>=30);
  assert(icons.names.every(x=>x.name&&x.href?.startsWith('#ps-icon-')));
  assert.equal(icons.cardButtons,1);
  report.iconOnlyPrimaryActions=true;
  await click('#themeButton');
  assert.equal(await evalChrome('document.documentElement.dataset.theme'),"dark");
  assert.equal(await evalChrome('document.querySelector("#themeButton use").getAttribute("href")'),"#ps-icon-sun");
  assert.equal(await evalChrome('document.querySelector("#themeButton").getAttribute("aria-pressed")'),"true");
  await shot('dark-svg-icons.png');
  await click('#themeButton');
  assert.equal(await evalChrome('document.documentElement.dataset.theme'),"light");
  for(const width of [320,360,400,440]){
    await click('#size'+width);x=await state();
    assert.equal(x.width,width);assert.equal(x.overflow,false,'panel overflow '+width);
    await shot('list-'+width+'px');report.scenes.push({width,overflow:x.overflow,screenshot:'list-'+width+'px.png'});
  }
  assert.equal(await evalChrome('document.querySelector("#indexHeading")===null'),true);
  assert.equal(await evalChrome('getComputedStyle(document.querySelector("#listCount")).position'),"absolute");
  assert.equal(await evalChrome('!document.querySelector("#addButton").hidden'),true);
  // Narrow sidebar must keep the icon toolbar unobstructed and focusable.
  await click('#size320');
  await click('.prompt-actions button[aria-label^="更多操作"]');
  const iconMenu=await evalChrome('('+function(){
    const bar=document.querySelector('.prompt-more'),buttons=[...bar.querySelectorAll('button')];
    const card=bar.closest('.prompt-card'),panel=document.querySelector('#sidepanel');
    return {count:buttons.length,labels:buttons.map(x=>x.getAttribute('aria-label')),
      titles:buttons.map(x=>x.title),allSvg:buttons.every(x=>x.querySelector('svg use')),
      noVisibleText:buttons.every(x=>x.textContent.trim()===''),
      sizes:buttons.map(x=>[Math.round(x.getBoundingClientRect().width),Math.round(x.getBoundingClientRect().height)]),
      noOverflow:bar.scrollWidth<=bar.clientWidth+1&&card.scrollWidth<=card.clientWidth+1&&panel.scrollWidth<=panel.clientWidth+1,
      focused:document.activeElement?.getAttribute('aria-label')};
  }.toString()+')()');
  assert.equal(iconMenu.count,6);
  assert.deepEqual(iconMenu.labels.map(x=>x.split('：')[0]),['编辑','停用','上移','下移','复制','删除']);
  assert(iconMenu.allSvg&&iconMenu.noVisibleText&&iconMenu.noOverflow);
  assert(iconMenu.titles.every((name,i)=>name===iconMenu.labels[i]&&name));
  assert(iconMenu.sizes.every(([w,h])=>w>=38&&h>=38));
  assert(iconMenu.focused.startsWith('编辑：'));
  await shot('icon-toolbar-320px');
  await click('.prompt-actions button[aria-label^="更多操作"]');
  await click('#size440');
  report.responsiveIconToolbar=true;
  // R1.16 trusted settings: three switches and multi-site status (no fake site authorization).
  await click('#hostMore');
  assert.equal(await evalChrome('!document.querySelector("#hostMoreMenu").hidden'),true);
  await pressKey('Escape','Escape',27);
  assert.equal(await evalChrome('document.querySelector("#hostMoreMenu").hidden'),true);
  assert.equal(await evalChrome('document.activeElement?.id'),'hostMore');
  await click('#hostMore');
  assert.equal(await evalChrome('document.activeElement?.id'),'hostSettings');
  await pressKey('Tab','Tab',9);
  assert.equal(await evalChrome('document.activeElement?.id'),'hostRemove');
  await pressKey('Tab','Tab',9,8);
  assert.equal(await evalChrome('document.activeElement?.id'),'hostSettings');
  report.r42HostMenuKeyboard=true;
  await click('#hostSettings');
  assert.equal(await evalChrome('!document.querySelector("#settingsView").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#hostToolTitle").textContent'),"工具设置");
  assert.equal(await evalChrome('document.querySelector("#settingsView h2")===null'),true);
  assert.equal(await evalChrome('document.querySelector("#permissionView")===null'),true);
  for(const width of [320,360,400,440]){
    await click('#size'+width);x=await state();
    assert.equal(x.overflow,false,'compact settings overflow '+width);
    await shot('settings-'+width+'px');
  }
  assert.equal(await evalChrome('document.querySelector("#addButton").hidden'),true);
  await click('#toolEnabledSwitch');
  assert.equal(await evalChrome('document.querySelector("#pageRail").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#toolEnabledSwitch").checked'),false);
  await click('#toolEnabledSwitch');
  assert.equal(await evalChrome('document.querySelector("#pageRail").hidden'),false);
  await click('#contextSwitch');
  assert.equal(await evalChrome('document.querySelector("#contextSwitch").checked'),true);
  assert.equal(await evalChrome('document.querySelector("#sitesButton").textContent.trim()'),"");
  await click('#sitesButton');
  assert.equal(await evalChrome('!document.querySelector("#siteDetails").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#sitesButton").getAttribute("aria-expanded")'),"true");
  assert.equal(await evalChrome('document.querySelector("#sitesButton").getAttribute("aria-label")'),"收起适用网站");
  // Approved R2.4.2 lists each site's verified-vs-planned state, not a generic warning.
  assert.equal(await evalChrome('(()=>{const text=document.querySelector("#siteDetails").textContent;return ["ChatGPT","Claude","Gemini","真实 DOM 待验","规划中 · 未验证"].every(value=>text.includes(value));})()'),true);
  await click('#hostBack');
  assert.equal(await evalChrome('!document.querySelector("#indexView").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#hostToolTitle").textContent'),"提示词快捷按钮");
  report.compactHostSettings=true;
  // R2.6 import/export stays in the tool header without overflowing the 360px sidebar.
  await click('#size360');
  await click('#transferButton');
  assert.equal(await evalChrome('!document.querySelector("#transferMenu").hidden'),true);
  await pressKey('Escape','Escape',27);
  assert.equal(await evalChrome('document.querySelector("#transferMenu").hidden'),true);
  assert.equal(await evalChrome('document.activeElement?.id'),'transferButton');
  await click('#transferButton');
  report.r42TransferEscapeFocus=true;
  const menuFits=await evalChrome('(()=>{const p=document.querySelector("#sidepanel").getBoundingClientRect(),m=document.querySelector("#transferMenu").getBoundingClientRect();return m.left>=p.left-1&&m.right<=p.right+1;})()');
  assert.equal(menuFits,true);
  await shot('r26-transfer-menu-360px');
  // Capture the browser Blob export in the source page without a download manager dependency.
  await evalChrome('(()=>{window.__anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.__exportUrl=this.href;window.__exportName=this.download;};})()');
  await click('#exportJson');
  const backup=await evalChrome('(async()=>{const data=JSON.parse(await (await fetch(window.__exportUrl)).text());HTMLAnchorElement.prototype.click=window.__anchorClick;return {format:data.format,version:data.version,count:data.items.length,file:window.__exportName,imageSize:data.imageSize,imageCount:data.items.filter(item=>item.appearance==="image").length};})()');
  assert.equal(backup.format,'opendesk.prompt-shortcuts');
  assert.equal(backup.version,2);assert.equal(backup.count,4);
  assert.equal(backup.imageSize,'large');assert.equal(backup.imageCount,1);
  assert.match(backup.file,/^opendesk-prompt-shortcuts-\d{4}-\d{2}-\d{2}\.json$/);
  // HTML File selection, import precheck, duplicate filtering and target-page immediate repaint.
  await evalChrome('(()=>{const body=document.querySelector(".prompt-content").textContent,items=[{body,label:"润色",name:"duplicate"},{body:"R2.6 新导入的提示词正文",label:"导入",name:"立即同步"}];const dt=new DataTransfer();dt.items.add(new File([JSON.stringify({format:"opendesk.prompt-shortcuts",version:1,items})],"r26-append.json",{type:"application/json"}));const input=document.getElementById("importFile");input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await poll('!document.querySelector("#importPanel").hidden','import precheck');
  assert.equal(await evalChrome('document.querySelector("#importStats").textContent.includes("可新增 1 条")'),true);
  await shot('r26-import-preview-360px');
  await click('#importAppend');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),5);
  
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail button").length'),5,
    'five imported-and-legacy prompts are directly visible without a launcher');
  assert.equal(await evalChrome('document.querySelector("#panelStatus").textContent.includes("网页按钮已即时同步")'),true);
  // Replacement is two explicit actions and never alters the list before confirmation.
  await evalChrome('(()=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify({format:"opendesk.prompt-shortcuts",version:1,items:[{body:"替换确认样例",label:"替换",name:"仅此一条"}]})],"r26-replace.json",{type:"application/json"}));const input=document.getElementById("importFile");input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await poll('!document.querySelector("#importPanel").hidden','replace precheck');
  await click('#importReplace');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),5,'first click is non-destructive');
  assert.equal(await evalChrome('!document.querySelector("#replaceWarning").hidden'),true);
  await click('#importReplace');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),1);
  
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail button").length'),1,
    'custom-only replacement exposes exactly its one saved prompt');
  
  assert.equal(await evalChrome('document.querySelector("#imageSizeGroup").hidden'),true,
    'text-only list retains original uncluttered header');
  await shot('r34-text-only-list-360px');
  report.jsonImportExport=true;report.immediateRailSync=true;report.noUnexpectedFold=true;
  await click('#resetButton');
  assert.equal(await evalChrome('document.querySelector("#imageSizeGroup").hidden'),false,
    'image size control returns with restored image shortcut');
  await click('.prompt-use');x=await state();
  assert(x.draft.includes('请在不改变原意的前提下润色以下文字：\n1. '));
  assert.equal(x.kind,'success');report.emptyInsert=true;
  await sleep(760);
  await evalChrome('(()=>{const f=document.querySelector("#mockDraft");f.value="已有内容";f.setSelectionRange(4,4);})()');
  await click('.prompt-use');x=await state();assert(x.draft.startsWith('已有内容'));report.preservedExisting=true;
  await click('.prompt-actions button[aria-label^="更多操作"]');
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("编辑：")'),true);
  await click('.prompt-more button[aria-label^="编辑："]');
  x=await state();assert.equal(x.editing,true);assert.equal(x.shapeInputs,0);
  assert.equal(await evalChrome('document.querySelector("#hostToolTitle").textContent'),"编辑提示词");
  assert.equal(await evalChrome('document.querySelector("#formView h2")===null'),true);
  assert.equal(await evalChrome('document.querySelector("#formView").getAttribute("aria-labelledby")'),"hostToolTitle");
  assert.equal(await evalChrome('document.querySelector("label[for=promptBody]").classList.contains("sr-only")'),true);
  assert.equal(await evalChrome('document.querySelector("#quotaMeter").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#contentHint")===null'),true);
  assert.equal(await evalChrome('document.querySelector("#effectiveShort")===null'),true);
  await shot('edit-440px');
  for(const width of [320,360]){
    await click('#size'+width);
    x=await state();
    assert.equal(x.width,width,'narrow form width '+width);
    assert.equal(x.overflow,false,'narrow form has no horizontal overflow '+width);
    await shot('edit-'+width+'px');
  }
  report.editView=true;
  await click('#cancelForm');assert.equal((await state()).leaving,false);
  await click('#addButton');
  assert.equal(await evalChrome('document.querySelector("#hostToolTitle").textContent'),"新建提示词");
  assert.equal(await evalChrome('document.querySelector("#quotaMeter").hidden'),true);
  await shot('new-minimal-360px');
  // Use the actual serialized library size rather than assuming N characters equals N stored bytes.
  const nearLength=await evalChrome('(()=>{const f=document.querySelector("#promptBody"),m=document.querySelector("#quotaMeter");for(let size=3000;size<8200;size+=64){f.value="a".repeat(size);f.dispatchEvent(new Event("input",{bubbles:true}));if(!m.hidden&&!m.classList.contains("error"))return size;}throw Error("No valid near-limit state before 8 KiB");})()');
  assert.equal(typeof nearLength,'number');
  assert.equal(await evalChrome('!document.querySelector("#quotaMeter").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#quotaLabel").textContent'),"空间接近上限");
  assert.equal(await evalChrome('document.querySelector("#quotaValue").textContent.startsWith("剩余 ")'),true);
  await shot('new-near-limit-360px');
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value="a".repeat(8500);f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  assert.equal(await evalChrome('document.querySelector("#quotaLabel").textContent'),"存储空间不足");
  await click('#saveButton');
  assert.equal(await evalChrome('!document.querySelector("#formView").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#promptBody").value.length'),8500);
  assert.equal(await evalChrome('document.querySelector("#bodyError").textContent.includes("8 KiB")'),true);
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value="";f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  assert.equal(await evalChrome('document.querySelector("#quotaMeter").hidden'),true);
  await click('#cancelForm');
  x=await state();assert.equal(x.editing,false);assert.equal(x.leaving,false);
  report.pristineForm=true;report.conditionalQuotaAndSingleTitle=true;
  await click('#addButton');
  assert.equal(await evalChrome('!document.querySelector("#saveContinue").hidden'),true);
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value="连续创建第一条：回顾昨天的工作。";f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await click('#saveContinue');
  await poll('document.querySelectorAll(".prompt-card").length===5&&document.querySelector("#promptBody").value===""','save and continue first');
  x=await state();assert.equal(x.editing,true);assert.equal(x.cards,5);
  
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail button").length'),5,
    'save-and-continue shows exactly five real prompts');
  await shot('batch-create-320px');
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value="连续创建第二条：列出下一步计划。";f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await click('#saveContinue');
  await poll('document.querySelectorAll(".prompt-card").length===6&&document.querySelector("#promptBody").value===""','save and continue second');
  x=await state();assert.equal(x.cards,6);assert.equal(x.editing,true);
  
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail button").length'),6,
    'all six saved shortcuts remain directly accessible');
  await poll('document.querySelector("#promptForm").getAttribute("aria-busy")!=="true"',
    'save-and-continue finishes before cancel');
  const batchCancelBefore=await evalChrome('('+function(){
    return {cancelDisabled:document.querySelector('#cancelForm').disabled,
      body:document.querySelector('#promptBody').value,
      formError:document.querySelector('#formError').textContent,
      status:document.querySelector('#formSaveStatus').textContent};
  }.toString()+')()');
  await click('#cancelForm');x=await state();
  if(x.editing){
    report.r41BatchCancelDiagnostic={before:batchCancelBefore,
      after:await evalChrome('('+function(){
        return {leaveConfirmRemoved:document.querySelector('#leaveConfirm')===null,
          error:document.querySelector('#formError').textContent,
          status:document.querySelector('#formSaveStatus').textContent,
          activeId:document.activeElement?.id};
      }.toString()+')()')};
    await shot('r41-batch-cancel-diagnostic');
  }
  assert.equal(x.editing,false,JSON.stringify(report.r41BatchCancelDiagnostic||batchCancelBefore));
  report.batchCreateAndReset=true;
  await click('#resetButton');
  x=await state();assert.equal(x.cards,4);
  await click('.prompt-actions button[aria-label^="更多操作"]');
  assert(await evalChrome('!!document.querySelector(".prompt-more")'));
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("编辑：")'),true);
  await evalChrome('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await evalChrome('document.querySelector(".prompt-more")===null'),true);
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("更多操作")'),true);
  await click('.prompt-actions button[aria-label^="更多操作"]');
  assert(await evalChrome('!!document.querySelector(".prompt-more")'));
  // A visually hidden action must still have a complete operation and preserve identity/focus.
  await click('.prompt-more button[aria-label^="下移："]');
  assert.equal(await evalChrome('document.querySelector(".prompt-card").dataset.id'),"b");
  assert.equal(await evalChrome('document.querySelector(".prompt-card:nth-child(2)").dataset.id'),"a");
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("下移：")'),true);
  await click('.prompt-more button[aria-label^="上移："]');
  assert.equal(await evalChrome('document.querySelector(".prompt-card").dataset.id'),"a");
  await click('.prompt-more button[aria-label^="停用："]');
  assert.equal(await evalChrome('document.querySelector(".prompt-card").classList.contains("is-disabled")'),true);
  assert.equal(await evalChrome('Array.from(document.querySelectorAll(".prompt-more button")).some(x=>x.getAttribute("aria-label")?.startsWith("启用："))'),true);
  await click('.prompt-more button[aria-label^="启用："]');
  assert.equal(await evalChrome('document.querySelector(".prompt-card").classList.contains("is-disabled")'),false);
  await click('.prompt-more button[aria-label^="删除："]');
  assert.equal(await evalChrome('!!document.querySelector(".prompt-delete")'),true);
  assert.equal(await evalChrome('document.querySelector(".prompt-delete").textContent.includes("确认删除")'),true);
  await shot('delete-confirm-icon-440px');
  await click('.prompt-delete button:first-child');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4);
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("更多操作")'),true);
  await click('.prompt-more button[aria-label^="删除："]');
  await click('.prompt-delete button:nth-child(2)');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),3);
  assert.equal(await evalChrome('document.activeElement?.getAttribute("aria-label")?.startsWith("更多操作")'),true);
  await click('#resetButton');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4);
  report.iconActionsReorderToggleDelete=true;report.managementSeparate=true;
  // R3.7: real native PNG file input, pixel decode, preview storage and reload.
  await click('.prompt-card:nth-child(2) .prompt-actions button');
  await click('.prompt-more button[aria-label^="编辑："]');
  await click('label:has(#imageSourceLocal)');
  assert.equal(await evalChrome('!document.querySelector("#imageUploadControls").hidden'),true);
  // R4.1: screenshots of the ACTUAL original dropzone, never a second screenshot fixture.
  report.r41Dropzone=[];
  for(const width of [320,360,400,440]){
    await click('#size'+width);
    const ui=await evalChrome('('+function(){
      const p=document.querySelector('#sidepanel'),zone=document.querySelector('#imageDropzone');
      const r=zone.getBoundingClientRect();
      return {width:Math.round(p.getBoundingClientRect().width),
        overflow:p.scrollWidth>p.clientWidth+1,zoneVisible:r.width>0&&r.height>=100,
        label:document.querySelector('#imagePick').textContent.trim()};
    }.toString()+')()');
    assert(ui.zoneVisible&&!ui.overflow&&ui.label.includes('选择图片'),'dropzone '+width+'px');
    await shot('r41-dropzone-'+width+'px');
    report.r41Dropzone.push(ui);
  }
  await click('#themeButton');
  await sleep(220); // allow existing 150ms background transition to settle before contrast evidence
  await shot('r41-dropzone-dark-440px');
  await click('#themeButton');
  // Real CDP-intercepted native file chooser: a click must reach input[type=file].
  await call('Page.setInterceptFileChooserDialog',{enabled:true});
  await click('#imagePick');
  for(let i=0;i<20&&!fileChooserEvents.length;i++)await sleep(80);
  assert(fileChooserEvents.length>=1,'the visible Choose Image button opens the real file picker');
  report.r41NativePicker=true;
  const previewHTML=await readFile(resolve('examples/sidebar-tools/prompt-shortcuts/preview/index.html'),'utf8');
  const pngBase64=previewHTML.split("const PREVIEW_OFFLINE_PNG='")[1]?.split("'")[0]?.split(',')[1];
  assert(pngBase64,'source-bound PNG fixture');
  const imageFilePath=join(profile,'r37-file.png');
  await writeFile(imageFilePath,Buffer.from(pngBase64,'base64'));
  await call('DOM.enable');
  const {root:domRoot}=await call('DOM.getDocument',{depth:1});
  const {nodeId:fileNode}=await call('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'#imageFile'});
  assert(fileNode,'real original input[type=file] exists');
  await call('DOM.setFileInputFiles',{nodeId:fileNode,files:[imageFilePath]});
  await poll('document.querySelector("#imageHelp").textContent.includes("图片已准备好")',
    'original image upload write is confirmed');
  await poll('document.querySelector("#pictureExample img")?.naturalWidth>0','uploaded PNG decoded');
  const firstImage=await evalChrome('('+function(){
    const selected=document.querySelector('#imageSelected');
    return {selected:!selected.hidden,name:document.querySelector('#imageFileName').textContent,
      meta:document.querySelector('#imageFileMeta').textContent,
      pictureDecoded:document.querySelector('#pictureExample img')?.naturalWidth>0};
  }.toString()+')()');
  assert(firstImage.selected&&firstImage.name==='r37-file.png'&&firstImage.pictureDecoded);
  assert.match(firstImage.meta,/\d+×\d+/);
  for(const width of [320,360,400,440]){
    await click('#size'+width);
    const fits=await evalChrome('('+function(){
      const p=document.querySelector('#sidepanel'),card=document.querySelector('#imageSelected'),
        actions=document.querySelector('#imageSelectedActions');
      return p.scrollWidth<=p.clientWidth+1&&card.scrollWidth<=card.clientWidth+1&&
        actions.querySelectorAll('button[aria-label]').length===2;
    }.toString()+')()');
    assert(fits,'selected image card must fit '+width+'px');
    await shot('r41-selected-'+width+'px');
  }
  await click('#themeButton');
  await sleep(220);
  await shot('r41-selected-dark-440px');
  await click('#themeButton');
  // Invalid input must retain the accepted image; the existing decoder is unchanged.
  const invalidFile=join(profile,'r41-unsupported.svg');
  await writeFile(invalidFile,'<svg xmlns="http://www.w3.org/2000/svg"/>');
  await call('DOM.setFileInputFiles',{nodeId:fileNode,files:[invalidFile]});
  await poll('document.querySelector("#imageFieldError").textContent.includes("PNG")','unsupported type error');
  assert.equal(await evalChrome('document.querySelector("#imageFileName").textContent'),'r37-file.png');
  const oversized=join(profile,'r41-oversized.png');
  await writeFile(oversized,Buffer.alloc(2*1024*1024+1,42));
  await call('DOM.setFileInputFiles',{nodeId:fileNode,files:[oversized]});
  await poll('document.querySelector("#imageFieldError").textContent.includes("2 MB")','oversized error');
  assert.equal(await evalChrome('document.querySelector("#imageFileName").textContent'),'r37-file.png');
  // The entire empty dashed region must also open the native file chooser.
  await click('#imageClear');
  assert.equal(await evalChrome('!document.querySelector("#imageUploadControls").hidden'),true);
  const count=fileChooserEvents.length;
  const blank=await evalChrome('('+function(){
    const r=document.querySelector('#imageDropzone').getBoundingClientRect();
    return {x:r.left+12,y:r.top+12};
  }.toString()+')()');
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],
    ['mouseReleased',{button:'left',clickCount:1}]])
    await call('Input.dispatchMouseEvent',{type,x:blank.x,y:blank.y,...extra});
  for(let i=0;i<20&&fileChooserEvents.length===count;i++)await sleep(80);
  assert(fileChooserEvents.length>count,'blank dropzone click opens real picker');
  await call('DOM.setFileInputFiles',{nodeId:fileNode,files:[imageFilePath]});
  await poll('document.querySelector("#pictureExample img")?.naturalWidth>0&&document.querySelector("#imageFileName").textContent==="r37-file.png"',
    'reselect after clearing image');
  await call('Page.setInterceptFileChooserDialog',{enabled:false});
  report.r41PickerAndErrors={...firstImage,blankDropzone:true,invalidPreserved:true,oversizedPreserved:true};
  await shot('r37-original-local-upload');
  await click('#saveButton');
  await waitPreviewRail();
  await poll('document.querySelector("#formView").hidden&&document.querySelector("#pageRail .page-shortcut:nth-child(2) img")?.naturalWidth>0',
    'saved local raster appears on real rail');
  const uploadEvidence=await evalChrome('('+function(){
    const item=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.items-r3'))[1];
    const store=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.assets-r37'));
    const img=document.querySelector('#pageRail .page-shortcut:nth-child(2) img');
    const box=img.closest('button').getBoundingClientRect();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
    for(let i=0;i<pixels.length;i+=64)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]+','+pixels[i+3]);
    return {id:item.imageAssetId,stored:!!store[item.imageAssetId],bytesInLibrary:JSON.stringify(item).includes('base64,'),
      pixels:img.naturalWidth*img.naturalHeight,colors:colors.size,width:box.width,height:box.height};
  }.toString()+')()');
  assert.match(uploadEvidence.id,/^psa_[a-f0-9]{32}$/);
  assert(uploadEvidence.stored&&!uploadEvidence.bytesInLibrary&&uploadEvidence.pixels>0&&uploadEvidence.colors>10);
  assert(Math.abs(uploadEvidence.width-68)<.6&&Math.abs(uploadEvidence.height-48)<.6);
  await shot('r37-original-local-image-saved');
  await reloadPreview();
  await waitPreviewRail();
  await poll('document.querySelector("#pageRail .page-shortcut:nth-child(2) img")?.naturalWidth>0',
    'same saved local image after reload');
  assert.equal(await evalChrome('document.querySelector("#pageRail .page-shortcut:nth-child(2) img")?.dataset.previewFixture??null'),null,
    'saved local image must really be restored; initial offline sample is NOT reload evidence');
  const insert=await evalChrome('('+async function(){
    const field=document.querySelector('#mockDraft');field.value='原草稿';field.setSelectionRange(field.value.length,field.value.length);
    document.querySelector('#pageRail .page-shortcut:nth-child(2)').click();
    await new Promise(done=>setTimeout(done,110));
    return field.value;
  }.toString()+')()');
  assert(insert.includes('原草稿')&&insert.includes('重要依据')&&!insert.includes('data:image'));
  report.r37LocalImage={...uploadEvidence,reload:true,promptInsert:true};
  await shot('r37-original-local-image-reloaded');
  // R4.1: reopen the EXACT persisted image row (not a position-dependent card).
  const persistedImageRow=await evalChrome('('+function(){
    const item=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.items-r3'))
      .find(row=>row.imageAssetId);
    return item&&{id:item.id,imageAssetId:item.imageAssetId,appearance:item.appearance};
  }.toString()+')()');
  assert.equal(persistedImageRow?.imageAssetId,uploadEvidence.id,
    'expected saved local asset is still attached to a persisted prompt');
  await click('.prompt-card[data-id="'+persistedImageRow.id+'"] .prompt-actions button');
  await click('.prompt-more button[aria-label^="编辑："]');
  const reopened=await evalChrome('('+function(){
    const rows=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.items-r3'));
    const row=rows.find(r=>r.imageAssetId);
    const card=document.querySelector('.prompt-card[data-id="'+row?.id+'"]');
    const cardPicture=card?.querySelector('img');
    const railPicture=document.querySelector('#pageRail .page-shortcut:nth-child(2) img');
    return {formVisible:!document.querySelector('#formView').hidden,
      sourceLocal:document.querySelector('#imageSourceLocal').checked,
      sourceUrl:document.querySelector('#imageSourceUrl').checked,
      appearanceImage:document.querySelector('#appearanceImage').checked,
      bodyStart:document.querySelector('#promptBody').value.slice(0,45),
      persistedRow:row,
      persistedRows:rows.map(r=>({id:r.id,label:r.label,appearance:r.appearance,
        imageUrl:r.imageUrl,imageAssetId:r.imageAssetId,bodyType:typeof r.body})),
      cardHasImg:!!cardPicture,cardImgMime:cardPicture?.src.slice(0,36),
      railImgMime:railPicture?.src.slice(0,36),railOfflineFixture:railPicture?.dataset.previewFixture};
  }.toString()+')()');
  if(!reopened.formVisible||!reopened.sourceLocal||!reopened.appearanceImage)
    await shot('r41-saved-local-reopen-diagnostic');
  assert(reopened.formVisible&&reopened.sourceLocal&&reopened.appearanceImage,
    'saved local-image row reopens as local picture: '+JSON.stringify(reopened));
  await click('label:has(#imageSourceUrl)');
  await evalChrome('('+function(){
    const url=document.querySelector('#imageUrl');
    url.value='https://example.com/unsaved-alternative.png';
    url.dispatchEvent(new Event('input',{bubbles:true}));
  }.toString()+')()');
  await click('label:has(#imageSourceLocal)');
  // R1.9.5 direct Cancel: verify inactive URL draft before leaving, without
  // recreating the removed leave-confirmation layer.
  await click('label:has(#imageSourceUrl)');
  assert.equal(await evalChrome('document.querySelector("#imageUrl").value'),
    'https://example.com/unsaved-alternative.png');
  await click('label:has(#imageSourceLocal)');
  // Native Chromium drag/drop with an actual filesystem-backed JPEG, not dispatchEvent(mock).
  const jpegBase64=await evalChrome('('+function(){
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;
    const ctx=canvas.getContext('2d');
    for(let y=0;y<80;y++){
      ctx.fillStyle='rgb('+Math.round(255*y/80)+','+(120+y)+','+(200-y)+')';
      ctx.fillRect(0,y,120,1);
    }
    return canvas.toDataURL('image/jpeg',0.88).split(',')[1];
  }.toString()+')()');
  const dragFile=join(profile,'r41-native-drop.jpg');
  await writeFile(dragFile,Buffer.from(jpegBase64,'base64'));
  const target=await evalChrome('('+function(){
    const r=document.querySelector('#imageSelected').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }.toString()+')()');
  const dragData={items:[],files:[dragFile],dragOperationsMask:1};
  for(const type of ['dragEnter','dragOver','drop'])
    await call('Input.dispatchDragEvent',{type,x:target.x,y:target.y,data:dragData});
  await poll('document.querySelector("#imageFileName").textContent==="r41-native-drop.jpg"',
    'real Chromium filesystem drag/drop ingested');
  await poll('document.querySelector("#pictureExample img")?.naturalWidth>0',
    'native-dropped JPEG decoded');
  await shot('r41-native-jpeg-drop-preview');
  const draftAssets=await evalChrome('('+function(){
    const assets=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.assets-r37'));
    return Object.keys(assets);
  }.toString()+')()');
  assert(draftAssets.includes(uploadEvidence.id)&&draftAssets.length>=2,
    'saved old asset remains while JPEG replacement is an uncommitted draft');
  await click('#hostBack');
  assert.equal(await evalChrome('!document.querySelector("#toolListView").hidden'),true,
    'ordinary unsaved image replacement is discarded directly');
  const afterDiscard=await evalChrome('('+function(){
    const assets=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.assets-r37'));
    const items=JSON.parse(localStorage.getItem('opendesk.prompt-shortcuts.preview.items-r3'));
    return {ids:Object.keys(assets),saved:items[1].imageAssetId};
  }.toString()+')()');
  assert.deepEqual(afterDiscard.ids,[uploadEvidence.id],
    'host back must clean temporary image without deleting the committed one');
  assert.equal(afterDiscard.saved,uploadEvidence.id);
  await click('#reopenTool');
  await waitPreviewRail();
  await poll('document.querySelector("#pageRail .page-shortcut:nth-child(2) img")?.naturalWidth>0',
    'saved picture survives aborted host exit');
  report.r41DraftProtection={inactiveUrlGuard:true,realFilesystemJpegDrop:true,
    hostDiscardClean:true,oldSavedAssetRetained:true};
  await click('#resetButton');
  await waitPreviewRail();
  await poll('document.querySelector("#pageRail img[data-preview-fixture]")?.naturalWidth>0','reset original fixtures');
  assert.equal(await evalChrome('localStorage.getItem("opendesk.prompt-shortcuts.preview.assets-r37")'),null);
  // R3.4: genuine Chromium storage-rejection fault, not a synthetic status banner.
  await click('#addButton');
  await evalChrome('(()=>{const f=document.getElementById("promptBody");f.value="R3.4 本地存储失败仍保留草稿";f.dispatchEvent(new Event("input",{bubbles:true}));window.__originalPsSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,val){if(String(key).includes("prompt-shortcuts.preview.items-r3"))throw new DOMException("Storage blocked","QuotaExceededError");return window.__originalPsSetItem.call(this,key,val);};})()');
  await click('#saveButton');
  await poll('document.querySelector("#formError").textContent.includes("E_PREVIEW_STORAGE")',
    'storage refused must show explicit error');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4);
  assert.equal(await evalChrome('document.querySelector("#promptBody").value.includes("R3.4")'),true);
  assert.equal(await evalChrome('!document.querySelector("#formView").hidden'),true);
  await shot('r34-storage-error-keeps-draft-360px');
  await evalChrome('Storage.prototype.setItem=window.__originalPsSetItem');
  await click('#saveButton');
  await poll('document.querySelectorAll(".prompt-card").length===5&&document.querySelector("#formView").hidden',
    'save succeeds once storage is restored');
  await click('#resetButton');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4);
  report.r34FailedWriteSafe=true;
  await evalChrome('(()=>{const f=document.getElementById("actionScenario");f.value="clipboard-failure";f.dispatchEvent(new Event("change",{bubbles:true}));})()');
  // The preview deliberately debounces repeated activation of one prompt for 650ms.
  // Reaching the clipboard-failure scenario requires a fresh real user click.
  await sleep(700);
  await click('.prompt-use');
  await poll('document.querySelector("#panelStatus").dataset.kind==="error"','double-failure notice');
  x=await state();assert.match(x.notice,/安全停止：模拟编辑器与剪贴板均不可用/);assert.equal(x.copyDialog,false);
  report.simulatedFailure=true;
  // Exercise Unicode editing in the original full preview, including a ZWJ
  // emoji, skin tone, combining accent and blank line; then restore the fixture.
  await click('.prompt-actions button[aria-label^="更多操作"]');
  await click('.prompt-more button[aria-label^="编辑："]');
  const unicodeBody='R4.2 编辑保存 👩🏽‍💻 🇨🇳 e\u0301\n\n保留完整正文与 Emoji。';
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value='+
    JSON.stringify(unicodeBody)+';f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await click('#saveButton');
  await poll('document.querySelector("#formView").hidden','Unicode edit saved');
  assert.equal((await state()).firstContent,unicodeBody);
  await shot('r42-emoji-saved');
  await click('.prompt-actions button[aria-label^="更多操作"]');
  await click('.prompt-more button[aria-label^="编辑："]');
  assert.equal(await evalChrome('document.querySelector("#promptBody").value'),unicodeBody);
  await click('#cancelForm');
  await click('#resetButton');
  report.r42UnicodeEditSaveReadback=true;
  // R2.6.1: canonical host gear + uninstall in the header; no extra explanatory menu text.
  await click('#size320');
  const header=await evalChrome('(()=>{const panel=document.querySelector("#sidepanel").getBoundingClientRect(),title=document.querySelector("#hostToolTitle").getBoundingClientRect(),more=document.querySelector("#hostMore").getBoundingClientRect();return {noOverflow:document.querySelector("#hostToolHead").scrollWidth<=document.querySelector("#hostToolHead").clientWidth+1,titleWidth:title.width,moreRight:more.right,panelRight:panel.right,gear:document.querySelector("#ps-icon-settings")?.innerHTML.includes("<circle"),trash:document.querySelector("#hostRemove use")?.getAttribute("href"),moreHidden:document.querySelector("#hostMoreMenu").hidden,chat:document.querySelector("#hostChat").getBoundingClientRect().width,menuNote:document.querySelector(".transfer-note")!==null};})()');
  assert.equal(header.noOverflow,true,'320px header must not overflow');
  assert(header.titleWidth>=80,'tool title must remain legible at 320px');
  assert(header.moreRight<=header.panelRight+1,'overflow trigger must stay inside the panel');
  assert.equal(header.gear,true);assert.equal(header.trash,'#ps-icon-uninstall');
  assert.equal(header.moreHidden,true);assert(header.chat>=30);assert.equal(header.menuNote,false);
  await click('#hostMore');
   await click('#hostRemove');
  assert.equal(await evalChrome('!document.querySelector("#uninstallConfirm").hidden'),true);
  await shot('r261-uninstall-confirm-320px');
  await click('#cancelUninstall');
  assert.equal(await evalChrome('document.querySelector("#uninstallConfirm").hidden'),true);
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4,'cancel keeps all prompts');
  await click('#hostMore');
   await click('#hostRemove');
  await click('#confirmUninstall');
  assert.equal(await evalChrome('!document.querySelector("#toolListView").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#reopenTool").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#pageRail").hidden'),true);
  await click('#resetButton');
  assert.equal(await evalChrome('document.querySelectorAll(".prompt-card").length'),4);
  await waitPreviewRail();
  assert.equal(await evalChrome('document.querySelectorAll("#pageRail .page-shortcut").length'),4,
    'reset restores four legacy prompts without an OD launcher');
  report.unifiedGearAndUninstall=true;report.result='PASS';
  console.log('PROMPT_SHORTCUTS_R111_REAL_CHROME_MOCK_PASS',JSON.stringify(report));
}
try{await run();}
catch(e){report.result='FAIL';report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  try{socket?.close();}catch{}
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}

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
const pending=new Map(),report={kind:'REAL_CHROME_OFFLINE_PREVIEW_ONLY',installedExtension:false,scenes:[]};
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
async function shot(name){
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
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
      editing:!q('#formView').hidden,leaving:!q('#leaveConfirm').hidden,
      shapeInputs:document.querySelectorAll('input[name="shape"]').length,
      copyDialog:Boolean(q('#copyFallback')),
      iconRadius:getComputedStyle(card.querySelector('.prompt-icon')).borderRadius};
  }.toString()+')()');
}
async function run(){
  await connect();
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(resolve('examples/sidebar-tools/prompt-shortcuts/preview/index.html')).href});
  await poll('document.readyState==="complete"&&document.querySelectorAll(".prompt-card").length===4','four cards');
  let x=await state();
  assert.equal(x.cards,4);assert.equal(x.clamp,'2');assert(x.firstContent.includes('\n1. '));
  assert(x.firstButton.startsWith('使用完整提示词'));
  assert.equal(x.copyDialog,false);assert.equal(x.shapeInputs,0);
  // R1.16 all SVG icons come from inline source with accessible button names.
  const icons=await evalChrome('('+function(){
    const a=document.querySelector('#addButton');
    const ids=['addButton','hostBack','hostSettings','themeButton','resetButton'];
    const named=ids.map(id=>({id,button:document.getElementById(id),svg:document.getElementById(id)?.querySelector('svg use')}));
    const r=a.getBoundingClientRect();
    return {symbols:document.querySelectorAll('.od-icon-sprite symbol').length,
      names:named.map(x=>({id:x.id,name:x.button?.getAttribute('aria-label'),href:x.svg?.getAttribute('href')})),
      addVisibleText:a.textContent.trim(),addBounds:{width:r.width,height:r.height},
      cardButtons:document.querySelector('.prompt-card').querySelectorAll('.prompt-actions button').length};
  }.toString()+')()');
  assert(icons.symbols>=15);
  assert.equal(icons.addVisibleText,'');
  assert(icons.addBounds.width>=40&&icons.addBounds.height>=40);
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
  assert.equal(await evalChrome('document.querySelector("#siteDetails").textContent.includes("其他 AI 网站仍须逐站验证")'),true);
  await click('#hostBack');
  assert.equal(await evalChrome('!document.querySelector("#indexView").hidden'),true);
  assert.equal(await evalChrome('document.querySelector("#hostToolTitle").textContent'),"提示词快捷按钮");
  report.compactHostSettings=true;
  await click('#resetButton');
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
  await shot('batch-create-320px');
  await evalChrome('(()=>{const f=document.querySelector("#promptBody");f.value="连续创建第二条：列出下一步计划。";f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await click('#saveContinue');
  await poll('document.querySelectorAll(".prompt-card").length===6&&document.querySelector("#promptBody").value===""','save and continue second');
  x=await state();assert.equal(x.cards,6);assert.equal(x.editing,true);
  await click('#cancelForm');x=await state();assert.equal(x.editing,false);
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
  await evalChrome('(()=>{const f=document.getElementById("actionScenario");f.value="clipboard-failure";f.dispatchEvent(new Event("change",{bubbles:true}));})()');
  // The preview deliberately debounces repeated activation of one prompt for 650ms.
  // Reaching the clipboard-failure scenario requires a fresh real user click.
  await sleep(700);
  await click('.prompt-use');
  await poll('document.querySelector("#panelStatus").dataset.kind==="error"','double-failure notice');
  x=await state();assert.match(x.notice,/复制失败/);assert.equal(x.copyDialog,false);
  report.simulatedFailure=true;report.result='PASS';
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
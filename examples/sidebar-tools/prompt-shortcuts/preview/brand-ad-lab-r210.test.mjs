// R2.10 offline regression — browser assertions are real Playwright/Chromium only.
// Run: node --test examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r{28,29,210}.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const file=name=>readFileSync(join(root,name),'utf8');
const r28=file('brand-ad-lab-r28.js'),r29=file('brand-ad-lab-r29.js');
const css=file('brand-ad-lab-r29.css'),oldCss=file('brand-ad-lab-r28.css');
const html=file('brand-ad-lab.html');
const raw=r28.match(/const raw = \[([\s\S]*?)\n  \];/)?.[1]||'';
const ids=[...raw.matchAll(/\['([BSNC]\d\d)',/g)].map(m=>m[1]);
const catalogue=r29.match(/const specs=\[([\s\S]*?)\n  \];/)?.[1]||'';
const formats=[...catalogue.matchAll(/\['([a-z]+(?:-[a-z]+)*)','(?:brand|sponsors|cards|business)'/g)].map(m=>m[1]);

test('R2.10 parses retained R2.7, R2.8 and R2.9 JavaScript',()=>{
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 new vm.Script(inline);new vm.Script(r28);new vm.Script(r29);
 assert.equal(ids.length,35);assert.equal(new Set(ids).size,35);
 assert.equal(formats.length,17);assert.equal(new Set(formats).size,17);
});
test('R2.10 scoped dismissal, stable input/chat DOM and distinct form states',()=>{
 assert.match(r28,/closedRail:new Set\(\)/);
 assert.match(r28,/closedRail\.add\(state\.id\)/);
 assert.match(r28,/closedCards\.add\(state\.id\+':'\+i\)/);
 assert.match(r28,/closedCards\.add\(target\)/);
 assert.match(r28,/const sceneChanged=page\.dataset\.r28Scene/);
 assert.match(r28,/if\(sceneChanged\)\{/);
 assert.match(r28,/trigger\.replaceChildren\(marker,label\)/);
 assert.match(r28,/prepareForm\('new'\)/);assert.match(r28,/prepareForm\('edit'\)/);
 assert.match(r28,/stopImmediatePropagation/);
 assert.match(r28,/r29NarrowSuppressed/);
 assert.match(r29,/lab\.openDialog\('sponsor'\)/);
 assert.match(css,/r29-sample-pop/);assert.match(oldCss,/r29-solo-card/);
});
test('R2.10 never adds ad tracking, real web injection or new permissions',()=>{
 for(const source of [r28,r29]){
  assert.doesNotMatch(source,/\b(?:fetch|sendBeacon|XMLHttpRequest|chrome\.scripting|chrome\.tabs|OpenDeskSDK|localStorage|sessionStorage)\s*[\.(]/);
 }
 assert.match(r29,/simulatedOnly:web/);
 assert.match(r28,/id==='C06'/);
 assert.match(r29,/review:!web/);
});

let chromium=null,whySkipped='No Playwright or managed Chromium installed';
try{
 const pw=await import('playwright');
 if(existsSync(pw.chromium.executablePath()))chromium=pw.chromium;
}catch{/* NOT_TESTED, never PASS. */}
const browserTest=(name,fn)=>test(name,{skip:chromium?false:whySkipped},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  await page.waitForSelector('#r29Map [data-place]');
  await fn(page);
  assert.deepEqual(errors,[],'no page JavaScript exceptions');
 }finally{await browser.close();}
});

browserTest('REAL Chromium: 35 distinct DOM anchors and per-placement close/restore',async page=>{
 assert.equal(await page.locator('#r29Map [data-place]').count(),35);
 await page.locator('#r28Sold').selectOption('1');
 for(const id of ids){
  await page.evaluate(key=>window.OpenDeskR28.choose(key),id);
  assert.equal(await page.locator('#r29Map [data-place="'+id+'"]').getAttribute('aria-pressed'),'true',id);
  assert.match(await page.locator('#r29SelectionTitle').innerText(),new RegExp(id),id);
  const anchor=await page.evaluate(key=>{
   const m=window.OpenDeskR28.R29.meta[key],css=m.anchor.split(' → ')[0];
   const el=document.querySelector(css);
   return {found:!!el,policy:m.policy,simulatedOnly:m.simulatedOnly};
  },id);
  assert.equal(anchor.found,true,id+' must have a real DOM anchor');
  if('NC'.includes(id[0])){
   assert.equal(anchor.simulatedOnly,true,id);
   assert.equal(await page.locator('[data-spot="'+id+'"] .r29-zone-trigger').count(),1,id);
  }
  if(id==='C06')assert.equal(anchor.policy,'critical');
  let close=null;
  if(['B03','B04','B05'].includes(id))close='.r29-rail-close';
  if(['B06','B07'].includes(id))close='#r28TipExtra .r29-tip-dismiss';
  if(id==='S03')close='#r28SlotS03 .r29-footer-dismiss';
  if(id[0]==='S'&&id!=='S03')close='#r28Slot'+id+' .r28-dismiss-card';
  if('NC'.includes(id[0]))close='[data-spot="'+id+'"] .r29-spot-dismiss';
  if(close){
   assert.equal(await page.locator(close).count(),1,id+' needs own close');
   await page.locator(close).click();
   assert.equal(await page.locator(close).count(),0,id+' close removes ad');
   await page.locator('#r28Restore').click();
   assert.equal(await page.locator(close).count(),1,id+' restore is reversible');
  }
 }
});

browserTest('REAL Chromium: 17 formats, hover/focus/touch alternatives and details',async page=>{
 assert.equal(await page.locator('#r29Gallery button[data-format]').count(),17);
 for(const type of formats){
  const button=page.locator('#r29Gallery button[data-format="'+type+'"]');
  await button.click();
  assert.equal(await page.locator('#r28Layout').inputValue(),type);
  if(['brand-hover','hover-card','expand-card'].includes(type)){
   assert.equal(await page.locator('#r28Dialog').evaluate(d=>d.open),true,type);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#r28Dialog').evaluate(d=>d.open),false,type);
   assert.equal(await button.evaluate(e=>document.activeElement===e),true,type+' focus return');
  }
 }
 const hover=page.locator('#r29Gallery button[data-format="hover-card"]');
 await hover.hover();
 await page.waitForTimeout(180);
 assert.equal(await hover.locator('.r29-sample-pop').evaluate(e=>getComputedStyle(e).opacity),'1');
});

browserTest('REAL Chromium: S04 new and S05 edit preserve mock data, cancel and focus',async page=>{
 await page.locator('#r28Sold').selectOption('1');
 await page.evaluate(()=>window.OpenDeskR28.choose('S04'));
 assert.equal(await page.locator('#editView').getAttribute('data-r29-form'),'new');
 assert.equal(await page.locator('#editPrompt').inputValue(),'');
 await page.locator('#editPrompt').fill('R2.10 可编辑的新提示词正文');
 await page.locator('#editName').fill('R2.10 示例名称');
 await page.locator('#saveEdit').click();
 await page.evaluate(()=>window.OpenDeskR28.choose('S05'));
 assert.equal(await page.locator('#editView').getAttribute('data-r29-form'),'edit');
 assert.equal(await page.locator('#editPrompt').inputValue(),'R2.10 可编辑的新提示词正文');
 assert.equal(await page.locator('#editName').inputValue(),'R2.10 示例名称');
 await page.locator('#editPrompt').fill('未保存改动');
 await page.locator('#cancelEdit').click();
 await page.evaluate(()=>window.OpenDeskR28.choose('S05'));
 assert.equal(await page.locator('#editPrompt').inputValue(),'R2.10 可编辑的新提示词正文');
 await page.locator('#r28SlotS05 .r28-dismiss-card').click();
 assert.equal(await page.locator('#editPrompt').inputValue(),'R2.10 可编辑的新提示词正文');
 await page.locator('#r28Restore').click();
 assert.equal(await page.locator('#r28SlotS05 .r28-demo-ad').count(),1);
});

browserTest('REAL Chromium: no typed draft/caret/IME loss or chat scroll reset',async page=>{
 await page.locator('#r28Sold').selectOption('1');
 await page.evaluate(()=>{
   const lab=window.OpenDeskR28,bridge=window.OpenDeskR27Bridge;
   lab.choose('C05');lab.state.scene='long';bridge.render();
   const draft=document.querySelector('#draft');
   draft.value='Input 中文 日本語';draft.focus();draft.setSelectionRange(4,8);
   const scroll=document.querySelector('.r28-chat-scroll');scroll.scrollTop=180;
   window.__r210={draft,scroll,scrollTop:scroll.scrollTop};
   draft.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'文'}));
   lab.state.closedWeb.add('C05');bridge.render();
   draft.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'文'}));
 });
 const state=await page.evaluate(()=>{
  const draft=document.querySelector('#draft'),scroll=document.querySelector('.r28-chat-scroll');
  return {sameDraft:draft===window.__r210.draft,sameScroll:scroll===window.__r210.scroll,
   value:draft.value,start:draft.selectionStart,end:draft.selectionEnd,focused:document.activeElement===draft,
   scrollTop:scroll.scrollTop,before:window.__r210.scrollTop};
 });
 assert.equal(state.sameDraft,true);assert.equal(state.sameScroll,true);
 assert.equal(state.value,'Input 中文 日本語');assert.equal(state.start,4);assert.equal(state.end,8);
 assert.equal(state.focused,true);assert.equal(state.scrollTop,state.before);
 assert.equal(await page.locator('[data-spot=C05] .r28-demo-ad').count(),0);
 await page.locator('#r28Restore').click();
 assert.equal(await page.locator('#draft').inputValue(),'Input 中文 日本語');
});

browserTest('REAL Chromium: six screenshot presets, sold inventory and 0–4 prompts',async page=>{
 await page.locator('#r28PromptCount').selectOption('0');
 assert.equal(await page.locator('#r28Brand').isVisible(),true);
 assert.equal(await page.locator('#shortcut').isVisible(),false);
 for(const n of [1,2,3,4]){
  await page.locator('#r28PromptCount').selectOption(String(n));
  assert.equal(await page.locator('#rail .r28-shortcut:visible').count(),Math.max(0,n-1));
 }
 await page.locator('#r28Mode').selectOption('user');
 await page.evaluate(()=>window.OpenDeskR28.choose('S02'));
 for(const sold of [0,1,2,3]){
  await page.locator('#r28Sold').selectOption(String(sold));
  assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),sold);
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),0);
 }
 await page.locator('#r28Mode').selectOption('sales');
 for(const sold of [0,1,2,3]){
  await page.locator('#r28Sold').selectOption(String(sold));
  assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),3);
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),3-sold);
 }
 const captureDir=join(root,'artifacts');mkdirSync(captureDir,{recursive:true});
 for(const [index,preset] of ['brand','sponsor','hover','sidebar','newads','compare'].entries()){
  await page.evaluate(p=>window.OpenDeskR28.preset(p),preset);
  assert.equal(await page.evaluate(()=>window.OpenDeskR28.state.preset),preset);
  await page.screenshot({path:join(captureDir,'r210-'+(index+1)+'-'+preset+'.png'),fullPage:true});
 }
 await page.evaluate(()=>window.OpenDeskR28.preset('off'));
 assert.equal(await page.locator('#r28Brand').isVisible(),true);
 assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
});

browserTest('REAL Chromium: responsive, languages, theme, zoom, draft vs hotspots',async page=>{
 for(const lang of ['zh','en','ja']){
  await page.locator('#language').selectOption(lang);
  assert.ok((await page.locator('#r29SelectionTitle').innerText()).length>8);
 }
 for(const theme of ['dark','light']){
  await page.locator('#theme').selectOption(theme);
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
 }
 for(const w of [320,360,400,440]){
  await page.locator('#widthChoices button[data-width="'+w+'"]').click();
  assert.equal(await page.locator('#sidePanel').evaluate(e=>Math.round(e.getBoundingClientRect().width)),w);
 }
 await page.setViewportSize({width:360,height:800});
 await page.locator('#r28Sold').selectOption('1');
 await page.evaluate(()=>window.OpenDeskR28.choose('N05'));
 assert.equal(await page.locator('[data-spot=N05]').getAttribute('data-r29-narrow-suppressed'),'true');
 assert.equal(await page.locator('[data-spot=N05] .r28-demo-ad').count(),0);
 await page.locator('#draft').fill('Keep this draft');
 await page.locator('#zoom').selectOption('200');
 assert.equal(await page.locator('#draft').inputValue(),'Keep this draft');
 assert.equal(await page.locator('#r28Brand').isVisible(),true);
 await page.locator('#r28Restore').click();
 assert.equal(await page.locator('#draft').inputValue(),'Keep this draft');
});

// R2.11 — scoped preview tests. Browser checks require REAL Playwright Chromium.
// Run with BRAND_AD_LAB_REQUIRE_BROWSER=1 to FAIL (rather than SKIP) if unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const source=name=>readFileSync(join(root,name),'utf8');
const html=source('brand-ad-lab.html');
const r28=source('brand-ad-lab-r28.js'),r29=source('brand-ad-lab-r29.js');
const css28=source('brand-ad-lab-r28.css'),css29=source('brand-ad-lab-r29.css');
const ids=[...(r28.match(/const raw = \[([\s\S]*?)\n  \];/)?.[1]||'').matchAll(/\['([BSNC]\d\d)',/g)].map(m=>m[1]);
const formats=[...(r29.match(/const specs=\[([\s\S]*?)\n  \];/)?.[1]||'').matchAll(/\['([a-z]+(?:-[a-z]+)*)','(?:brand|sponsors|cards|business)'/g)].map(m=>m[1]);

test('R2.11 retains 17 formats, 35 placements and the three source versions',()=>{
 assert.equal(ids.length,35);
 assert.equal(new Set(ids).size,35);
 assert.equal(formats.length,17);
 assert.equal(new Set(formats).size,17);
 for(const src of [r28,r29])new vm.Script(src);
 assert.match(html,/OpenDeskR27Bridge=/);
 assert.match(html,/brand-ad-lab-r28\.js/);
 assert.match(html,/brand-ad-lab-r29\.js/);
});
test('R2.11 one close state authority, no misleading bulk dismiss, no unrelated ad surfaces',()=>{
 assert.doesNotMatch(r28,/\bcloseRail\b/);
 assert.match(r28,/closedRail:new Set\(\)/);
 assert.match(r28,/closedCards:new Set\(\)/);
 assert.match(r28,/closedWeb:new Set\(\)/);
 assert.match(r28,/closedTip:new Set\(\)/);
 assert.match(r28,/state\.group!=='S'/);
 assert.match(r28,/\['B03','B04','B05'\]\.includes\(state\.id\)/);
 assert.match(r28,/\['S01','S02','S08'\]\.includes\(state\.id\)/);
 assert.doesNotMatch(r28,/for\(let i=0;i<3;i\)state\.closedCards\.add/);
 assert.match(r28,/unit\.dataset\.layout=layout/);
 assert.match(r28,/composingDraft&&sceneChanged/);
 assert.match(css28,/R2\.11: preserve distinct semantic shapes/);
 assert.match(css29,/r29-sample-pop/);
});
test('R2.11 stays offline, fictional and non-tracking',()=>{
 for(const src of [r28,r29]){
   assert.doesNotMatch(src,/\b(?:fetch|sendBeacon|XMLHttpRequest|chrome\.scripting|chrome\.tabs|OpenDeskSDK|localStorage|sessionStorage)\s*[\.(]/);
 }
 assert.match(r29,/simulatedOnly:web/);
 assert.match(r29,/review:!web/);
 assert.match(r29,/p\.id==='C06'\?'critical'/);
});

let chromium=null, unavailable='No Playwright/managed Chromium installed — NOT_TESTED';
try{
 const pw=await import('playwright');
 if(existsSync(pw.chromium.executablePath()))chromium=pw.chromium;
 else unavailable='Playwright Chromium executable missing — NOT_TESTED';
}catch{/* No fake browser PASS. */}
if(process.env.BRAND_AD_LAB_REQUIRE_BROWSER==='1'&&!chromium){
 test('R2.11 mandatory real Chromium availability',()=>assert.fail(unavailable));
}
const inBrowser=(title,run)=>test(title,{skip:chromium?false:unavailable},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1480,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  await page.locator('#r29Map [data-place]').first().waitFor();
  await run(page);
  assert.deepEqual(errors,[],'No JS exceptions');
 }finally{await browser.close();}
});

inBrowser('REAL Chromium: 35 placement anchors, unique highlight, mock-only restrictions',async page=>{
 const meta=await page.evaluate(()=>window.OpenDeskR28.R29.meta);
 assert.equal(Object.keys(meta).length,35);
 for(const id of ids){
  await page.locator('#r29Map [data-place="'+id+'"]').click();
  assert.equal(await page.locator('#r29Map [aria-pressed=true]').count(),1,id);
  const anchor=meta[id].anchor.split(' → ')[0];
  assert.equal(await page.locator(anchor).count()>0,true,id+' anchor exists');
  if('NC'.includes(id[0])){
   assert.equal(meta[id].simulatedOnly,true,id);
   assert.equal(await page.locator('[data-spot="'+id+'"] .r29-zone-trigger').count(),1,id);
  }
 }
 assert.equal(meta.C06.policy,'critical');
});

inBrowser('REAL Chromium: independent rail/panel/footer/web closure and reversible stock',async page=>{
 await page.locator('#r28Sold').selectOption('3');
 await page.locator('#r28Mode').selectOption('user');
 await page.evaluate(()=>window.OpenDeskR28.choose('B03'));
 assert.equal(await page.locator('#r28Sponsor').isVisible(),true);
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),0);
 await page.locator('.r29-rail-close').click();
 assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
 await page.evaluate(()=>window.OpenDeskR28.choose('B04'));
 assert.equal(await page.locator('#r28Sponsor').isVisible(),true);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.OpenDeskR28.choose('S02'));
 assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),3);
 await page.locator('#r28SlotS02 .r28-dismiss-card').first().click();
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),2);
 await page.locator('#language').selectOption('ja');
 await page.locator('#theme').selectOption('dark');
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),2);
 await page.locator('#r28Restore').click();
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),3);
 await page.evaluate(()=>window.OpenDeskR28.choose('S03'));
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),0);
 assert.equal(await page.locator('#r28SlotS03 .r29-footer-dismiss').count(),1);
 await page.locator('#r28SlotS03 .r29-footer-dismiss').click();
 assert.equal(await page.locator('#r28SlotS03 .r29-footer-dismiss').count(),0);
 await page.evaluate(()=>window.OpenDeskR28.choose('N03'));
 assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
 assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),0);
 await page.locator('[data-spot="N03"] .r29-spot-dismiss').click();
 assert.equal(await page.locator('[data-spot="N03"] .r28-demo-ad').count(),0);
 await page.evaluate(()=>window.OpenDeskR28.choose('N04'));
 assert.equal(await page.locator('[data-spot="N04"] .r28-demo-ad').count(),1);
 await page.evaluate(()=>window.OpenDeskR28.choose('N03'));
 assert.equal(await page.locator('[data-spot="N03"] .r28-demo-ad').count(),0);
 await page.locator('#r28Restore').click();
 assert.equal(await page.locator('[data-spot="N03"] .r28-demo-ad').count(),1);
 assert.equal(await page.locator('#r28Brand').isVisible(),true);
});

inBrowser('REAL Chromium: S04/S05 mock form, draft caret and in-progress IME scene switch',async page=>{
 await page.locator('#r28Sold').selectOption('1');
 await page.evaluate(()=>window.OpenDeskR28.choose('S04'));
 assert.equal(await page.locator('#editPrompt').inputValue(),'');
 await page.locator('#editPrompt').fill('R2.11 中文输入内容');
 await page.locator('#editName').fill('保存示例');
 await page.locator('#r28SlotS04 .r28-dismiss-card').click();
 assert.equal(await page.locator('#editPrompt').inputValue(),'R2.11 中文输入内容');
 await page.locator('#saveEdit').click();
 await page.evaluate(()=>window.OpenDeskR28.choose('S05'));
 assert.equal(await page.locator('#editPrompt').inputValue(),'R2.11 中文输入内容');
 await page.evaluate(()=>{
   const lab=window.OpenDeskR28,bridge=window.OpenDeskR27Bridge;
   lab.choose('C05');lab.state.scene='long';bridge.render();
   const draft=document.getElementById('draft'),scroll=document.querySelector('.r28-chat-scroll');
   draft.value='A中文日本語Z';draft.focus();draft.setSelectionRange(1,4);
   scroll.scrollTop=180;window.__r211={draft,scrollTop:scroll.scrollTop};
   draft.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'}));
   lab.state.scene='short';bridge.render();
 });
 assert.equal(await page.evaluate(()=>window.__r211.draft===document.getElementById('draft')),true);
 assert.equal(await page.evaluate(()=>document.querySelector('#r28Page').dataset.r28Scene),'long');
 await page.evaluate(()=>document.getElementById('draft').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'})));
 const state=await page.evaluate(()=>{
  const d=document.getElementById('draft');
  return {same:d===window.__r211.draft,value:d.value,focus:document.activeElement===d,start:d.selectionStart,end:d.selectionEnd,scene:document.querySelector('#r28Page').dataset.r28Scene};
 });
 assert.deepEqual(state,{same:true,value:'A中文日本語Z',focus:true,start:1,end:4,scene:'short'});
});

inBrowser('REAL Chromium: six meaningful presets, 17 visual formats, narrow mock and screenshots',async page=>{
 const gallery=page.locator('#r29Gallery button[data-format]');
 assert.equal(await gallery.count(),17);
 const signatures=new Set();
 for(const fmt of formats){
  const b=gallery.filter({has:page.locator('strong')}).filter({visible:true}).filter({has:page.locator('[data-format="'+fmt+'"]')});
  const node=page.locator('#r29Gallery button[data-format="'+fmt+'"]');
  await node.click();
  if(['hover-card','expand-card','brand-hover'].includes(fmt)){
   assert.equal(await page.locator('#r28Dialog').evaluate(el=>el.open),true);
   await page.keyboard.press('Escape');
  }
  const signature=await node.locator('.r29-sample').evaluate(e=>{
   const s=getComputedStyle(e);return [s.display,s.flexDirection,s.gridTemplateColumns,s.borderLeftStyle,s.borderTopStyle,s.borderRadius,s.minHeight,s.width].join('/');
  });
  signatures.add(signature);
 }
 assert.ok(signatures.size>=10,'At least ten demonstrably distinct computed gallery layouts');
 const dir=join(root,'artifacts');mkdirSync(dir,{recursive:true});
 const presets=['brand','sponsor','hover','sidebar','newads','compare'];
 for(const [index,name] of presets.entries()){
  await page.evaluate(p=>window.OpenDeskR28.preset(p),name);
  assert.equal(await page.evaluate(()=>window.OpenDeskR28.state.preset),name);
  await page.screenshot({path:join(dir,'r211-'+(index+1)+'-'+name+'.png'),fullPage:true});
 }
 await page.evaluate(()=>window.OpenDeskR28.preset('off'));
 assert.equal(await page.locator('#r28Brand').isVisible(),true);
 assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
 await page.setViewportSize({width:360,height:800});
 await page.locator('#r28Sold').selectOption('1');
 await page.evaluate(()=>window.OpenDeskR28.choose('C06'));
 assert.equal(await page.locator('[data-spot="C06"]').getAttribute('data-r29-narrow-suppressed'),'true');
 assert.equal(await page.locator('[data-spot="C06"] .r28-demo-ad').count(),0);
});

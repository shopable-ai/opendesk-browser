// R2.9 offline preview tests. Run:
// node --test examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r{28,29}.test.mjs
// Browser tests require a REAL installed Playwright + Chromium; skipped means NOT_TESTED, never PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
const root=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(root,'brand-ad-lab.html'),'utf8');
const base=readFileSync(join(root,'brand-ad-lab-r28.js'),'utf8');
const js=readFileSync(join(root,'brand-ad-lab-r29.js'),'utf8');
const css=readFileSync(join(root,'brand-ad-lab-r29.css'),'utf8');
const oldCss=readFileSync(join(root,'brand-ad-lab-r28.css'),'utf8');

test('R2.9 loads after R2.8 and preserves R2.7 inline behavior',()=>{
 assert.match(html,/window\.OpenDeskR27Bridge=/);
 assert.ok(html.indexOf('brand-ad-lab-r28.js') < html.indexOf('brand-ad-lab-r29.js'));
 assert.ok(html.indexOf('brand-ad-lab-r28.css') < html.indexOf('brand-ad-lab-r29.css'));
 assert.match(html,/R2\.9/);
});
test('both R2.8 and R2.9 scripts parse',()=>{
 new vm.Script(base,{filename:'R28'});
 new vm.Script(js,{filename:'R29'});
});
test('exactly 17 unique formats and 35 map selectors exist',()=>{
 const content=js.match(/const specs=\[([\s\S]*?)\n  \];/)?.[1];
 assert.ok(content);
 const formats=[...content.matchAll(/\['([a-z]+(?:-[a-z]+)*)','(?:brand|sponsors|cards|business)'/g)].map(x=>x[1]);
 assert.equal(formats.length,17);
 assert.equal(new Set(formats).size,17);
 const registry=base.match(/const raw = \[([\s\S]*?)\n  \];/)?.[1];
 const ids=[...registry.matchAll(/\['([BSNC]\d\d)',/g)].map(x=>x[1]);
 assert.equal(ids.length,35);assert.equal(new Set(ids).size,35);
 for(const [group,num] of [['B',8],['S',8],['N',12],['C',7]])
   assert.equal(ids.filter(id=>id[0]===group).length,num);
 for(const id of ids){
   if(id[0]==='B'||id[0]==='S')assert.match(js,new RegExp(id+":"));
   else assert.match(js,new RegExp("for\\(const g of \\['N','C'\\]"));
 }
});
test('dismiss, restore, prompt-first states and zero-sold user guards',()=>{
 assert.match(base,/state\.closeRail=true/);
 assert.match(base,/state\.closedWeb\.add\(id\)/);
 assert.match(base,/state\.closedCards\.add\(i\)/);
 assert.match(base,/state\.sold>0\|\|state\.mode==='sales'/);
 assert.match(base,/hadDraftFocus/);
 assert.match(base,/setSelectionRange/);
 assert.match(base,/formMode:'new'/);
 assert.match(base,/state\.formMode='edit'/);
 assert.match(base,/prompts<i\+2/);
 assert.match(oldCss,/#railSponsor\[hidden\]/);
 assert.match(base,/window\.OpenDeskR28=/);
});
test('format and placement are separate, risk-only areas remain fictional',()=>{
 assert.match(js,/const compatible=id=>/);
 assert.match(js,/simulatedOnly:web/);
 assert.match(js,/review:!web/);
 assert.match(js,/Object\.keys\(meta\)\.length!==35/);
 assert.match(js,/const prior=lab\.sync/);
 assert.doesNotMatch(js,/(?:fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|chrome\.scripting|OpenDeskSDK|https?:\/\/)/);
 assert.match(css,/focus-visible/);
 assert.match(css,/@media\(max-width:440px\)/);
});
let chromium;
try{({chromium}=await import('playwright'));}catch{/* No browser proof without the dependency. */}
test('REAL Chromium: 35 placements, gallery interactions, no JS exceptions',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  assert.equal(await page.locator('#r29Gallery [data-format].r29-format-card').count(),17);
  assert.equal(await page.locator('#r29Map [data-place]').count(),35);
  const ids=await page.locator('#r29Map [data-place]').evaluateAll(es=>es.map(e=>e.dataset.place));
  for(const id of ids){
   await page.evaluate(id=>window.OpenDeskR28.choose(id),id);
   assert.equal(await page.locator('#r29Map [data-place="'+id+'"]').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('#r29SelectionTitle').innerText(),new RegExp(id));
   if(id[0]==='N'||id[0]==='C'){
    const zone=page.locator('[data-spot="'+id+'"]').first();
    assert.equal(await zone.getAttribute('data-r28-current'),'true');
    assert.equal(await zone.locator('button.r29-zone-trigger').count(),1);
   }
  }
  for(const type of ['brand-logo','icon','text','landscape','vertical','mini','hero','recruit','self','event','directory','affiliate']){
   await page.locator('#r29Gallery button[data-format="'+type+'"]').click();
   assert.equal(await page.locator('#r28Layout').inputValue(),type);
  }
  await page.evaluate(()=>window.OpenDeskR28.choose('S04'));
  assert.equal(await page.locator('#editView').getAttribute('data-r29-form'),'new');
  await page.evaluate(()=>window.OpenDeskR28.choose('S05'));
  assert.equal(await page.locator('#editView').getAttribute('data-r29-form'),'edit');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('REAL Chromium: rail, inventory, webpage opt-out, editor and languages',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  await page.locator('#r28PromptCount').selectOption('0');
  assert.equal(await page.locator('#r28Brand').isVisible(),true);
  assert.equal(await page.locator('#shortcut').isVisible(),false);
  await page.locator('#r28PromptCount').selectOption('4');
  await page.locator('#r28Sold').selectOption('1');
  await page.evaluate(()=>window.OpenDeskR28.choose('B03'));
  assert.equal(await page.locator('#r28Sponsor').isVisible(),true);
  await page.locator('.r29-rail-close').click();
  assert.equal(await page.locator('#r28Sponsor').isVisible(),false);
  assert.equal(await page.locator('#r28Brand').isVisible(),true);
  await page.locator('#r28Restore').click();
  assert.equal(await page.locator('#r28Sponsor').isVisible(),true);
  await page.locator('#r28Sold').selectOption('0');
  await page.locator('#r28Mode').selectOption('user');
  await page.evaluate(()=>window.OpenDeskR28.choose('N03'));
  assert.equal(await page.locator('[data-spot=N03] .r28-demo-ad').count(),0);
  await page.locator('#r28Sold').selectOption('1');
  assert.equal(await page.locator('[data-spot=N03] .r28-demo-ad').count(),1);
  await page.locator('[data-spot=N03] .r29-spot-dismiss').click();
  assert.equal(await page.locator('[data-spot=N03] .r28-demo-ad').count(),0);
  await page.locator('#r28Restore').click();
  assert.equal(await page.locator('[data-spot=N03] .r28-demo-ad').count(),1);
  await page.evaluate(()=>window.OpenDeskR28.choose('S02'));
  await page.locator('#r28Mode').selectOption('user');
  for(const n of [0,1,2,3]){
   await page.locator('#r28Sold').selectOption(String(n));
   assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),n);
  }
  await page.locator('#r28Mode').selectOption('sales');
  await page.locator('#r28Sold').selectOption('0');
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),3);
  await page.locator('#r28Mode').selectOption('user');
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),0);
  for(const lang of ['en','ja','zh'])await page.locator('#language').selectOption(lang);
  for(const theme of ['dark','light'])await page.locator('#theme').selectOption(theme);
  for(const w of ['320','360','400','440']){
   await page.locator('#widthChoices button[data-width="'+w+'"]').click();
   assert.equal(await page.locator('#sidePanel').evaluate(e=>Math.round(e.getBoundingClientRect().width)),Number(w));
  }
  await page.evaluate(()=>window.OpenDeskR28.choose('B01'));
  await page.locator('#shortcut').click();
  assert.ok((await page.locator('#draft').inputValue()).length>0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('REAL Chromium: six presets, 200% zoom, long conversation and R2.7 compatibility',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  for(const preset of ['brand','sponsor','hover','sidebar','newads','compare','off']){
   await page.evaluate(key=>window.OpenDeskR28.preset(key),preset);
   assert.equal(await page.evaluate(()=>window.OpenDeskR28.state.preset),preset);
  }
  await page.evaluate(()=>window.OpenDeskR28.choose('C06'));
  await page.locator('#r28Scene').selectOption('long');
  assert.ok(await page.locator('.r28-chat-scroll .r28-answer').count()>=13);
  await page.locator('#zoom').selectOption('200');
  assert.equal(await page.locator('#r28Brand').isVisible(),true);
  await page.locator('#placement').selectOption('A4');
  assert.equal(await page.evaluate(()=>window.OpenDeskR28.state.active),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

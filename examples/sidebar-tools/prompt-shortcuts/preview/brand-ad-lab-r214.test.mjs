// R2.14 preview-only smoke. Static tests run with Node; Chromium tests require Playwright.
// R214_REQUIRE_BROWSER=1 node --test examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r214.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const file=join(root,'brand-ad-lab-r214.html');
const html=readFileSync(file,'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('R2.14 inline JavaScript parses; one self-contained preview',()=>{
  assert.ok(script,'Expected inline preview script');
  new vm.Script(script,{filename:'brand-ad-lab-r214 inline'});
  assert.match(html,/<nav class="rail variant-b" id="rail"/);
  assert.match(script,/className='rail-btn od'/);
  assert.match(html,/aria-live="polite"/);
});
test('R2.14 remains offline; approved rail and four scenes are source-bound',()=>{
  assert.doesNotMatch(script,/\b(?:fetch|sendBeacon|XMLHttpRequest|OpenDeskSDK|chrome\.scripting|chrome\.tabs|localStorage|sessionStorage)\s*[.(]/);
  for(const scene of ['normal-new','project-new','normal-old','project-old'])assert.ok(html.includes(scene),scene);
  for(const variant of ['variant-a','variant-b','variant-c'])assert.ok(html.includes(variant),variant);
  assert.match(script,/pendingScene=scene/);
  assert.match(script,/if\(state\.composing\)/);
  assert.match(script,/aria-describedby/);
  assert.match(script,/state\.sponsor=false/);
});

let chromium=null,unavailable='Playwright/Chromium unavailable — NOT_TESTED';
try{
  const pw=await import('playwright');
  if(existsSync(pw.chromium.executablePath()))chromium=pw.chromium;
  else unavailable='Playwright Chromium executable missing — NOT_TESTED';
}catch{}
if(process.env.R214_REQUIRE_BROWSER==='1'&&!chromium)
  test('R2.14 real Chromium required',()=>assert.fail(unavailable));

const browserTest=(title,check)=>test(title,{skip:chromium?false:unavailable},async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(file).href);
    await page.locator('#rail .od').waitFor();
    await check(page);
    assert.deepEqual(errors,[],'Unexpected preview JS exception');
    if(process.env.R214_SCREENSHOT_DIR){
      mkdirSync(process.env.R214_SCREENSHOT_DIR,{recursive:true});
      const label=title.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
      await page.screenshot({path:join(process.env.R214_SCREENSHOT_DIR,label+'.png'),fullPage:true});
    }
  }finally{await browser.close();}
});

browserTest('Four states, three variants, zero to four buttons and composer integrity',async page=>{
  for(let i=0;i<4;i++){
    await page.locator('#scenes button').nth(i).click();
    assert.equal(await page.locator('#device').getAttribute('data-scene'),['normal-new','project-new','normal-old','project-old'][i]);
    assert.equal(await page.locator('#draft').count(),1);
  }
  for(const [i,variant] of ['a','b','c'].entries()){
    await page.locator('#variants button').nth(i).click();
    await page.locator('#rail').evaluate(el=>el.offsetHeight);
    assert.match(await page.locator('#rail').getAttribute('class'),new RegExp('variant-'+variant));
  }
  for(let count=0;count<=4;count++){
    await page.locator('#count').selectOption(String(count));
    assert.equal(await page.locator('#rail .prompt').count(),count);
    assert.equal(await page.locator('#rail .od').count(),1);
  }
});

browserTest('Draft insertion preserves text, IME postpones scene changes and send changes layout',async page=>{
  await page.locator('#draft').fill('保留草稿');
  await page.locator('#draft').evaluate(el=>el.setSelectionRange(2,2));
  await page.locator('#rail .prompt').first().click();
  assert.match(await page.locator('#draft').inputValue(),/^保留/);
  assert.equal(await page.locator('#messages .message').count(),0);
  const field=page.locator('#draft');
  const before=await field.inputValue();
  await field.dispatchEvent('compositionstart');
  await page.locator('#scenes button').nth(1).click();
  assert.equal(await page.locator('#device').getAttribute('data-scene'),'normal-new');
  assert.equal(await field.inputValue(),before);
  await field.dispatchEvent('compositionend');
  await page.waitForFunction(()=>document.querySelector('#device').dataset.scene==='project-new');
  assert.equal(await field.inputValue(),before);
  await page.locator('#send').click();
  assert.equal(await page.locator('#device').getAttribute('data-scene'),'project-old');
  assert.equal(await page.locator('#messages .message').count(),2);
});

browserTest('Tooltip Escape and separately dismissible sponsor retain keyboard focus',async page=>{
  await page.locator('#rail .prompt').first().focus();
  assert.equal(await page.locator('#tip').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#tip').isHidden(),true);
  await page.locator('#sponsor').check();
  await page.locator('#rail .ad').focus();
  assert.equal(await page.locator('#tip').isVisible(),true);
  assert.equal(await page.locator('#tipClose').getAttribute('aria-label'),'关闭赞助入口');
  await page.locator('#tipClose').click();
  assert.equal(await page.locator('#rail .ad').count(),0);
  assert.equal(await page.locator('#sponsor').isChecked(),false);
  assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('od')),true);
  await page.locator('#sponsor').check();
  assert.equal(await page.locator('#rail .ad').count(),1);
});

browserTest('Compact viewport, dark theme, English and Japanese; avoid composer overlap',async page=>{
  for(const size of ['1440','1024','390']){
    await page.locator('#size').selectOption(size);
    await page.waitForTimeout(120);
    if(size==='390')assert.match(await page.locator('#rail').getAttribute('class'),/horizontal/);
    const overlap=await page.evaluate(()=>{
      const rail=document.querySelector('#rail').getBoundingClientRect();
      const editor=document.querySelector('#composer').getBoundingClientRect();
      return Math.max(0,Math.min(rail.right,editor.right)-Math.max(rail.left,editor.left))*
        Math.max(0,Math.min(rail.bottom,editor.bottom)-Math.max(rail.top,editor.top));
    });
    assert.ok(overlap<3,'Rail overlays composer: '+size+' overlap='+overlap);
  }
  await page.locator('#theme').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  for(const lang of ['en','ja','zh']){
    await page.locator('#lang').selectOption(lang);
    assert.ok((await page.locator('#rail .prompt').first().getAttribute('aria-label'))?.length);
  }
});

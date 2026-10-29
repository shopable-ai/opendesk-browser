// R2.8 preview-only validation. node --test brand-ad-lab-r28.test.mjs
// Browser test runs when an existing Playwright installation is available; no new dependency is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const root=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(root,'brand-ad-lab.html'),'utf8');
const js=readFileSync(join(root,'brand-ad-lab-r28.js'),'utf8');
const css=readFileSync(join(root,'brand-ad-lab-r28.css'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('R2.7 source remains and R2.8 CSS/JS load after it',()=>{
 assert.ok(source,'original inline script is retained');
 assert.match(html,/src="\.\/brand-ad-lab-r28\.js"/);
 assert.match(html,/href="\.\/brand-ad-lab-r28\.css"/);
 assert.match(source,/window\.OpenDeskR27Bridge=/);
 assert.ok(html.indexOf('</script>')<html.indexOf('brand-ad-lab-r28.js'));
});
test('both JavaScript programs parse as JavaScript',()=>{
 new vm.Script(source,{filename:'R2.7 inline'});
 new vm.Script(js,{filename:'R2.8 extension'});
});
test('candidate registry defines exactly B8 S8 N12 C7 with no duplicate IDs',()=>{
 const names=js.match(/const raw = \[([\s\S]*?)\n  \];/)?.[1];
 assert.ok(names,'position registry');
 const ids=[...names.matchAll(/\['([BSNC]\d\d)',/g)].map(x=>x[1]);
 assert.equal(ids.length,35);assert.equal(new Set(ids).size,35);
 for(const [g,count] of [['B',8],['S',8],['N',12],['C',7]])assert.equal(ids.filter(x=>x[0]===g).length,count);
 for(const id of ['N03','N04','N05','N08','C06','B01','S02'])assert.ok(ids.includes(id));
});
test('no real injection, remote advertising or telemetry methods in new preview',()=>{
 assert.doesNotMatch(js,/\b(?:fetch|sendBeacon|XMLHttpRequest|chrome\.tabs|chrome\.scripting|OpenDeskSDK|localStorage|sessionStorage)\s*[\.(]/);
 assert.doesNotMatch(html,/https?:\/\/[^" ]+\/ads\/serve/);
 assert.match(css,/\.r28-rail-sponsor/);
 assert.match(js,/state\.closedCards\.clear\(\)/);
});
test('all screenshot presets and accessibility controls are present',()=>{
 for(const key of ['brand','sponsor','hover','sidebar','newads','compare','off'])assert.match(js,new RegExp("'"+key+"'"));
 assert.match(js,/aria-pressed/);assert.match(js,/r28DialogClose/);assert.match(js,/event\.isTrusted|r28Points/);
});
let chromium;
try {({chromium}=await import('playwright'));}catch{/* Node static checks remain usable without Playwright. */}
test('browser interaction: rail brand, inventory, hotspots, dialog and ad dismissal',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1480,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(root,'brand-ad-lab.html')).href);
  await page.waitForSelector('#r28Brand');
  assert.equal(await page.locator('#r28Table tr').count(),35);
  await page.locator('#r28PromptCount').selectOption('0');
  assert.equal(await page.locator('#r28Brand').isVisible(),true);
  assert.equal(await page.locator('#shortcut').isVisible(),false);
  await page.locator('#r28PromptCount').selectOption('4');
  await page.locator('#r28Mode').selectOption('sales');
  await page.locator('#r28Sold').selectOption('0');
  await page.locator('#r28Groups button').filter({hasText:'S ·'}).click();
  await page.locator('#r28Points button').filter({hasText:'S02'}).click();
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),3);
  await page.locator('#r28Mode').selectOption('user');
  assert.equal(await page.locator('#r28SlotS02 [data-unsold=true]').count(),0);
  await page.locator('#r28Sold').selectOption('3');
  assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),3);
  await page.locator('#r28Dismiss').click();
  assert.equal(await page.locator('#r28SlotS02 .r28-demo-ad').count(),0);
  await page.locator('#r28Restore').click();
  await page.locator('#r28Groups button').filter({hasText:'N ·'}).click();
  await page.locator('#r28Points button').filter({hasText:'N03'}).click();
  assert.equal(await page.locator('[data-spot=N03]').first().getAttribute('data-r28-current'),'true');
  await page.locator('#r28Points button').filter({hasText:'N04'}).click();
  assert.equal(await page.locator('[data-spot=N04]').first().getAttribute('data-r28-current'),'true');
  await page.locator('#r28Brand').click();
  assert.equal(await page.locator('#r28Dialog').evaluate(d=>d.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#r28Dialog').evaluate(d=>d.open),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

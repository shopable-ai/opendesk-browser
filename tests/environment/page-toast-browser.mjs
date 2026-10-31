// Offline DOM/CSS software regression only; no extension/profile/installation or real-site evidence.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {showPageToast} from '../../src/scripting/user-scripts/page-toast.js';

const candidates=[process.env.OPENDESK_PLAYWRIGHT_MODULE,'playwright',
  resolve(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean);
let chromium;
for(const candidate of candidates){
  try{({chromium}=await import(candidate));break;}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
}
if(!chromium)throw Error('Existing Playwright required; set OPENDESK_PLAYWRIGHT_MODULE (no dependency installation).');
const executablePath=process.env.OPENDESK_PREVIEW_CHROME_BIN||[
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'
].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
const failures=[],checks=[];
async function check(name,run){
  try{await run();checks.push(name);console.log('PASS '+name);}
  catch(error){failures.push({name,message:error.message});console.error('FAIL '+name+': '+error.message);}
}
try{
  const context=await browser.newContext({viewport:{width:1000,height:720},colorScheme:'light'});
  // Capture only in this test realm; production closed-shadow code is unchanged.
  await context.addInitScript(()=>{
    const attach=Element.prototype.attachShadow;
    window.toastRoots=new WeakMap();
    Element.prototype.attachShadow=function(options){const root=attach.call(this,options);window.toastRoots.set(this,root);return root;};
  });
  const page=await context.newPage();
  await page.goto(pathToFileURL(fileURLToPath(new URL('../fixtures/page-toast-conflicts.html',import.meta.url))).href);
  const source=showPageToast.toString();
  const show=(options)=>page.evaluate(({source,options})=>(0,eval)('('+source+')')(options),{source,options});
  const measure=()=>page.evaluate(()=>{
    const host=document.querySelector('[data-opendesk-page-toast]');
    if(!host)return null;
    const root=window.toastRoots.get(host),notice=root.querySelector('[role=status]'),text=notice.lastElementChild;
    const styles=el=>{const s=getComputedStyle(el);return Object.fromEntries(['display','visibility','opacity','filter','transform','fontSize','fontStyle','lineHeight','letterSpacing','textTransform','textShadow','color','backgroundColor','pointerEvents','animationName','clipPath'].map(key=>[key,s[key]]));};
    const rect=notice.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(text);const tr=range.getBoundingClientRect();
    return {host:styles(host),notice:styles(notice),text:styles(text),message:text.textContent,
      rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      textRect:{width:tr.width,height:tr.height},viewport:{width:innerWidth,height:innerHeight},
      parent:host.parentElement.id,popover:host.matches(':popover-open'),
      pseudo:['::before','::after'].map(p=>({content:getComputedStyle(host,p).content,display:getComputedStyle(host,p).display})),
      backdrop:{background:getComputedStyle(host,'::backdrop').backgroundColor,pointerEvents:getComputedStyle(host,'::backdrop').pointerEvents}};
  });
  const snapshot=()=>page.evaluate(()=>Object.fromEntries(['stage','controls','label','edit','click'].map(id=>{
    const el=document.getElementById(id),s=getComputedStyle(el),r=el.getBoundingClientRect();
    return [id,{css:Array.from(s).map(key=>[key,s.getPropertyValue(key)]),rect:[r.x,r.y,r.width,r.height]}];
  })));
  await page.locator('#edit').fill('before');
  const before=await snapshot();
  await show({id:'regression',message:'视频倍速 · 1.25×',variant:'success',duration:10000});
  await check('website computed styles and layout unchanged',async()=>assert.deepEqual(await snapshot(),before));
  await check('focus and input retained; toast does not intercept clicks',async()=>{
    assert.equal(await page.evaluate(()=>document.activeElement.id),'edit');
    await page.keyboard.type(' after');assert.equal(await page.locator('#edit').inputValue(),'before after');
    await page.locator('#click').click();assert.equal(await page.locator('#count').textContent(),'1');
  });
  await check('toast readable despite host resets, inherited typography and semantic variables',async()=>{
    const m=await measure();
    assert.equal(m.message,'视频倍速 · 1.25×');
    assert.equal(m.host.opacity,'1');assert.equal(m.host.filter,'none');assert.equal(m.host.animationName,'none');
    assert.equal(m.host.visibility,'visible');assert.equal(m.host.pointerEvents,'none');assert.equal(m.host.clipPath,'none');
    assert.equal(m.text.fontSize,'14px');assert.equal(m.text.fontStyle,'normal');
    assert.equal(m.text.letterSpacing,'normal');assert.equal(m.text.textTransform,'none');assert.equal(m.text.textShadow,'none');
    assert.equal(m.text.color,'rgb(27, 44, 73)');assert.equal(m.notice.backgroundColor,'rgb(255, 255, 255)');
    assert.ok(m.textRect.width>40&&m.textRect.height>=14,JSON.stringify(m));
    assert.ok(m.rect.width>m.textRect.width&&m.rect.height>=38,JSON.stringify(m));
  });
  await check('host pseudo elements and popover backdrop cannot cover website',async()=>{
    const m=await measure();assert.equal(m.popover,true);
    for(const p of m.pseudo)assert.ok(p.content==='none'||p.display==='none',JSON.stringify(p));
    assert.equal(m.backdrop.background,'rgba(0, 0, 0, 0)');assert.equal(m.backdrop.pointerEvents,'none');
  });
  const positions=['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'];
  async function verifyPositions(mode){
    for(const position of positions)await check(mode+' '+position,async()=>{
      await show({id:'regression',message:'位置测试 1.25×',position,duration:10000});
      const {rect:r,viewport:v,parent}=await measure();
      const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=2,`${position}: ${actual} != ${expected}; ${JSON.stringify(r)}`);
      if(position.includes('left')||position==='left')near(r.left,16);
      else if(position.includes('right')||position==='right')near(r.right,v.width-16);
      else near((r.left+r.right)/2,v.width/2);
      if(position.startsWith('top'))near(r.top,16);
      else if(position.startsWith('bottom'))near(r.bottom,v.height-16);
      else near((r.top+r.bottom)/2,v.height/2);
      assert.ok(r.width>40&&r.height>=38);
      if(mode==='fullscreen')assert.equal(parent,'stage');
    });
  }
  await verifyPositions('ordinary');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(()=>document.fullscreenElement?.id==='stage');
  await verifyPositions('fullscreen');
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.fullscreenElement);
  await check('replacement reuses host and resets dismissal deadline',async()=>{
    await show({id:'regression',message:'first',duration:1000});
    await page.evaluate(()=>window.firstToast=document.querySelector('[data-opendesk-page-toast]'));
    await page.waitForTimeout(650);
    await show({id:'regression',message:'replacement',duration:1600});
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>document.querySelector('[data-opendesk-page-toast]')===window.firstToast),true);
    assert.equal((await measure()).message,'replacement');
    assert.equal(await page.locator('[data-opendesk-page-toast]').count(),1);
    await page.waitForFunction(()=>!document.querySelector('[data-opendesk-page-toast]'),{},{timeout:2500});
  });
  await check('pagehide removes DOM, timer and fullscreen listener without resurrection',async()=>{
    await show({id:'regression',message:'pagehide',duration:1000});
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await measure(),null);
    await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
    assert.equal(await measure(),null);
    // A stale pre-pagehide timer must not close a new toast on the same test document.
    await show({id:'regression',message:'new lifecycle',duration:1800});
    await page.waitForTimeout(1100);assert.equal((await measure()).message,'new lifecycle');
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await measure(),null);
  });
  console.log(JSON.stringify({grade:'OFFLINE_HEADLESS_DOM_CSS',browser:browser.version(),passed:checks.length,failed:failures.length,failures,nativeChrome:'NOT_TESTED',realSites:'NOT_TESTED'},null,2));
  if(failures.length)process.exitCode=1;
}finally{await browser.close();}

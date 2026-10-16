// Real upstream engine / local DOM fixture only; never a native installation or
// ChatGPT acceptance driver. No changes to Chrome extension permissions/CSP.
// Usage: node this-file --assets DIR --browser CHROMIUM --playwright MODULE --out DIR
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,join,extname,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startXmindPreview} from '../../examples/programs/chatgpt-mindmap/preview/serve.mjs';
const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2].slice(2),process.argv[3+i*2]]));
for(const key of ['assets','browser','playwright','out'])assert.ok(args[key],`--${key} required`);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const provenance=JSON.parse(await readFile(join(root,'examples/programs/chatgpt-mindmap/tests/xmind-provenance.json'),'utf8'));
const assets=new Map();
for(const row of provenance.assets){
 const data=await readFile(join(resolve(args.assets),row.name));
 assert.equal(data.length,row.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),row.sha256);
 assets.set('/__xmind_probe/'+row.name,data);
}
const out=resolve(args.out);await mkdir(out,{recursive:true});
const report={level:'LINUX_CHROMIUM_REAL_SDK_DOM_FIXTURE',chatgpt:'NOT_TESTED',installed:'NOT_TESTED',
 csp:"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'",
 launchArgs:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],assets:provenance.assets,cases:[],errors:[],externalRequests:[]};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://probe');let pathname=decodeURIComponent(url.pathname),bytes;
  if(assets.has(pathname))bytes=assets.get(pathname);
  else{
   const target=resolve(root,'.'+pathname);if(!target.startsWith(root+'/'))throw Error('path');bytes=await readFile(target);
   if(pathname.endsWith('chatgpt-mindmap.html')&&!url.searchParams.has('missing')){
    const tags=provenance.assets.map(r=>`<script src="/__xmind_probe/${r.name}"></script>`).join('');
    bytes=Buffer.from(bytes.toString().replace('<script type="module"',tags+'<script type="module"'));
   }
  }
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'})[extname(pathname)]||'application/octet-stream','Content-Security-Policy':report.csp});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
const passed=name=>report.cases.push({name,status:'PASS'});
try{
 const {chromium}=await import(pathToFileURL(resolve(args.playwright)).href);
 browser=await chromium.launch({executablePath:resolve(args.browser),headless:true,args:report.launchArgs});report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 page.on('pageerror',e=>report.errors.push(e.stack));
 await page.route('**/*',route=>{if(!route.request().url().startsWith(origin+'/')){report.externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 const base=origin+'/tests/fixtures/chatgpt-mindmap.html';
 const turn=n=>page.locator(`[data-testid="conversation-turn-${n}"]`);
 const trigger=n=>turn(n).locator('[data-opendesk-chatgpt-mindmap="button"] button');
 const viewer=n=>turn(n).locator('[data-opendesk-chatgpt-mindmap="viewer"]');
 const control=(n,label)=>viewer(n).getByRole('button',{name:label,exact:true});
 const ready=n=>viewer(n).and(page.locator('[data-ready="true"]')).waitFor({timeout:15000});
 await page.goto(base+'?missing=1');await page.waitForFunction(()=>window.fixtureReady);
 await trigger(1).click();await page.waitForFunction(()=>document.querySelector('[data-testid="conversation-turn-1"] .markdown').style.display!=='none');
 assert.equal(await viewer(1).count(),0);passed('Missing runtime restores original without an alternate renderer');
 await page.goto(base+'?delay=250');await page.waitForFunction(()=>window.fixtureReady);
 await trigger(1).click();await control(1,'恢复本条回复原文').click();
 await viewer(1).waitFor({state:'detached'});
 const late=await page.evaluate(()=>({created:fixture.calls.created,closed:fixture.calls.closed,hidden:document.querySelector('.markdown').style.display==='none'}));
 assert.equal(late.created,1);assert.equal(late.closed,1);assert.equal(late.hidden,false);
 passed('Closing while real SDK initializes closes the late controller');
 await page.goto(base);await page.waitForFunction(()=>window.fixtureReady);
 assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),6);passed('Six answers each have one button');
 await trigger(1).click();await ready(1);await trigger(2).click();await ready(2);
 assert.ok(await viewer(1).locator('.topic').count()>1);assert.ok(await viewer(2).locator('.topic').count()>1);passed('A/B both render actual XMind topics');
 const zoomBefore=await page.evaluate(()=>window.fixture.calls.controllers[0].getZoomPencentage());
 await control(1,'放大').click();await page.waitForTimeout(180);
 const zoomAfter=await page.evaluate(()=>window.fixture.calls.controllers[0].getZoomPencentage());assert.ok(zoomAfter>zoomBefore);passed('Toolbar calls real SDK zoom');
 const expandedCount=await viewer(1).locator('.topic:visible').count();
 await control(1,'折叠所有分支').click();
 await control(1,'展开所有分支').waitFor({timeout:20000});
 const foldedCount=await viewer(1).locator('.topic:visible').count();report.actualFold={expandedCount,foldedCount};assert.ok(foldedCount<expandedCount);
 await control(1,'展开所有分支').click();
 await control(1,'折叠所有分支').waitFor({timeout:20000});
 assert.equal(await viewer(1).locator('.topic:visible').count(),expandedCount);
 report.actualFold={expandedCount,foldedCount};passed('Real Workbook branch flags collapse and expand rendered topics');
 await control(1,'进入全屏').click();await page.waitForFunction(()=>window.fixture.registry.activeFullscreen);await page.keyboard.press('Escape');
 await viewer(1).waitFor();passed('Fullscreen/Escape returns to A');
 await trigger(5).click();await ready(5);await trigger(6).click();await ready(6);
 const beforeFold=await viewer(5).locator('.topic').count();
 await control(5,'折叠所有分支').click();
 await control(5,'展开所有分支').waitFor({timeout:20000});
 assert.equal(await control(5,'展开所有分支').getAttribute('aria-pressed'),'true');
 assert.equal(await control(6,'折叠所有分支').getAttribute('aria-pressed'),'false');
 passed('Identical replies keep independent SDK controllers and toolbar state');
 report.foldObservation={beforeFold,afterFold:await viewer(5).locator('.topic').count()};
 await page.getByRole('button',{name:'重建 B 操作栏',exact:true}).click();await page.waitForTimeout(250);
 assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),6);passed('Toolbar replacement does not duplicate buttons');
 await page.getByRole('button',{name:'更新 B 正文',exact:true}).click();await page.waitForTimeout(850);
 await control(2,'重新读取本条回复').click();await ready(2);passed('Refresh recreates B from its updated content');
 for(let i=0;i<20;i++){await trigger(3).click();await ready(3);await control(3,'恢复本条回复原文').click();await viewer(3).waitFor({state:'detached'});}
 passed('20 actual SDK open/close cycles');
 await page.screenshot({path:join(out,'light-fixture.png'),fullPage:true});
 await page.setViewportSize({width:320,height:740});await page.waitForTimeout(250);await page.screenshot({path:join(out,'narrow-fixture.png'),fullPage:true});
 report.narrowOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.getByRole('button',{name:'删除 F',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),5);passed('Removed answer releases controller');
 await page.getByRole('button',{name:'模拟 SPA',exact:true}).click();await page.waitForTimeout(1300);assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="viewer"]').count(),0);passed('SPA releases all answer views');
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForFunction(()=>window.fixtureStopped||window.fixtureError);
 assert.equal(await page.evaluate(()=>window.fixtureError||null),null);
 report.lifecycle=await page.evaluate(()=>({created:fixture.calls.created,closed:fixture.calls.closed,remaining:document.querySelectorAll('[data-opendesk-chatgpt-mindmap]').length,hidden:[...document.querySelectorAll('.markdown')].some(n=>n.style.display==='none')}));
 assert.equal(report.lifecycle.created,report.lifecycle.closed);assert.equal(report.lifecycle.remaining,0);assert.equal(report.lifecycle.hidden,false);passed('Stop calls close on every controller and restores originals');
 report.globalStyleCount=await page.locator('style').count();
 assert.equal(report.externalRequests.length,0);passed('No external network request from synthetic content');
 // R2.1: independent product-facing HTML is tested with the same ORIGINAL SDK.
 // Separate loopback origin + isolated browser page; no installed extension claim.
 const preview=await startXmindPreview({assetsDirectory:args.assets});
 const previewPage=await browser.newPage({viewport:{width:1000,height:800}});
 const previewOrigin=new URL(preview.url).origin;
 try{
  await previewPage.route('**/*',route=>{
   const url=route.request().url();
   if(!url.startsWith(previewOrigin+'/')){
    report.externalRequests.push(url);return route.abort();
   }
   return route.continue();
  });
  previewPage.on('pageerror',error=>report.errors.push(error.stack));
  // A real developer runs serve.mjs once: the emitted URL includes
  // autostart=1 and must render actual SDK topics without a second click.
  const autoPage=await browser.newPage({viewport:{width:1000,height:800}});
  try{
    await autoPage.goto(new URL('?autostart=1',preview.url).href);
    await autoPage.locator('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"][data-ready="true"]')
      .waitFor({timeout:20000});
    report.autoStartTopics=await autoPage.locator('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"] .topic:visible').count();
    assert.ok(report.autoStartTopics>1);
    assert.equal(await autoPage.evaluate(()=>window.mindmapPreview.autostart),'REAL_XMIND_RENDERED');
    passed('R2.3 printed one-command URL automatically renders real XMind A');
    await autoPage.screenshot({path:join(out,'r23-one-command-xmind.png'),fullPage:true});
  }finally{await autoPage.close();}
  await previewPage.goto(preview.url);
  await previewPage.waitForFunction(()=>window.mindmapPreview?.sdk==='FIXED_RESOURCES_LOADED');
  const t=n=>previewPage.locator('[data-testid="conversation-turn-'+n+'"]');
  const btn=n=>t(n).locator('[data-opendesk-chatgpt-mindmap="button"] button');
  const viewer=n=>t(n).locator('[data-opendesk-chatgpt-mindmap="viewer"]');
  assert.equal(await btn(1).count(),1);
  assert.equal(await btn(2).count(),1);
  await btn(1).click();
  await viewer(1).and(previewPage.locator('[data-ready="true"]')).waitFor({timeout:15000});
  await btn(2).click();
  await viewer(2).and(previewPage.locator('[data-ready="true"]')).waitFor({timeout:15000});
  assert.ok(await viewer(1).locator('.topic:visible').count()>1);
  assert.ok(await viewer(2).locator('.topic:visible').count()>1);
  passed('R2.1 real standalone HTML opens A/B XMind from product code');
  await viewer(1).getByRole('button',{name:'放大导图',exact:true}).click();
  await viewer(1).getByRole('button',{name:'折叠所有分支',exact:true}).click();
  await viewer(1).getByRole('button',{name:'展开所有分支',exact:true}).waitFor({timeout:20000});
  assert.equal(await viewer(2).getByRole('button',{name:'折叠所有分支',exact:true}).getAttribute('aria-pressed'),'false');
  passed('R2.1 standalone A/B controllers and state are independent');
  // CDP page-scale is a real Chromium visual viewport zoom, NOT equivalent
  // to a user's Chrome-toolbar text/layout zoom. Preserve that distinction.
  const cdp=await previewPage.context().newCDPSession(previewPage);
  try{
    // Focus the actual Shadow DOM toolbar button before pinch-style scaling.
    // Playwright mouse hit-testing at visualViewport.scale=2 differs from a
    // Chrome toolbar zoom and can hit a different reply; do not force-click.
    const fitAtScale=viewer(2).getByRole('button',{name:'适配导图画布',exact:true});
    await fitAtScale.focus();
    assert.ok(await fitAtScale.evaluate(button=>button.getRootNode().activeElement===button));
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
    const scale=await previewPage.evaluate(()=>visualViewport.scale);
    assert.ok(Math.abs(scale-2)<0.05,`Expected Chromium 2x visual viewport scale, got ${scale}`);
    await previewPage.keyboard.press('Enter');
    await previewPage.waitForTimeout(250);
    assert.ok(await viewer(2).locator('.topic:visible').count()>1);
    report.chromiumPageScale={requested:2,observed:scale,kind:'CDP_VISUAL_VIEWPORT_PINCH_NOT_BROWSER_TOOLBAR_ZOOM',
      interaction:'NATIVE_KEYBOARD_ENTER_ON_FOCUSED_REAL_FIT_BUTTON',mouseHitTesting:'NOT_VERIFIED'};
    passed('R2.3 Chromium 200% CDP page scale supports real XMind keyboard Fit');
    await previewPage.screenshot({path:join(out,'r23-cdp-200-percent.png'),fullPage:false});
  }finally{
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await cdp.detach();
  }
  await btn(3).click();
  await viewer(3).and(previewPage.locator('[data-ready="true"]')).waitFor({timeout:15000});
  assert.ok(await viewer(3).locator('.topic:visible').count()>3);
  passed('R2.2 third answer renders real XMind from table/code/quote content');
  await viewer(3).getByRole('button',{name:'恢复本条回复原文',exact:true}).click();
  await viewer(3).waitFor({state:'detached'});
  await previewPage.getByRole('button',{name:'将 C 切换为大型导图'}).click();
  await previewPage.waitForTimeout(850);
  await btn(3).click();
  await viewer(3).and(previewPage.locator('[data-ready="true"]')).waitFor({timeout:20000});
  const largeTopicCount=await viewer(3).locator('.topic:visible').count();
  assert.ok(largeTopicCount>=90,`Expected at least 90 real visible XMind topics, got ${largeTopicCount}`);
  report.largeTopicCount=largeTopicCount;
  report.largeViewport=await viewer(3).evaluate(host=>{
    const shadow=host.shadowRoot,canvas=shadow.querySelector('.odmm-canvas');
    const topics=[...shadow.querySelectorAll('.topic')].map(n=>n.getBoundingClientRect())
      .filter(r=>r.width&&r.height);
    const r=canvas.getBoundingClientRect(),scroller=shadow.querySelector('.workbook-item');
    return {canvasWidth:r.width,canvasHeight:r.height,topicCount:topics.length,
      topicSpanX:Math.round(Math.max(...topics.map(x=>x.right))-Math.min(...topics.map(x=>x.left))),
      topicSpanY:Math.round(Math.max(...topics.map(x=>x.bottom))-Math.min(...topics.map(x=>x.top))),
      scrollerScrollWidth:scroller?.scrollWidth??null,scrollerClientWidth:scroller?.clientWidth??null,
      scrollerScrollLeft:scroller?.scrollLeft??null};
  });
  report.fontProbe=await viewer(3).evaluate(host=>({
    canvasFont:getComputedStyle(host.shadowRoot.querySelector('.odmm-canvas')).fontFamily,
    cjkFontAvailable:document.fonts.check('14px "Noto Sans CJK SC"','中文')
  }));
  passed('R2.2 large multi-layer tree uses real SDK without duplicate renderer');
  await previewPage.screenshot({path:join(out,'r22-local-html-wide.png'),fullPage:true});
  // A large map cannot display 97 readable labels in a 387px-high canvas at
  // once. Probe user navigation instead of falsely claiming no clipping.
  const canvasBox=await viewer(3).locator('.odmm-canvas').boundingBox();
  const landmark=()=>viewer(3).locator('.topic:visible').first().evaluate(element=>{
    const box=element.getBoundingClientRect();
    return {x:box.x,y:box.y};
  });
  const beforeDrag=await landmark();
  const x=canvasBox.x+canvasBox.width*.72,y=canvasBox.y+canvasBox.height*.72;
  await previewPage.mouse.move(x,y);
  await previewPage.mouse.down();
  await previewPage.mouse.move(x-105,y-70,{steps:12});
  await previewPage.mouse.up();
  await previewPage.waitForTimeout(250);
  const afterDrag=await landmark();
  const dragShift=Math.hypot(afterDrag.x-beforeDrag.x,afterDrag.y-beforeDrag.y);
  report.largeDrag={beforeDrag,afterDrag,shiftPx:Math.round(dragShift)};
  if(dragShift>=10)passed('R2.3 real SDK large canvas pans through user mouse drag');
  else report.cases.push({name:'Large canvas mouse drag moves visible topics',
    status:'NOT_VERIFIED',note:'Pointer gesture caused less than 10px movement; needs human trackpad and SDK DOM investigation'});
  const scrollBefore=await viewer(3).locator('.workbook-item').evaluate(el=>({
    top:el.scrollTop,left:el.scrollLeft
  }));
  await previewPage.mouse.move(x,y);
  await previewPage.mouse.wheel(0,340);
  await previewPage.waitForTimeout(300);
  const scrollAfter=await viewer(3).locator('.workbook-item').evaluate(el=>({
    top:el.scrollTop,left:el.scrollLeft
  }));
  report.largeWheel={before:scrollBefore,after:scrollAfter};
  if(Math.abs(scrollBefore.top-scrollAfter.top)+Math.abs(scrollBefore.left-scrollAfter.left)>=10)
    passed('R2.3 real SDK large canvas scrolls via user mouse wheel');
  else report.cases.push({name:'Large canvas mouse wheel changes scroll position',
    status:'NOT_VERIFIED',note:'No scroller delta; wheel may zoom rather than pan'});
  await previewPage.getByRole('button',{name:'切换 320px 容器'}).click();
  // The light-only preview animates max-width for 150ms. Assert the final
  // computed width after layout settles, not the pre-transition 880px frame.
  await previewPage.waitForFunction(()=>document.getElementById('preview-conversation')
    ?.getBoundingClientRect().width<=321,null,{timeout:4000});
  const narrowWidth=await previewPage.locator('#preview-conversation').evaluate(
    element=>element.getBoundingClientRect().width);
  assert.ok(narrowWidth<=321,`Expected 320px preview container, got ${narrowWidth}`);
  report.previewNarrowWidth=narrowWidth;
  passed('R2.2 standalone real XMind preview uses actual 320px narrow container');
  await previewPage.screenshot({path:join(out,'r21-local-html-xmind.png'),fullPage:true});
  await previewPage.getByRole('button',{name:'Stop 并检查残余样式'}).click();
  await previewPage.waitForFunction(()=>window.mindmapPreview?.sdk==='STOPPED');
  const diagnostic=await previewPage.evaluate(()=>window.mindmapPreview);
  report.preview={level:'LOCAL_HTML_REAL_SDK',diagnostic};
  assert.equal(diagnostic.styleIsolation,'BLOCKED_GLOBAL_STYLE_RESIDUE');
  assert.ok(diagnostic.globalSdkStyles.includes('snowbrush_style'));
  // Browser proof must report a real isolation blocker, not re-label it clean.
  assert.equal(diagnostic.remainingOwnNodes,0);
  assert.equal(await previewPage.locator('.markdown').count(),3);
  passed('R2.1 standalone Stop restores DOM and explicitly counts global style residue');
 }finally{await previewPage.close();await preview.close();}
 report.status=report.errors.length?'FAIL':'PASS';
 report.productRelease='BLOCKED';report.visualAcceptance='NOT_PASSED';report.reason='Vendor license provenance/resource admission/style isolation and logged-in ChatGPT installation not verified';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally{
 await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));
}

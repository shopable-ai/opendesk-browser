// Real upstream engine / local DOM fixture only; never a native installation or
// ChatGPT acceptance driver. No changes to Chrome extension permissions/CSP.
// Usage: node this-file --assets DIR --browser CHROMIUM --playwright MODULE --out DIR
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,join,extname,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
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
 await control(1,'展开或折叠分支').click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=conversation-turn-1] [data-opendesk-chatgpt-mindmap=viewer]').shadowRoot.querySelector('[aria-label="展开或折叠分支"]').textContent==='展开');
 const foldedCount=await viewer(1).locator('.topic:visible').count();report.actualFold={expandedCount,foldedCount};assert.ok(foldedCount<expandedCount);
 await control(1,'展开或折叠分支').click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=conversation-turn-1] [data-opendesk-chatgpt-mindmap=viewer]').shadowRoot.querySelector('[aria-label="展开或折叠分支"]').textContent==='折叠');
 assert.equal(await viewer(1).locator('.topic:visible').count(),expandedCount);
 report.actualFold={expandedCount,foldedCount};passed('Real Workbook branch flags collapse and expand rendered topics');
 await control(1,'切换全屏').click();await page.waitForFunction(()=>window.fixture.registry.activeFullscreen);await page.keyboard.press('Escape');
 await viewer(1).waitFor();passed('Fullscreen/Escape returns to A');
 await trigger(5).click();await ready(5);await trigger(6).click();await ready(6);
 const beforeFold=await viewer(5).locator('.topic').count();
 await control(5,'展开或折叠分支').click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=conversation-turn-5] [data-opendesk-chatgpt-mindmap=viewer]').shadowRoot.querySelector('[aria-label="展开或折叠分支"]').textContent==='展开');
 assert.equal(await control(5,'展开或折叠分支').getAttribute('aria-pressed'),'true');
 assert.equal(await control(6,'展开或折叠分支').textContent(),'折叠');
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
 report.status=report.errors.length?'FAIL':'PASS';
 report.productRelease='BLOCKED';report.visualAcceptance='NOT_PASSED';report.reason='Vendor license provenance/resource admission/style isolation and logged-in ChatGPT installation not verified';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally{
 await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));
}

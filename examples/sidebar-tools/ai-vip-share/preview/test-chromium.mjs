// Real offline Chromium acceptance. Reuses an installed Playwright; never downloads a browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const output=path.resolve(process.env.QA_OUTPUT||path.join(root,'artifacts/ai-vip-share/r58-local-acceptance/final'));
await mkdir(output,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE?require(process.env.PLAYWRIGHT_MODULE):require('playwright-core');
const executablePath=process.env.CHROME_FOR_TESTING_BIN||path.join(homedir(),'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
assert(existsSync(executablePath),'Point CHROME_FOR_TESTING_BIN to an existing test browser');
const inputs=['index.html','test-ui.mjs','test-r41.mjs','test-chromium.mjs'];
async function hashes(){return Object.fromEntries(await Promise.all(inputs.map(async f=>[f,createHash('sha256').update(await readFile(new URL(f,import.meta.url))).digest('hex')])))}
const sourceBefore=await hashes();
const report={started:new Date().toISOString(),gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,executablePath,sourceBefore,cases:[],errors:[],requests:[],dialogs:[],screenshots:[],layouts:[],contrast:[]};
const browser=await chromium.launch({headless:process.env.QA_HEADLESS==='1',executablePath,args:['--use-mock-keychain','--password-store=basic','--no-first-run','--disable-background-networking']});
report.browser=browser.version();
const context=await browser.newContext({viewport:{width:1100,height:1200}});
const page=await context.newPage();page.setDefaultTimeout(3500);
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
page.on('request',r=>report.requests.push(r.url()));
page.on('dialog',async d=>{report.dialogs.push(d.message());await d.dismiss()});
const url=new URL('./index.html',import.meta.url).href;
const $=id=>page.locator('#'+id);
const text=id=>$(id).textContent();
const scene=s=>$('scenario').selectOption(s);
async function type(code){await $('redeem-code').click();await $('redeem-code').press('Meta+A');await $('redeem-code').press('Backspace');if(code)await $('redeem-code').pressSequentially(code)}
async function precheck(code='DEMO-ACCESS-2026'){await type(code);await $('redeem-code').press('Enter');await $('redeem-review').waitFor({state:'visible'})}
async function settled(id,pattern){await page.waitForFunction(({id,pattern})=>new RegExp(pattern).test(document.getElementById(id).textContent),{id,pattern:pattern.source})}
async function screenshot(name){await page.locator('.shell').screenshot({path:path.join(output,name)});report.screenshots.push({name,width:await $('preview-width').inputValue(),theme:await $('preview-theme').inputValue(),scene:await $('scenario').inputValue()})}
async function run(name,fn){try{await page.goto(url);await fn();report.cases.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){report.cases.push({name,status:'FAIL',error:e.stack});console.log('FAIL '+name+': '+e.message);await page.screenshot({path:path.join(output,'failure-'+report.cases.length+'.png'),fullPage:true}).catch(()=>{})}}
await run('unique IDs, parsed scripts, offline load',async()=>{
 const ids=await page.locator('[id]').evaluateAll(els=>els.map(e=>e.id));assert.equal(ids.length,new Set(ids).size);assert.equal(await page.locator('script').count(),3);assert.match(await text('remaining'),/31/);
});
await run('keyboard tab order, visible focus, Enter review, cancel returns input',async()=>{
 await $('account-action').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'history');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'redeem-code');assert.equal(await $('redeem-code').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
 await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');await $('redeem-review').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.activeElement.id),'review-confirm');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'review-cancel');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'redeem-code');assert.equal(await page.locator('#history-list li').count(),0);
});
await run('reveal and clear never submit; error inputs never consume',async()=>{
 await type('DEMO-ACCESS-2026');await $('code-reveal').click();assert.equal(await $('redeem-code').getAttribute('type'),'text');assert.equal(await $('redeem-review').isVisible(),false);await $('code-clear').click();assert.equal(await $('redeem-code').inputValue(),'');assert.equal(await $('redeem-review').isVisible(),false);
 for(const [code,message] of [['',/格式/],['bad!',/格式/],['UNKNOWN-CODE',/未知兑换码/],['DEMO-USED-2026',/已被使用/],['DEMO-EXPIRED-2026',/已过期/],['DEMO-WRONG-ACCOUNT-2026',/不匹配/]]){await type(code);await $('redeem-code').press('Enter');assert.match(await text('redeem-feedback'),message);assert.equal(await page.locator('#history-list li').count(),0)}
});
await run('receipt once, no time invention or proxy auto-start, focus after submit',async()=>{
 await scene('existing');await precheck();assert.match(await text('review-product'),/20/);assert.match(await text('review-account'),/li\*\*\*@example.com/);assert.equal(await page.locator('#history-list li').count(),0);await screenshot('redeem-review.png');
 await $('review-confirm').press('Enter');await page.keyboard.press('Enter');await settled('redeem-feedback',/模拟回执/);assert.equal(await page.locator('#history-list li').count(),1);assert.equal(await text('remaining'),'31天');assert.match(await text('proxy-status'),/已停用/);assert.equal(await page.evaluate(()=>document.activeElement.id),'redeem-code');
 await $('history').focus();await page.keyboard.press('Enter');assert.equal(await $('history-panel').isVisible(),true);await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');assert.match(await text('redeem-feedback'),/不能重复/);assert.equal(await page.locator('#history-list li').count(),1);
});
await run('guest binding then explicit review; Provider unavailable rejects',async()=>{
 await scene('guest');await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');assert.match(await text('redeem-feedback'),/先绑定/);await $('account-action').click();await $('redeem-code').press('Enter');await $('redeem-review').waitFor({state:'visible'});await $('review-cancel').click();
 for(const s of ['blocked','provider-stop']){await scene(s);await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');assert.equal(await $('redeem-review').isVisible(),false);assert.match(await text('redeem-feedback'),/尚不能核验/)}
});
await run('timeout has no receipt and can manually retry',async()=>{
 await scene('service-timeout');await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');assert.equal(await $('redeem-button').getAttribute('aria-busy'),'true');await settled('redeem-feedback',/超时/);assert.equal(await $('redeem-button').isDisabled(),false);assert.equal(await page.locator('#history-list li').count(),0);
});
await run('edit during precheck invalidates late review without clearing input',async()=>{
 await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');await $('redeem-code').pressSequentially('-EDIT');await page.waitForTimeout(520);assert.equal(await $('redeem-review').isVisible(),false);assert.equal(await $('redeem-code').inputValue(),'DEMO-ACCESS-2026-EDIT');assert.equal(await page.locator('#history-list li').count(),0);
});
await run('scene switch cancels pending precheck and preserves typed intent',async()=>{
 await type('DEMO-ACCESS-2026');await $('redeem-code').press('Enter');await scene('quota');await page.waitForTimeout(520);assert.equal(await $('redeem-review').isVisible(),false);assert.equal(await $('redeem-code').inputValue(),'DEMO-ACCESS-2026');assert.equal(await text('remaining'),'12次');
});
await run('scene switch during submit locks transaction and discards late success',async()=>{
 await precheck();await $('review-confirm').click();await scene('quota');await page.waitForTimeout(550);assert.equal(await $('recovery-panel').isVisible(),true);assert.equal(await text('remaining'),'12次');assert.equal(await page.locator('#history-list li').count(),0);await scene('member');assert.equal(await $('redeem-button').isDisabled(),true);assert.equal(await text('remaining'),'31天');
});
await run('unknown receipt remains locked across install and scene changes',async()=>{
 await scene('submit-unknown');await precheck();await $('review-confirm').click();await $('recovery-panel').waitFor({state:'visible'});assert.equal(await text('remaining'),'31天');assert.equal(await page.evaluate(()=>document.activeElement.id),'recovery-check');await screenshot('redeem-unknown.png');await $('recovery-check').click();assert.match(await text('recovery-text'),/可信服务端终态/);await scene('link-host');await $('lab-install-confirm').click();await $('lab-install-confirm').click();assert.equal(await $('redeem-button').isDisabled(),true);assert.equal(await page.locator('#history-list li').count(),0);
});
await run('recovery scene selected from lab is locked',async()=>{await scene('recovery');assert.equal(await $('recovery-panel').isVisible(),true);assert.equal(await $('redeem-button').isDisabled(),true)});
await run('link: guide is not install; explicit two steps preserve unconsumed intent',async()=>{
 await scene('link-host');await screenshot('activation-link.png');await $('install-button').click();assert.equal(await $('redeem-button').isDisabled(),true);assert.match(await text('install-title'),/安装 OpenDesk/);await $('lab-install-confirm').click();assert.match(await text('install-title'),/添加 AI VIP/);assert.equal(await $('redeem-button').isDisabled(),true);await $('lab-install-confirm').click();assert.equal(await $('redeem-button').isDisabled(),false);assert.equal(await $('redeem-code').inputValue(),'DEMO-ACCESS-2026');assert.equal(await $('redeem-review').isVisible(),false);assert.equal(await page.locator('#history-list li').count(),0);await $('redeem-code').press('Enter');await $('redeem-review').waitFor({state:'visible'});assert.equal(await page.locator('#history-list li').count(),0);
});
await run('already installed links need explicit precheck and confirm',async()=>{
 for(const s of ['link-install','link-ready']){await scene(s);if(s==='link-install'){await $('install-button').click();assert.equal(await $('redeem-button').isDisabled(),true);await $('lab-install-confirm').click()}assert.equal(await $('redeem-review').isVisible(),false);await $('redeem-code').press('Enter');await $('redeem-review').waitFor({state:'visible'});await $('review-cancel').click();assert.equal(await page.locator('#history-list li').count(),0)}
});
await run('START then immediate STOP discards late START; no duplicate STOP',async()=>{
 await scene('existing');await $('proxy-toggle').click();assert.match(await text('proxy-status'),/正在启用/);assert.equal(await $('proxy-toggle').isDisabled(),false);await $('proxy-toggle').click();assert.equal(await $('proxy-toggle').isDisabled(),true);await settled('proxy-status',/本工具已停用/);await page.waitForTimeout(450);assert.match(await text('proxy-source'),/现有网络/);
});
await run('STOP failure retry never displays optimistic success',async()=>{
 await scene('stop-failed');await $('proxy-toggle').click();await settled('proxy-status',/停止未确认/);await screenshot('proxy-stop-failed.png');assert.equal(await text('proxy-toggle'),'重试停用');await $('proxy-toggle').click();await settled('proxy-status',/本工具已停用/);
});
await run('unknown and uncontrollable cannot fake release',async()=>{
 for(const s of ['unknown','locked']){await scene(s);await $('proxy-toggle').click();await settled('proxy-status',/停止未确认/);assert.equal(await text('proxy-toggle'),'重试停用')}
});
await run('STOP preserves external owners and works offline/expired',async()=>{
 for(const [s,source] of [['conflict',/其他 Chrome 扩展/],['other-tool',/另一工具/],['provider-stop',/现有网络/],['expired-stop',/现有网络/]]){await scene(s);await $('proxy-toggle').click();await page.waitForTimeout(450);assert.match(await text('proxy-source'),source);assert.equal(await text('proxy-toggle'),'启用代理');if(['conflict','other-tool','provider-stop','expired-stop'].includes(s))assert.equal(await $('proxy-toggle').isDisabled(),true)}
});
await run('proxy scene generation isolates late results; refresh never starts',async()=>{
 await scene('existing');await $('proxy-toggle').click();await scene('other-tool');await page.waitForTimeout(450);assert.match(await text('proxy-source'),/另一工具/);assert.equal(await $('proxy-toggle').isDisabled(),false);await $('proxy-toggle').click();await page.waitForTimeout(450);await $('proxy-refresh').click();assert.match(await text('proxy-source'),/另一工具/);assert.equal(await $('proxy-toggle').isDisabled(),true);
});
await run('external HTTPS new tab, no opener, no internal shop or state mutation',async()=>{
 assert.equal(await page.locator('a[href="https://example.com/"]').count(),1);assert.match(await $('shop').getAttribute('rel'),/noopener/);assert.match(await $('shop').getAttribute('rel'),/noreferrer/);assert.equal(await $('shop').getAttribute('target'),'_blank');assert.match(await $('shop').getAttribute('title'),/示例/);let before=await text('remaining');const pending=context.waitForEvent('page');await $('shop').click();const popup=await pending;await popup.waitForLoadState('domcontentloaded',{timeout:8000}).catch(()=>{});assert(popup.url().startsWith('https://example.com/')||popup.url().startsWith('chrome-error://'));assert.equal(await popup.evaluate(()=>window.opener===null),true);await popup.close();assert.equal(await text('remaining'),before);assert.equal(await $('redeem-review').isVisible(),false);
});
// Read-only geometry / contrast inspection. Long content is a visual stress fixture, never a business receipt.
async function inspect(){return page.locator('.shell').evaluate(shell=>{
 const r=shell.getBoundingClientRect();
 function luminance(c){const values=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return values[0]*.2126+values[1]*.7152+values[2]*.0722}
 function background(e){for(;e;e=e.parentElement){let c=getComputedStyle(e).backgroundColor;if(c!=='rgba(0, 0, 0, 0)')return c}return 'rgb(255, 255, 255)'}
 const visible=[...shell.querySelectorAll('*')].filter(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
 const over=visible.filter(e=>e.getBoundingClientRect().right>r.right+1||e.getBoundingClientRect().left<r.left-1||e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow==='visible').map(e=>e.id||e.className);
 const contrast=visible.filter(e=>!e.disabled&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>{let c=getComputedStyle(e),a=luminance(c.color),b=luminance(background(e)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);let large=parseFloat(c.fontSize)>=24||parseFloat(c.fontSize)>=18.66&&parseInt(c.fontWeight)>=700;return {id:e.id||e.className||e.tagName,ratio:+ratio.toFixed(2),minimum:large?3:4.5}});
 return {width:r.width,scroll:shell.scrollWidth,client:shell.clientWidth,over,contrast};
})}
await run('six actual widths/themes: screenshots, overflow, readable text',async()=>{
 for(const w of ['390','360','320'])for(const theme of ['light','dark']){await $('preview-width').selectOption(w);await $('preview-theme').selectOption(theme);let m=await inspect();report.layouts.push({w,theme,...m});assert.equal(m.width,Number(w));assert.equal(m.scroll,m.client);assert.deepEqual(m.over,[]);await screenshot('member-'+w+'-'+theme+'.png');report.contrast.push({w,theme,failures:m.contrast.filter(x=>x.ratio<x.minimum)});}
 assert.deepEqual(report.contrast.flatMap(x=>x.failures),[]);
});
await run('all scenario cards and review stay in bounds with long labels',async()=>{
 await $('preview-width').selectOption('320');
 for(const theme of ['light','dark']){await $('preview-theme').selectOption(theme);for(const s of ['quota','feature','guest','expired','blocked','link-host','link-install','link-ready','conflict','other-tool','locked','unknown','stop-failed','provider-stop','expired-stop','service-timeout','submit-unknown']){await scene(s);const m=await inspect();assert.deepEqual(m.over,[],theme+' '+s);const failures=m.contrast.filter(x=>x.ratio<x.minimum);report.contrast.push({w:'320',theme,scene:s,failures});} }
 assert.deepEqual(report.contrast.flatMap(x=>x.failures),[]);
 await scene('member');await precheck();assert.deepEqual((await inspect()).over,[]);
 await page.locator('#account-name').evaluate(e=>e.textContent='very-long-masked-account-***@example.com');await page.locator('#benefits-list li').first().evaluate(e=>e.textContent='超长权益标题用于检查排版安全边界与连续文本LongEntitlementWithoutSpaces0123456789');assert.deepEqual((await inspect()).over,[]);await screenshot('long-content-320-dark.png');
 await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('End');assert(await page.evaluate(()=>scrollY>0));
});
await run('no unexpected page errors, dialogs or remote resources',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.dialogs,[]);assert(report.requests.every(r=>r===url),'Preview must not initiate network requests')});
report.sourceAfter=await hashes();report.sourceStable=JSON.stringify(sourceBefore)===JSON.stringify(report.sourceAfter);report.finished=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
console.log(JSON.stringify({browser:report.browser,passed:report.passed,failed:report.failed,sourceStable:report.sourceStable,report:path.join(output,'report.json')}));
if(report.failed||!report.sourceStable)process.exitCode=1;

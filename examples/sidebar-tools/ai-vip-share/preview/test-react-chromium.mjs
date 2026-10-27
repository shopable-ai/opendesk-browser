#!/usr/bin/env node
// Source-bound standalone React UI in real Chromium; mock SDK only, no installed extension.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';

const root=resolve('examples/sidebar-tools/ai-vip-share/preview/dist');
const out=resolve(process.argv[2]||'artifacts/ai-vip-share-react/chromium');
await mkdir(out,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.includes('..')||/%2f|%5c/i.test(req.url))throw Error('unsafe asset');
    const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+'/'))throw Error('unsafe path');
    const data=await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'vip-react-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--hide-scrollbars','--user-data-dir='+profile,
  '--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,requestId=0;
const pending=new Map(),exceptions=[];
const result={evidence:'SOURCE_BOUND_REACT_CHROMIUM_MOCK_SDK',installed:false,
  nativeCookie:false,nativeProxy:false,provider:false,
  sourceCommit:process.env.GITHUB_SHA||null,checks:[],screenshots:[],exceptions};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++requestId;
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},12000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v)},
      fail(e){clearTimeout(timeout);fail(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chromium exited before CDP');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await wait(100);
  }
  assert(port,'CDP port missing');
  const page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json())
    .find(p=>p.type==='page');
  assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',e=>{
    const msg=JSON.parse(e.data);
    if(msg.method==='Runtime.exceptionThrown')
      exceptions.push(msg.params?.exceptionDetails?.exception?.description||'Uncaught runtime exception');
    const t=pending.get(msg.id);if(!t)return;
    pending.delete(msg.id);
    msg.error?t.fail(Error(msg.error.message)):t.ok(msg.result);
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
}
async function evaluate(code){
  const r=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function until(expression,label){
  for(let i=0;i<85;i++){
    if(await evaluate(expression))return;
    await wait(100);
  }
  throw Error('Timed out: '+label);
}
async function click(selector){
  const p=await evaluate('('+function(name){
    const el=document.querySelector(name);
    if(!el||el.disabled||el.hidden)throw Error('Unavailable '+name);
    el.scrollIntoView({block:'center'});
    const r=el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  }.toString()+')('+JSON.stringify(selector)+')');
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:p.x,y:p.y});
}
async function select(selector,value){
  await evaluate('('+function(name,v){
    const el=document.querySelector(name);if(!el)throw Error('Missing '+name);
    el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
}
async function capture(width,theme,name){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:1460,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
  await select('#preview-width',String(width));
  await wait(100);
  const size=await evaluate('('+function(){
    const el=document.querySelector('.frame');
    // Capture the product from its top, not from the current scroll left after STOP.
    el.scrollIntoView({block:'start'});
    const r=el.getBoundingClientRect();
    const content=el.querySelector('.ai-vip');
    return {x:r.x,y:r.y,w:r.width,h:r.height,
      noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1 &&
        (!content||content.scrollWidth<=content.clientWidth+1)};
  }.toString()+')()');
  assert(size.w>280&&size.w<=width+2,'bad source-bound frame width '+width);
  assert(size.noOverflow,'horizontal overflow '+width);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
    clip:{x:size.x,y:size.y,width:Math.ceil(size.w),height:Math.ceil(Math.min(size.h,1350)),scale:1}});
  const bytes=Buffer.from(screenshot.data,'base64');
  await writeFile(join(out,name+'.png'),bytes);
  result.screenshots.push({name,width,theme,sha256:createHash('sha256').update(bytes).digest('hex')});
  return size;
}
async function run(){
  await connect();
  // Every frame uses the installable App.jsx + real business controller.
  await cdp('Page.navigate',{url:url+'?scene=offline'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="服务未配置"','provider not configured');
  const isolated=await evaluate('('+function(){
    const app=document.querySelector('#tool-app'),studio=document.querySelector('#preview-controls');
    return {singleRoot:document.querySelectorAll('#tool-app .ai-vip').length===1,
      leaked:!!app?.querySelector('#ai-vip-local-connect,#ai-vip-shared-section,#ai-vip-shared-account,#ai-vip-features-title,h1'),
      hasProxy:app?.querySelectorAll('#ai-vip-proxy-toggle').length===1,
      outside:!!studio&&!app.contains(studio),studioClosed:studio?.open===false,
      inputDisabled:document.getElementById('ai-vip-redeem')?.disabled===true};
  }.toString()+')()');
  assert.deepEqual(isolated,{singleRoot:true,leaked:false,hasProxy:true,outside:true,
    studioClosed:true,inputDisabled:true});
  result.checks.push('no company-account UI or developer console in formal product');
  await capture(390,'light','react-offline-390-light');

  await cdp('Page.navigate',{url});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','member entitlement');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-shared-account,#ai-vip-shared-section").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-redeem-code").length'),1);
  assert.equal(await evaluate('document.querySelector("#ai-vip-product-name")?.textContent.includes("AI 会员")'),true);
  assert.equal(await evaluate('document.querySelector("#ai-vip-cookie-section")?.hidden'),true,
    'default membership must not add unapproved website-session workflow');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-benefits .ai-vip-list-item").length'),2,
    'primary membership hero must not repeat in benefit list');
  const labels=await evaluate('document.getElementById("tool-app").innerText');
  assert(!labels.includes('演示网站访问')&&!labels.includes('公司共享账号'),'fixture labels leaked into product');
  result.checks.push('product typography uses clean membership/website-access labels');
  await click('#preview-controls > summary');
  await select('#preview-proxy','enabled');
  await click('#ai-vip-proxy-refresh');
  await until('document.getElementById("ai-vip-proxy-toggle")?.dataset.action==="stop"','owned STOP');
  await click('#ai-vip-proxy-toggle');
  await until('document.getElementById("ai-vip-proxy-state")?.textContent==="已停止"','proxy STOP ack');
  result.checks.push('trusted STOP remains independent of membership and Cookie');
  for(const width of [320,360,390,400,440,520])
    await capture(width,'light','react-member-'+width+'-light');
  await capture(390,'dark','react-member-390-dark');

  await cdp('Page.navigate',{url:url+'?scene=session'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','approved session fixture');
  await until('document.getElementById("ai-vip-shared-receive")?.disabled===false','session refresh available');
  assert.equal(await evaluate('document.getElementById("ai-vip-cookie-section")?.hidden'),false);
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-shared-section,#ai-vip-shared-account").length'),0);
  await click('#ai-vip-shared-receive');
  await until('document.getElementById("ai-vip-cookie-install")?.disabled===false','explicit session receipt');
  await capture(390,'light','react-conditional-session-390-light');
  result.checks.push('website session is conditional and contains no company account manager');

  await cdp('Page.navigate',{url:url+'?scene=redeem'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="尚未开通"','ready for first redemption');
  await until('document.getElementById("ai-vip-redeem-code")?.disabled===false','redeem enabled');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-intro")?.hidden&&document.getElementById("ai-vip-redeem-fine")?.hidden'),true,
    'only one live instructional line belongs in the redeem card');
  const geometry=await evaluate('('+function(){
    const input=document.querySelector('#ai-vip-redeem-code').getBoundingClientRect();
    const reveal=document.querySelector('#ai-vip-code-reveal').getBoundingClientRect();
    const clear=document.querySelector('#ai-vip-code-clear').getBoundingClientRect();
    return {inline:reveal.left>=input.left&&reveal.right<=input.right&&
      clear.left>=input.left&&clear.right<=input.right,large:input.height>=42};
  }.toString()+')()');
  assert.equal(geometry.inline,true,'reveal and clear must be inside one input shell');
  assert.equal(geometry.large,true,'activation input requires a full touch target');
  const emptyRightGap=await evaluate('document.getElementById("ai-vip-redeem-code").getBoundingClientRect().right-document.getElementById("ai-vip-code-reveal").getBoundingClientRect().right');
  assert(emptyRightGap>=4&&emptyRightGap<=12,'empty input should not reserve space for hidden Clear action');
  await click('#preview-controls > summary');
  await click('#preview-fill-code');
  await until('document.getElementById("ai-vip-redeem")?.disabled===false','valid voucher preflight');
  const filledPositions=await evaluate('('+function(){
    const eye=document.getElementById('ai-vip-code-reveal').getBoundingClientRect();
    const clear=document.getElementById('ai-vip-code-clear').getBoundingClientRect();
    return {eyeToClear:clear.left-eye.right,clearVisible:!document.getElementById('ai-vip-code-clear').disabled};
  }.toString()+')()');
  assert(filledPositions.clearVisible&&filledPositions.eyeToClear>=0,
    'filled input must show non-overlapping Reveal and Clear');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").type'),'password');
  await click('#ai-vip-code-reveal');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").type'),'text');
  await click('#ai-vip-code-reveal');
  await click('#ai-vip-code-clear');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").value'),'');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem").disabled'),true);
  await click('#preview-fill-code');
  await capture(390,'light','react-redeem-input-390-light');
  await click('#ai-vip-redeem');
  await until('document.getElementById("ai-vip-redeem-preview")?.hidden===false','voucher preview visible');
  await capture(390,'light','react-redeem-confirm-390-light');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-confirm").disabled'),false);
  await click('#ai-vip-redeem-confirm');
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','redeemed member');
  await until('document.getElementById("ai-vip-cookie-install")?.disabled===false','conditional session delivery');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-shared-section").length'),0);
  await select('#preview-cookie','partial');
  await click('#ai-vip-cookie-install');
  await until('document.getElementById("ai-vip-cookie-status")?.textContent.includes("部分 Cookie")','partial write visible');
  const receiptCopy=await evaluate('document.getElementById("ai-vip-cookie-section")?.innerText');
  assert(receiptCopy.includes('请先允许此网站的 Cookie 访问'));
  assert(!receiptCopy.includes('E_SITE_GRANT_REQUIRED'),'no raw Host/SDK codes in product');
  result.checks.push('voucher review + explicit confirmation + partial Cookie write without replay');
  await capture(390,'light','react-cookie-partial-390-light');

  // The expiry / quota layouts are product cases, not developer-only cards.
  await cdp('Page.navigate',{url:url+'?scene=quota'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','quota member');
  await capture(390,'light','react-quota-390-light');
  await cdp('Page.navigate',{url:url+'?scene=expired'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="已到期"','expired member');
  await capture(390,'light','react-expired-390-light');
  await cdp('Page.navigate',{url:url+'?scene=error'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="无法核验"','provider error');
  await capture(390,'light','react-error-390-light');
  result.checks.push('quota, expiry and provider-error layouts use the same React view');
  assert.equal(exceptions.length,0,'runtime exceptions: '+exceptions.join(' | '));
  result.status='CHROMIUM_REACT_PREVIEW_PASS_NOT_INSTALLED';
  console.log('AI_VIP_REACT_PREVIEW_CHROMIUM_PASS '+result.checks.join(' / '));
}
try{await run();}catch(error){
  result.status='FAIL';result.error=String(error?.stack||error);
  console.error(result.error);process.exitCode=1;
}finally{
  await writeFile(join(out,'report.json'),JSON.stringify(result,null,2)+'\n');
  try{socket?.close();}catch{}
  try{chrome.kill('SIGTERM');}catch{}
  await new Promise(ok=>server.close(ok));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:120}).catch(()=>{});
}

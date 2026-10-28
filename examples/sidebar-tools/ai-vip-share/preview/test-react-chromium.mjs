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
    // Serve the approved, unchanged HTML baseline only to this test harness.
    if(url.pathname==='/design.html'){
      const baseline=await readFile(resolve('examples/sidebar-tools/ai-vip-share/preview/design.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(baseline);return;
    }
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
async function verifyPreviewReceipt(){
  const ready=JSON.parse(await readFile(join(root,'build-ready.json'),'utf8'));
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  assert(ready.sources?.['examples/sidebar-tools/ai-vip-share/src/App.jsx']);
  assert(ready.sources?.['examples/sidebar-tools/ai-vip-share/preview/vite.config.mjs']);
  for(const [base,entries] of [[resolve('.'),ready.sources],[root,ready.files]]){
    assert(entries&&Object.keys(entries).length);
    for(const [name,expected] of Object.entries(entries)){
      assert(!name.startsWith('/')&&!name.split('/').includes('..'),'receipt relative path');
      const bytes=await readFile(resolve(base,name));
      assert.equal(bytes.length,expected.bytes,'stale preview: '+name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,'stale preview: '+name);
    }
  }
  const {sources,files}=ready;
  assert.equal(ready.buildId,createHash('sha256').update(JSON.stringify({sources,files})).digest('hex'));
  result.previewBuild=ready;
}
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
  result.browser=await cdp('Browser.getVersion');
  result.executable=process.env.CHROME_BIN||'chromium';
  result.platform=process.platform;
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
  // Match both media-query viewport and product width; remove preview-only framing.
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:1460,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
  await select('#preview-width',String(width));
  // Linux CI reserves ~17 CSS px for a classic page scrollbar; macOS Side
  // Panels use overlay scrollbars. Hide the test-page scrollbar without
  // disabling scrolling or changing installable App/Shared UI geometry.
  await evaluate('document.documentElement.style.scrollbarWidth="none";'+
    'document.body.style.scrollbarWidth="none";'+
    'document.querySelector(".studio").style.padding="0";'+
    'document.querySelector(".frame").style.border="0";'+
    'document.documentElement.style.setProperty("--frame-width",'+JSON.stringify(width+'px')+')');
  await wait(100);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
  const size=await evaluate('('+function(){
    const el=document.querySelector('.frame');
    // Capture the product from its top, not from the current scroll left after STOP.
    el.scrollIntoView({block:'start'});
    const r=el.getBoundingClientRect();
    const content=el.querySelector('.ai-vip');
    const number=el.querySelector('#ai-vip-remaining').getBoundingClientRect();
    const unit=el.querySelector('#ai-vip-remaining-unit').getBoundingClientRect();
    return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,productWidth:content?.getBoundingClientRect().width,
      metricTogether:!number.width||!unit.width||
        (unit.left>=number.right-1&&unit.top>=number.top&&unit.bottom<=number.bottom+2),
      noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1 &&
        (!content||content.scrollWidth<=content.clientWidth+1)};
  }.toString()+')()');
  if(size.productWidth!==width)result.layoutFailure=await evaluate('('+function(){
    return Object.fromEntries(['html','body','.studio','.stage','.frame','#tool-root','.ai-vip'].map(selector=>{
      const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return [selector,{width:r.width,cssWidth:s.width,columns:s.gridTemplateColumns,zoom:s.zoom}];
    }));
  }.toString()+')()');
  assert.equal(size.productWidth,width,'source-bound product width must match requested width');
  assert.equal(size.w,width,'preview frame must not shrink the product viewport');
  assert(size.noOverflow,'horizontal overflow '+width);
  assert(size.metricTogether,'membership number and unit must stay together at '+width);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
    clip:{x:size.x,y:size.y,width:Math.ceil(size.w),height:Math.ceil(size.h),scale:1}});
  const bytes=Buffer.from(screenshot.data,'base64');
  await writeFile(join(out,name+'.png'),bytes);
  result.screenshots.push({name,width,actualProductWidth:size.productWidth,actualFrameWidth:size.w,
    theme,sha256:createHash('sha256').update(bytes).digest('hex')});
  return size;
}
async function appearance(){
  return evaluate('('+function(){
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
      return [...ctx.getImageData(0,0,1,1).data];};
    const luminance=c=>c.slice(0,3).map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;})
      .reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
    return Object.fromEntries(['.ai-vip-logo','.ai-vip-membership','.ai-vip-code-field>.od-field',
      '.ai-vip-shop-link','.ai-vip-desktop-cta','.ai-vip-proxy-toggle',
      '.ai-vip-review--warning','.ai-vip-error','.ai-vip-proxy-alert'].map(selector=>{
      const el=document.querySelector(selector),s=getComputedStyle(el),r=el.getBoundingClientRect();
      const ink=rgb(s.color);let bg=rgb(s.backgroundColor),parent=el.parentElement;
      while(bg[3]===0&&parent){bg=rgb(getComputedStyle(parent).backgroundColor);parent=parent.parentElement;}
      const a=luminance(ink),b=luminance(bg);
      return [selector,{color:s.color,background:s.backgroundColor,rgb:ink,backgroundRgb:bg,
        contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),font:s.fontSize,radius:s.borderRadius,
        width:r.width,height:r.height}];
    }));
  }.toString()+')()');
}
async function run(){
  await verifyPreviewReceipt();
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
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-shop-open").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-desktop-open").length'),1);
  assert.equal(await evaluate('document.getElementById("ai-vip-shop-section")?.hidden'),false);
  await click('#ai-vip-shop-open');
  assert.match(await evaluate('document.getElementById("ai-vip-shop-status").textContent'),/尚未配置或未通过审核/);
  await click('#ai-vip-desktop-open');
  assert.match(await evaluate('document.getElementById("ai-vip-desktop-status").textContent'),/尚未配置或未通过审核/);
  result.checks.push('two visible unconfigured external links, no false navigation or developer console');
  await capture(390,'light','react-offline-390-light');

  await cdp('Page.navigate',{url});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','member entitlement');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-shared-account,#ai-vip-shared-section").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-redeem-code").length'),1);
  assert.equal(await evaluate('document.querySelector("#ai-vip-product-name")?.textContent.includes("AI 会员")'),true);
  assert.equal(await evaluate('document.querySelector("#ai-vip-cookie-section")?.hidden'),true,
    'default membership must not add unapproved website-session workflow');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-benefits-section,#ai-vip-benefits").length'),0,
    'a second 我的权益 panel must not be mounted');
  const secondary=await evaluate('document.getElementById("ai-vip-secondary-metrics")?.textContent');
  assert.match(secondary,/可用额度：80 \/ 120 次/);
  assert.match(secondary,/AI 网站访问：有效/);
  assert(!secondary.includes('AI 会员体验权益'),'hero entitlement must not repeat');
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
  result.appearance={};
  for(const theme of ['light','dark']){
    for(const width of [320,360,390,400,440,520])
      await capture(width,theme,'react-member-'+width+'-'+theme);
    result.appearance[theme]=await appearance();
    for(const selector of ['.ai-vip-shop-link','.ai-vip-desktop-cta','.ai-vip-proxy-toggle'])
      assert(result.appearance[theme][selector].contrast>=4.5,theme+' text contrast '+selector);
    for(const selector of ['.ai-vip-review--warning','.ai-vip-error','.ai-vip-proxy-alert'])
      assert.notEqual(result.appearance[theme][selector].background,'rgba(0, 0, 0, 0)',
        'warning must have a valid semantic background: '+selector);
  }
  await cdp('DOM.enable');await cdp('CSS.enable');
  const doc=await cdp('DOM.getDocument');
  const heading=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.ai-vip-redeem h2'});
  result.chineseFonts=(await cdp('CSS.getPlatformFontsForNode',{nodeId:heading.nodeId})).fonts;
  assert(result.chineseFonts.some(font=>font.glyphCount>0&&/PingFang|Noto|Heiti|CJK|Song|YaHei|WenQuanYi/i.test(font.familyName)),
    'Chinese screenshots require an actual CJK font, not missing-glyph boxes');
  // 200% browser-like CSS zoom at a 320px logical Side Panel: no horizontal clipping.
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await cdp('Emulation.setDeviceMetricsOverride',{width:640,height:1600,deviceScaleFactor:1,mobile:false});
  await select('#preview-width','320');
  await evaluate('document.body.style.zoom="2"');
  await wait(80);
  const zoomState=await evaluate('('+function(){
    const width=document.documentElement.clientWidth;
    const app=document.querySelector('.ai-vip');
    const frame=document.querySelector('.frame');
    return {viewport:width,frame:frame.getBoundingClientRect().width,
      content:app.getBoundingClientRect().width,
      noOverflow:document.documentElement.scrollWidth<=width+1&&app.scrollWidth<=app.clientWidth+1};
  }.toString()+')()');
  assert.equal(zoomState.viewport,640);
  assert(zoomState.frame<=640&&zoomState.frame>=630,'zoomed sidebar should fill the viewport');
  assert(zoomState.noOverflow,'200% zoom overflow or clipped content');
  const zoomShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(join(out,'react-member-320-zoom200-light.png'),Buffer.from(zoomShot.data,'base64'));
  result.screenshots.push({name:'react-member-320-zoom200-light',zoom:'200%',logicalWidth:320,
    theme:'light',noOverflow:zoomState.noOverflow});
  await evaluate('document.body.style.zoom=""');
  result.checks.push('320px logical width at 200% zoom without horizontal overflow');

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
    const clear=document.querySelector('#ai-vip-code-clear').getBoundingClientRect();
    return {inline:clear.left>=input.left&&clear.right<=input.right,
      large:input.height>=36,clearSize:clear.width>=28,
      noReveal:document.querySelectorAll('#ai-vip-code-reveal').length===0,
      plain:document.getElementById('ai-vip-redeem-code').type==='text'};
  }.toString()+')()');
  assert.deepEqual(geometry,{inline:true,large:true,clearSize:true,noReveal:true,plain:true},
    'approved text input uses just one embedded Clear control');
  await click('#preview-controls > summary');
  await click('#ai-vip-redeem-code');
  await cdp('Input.insertText',{text:'DEMO-VIP-01'});
  await until('document.getElementById("ai-vip-redeem")?.disabled===false','valid voucher preflight');
  assert.equal(await evaluate('document.getElementById("ai-vip-code-clear").disabled'),false);
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").type'),'text');
  await click('#ai-vip-code-clear');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").value'),'');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem").disabled'),true);
  await click('#ai-vip-redeem-code');
  await cdp('Input.insertText',{text:'DEMO-VIP-01'});
  await click('#ai-vip-redeem');
  await until('document.getElementById("ai-vip-redeem-preview")?.hidden===false','cancel preview');
  await click('#ai-vip-redeem-cancel');
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-preview").hidden'),true);
  assert.equal(await evaluate('document.activeElement?.id'),'ai-vip-redeem-code');
  await cdp('Input.insertText',{text:'DEMO-VIP-01'});
  await click('#ai-vip-redeem');
  await until('document.getElementById("ai-vip-redeem-preview")?.hidden===false','Escape preview');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem-preview").hidden'),true);
  assert.equal(await evaluate('document.activeElement?.id'),'ai-vip-redeem-code');
  result.checks.push('trusted keyboard text input, embedded Clear, Cancel and Escape return focus without confirmation');
  await cdp('Input.insertText',{text:'DEMO-VIP-01'});
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
  result.checks.push('voucher review + explicit confirmation + partial Cookie receipt visible; replay safety is verified separately by Node tests');
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
  // Reuse the same source-bound view for the remaining approved state/width
  // matrix. These are fixture outcomes, never Native or commercial receipts.
  for(const scene of ['member','guest','expired','error','offline','cookie-unknown','proxy-conflict','stop-pending']){
    await cdp('Page.navigate',{url:url+'?scene='+(['cookie-unknown'].includes(scene)?'session':'member')});
    if(['guest','expired','error','offline'].includes(scene))
      await cdp('Page.navigate',{url:url+'?scene='+scene});
    await until('Boolean(document.getElementById("ai-vip-member-state"))&&document.getElementById("ai-vip-member-state").textContent!=="待核验"','scene '+scene);
    if(['cookie-unknown','proxy-conflict','stop-pending'].includes(scene)){
      await click('#preview-controls > summary');
      if(scene==='cookie-unknown'){
        await click('#ai-vip-shared-receive');
        await until('document.getElementById("ai-vip-cookie-install")?.disabled===false','unknown delivery');
        await select('#preview-cookie','unknown');await click('#ai-vip-cookie-install');
        await until('document.getElementById("ai-vip-cookie-status")?.textContent.includes("未知")','unknown Cookie receipt');
        assert.equal(await evaluate('document.getElementById("ai-vip-cookie-install").disabled'),true);
      }else{
        await select('#preview-proxy',scene==='proxy-conflict'?'conflict':'pending');
        await click('#ai-vip-proxy-refresh');
        if(scene==='stop-pending'){
          await until('document.getElementById("ai-vip-proxy-toggle")?.dataset.action==="stop"','pending STOP action');
          await click('#ai-vip-proxy-toggle');
          await until('document.getElementById("ai-vip-proxy-toggle")?.disabled===true','STOP request pending');
          assert.notEqual(await evaluate('document.getElementById("ai-vip-proxy-state").textContent'),'已停止');
        }else await until('document.getElementById("ai-vip-proxy-state")?.textContent.includes("冲突")','proxy conflict');
      }
    }
    for(const theme of ['light','dark'])for(const width of [320,360,390,400,440,520])
      await capture(width,theme,'matrix-'+scene+'-'+width+'-'+theme);
  }
  result.checks.push('eight states × six widths × two themes; unknown Cookie stays locked and pending STOP never reports success');
  // R2.9: all twelve states use the installed app's real React root.
  const scenesR29=[['first','未登录'],['empty','尚未开通'],['unconfigured','服务未配置'],
    ['error','无法核验'],['member','权益有效'],['expired','已到期'],
    ['link','尚未开通'],['permission','权益有效'],['proxy-on','权益有效'],
    ['conflict','权益有效'],['stop-pending','权益有效'],['session','权益有效']];
  for(const [scene,badge] of scenesR29){
    await cdp('Page.navigate',{url:url+'?scene='+scene});
    await until('document.getElementById("ai-vip-member-state")?.textContent==='+JSON.stringify(badge),'R2.9 '+scene);
    assert.equal(await evaluate('document.querySelectorAll("#tool-app .ai-vip").length'),1);
    if(['first','empty','unconfigured','error'].includes(scene))
      assert.equal(await evaluate('document.getElementById("ai-vip-member-facts").hidden'),true);
    if(scene==='link'){
      await until('document.getElementById("ai-vip-activation-hint")?.hidden===false','link awaits consent');
      assert.equal(await evaluate('document.getElementById("ai-vip-redeem-code").value'),'DEMO-VIP-01');
      assert.equal(await evaluate('document.getElementById("ai-vip-redeem-preview").hidden'),true);
    }
    if(scene==='permission')
      await until('document.getElementById("ai-vip-proxy-state")?.textContent==="未授权"','native permission missing');
    if(scene==='conflict')
      await until('document.getElementById("ai-vip-proxy-state")?.textContent==="控制权冲突"','proxy owner conflict');
    if(scene==='stop-pending')
      await until('document.getElementById("ai-vip-proxy-state")?.textContent==="停用待确认"','STOP not acknowledged');
    if(scene==='session'){
      await until('document.getElementById("ai-vip-cookie-section")?.hidden===false','authorized session');
      assert.equal(await evaluate('document.getElementById("ai-vip-cookie-install").disabled'),true);
    }
    for(const theme of ['light','dark'])for(const width of [320,360,390,400,440,520])
      await capture(width,theme,'r29-'+scene+'-'+width+'-'+theme);
  }
  await cdp('Page.navigate',{url:url+'?scene=member'});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','before transient failure');
  await click('#preview-controls > summary');
  await click('#preview-member-failure');
  await click('#ai-vip-refresh');
  await until('document.getElementById("ai-vip-member-state")?.textContent==="查询失败"','stale member display');
  assert.equal(await evaluate('document.getElementById("ai-vip-member-facts").hidden'),false);
  assert.equal(await evaluate('document.getElementById("ai-vip-history-details").hidden'),false);
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem").disabled'),true);
  assert.equal(await evaluate('document.getElementById("ai-vip-proxy-toggle").hidden'),true);
  result.checks.push('12 React scenes x 6 widths x 2 themes; stale validated data read-only');
  // Capture the real HTML visual baseline for side-by-side human review;
  // no fabricated pixel-parity score and no mock replacement of React.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:1460,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:url+'design.html'});
  await until('document.querySelector(".shell .membership")','approved design HTML');
  await wait(100);
  const baselineRect=await evaluate('('+function(){
    const shell=document.querySelector('.shell').getBoundingClientRect();
    const brand=document.querySelector('.brand h2');
    return {x:shell.x+scrollX,y:shell.y+scrollY,width:shell.width,height:shell.height,
      brandFont:getComputedStyle(brand).fontSize,memberRadius:getComputedStyle(document.querySelector('.membership')).borderRadius};
  }.toString()+')()');
  const baselineShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
    clip:{x:baselineRect.x,y:baselineRect.y,width:Math.ceil(baselineRect.width),
      height:Math.ceil(Math.min(baselineRect.height,1350)),scale:1}});
  const baselineBytes=Buffer.from(baselineShot.data,'base64');
  await writeFile(join(out,'reference-design-member-390-light.png'),baselineBytes);
  result.screenshots.push({name:'reference-design-member-390-light',referenceOnly:true,
    width:baselineRect.width,sha256:createHash('sha256').update(baselineBytes).digest('hex')});
  result.reference={source:'preview/design.html',role:'human_visual_AB_reference',
    ...baselineRect,automatedPixelParity:'NOT_TESTED'};
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

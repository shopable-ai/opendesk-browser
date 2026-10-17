// Real Chromium acceptance of the two committed OFFLINE preview HTML files.
// These scenarios cannot certify the installed extension or a user's Mac profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
const binary=[process.env.CHROME_BIN,'google-chrome-stable','google-chrome','chromium']
 .filter(Boolean).find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
async function connect(url){
 const socket=new WebSocket(url),waiting=new Map();let counter=0,listener=()=>{};
 await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 socket.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id){listener(msg);return;}
  const row=waiting.get(msg.id);if(!row)return;
  waiting.delete(msg.id);clearTimeout(row.timer);
  msg.error?row.reject(Error(msg.error.message)):row.resolve(msg.result);
 };
 return {onEvent(fn){listener=fn;},
  send(method,params={},timeout=12000,sessionId=null){return new Promise((resolve,reject)=>{
   const id=++counter,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
   waiting.set(id,{resolve,reject,timer});
   socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},
  close(){socket.close();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error('CLOSED'));}waiting.clear();}
 };
}
async function evaluate(target,expression){
 const row=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,
  ...(target.contextId?{contextId:target.contextId}:{})});
 if(row.exceptionDetails)throw Error('BROWSER_EVAL '+JSON.stringify(row.exceptionDetails).slice(0,700));
 return row.result.value;
}
async function until(probe,label,count=65){
 let error;
 for(let i=0;i<count;i++){try{const result=await probe();if(result)return result;}catch(e){error=e;}await pause(120);}
 throw Error(label+(error?' / '+error.message:''));
}
async function select(page,id,value){
 const expression="(()=>{const n=document.getElementById("+JSON.stringify(id)+");"+
 "if(!n)throw Error('Missing preview control');n.value="+JSON.stringify(value)+";"+
 "n.dispatchEvent(new Event('change',{bubbles:true}));return true;})()";
 return evaluate(page,expression);
}
async function child(browser,page){
 // A sandboxed srcdoc is typically an OOPIF. Fallback handles same-process
 // execution contexts without relaxing sandbox="allow-scripts".
 for(let i=0;i<8;i++){
  const targets=(await browser.send('Target.getTargets')).targetInfos;
  const found=targets.find(row=>row.type==='iframe'&&row.url?.startsWith('about:srcdoc'));
  if(found){
   const session=(await browser.send('Target.attachToTarget',{targetId:found.targetId,flatten:true})).sessionId;
   const client={send:(name,args={},timeout=12000)=>browser.send(name,args,timeout,session)};
   await client.send('Runtime.enable');
   if(await evaluate(client,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))').catch(()=>false))return client;
  }
  await pause(130);
 }
 const contexts=[];
 page.onEvent(event=>{if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);});
 await page.send('Runtime.disable');await page.send('Runtime.enable');
 const root=(await page.send('Page.getFrameTree')).frameTree.frame.id;
 const context=await until(()=>contexts.find(x=>x.auxData?.frameId!==root&&x.auxData?.isDefault), 'No real sandboxed iframe JS context',20);
 const inFrame={send:page.send,contextId:context.id};
 assert(await evaluate(inFrame,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))'));
 return inFrame;
}
// A closed Shadow Root cannot be inspected with document.querySelector.
// Use Chromium's native DOM domain, then dispatch a physical mouse click in
// the outer page (rather than JS .click() or a synthetic DOM event).
async function tocClosedShadow(target){
 await target.send('DOM.enable');
 const doc=(await target.send('DOM.getDocument',{depth:1,pierce:true})).root;
 const host=(await target.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'[data-opendesk-toc-root]'})).nodeId;
 assert(host,'trusted TOC host is absent from the iframe DOM');
 const node=(await target.send('DOM.describeNode',{nodeId:host,pierce:true})).node;
 assert.equal(node.shadowRoots?.[0]?.shadowRootType,'closed','must inspect the production closed shadow root');
 return node.shadowRoots[0].nodeId;
}
async function tocNode(target,shadow,selector){
 const {nodeId}=await target.send('DOM.querySelector',{nodeId:shadow,selector});
 assert(nodeId,'missing production shadow control: '+selector);
 return nodeId;
}
async function tocMouseClick(page,target,shadow,selector,iframeRect){
 const id=await tocNode(target,shadow,selector);
 const box=(await target.send('DOM.getBoxModel',{nodeId:id})).model.content;
 const x=iframeRect.left+(box[0]+box[4])/2,y=iframeRect.top+(box[1]+box[5])/2;
 const hit=await evaluate(page,'(()=>{const frame=document.getElementById("opendesk-preview-frame");return document.elementFromPoint('+x+','+y+')===frame})()');
 assert(hit,'shadow button is obscured in outer screenshot viewport: '+selector);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});
}
test('R1.4 real Chrome opens saved file:// bilingual previews and exercises inner UI',{timeout:120000},async t=>{
 assert(binary,'Chrome for Testing is required: no mock PREVIEW_PASS');
 const profile=await mkdtemp(join(tmpdir(),'toc-r14-chrome-'));
 const chrome=spawn(binary,['--headless=new','--window-size=1280,900','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-proxy-server','--no-first-run',
  '--disable-background-networking','--site-per-process','--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 let browser,log='';const pages=[];
 chrome.stderr.on('data',chunk=>{log=(log+chunk).slice(-2700);});
 t.after(async()=>{
  for(const page of pages)page.close();browser?.close();
  if(chrome.exitCode===null&&chrome.signalCode===null){
   const done=new Promise(resolve=>{const alarm=setTimeout(()=>chrome.kill('SIGKILL'),2700);
    chrome.once('close',()=>{clearTimeout(alarm);resolve();});});
   chrome.kill('SIGTERM');await done;
  }
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 });
 const port=await until(async()=>{try{return +(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return 0;}},
  'Chrome binary could not start: '+log,110);
 const base='http://127.0.0.1:'+port,version=await(await fetch(base+'/json/version')).json();
 browser=await connect(version.webSocketDebuggerUrl);
 async function open(name){
  const input=resolve('examples/sidebar-tools/reading-toc/preview',name);
  const contents=await readFile(input,'utf8');assert(contents.includes('opendesk-preview-manifest'));
  const targetId=(await browser.send('Target.createTarget',{url:pathToFileURL(input).href})).targetId;
  const url=await until(async()=>{const data=await(await fetch(base+'/json/list')).json();
   return data.find(row=>row.id===targetId)?.webSocketDebuggerUrl;},'Missing target for '+name);
  const page=await connect(url);pages.push(page);
  await page.send('Runtime.enable');await page.send('Page.enable');
  await until(()=>evaluate(page,'Boolean(document.querySelector("#od-toc-language"))'), 'Preview shell did not render '+name);
  assert.equal(await evaluate(page,'location.protocol'),'file:');
  await until(()=>evaluate(page,'Boolean(document.querySelector("#opendesk-preview-frame")?.srcdoc)'),'Preview iframe missing');
  return {page,targetId};
 }
 async function screenshot(page,file){
  await mkdir(resolve('artifacts/reading-toc-r41'),{recursive:true});
  const result=await page.send('Page.captureScreenshot',{format:'png'});
  const bytes=Buffer.from(result.data,'base64');
  await writeFile(resolve('artifacts/reading-toc-r41',file),bytes);
  return createHash('sha256').update(bytes).digest('hex');
 }
 const side=await open('reading-toc-r12-interactive-preview.html'),panel=await child(browser,side.page);
 await until(()=>evaluate(panel,'document.querySelectorAll("#toc-list button").length>0'),'Compiled TOC did not start in real sandbox');
 const gutters=await evaluate(panel, '(()=>{const rect=document.querySelector(".toc-panel").getBoundingClientRect();return {left:rect.left,right:document.documentElement.clientWidth-rect.right};})()');
 assert(gutters.left>=7&&gutters.right>=7,
  'CONTENTS card has visible symmetric left/right outer gutters: '+JSON.stringify(gutters));
 assert.equal(await evaluate(panel,'document.querySelector("#toc-source")?.hidden'),true,
  'the sidebar hides the extra multi-source dropdown');
 await evaluate(panel,"document.querySelector('[data-toc-mode=top]').click()");
 await until(()=>evaluate(panel,'document.querySelectorAll("#toc-list button").length===9 && document.querySelector("#toc-overview-more")?.hidden===true'),
  'the short overview must directly display all nine headings without a more button');
 await evaluate(panel,"document.querySelector('[data-toc-mode=focus]').click()");
 await select(side.page,'od-toc-language','en');
 await until(()=>evaluate(panel,'document.querySelector(".toc-title")?.textContent==="CONTENTS" && document.querySelector(".toc-panel")?.getAttribute("aria-label")==="Reading table of contents"'),'English accessible label and fixed CONTENTS heading failed');
 await evaluate(panel,"(()=>{const s=document.querySelector('#toc-source');s.value='s-2';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
 const labels=await until(async()=>{const rows=await evaluate(panel,
  '[...document.querySelectorAll("#toc-list button")].map(n=>({id:n.dataset.id,label:n.textContent.trim()}))');
  return rows.length===4?rows:null;},'Two-H1 answer did not show both duplicate H2');
 assert.equal(labels.filter(row=>row.label==='重复标题').length,2);
 assert.equal(new Set(labels.map(row=>row.id)).size,4);
 await evaluate(panel,"document.querySelector('[data-toc-mode=full]').click()");
 await select(side.page,'od-toc-language','zh-CN');
 await until(()=>evaluate(panel,'document.querySelector(".toc-title")?.textContent==="CONTENTS" && document.querySelector(".toc-panel")?.getAttribute("aria-label")==="阅读目录"'),'Chinese accessible label restore failed without changing the approved CONTENTS visual');
 assert.equal(await evaluate(panel,'document.querySelector("#toc-source").value'),'s-2');
 assert.equal(await evaluate(panel,'document.querySelector("[data-toc-mode=full]").getAttribute("aria-pressed")'),'true');
 // R1.8.3: exercise actual packaged UI, not CSS-only snapshot matching.
 await select(side.page,'od-toc-scenario','chatgpt-multi');
 const grouped=await until(async()=>{
  const result=await evaluate(panel,
   '({rows:[...document.querySelectorAll("#toc-list button")].map(b=>({id:b.dataset.id,label:b.textContent.trim()})),starts:[...document.querySelectorAll("#toc-list li.toc-answer-start button")].map(b=>b.dataset.id)})');
  return result.rows.length===8?result:null;
 },'R1.8.3 full mode must show eight titles from three assistant turns');
 assert.deepEqual(grouped.starts,['h-24','h-26'],
  'two 1px separators occur only at real assistant turn boundaries');
 assert.equal(grouped.rows.filter(row=>row.label==='出行路线').length,2);
 assert.equal(new Set(grouped.rows.map(row=>row.id)).size,8);
 await evaluate(panel,'document.querySelector("#toc-list button[data-id=h-25]").click()');
 await until(()=>evaluate(side.page,
  'document.querySelector("#od-toc-feedback")?.textContent.includes("出行路线")'),
  'clicking the second assistant answer must navigate its own title');
 await screenshot(side.page,'toc-r183-multi-preview-panel.png');
 await select(side.page,'od-toc-scenario','success');
 await until(()=>evaluate(panel,'document.querySelectorAll("#toc-list li.toc-answer-start").length===0'),
  'ordinary article must not retain assistant separators');
 await screenshot(side.page,'toc-r14-preview-panel.png');
 await select(side.page,'od-toc-scenario','error');
 await until(()=>evaluate(panel,'document.querySelector("#toc-error")?.dataset.state==="error"'),'Failure state did not activate');
 await select(side.page,'od-toc-scenario','success');
 await until(()=>evaluate(panel,'document.querySelector("#toc-error")?.hidden===true'),'Failure did not recover');
 await browser.send('Target.closeTarget',{targetId:side.targetId});
 console.log('TOC_PREVIEW_STAGE: real Chromium panel locale, source, mode, duplicates, recovery passed');
 const overlay=await open('reading-toc-r12-overlay-preview.html'),trusted=await child(browser,overlay.page);
 await until(()=>evaluate(trusted,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'Trusted overlay failed to mount');
 const original=await evaluate(trusted,'document.querySelector("article h1").textContent');
 // Check the closed-shadow production view at first mount, before clicking overview.
 const nineLabels=['OpenDesk Browser 阅读指南','产品目标','安装与开始使用','常用操作',
  '快速打开工具','按需刷新目录','多语言界面','数据安全','扩展权限说明'];
 await until(async()=>{
  const tree=await trusted.send('Accessibility.getFullAXTree');
  const names=new Set(tree.nodes.filter(node=>node.role?.value==='button')
   .map(node=>node.name?.value));
  return nineLabels.every(label=>names.has(label));
 },'Initial production overlay must expose all nine real headings without another mode click');
 await select(overlay.page,'od-toc-language','en');
 await until(async()=>{const tree=await trusted.send('Accessibility.getFullAXTree');
  return tree.nodes.some(node=>node.name?.value==='On-page table of contents');},
  'Closed-shadow overlay did not present translated English accessible label');

 const axe=await trusted.send('Accessibility.getFullAXTree');
 assert(axe.nodes.some(node=>node.name?.value==='CONTENTS'),
  'webpage overlay preserves the CONTENTS heading after locale switch');
 const modeNames=['Chapter overview (automatically includes subheadings)','Current section','Full contents','AI outline'];
 const buttonNames=axe.nodes.filter(node=>node.role?.value==='button').map(node=>node.name?.value);
 for(const name of modeNames)assert(buttonNames.includes(name),
  'injected webpage TOC must expose all four real mode icons: '+name);
 assert(!buttonNames.some(name=>/more sections|还有 \\d+ 个章节|see full contents/i.test(String(name))),
  'webpage TOC must not reintroduce the redundant see-all button');
 assert.equal(await evaluate(trusted,'document.querySelector("article h1").textContent'),original);
 // The overlay test frame contains three real assistant Markdown turn wrappers.
 await select(overlay.page,'od-toc-scenario','chatgpt-multi');
 const turns=await until(async()=>{
  const values=await evaluate(trusted,
   'document.getElementById("preview-chat")?.hidden===false?[...document.querySelectorAll("#preview-chat [data-message-author-role=assistant]")].map(turn=>turn.querySelectorAll("h1,h2,h3,h4,h5,h6").length):null');
  return values?.length===3?values:null;
 },'trusted overlay preview must render all three independent Markdown answer fixtures');
 assert.deepEqual(turns,[4,2,2],
  'two H1 in the first answer never mean two assistant sources');
 // P0: the *actual* trusted floating card must be visible, unobstructed,
 // and interactive on the three-answer scenario, not merely mounted/AX-listed.
 const visible=await until(()=>evaluate(trusted,`(()=>{
  const host=document.querySelector('[data-opendesk-toc-root]');
  if(!host)return null;
  const style=getComputedStyle(host),r=host.getBoundingClientRect();
  const x=r.left+r.width/2,y=r.top+Math.min(45,r.height/2);
  return !host.hidden&&style.display!=='none'&&style.visibility==='visible'&&
   Number(style.opacity)>0&&r.width>=180&&r.height>=60&&r.left>=0&&r.top>=0&&
   r.right<=innerWidth&&r.bottom<=innerHeight&&document.elementFromPoint(x,y)===host
   ?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
     opacity:style.opacity}:null;
 })()`),'Production overlay is mounted but hidden, offscreen, zero-sized or occluded');
 const frameRect=await evaluate(overlay.page,`(()=>{
  const frame=document.getElementById('opendesk-preview-frame'),r=frame.getBoundingClientRect();
  return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,
   width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};
 })()`);
 assert(frameRect.left+visible.left>=0&&frameRect.top+visible.top>=0&&
  frameRect.left+visible.right<=frameRect.viewportWidth&&
  frameRect.top+visible.bottom<=frameRect.viewportHeight,
  'Floating card is clipped out of the outer screenshot viewport: '+JSON.stringify({frameRect,visible}));
 let shadow=await tocClosedShadow(trusted);
 await tocMouseClick(overlay.page,trusted,shadow,'button[data-mode="full"]',frameRect);
 const expanded=await until(async()=>{
  shadow=await tocClosedShadow(trusted);
  const full=await tocNode(trusted,shadow,'button[data-mode="full"]');
  const attrs=(await trusted.send('DOM.getAttributes',{nodeId:full})).attributes;
  if(attrs[attrs.indexOf('aria-pressed')+1]!=='true')return null;
  const rows=(await trusted.send('DOM.querySelectorAll',{nodeId:shadow,selector:'.list button.link'})).nodeIds;
  const starts=(await trusted.send('DOM.querySelectorAll',{nodeId:shadow,selector:'.list li.answer-start'})).nodeIds;
  return rows.length===8&&starts.length===2?{rows:rows.length,separators:starts.length}:null;
 },'Full contents did not physically expand to eight titles and two answer separators');
 const list=await tocNode(trusted,shadow,'.list');
 const markup=(await trusted.send('DOM.getOuterHTML',{nodeId:list})).outerHTML;
 for(const label of ['周末城市公园活动计划','行程时间安排','交通与预算','雨天备选'])
  assert(markup.includes(label),'missing answer title inside closed shadow DOM: '+label);
 assert.equal((markup.match(/data-id="h-25"/g)||[]).length,1,'second answer duplicate heading lost');
 const imageHash=await screenshot(overlay.page,'toc-r186-three-answers-visible.png');
 await tocMouseClick(overlay.page,trusted,shadow,'button[data-id="h-25"]',frameRect);
 await until(()=>evaluate(overlay.page,
  'document.getElementById("od-toc-feedback")?.textContent.includes("模拟章节定位：出行路线")'),
  'Physical click of duplicate heading did not reach the second answer');
 const html=await readFile(resolve('examples/sidebar-tools/reading-toc/preview/reading-toc-r12-overlay-preview.html'),'utf8');
 const sourceHash=html.match(/"trustedOverlaySourceSha256":"([a-f0-9]{64})"/)?.[1]||null;
 await writeFile(resolve('artifacts/reading-toc-r41/toc-r186-visible-observation.json'),
  JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,trustedOverlaySourceSha256:sourceHash,
   browser:version.Browser,installed:false,scenario:'chatgpt-multi',
   actualClosedShadow:true,visible,expanded,physicalClicks:['full','h-25'],
   screenshot:'toc-r186-three-answers-visible.png',screenshotSha256:imageHash},null,2)+'\n');
 console.log('TOC_R186_REAL_VISIBILITY '+JSON.stringify({visible,expanded,sourceHash,imageHash}));
 await screenshot(overlay.page,'toc-r183-multi-preview-overlay.png');
 await screenshot(overlay.page,'toc-r14-preview-overlay.png');
 console.log('TOC_PREVIEW_EVIDENCE '+JSON.stringify({browser:version.Browser,file:true,installed:false,
  screenshots:['toc-r14-preview-panel.png','toc-r14-preview-overlay.png','toc-r186-three-answers-visible.png']}));
});

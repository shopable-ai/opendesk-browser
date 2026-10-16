// NON-RELEASE Mac/Chromium probe. Parent runs actual registry/view; each opaque
// child runs only the actual renderer. The disposable bootstrap is test code,
// not an approved Broker loader or a license/installation acceptance shortcut.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import webpack from 'webpack';

const args={};
for(let i=2;i<process.argv.length;i+=2){
  assert.match(process.argv[i]||'',/^--[a-z-]+$/);
  args[process.argv[i].slice(2)]=process.argv[i+1];
}
for(const key of ['browser','out'])assert(args[key],'Missing --'+key);
const {chromium}=await import(args.playwright
  ?pathToFileURL(resolve(args.playwright)).href:'playwright-core');
const base=resolve('examples/programs/chatgpt-mindmap'),out=resolve(args.out);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'odmm-r394-business-'));
const extension=join(temp,'extension');
await mkdir(join(extension,'vendor'),{recursive:true});
const report={format:'opendesk.mindmap.r394.business-frame-probe.v1',
  scope:'TEMPORARY_TEST_EXTENSION_PARENT_BUSINESS_CHILD_RENDERER_ONLY',
  platform:process.platform,architecture:process.arch,executable:resolve(args.browser),
  license:'BLOCKED',brokerInstall:'NOT_TESTED',
  realChatGPT:'REAL_CHATGPT_NOT_TESTED_OFFLINE_FIXTURE',result:'NOT_TESTED',
  tests:[],externalRequests:[],error:null};
report.node=process.version;report.compiler=webpack.version;
report.probeSourceHash=sha(await readFile(fileURLToPath(import.meta.url)));
const record=(test,details={})=>report.tests.push({test,result:'PASS',...details});
let context,page;
try{
  const businessFiles=['answer-registry.js','chatgpt-adapter.js','extract.js','view.js',
    'xmind-adapter.js','xmind-convert.js','xmind-frame.js','xmind-frame-child.js','xmind-frame-protocol.js'];
  report.sourceInputs=await Promise.all([...businessFiles.map(path=>'src/'+path),'assets/ui.css',
    'preview/chatgpt.html','tests/xmind-provenance.json']
    .map(async path=>({path,sha256:sha(await readFile(join(base,path)))})));
  const compiledInputs=new Map();
  const provenance=JSON.parse(await readFile(join(base,'tests/xmind-provenance.json'),'utf8'));
  for(const asset of provenance.assets){
    const bytes=await readFile(join(base,'preview',asset.name));
    assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);
    await copyFile(join(base,'preview',asset.name),join(extension,'vendor',asset.name));
  }
  report.assets=provenance.assets.map(({name,bytes,sha256})=>({name,bytes,sha256}));
  const css=await readFile(join(base,'assets/ui.css'),'utf8');
  const modulePath=name=>JSON.stringify(join(base,'src',name));
  const parentEntry=join(temp,'parent-entry.js');
  await writeFile(parentEntry,`
import {createAnswerRegistry} from ${modulePath('answer-registry.js')};
import {createAnswerView} from ${modulePath('view.js')};
import {createXmindFrameRenderer} from ${modulePath('xmind-frame.js')};
import {createPageUI} from ${JSON.stringify(resolve('src/scripting/user-scripts/page-ui.js'))};
const slots=new Map(),replies=[];let nextSlot=0;
const owner=createPageUI({id:'opendesk.r394.test',baseStyles:false});
owner.host.hidden=true;
function frameFactory({canvas,signal,identity}){
  if(signal.aborted)throw Error('aborted test frame');
  const slot=String(++nextSlot),nonce=crypto.randomUUID(),channel=new MessageChannel();
  channel.port1.addEventListener('message',event=>{
    if(event.data?.kind==='reply')replies.push({command:event.data.command,ok:event.data.ok,
      error:event.data.error?.code});
  });
  const frame=document.createElement('iframe');
  frame.sandbox='allow-scripts';frame.dataset.odmmR394Frame=slot;
  frame.src='https://chatgpt.com/__odmm_r394_child?slot='+slot;
  frame.style.cssText='width:100%;height:100%;border:0;display:block';
  canvas.append(frame);
  slots.set(slot,{slot,identity,nonce,frame,childPort:channel.port2});
  return {port:channel.port1,destroy:async()=>{
    channel.port2.close();frame.remove();slots.delete(slot);
  }};
}
const registry=createAnswerRegistry({document,window,owner,css:${JSON.stringify(css)},
  createView:options=>createAnswerView({...options,
    rendererFactory:input=>createXmindFrameRenderer({...input,frameFactory,timeoutMs:30000})})});
owner.onDispose(()=>registry.destroy());registry.start();
globalThis.__odmmR394Test={
  replies:()=>replies.slice(-200),
  slots:()=>[...slots.values()].map(({slot,identity,nonce})=>({slot,identity,nonce})),
  connect(slot){const row=slots.get(slot);if(!row)throw Error('unknown slot');
    row.frame.contentWindow.postMessage({type:'ODMM_R394_TEST_PORT',nonce:row.nonce},'*',[row.childPort]);},
  async stop(){await registry.destroy();owner.destroy();return slots.size;}
};
const stop=document.createElement('button');stop.id='r394-stop';stop.textContent='Stop test program';
stop.addEventListener('click',event=>{if(event.isTrusted)globalThis.__odmmR394Test.stop()
  .then(()=>{stop.dataset.stopped='true';},error=>{stop.dataset.error=String(error);});});
const theme=document.createElement('button');theme.id='r394-theme';theme.textContent='Toggle test theme';
theme.addEventListener('click',event=>{if(event.isTrusted)document.documentElement.classList.toggle('dark');});
document.body.prepend(stop,theme);
`);
  const childEntry=join(temp,'child-entry.js');
  await writeFile(childEntry,`
import {serveXmindFrame} from ${modulePath('xmind-frame-child.js')};
const {identity,nonce}=globalThis.__odmmR394ChildSeed;
function connect(event){
  if(event.source!==window.parent||event.origin!=='https://chatgpt.com'||
    event.data?.type!=='ODMM_R394_TEST_PORT'||event.data.nonce!==nonce||event.ports.length!==1)return;
  window.removeEventListener('message',connect);
  globalThis.__odmmR394ChildService=serveXmindFrame({port:event.ports[0],identity,window,
    canvas:document.getElementById('child-canvas')});
}
window.addEventListener('message',connect);
`);
  const compile=entry=>new Promise((resolveBuild,reject)=>webpack({
    mode:'production',devtool:false,target:'web',entry,
    output:{path:extension,filename:'[name].js'},optimization:{minimize:false},
    performance:{hints:false},resolve:{modules:[resolve('node_modules'),'node_modules']}
  },async(error,stats)=>{
    if(error||stats?.hasErrors())reject(error||Error(stats.toString({all:false,errors:true})));
    else try{
      // Capture the actual raw modules Webpack compiled, including Page UI's
      // imported closure. Compare with disk so compilation-time drift fails.
      for(const module of stats.compilation.modules){
        if(!module.resource||!module.originalSource())continue;
        const original=module.originalSource().source();
        const hash=sha(original);
        assert.equal(sha(await readFile(module.resource)),hash,'Compiled module changed: '+module.resource);
        compiledInputs.set(module.resource,hash);
      }
      resolveBuild();
    }catch(cause){reject(cause);}
  }));
  await compile({parent:parentEntry,child:childEntry});
  report.compiledModuleInputs=[...compiledInputs].map(([path,sha256])=>({path:relative(resolve('.'),path),sha256}));
  report.generatedBundleHashes=await Promise.all(['parent.js','child.js'].map(async path=>({path,
    sha256:sha(await readFile(join(extension,path)))})));
  for(const row of report.sourceInputs)assert.equal(sha(await readFile(join(base,row.path))),row.sha256,
    'Business source changed during test compilation');
  await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,
    name:'Mind Map R394 temporary business frame test',version:'0.0.1',
    permissions:['userScripts','tabs'],host_permissions:['https://chatgpt.com/*']}));
  await writeFile(join(extension,'probe.html'),'<!doctype html><title>R394 native test controller</title>');
  const parentHTML=(await readFile(join(base,'preview/chatgpt.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link rel="stylesheet" href="\/preview\/chatgpt\.css">/,'');
  const childHTML='<!doctype html><html><head><style>html,body,#child-canvas{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="child-canvas"></div></body></html>';
  context=await chromium.launchPersistentContext(join(temp,'profile'),{
    executablePath:resolve(args.browser),headless:false,viewport:{width:1300,height:900},
    args:['--disable-extensions-except='+extension,'--load-extension='+extension]
  });
  report.browser=context.browser()?.version();
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('https://chatgpt.com/'))return route.fulfill({status:200,contentType:'text/html; charset=utf-8',
      headers:{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-src https://chatgpt.com"},
      body:url.includes('/__odmm_r394_child?')?childHTML:parentHTML});
    if(url.startsWith('chrome-extension://'))return route.continue();
    report.externalRequests.push(url);return route.abort();
  });
  const manager=await context.newPage();await manager.goto('chrome://extensions/');
  await manager.locator('extensions-item').first().waitFor({timeout:15000});
  const extensionId=await manager.locator('extensions-item').evaluateAll(nodes=>
    nodes.find(node=>node.data?.name==='Mind Map R394 temporary business frame test')?.data?.id);
  assert(extensionId);report.extensionId=extensionId;
  let panel=await context.newPage();const panelURL='chrome-extension://'+extensionId+'/probe.html';
  await panel.goto(panelURL);
  const available=()=>panel.evaluate(async()=>{try{await chrome.userScripts.getScripts();return true;}catch{return false;}});
  if(!await available()){
    await manager.goto('chrome://extensions/?id='+extensionId);
    const row=manager.locator('extensions-detail-view #allow-user-scripts');await row.waitFor({timeout:15000});
    if(!await row.evaluate(e=>Boolean(e.checked)))await row.locator('cr-toggle').click();
    assert(await row.evaluate(e=>Boolean(e.checked)));
    if(panel.isClosed())panel=await context.newPage();await panel.goto(panelURL);
  }
  assert(await available());
  const worldId='odmm-r394-'+randomUUID();
  await panel.evaluate(id=>chrome.userScripts.configureWorld({worldId:id,
    csp:"script-src 'self'; object-src 'none'",messaging:false}),worldId);
  page=await context.newPage();
  const parentURL='https://chatgpt.com/__odmm_r394_parent';
  report.frameEvents=[];
  page.on('framenavigated',frame=>report.frameEvents.push({event:'navigated',url:frame.url()}));
  page.on('framedetached',frame=>report.frameEvents.push({event:'detached',url:frame.url()}));
  await page.goto(parentURL);
  const tabId=await panel.evaluate(async url=>(await chrome.tabs.query({url:'https://chatgpt.com/*'}))
    .find(tab=>tab.url===url)?.id,parentURL);
  assert(Number.isSafeInteger(tabId));
  const execute=async(frameId,js)=>{
    const result=await panel.evaluate(({tabId,frameId,worldId,js})=>chrome.userScripts.execute({
      target:{tabId,frameIds:[frameId]},world:'USER_SCRIPT',worldId,js}),{tabId,frameId,worldId,js});
    assert.equal(result.length,1);assert(!result[0].error,JSON.stringify(result[0].error));return result[0].result;
  };
  await execute(0,[{file:'parent.js'}]);
  const turns=page.locator('article[data-testid^="conversation-turn-"]');
  const viewer=index=>turns.nth(index).locator('[data-opendesk-chatgpt-mindmap="viewer"]');
  const trigger=index=>turns.nth(index).locator('[data-opendesk-chatgpt-mindmap="button"] button');
  const originalHTML=await turns.locator('.markdown').evaluateAll(nodes=>nodes.map(node=>node.innerHTML));
  assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),3);
  const frames=new Map();
  async function open(index){
    await trigger(index).click();
    await viewer(index).locator('iframe').waitFor({timeout:10000});
    const slot=await viewer(index).locator('iframe').getAttribute('data-odmm-r394-frame');
    const identity=(await execute(0,[{code:'globalThis.__odmmR394Test.slots()'}])).find(row=>row.slot===slot);
    assert(identity);
    const childURL='https://chatgpt.com/__odmm_r394_child?slot='+slot;
    if(!page.frames().some(frame=>frame.url()===childURL))
      await page.waitForEvent('framenavigated',{predicate:frame=>frame.url()===childURL,timeout:15000});
    const targets=await panel.evaluate(({tabId,worldId})=>chrome.userScripts.execute({target:{tabId,allFrames:true},
      world:'USER_SCRIPT',worldId,js:[{code:'location.href'}]}),{tabId,worldId});
    const childTarget=targets.find(row=>row.result===childURL);assert(childTarget&&childTarget.frameId!==0);
    await execute(childTarget.frameId,[...report.assets.map(asset=>({file:'vendor/'+asset.name})),
      {code:'globalThis.__odmmR394ChildSeed='+JSON.stringify({identity:identity.identity,nonce:identity.nonce})},
      {file:'child.js'}]);
    await execute(0,[{code:'globalThis.__odmmR394Test.connect('+JSON.stringify(slot)+')'}]);
    await viewer(index).and(page.locator('[data-ready="true"]')).waitFor({timeout:30000});
    const child=page.frames().find(frame=>frame.url()===childURL);assert(child);
    assert.equal(await child.evaluate(()=>self.origin),'null');
    assert((await child.locator('.topic').count())>=3,'Real XMind topics missing');
    assert.equal(await page.locator('style#snowbrush_style').count(),0);
    assert.equal(await child.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),0,
      'Child must contain renderer only, never a second answer registry');
    frames.set(index,child);return child;
  }
  for(let index=0;index<3;index++)await open(index);
  record('PARENT_THREE_REAL_ANSWERS_CHILD_ONLY_REAL_RENDERERS',{instances:3});
  await viewer(0).getByRole('button',{name:'放大导图'}).click();
  const expanded=await frames.get(1).locator('.topic:visible').count();
  await viewer(1).getByRole('button',{name:'折叠所有分支'}).click();
  await viewer(1).getByRole('button',{name:'展开所有分支'}).waitFor();
  const collapsed=await frames.get(1).locator('.topic:visible').count();assert(collapsed<expanded);
  await viewer(1).getByRole('button',{name:'展开所有分支'}).click();
  await viewer(2).getByRole('button',{name:'进入全屏'}).click();
  assert(!frames.get(2).isDetached(),'Fullscreen entry reloaded the live renderer frame');
  // The real view moves to document.body while fullscreen; the article-local
  // locator correctly stops matching until the user restores the inline view.
  await page.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen')
    .getByRole('button',{name:'退出全屏'}).click();
  assert(!frames.get(2).isDetached(),'Fullscreen exit reloaded the live renderer frame');
  assert((await frames.get(2).locator('.topic').count())>=3);
  await page.locator('#r394-theme').click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
  let themeAcknowledged=false;
  for(let attempt=0;attempt<300;attempt++){
    const replies=await execute(0,[{code:'globalThis.__odmmR394Test.replies()'}]);
    report.lastObservedReplies=replies;
    if(replies.filter(row=>row.command==='setTheme'&&row.ok).length>=3){themeAcknowledged=true;break;}
    await page.waitForTimeout(100);
  }
  assert(themeAcknowledged,'Three child renderers did not acknowledge actual theme changes');
  record('PARENT_TOOLBAR_ZOOM_FOLD_FULLSCREEN_THEME',{expanded,collapsed});
  await page.screenshot({path:join(out,'three-business-frames.png')});
  async function close(index){
    await viewer(index).getByRole('button',{name:'恢复本条回复原文'}).click();
    await viewer(index).waitFor({state:'detached'});
    assert.equal(await turns.nth(index).locator('.markdown').evaluate(node=>node.innerHTML),originalHTML[index]);
  }
  await close(0);assert.equal(await page.locator('iframe[data-odmm-r394-frame]').count(),2);
  assert((await frames.get(1).locator('.topic').count())>=3);assert((await frames.get(2).locator('.topic').count())>=3);
  await close(1);await close(2);
  record('CLOSE_A_PRESERVES_B_C_AND_BYTE_IDENTICAL_ORIGINALS');
  const cycles=Number(args.cycles??20);assert(Number.isSafeInteger(cycles)&&cycles>=1&&cycles<=20);
  for(let cycle=0;cycle<cycles;cycle++){await open(0);await close(0);
    assert.equal(await page.locator('iframe[data-odmm-r394-frame]').count(),0);}
  record('REPEATED_REAL_FRAME_OPEN_CLOSE',{cycles});
  await open(0);await page.locator('#r394-stop').click();
  await page.locator('#r394-stop[data-stopped="true"]').waitFor({timeout:30000});
  assert.equal(await page.locator('iframe[data-odmm-r394-frame]').count(),0);
  assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap]').count(),0);
  assert.equal(await page.locator('style#snowbrush_style').count(),0);
  assert.deepEqual(await turns.locator('.markdown').evaluateAll(nodes=>nodes.map(node=>node.innerHTML)),originalHTML);
  record('DIRECT_BUSINESS_STOP_CLEANS_FRAMES_UI_ORIGINAL_HTML_NOT_BROKER_REVOKE');
  assert.equal(report.externalRequests.length,0,'Unexpected external runtime request');
  for(const row of report.sourceInputs)assert.equal(sha(await readFile(join(base,row.path))),row.sha256,
    'Business inputs changed during native probe');
  for(const [path,hash] of compiledInputs)assert.equal(sha(await readFile(path)),hash,
    'Compiled dependency changed during native probe: '+path);
  for(const row of report.generatedBundleHashes)assert.equal(sha(await readFile(join(extension,row.path))),row.sha256);
  assert.equal(sha(await readFile(fileURLToPath(import.meta.url))),report.probeSourceHash,
    'Native probe changed during execution');
  report.result='PASS_REAL_XMIND_PARENT_BUSINESS_OPAQUE_CHILD_RENDERER';
}catch(error){
  report.result='FAILED';report.error=String(error);report.errorStack=error.stack;
  report.remainingFrames=page?.frames().map(frame=>frame.url());process.exitCode=1;
}
finally{
  if(context)await context.close();await rm(temp,{recursive:true,force:true});
  report.cleanup='REMOVED_OWN_TEMP_EXTENSION_PROFILE_VENDOR_COPY';
  await writeFile(join(out,'business-frame-probe.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({result:report.result,error:report.error,tests:report.tests.length}));

// R3.9.3 independent Chrome proof: real XMind SDK in an opaque iframe.
// The temporary extension is generated ONLY inside the CI temp directory.
// Neither the actual OpenDesk package nor its Broker is installed by this
// experiment. A PASS is sandbox feasibility, NOT product installation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const argv=Object.fromEntries(
  Array.from({length:(process.argv.length-2)/2},(_,i)=>
    [process.argv[2+2*i]?.slice(2),process.argv[3+2*i]]));
for(const item of ['browser','program','out'])assert(argv[item],'Missing --'+item);
const {chromium}=await import(argv.playwright
  ?pathToFileURL(resolve(argv.playwright)).href:'playwright-core');
const out=resolve(argv.out),repo=resolve('.');
const base=join(repo,'projects/chatgpt-mindmap');
const provenance=JSON.parse(await readFile(join(base,'tests/xmind-provenance.json'),'utf8'));
const source=await readFile(resolve(argv.program),'utf8');
const artifact=JSON.parse(await readFile(join(resolve(argv.program),'..','artifact.json'),'utf8'));
assert.equal(artifact.status,'BUILT_UNVERIFIED');
assert.equal(artifact.installable,false);
assert.equal(artifact.sourceHash,createHash('sha256').update(source).digest('hex'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={
  format:'opendesk.mindmap.r393.sandbox-feasibility.v1',
  scope:'TEMPORARY_MINIMAL_TEST_EXTENSION_NOT_OPENDESK_INSTALLATION',
  license:'BLOCKED_UNVERIFIED_REDISTRIBUTION',
  actualBroker:'NOT_TESTED',
  realChatGPT:'NOT_TESTED_OFFLINE_FIXTURE',
  result:'NOT_TESTED',
  parentSnowbrushStyle:'NOT_TESTED',
  childSnowbrushStyle:'NOT_TESTED',
  childOrigin:'NOT_TESTED',
  nativeWorld:'USER_SCRIPT',
  sourceHash:artifact.sourceHash,sourceBytes:Buffer.byteLength(source),
  platform:process.platform,architecture:process.arch,browserExecutable:resolve(argv.browser),
  assets:[],externalRequests:[],
  error:null
};
await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'odmm-r393-sandbox-'));
let browser;
try{
  const ext=join(temp,'extension');
  await mkdir(join(ext,'vendor'),{recursive:true});
  for(const asset of provenance.assets){
    const original=join(base,'preview',asset.name);
    const bytes=await readFile(original);
    assert.equal(bytes.length,asset.bytes);
    assert.equal(hash(bytes),asset.sha256);
    await copyFile(original,join(ext,'vendor',asset.name));
    report.assets.push({name:asset.name,bytes:asset.bytes,sha256:asset.sha256});
  }
  assert.equal(report.assets.reduce((n,x)=>n+x.bytes,0),4042573);
  await writeFile(join(ext,'manifest.json'),JSON.stringify({
    manifest_version:3,name:'OpenDesk MindMap R393 TEMPORARY isolation experiment',
    version:'0.0.1',permissions:['userScripts','tabs'],
    host_permissions:['https://chatgpt.com/*'],
    action:{default_popup:'probe.html'}
  }));
  await writeFile(join(ext,'probe.html'),'<!doctype html><title>R393 isolated test</title>');
  const fixture=(await readFile(join(base,'preview/chatgpt.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link rel="stylesheet" href="\/preview\/chatgpt\.css">/,'');
  assert.equal((fixture.match(/data-message-author-role="assistant"/g)||[]).length,3);
  browser=await chromium.launchPersistentContext(join(temp,'profile'),{
    executablePath:resolve(argv.browser),headless:false,
    viewport:{width:1300,height:900},
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--disable-extensions-except='+ext,'--load-extension='+ext]
  });
  report.browser=browser.browser()?.version()||'unknown';
  const manager=await browser.newPage();
  await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  const extensionItem=manager.locator('extensions-item');
  await extensionItem.first().waitFor({timeout:15000});
  const installed=await extensionItem.evaluateAll(nodes=>nodes.map(node=>({
    id:node.data?.id||node.id,
    name:node.data?.name||node.shadowRoot?.querySelector('#name')?.textContent?.trim()
  })));
  const item=installed.find(x=>x.name==='OpenDesk MindMap R393 TEMPORARY isolation experiment');
  assert(item&&/^[a-p]{32}$/.test(item.id),'Temporary extension was not loaded');
  report.extensionId=item.id;
  await manager.close();
  let panel=await browser.newPage();
  const url='chrome-extension://'+item.id+'/probe.html';
  await panel.goto(url,{waitUntil:'domcontentloaded'});
  async function active(){
    return panel.evaluate(async()=>{
      try{
        if(typeof chrome.userScripts?.execute!=='function')throw Error('E_USER_SCRIPTS_EXECUTE');
        await chrome.userScripts.getScripts();
        return {ok:true};
      }catch(e){return {ok:false,error:String(e)};}
    });
  }
  let enabled=await active();
  if(!enabled.ok){
    const settings=await browser.newPage();
    try{
      await settings.goto('chrome://extensions/?id='+item.id,
        {waitUntil:'domcontentloaded'});
      const row=settings.locator('extensions-detail-view #allow-user-scripts');
      await row.waitFor({timeout:15000});
      if(!await row.evaluate(e=>Boolean(e.checked)))await row.locator('cr-toggle').click();
      assert(await row.evaluate(e=>Boolean(e.checked)),'USER_SCRIPT opt-in unavailable');
    }finally{await settings.close();}
    if(panel.isClosed())panel=await browser.newPage();
    await panel.goto(url,{waitUntil:'domcontentloaded'});
    enabled=await active();
  }
  assert(enabled.ok,'Chrome USER_SCRIPT denied: '+enabled.error);
  report.userScriptsOptIn='PASS_REAL_CHROME_USER_ACTION';
  const worldId='opendesk-r393-opaque-frame';
  await panel.evaluate(async id=>chrome.userScripts.configureWorld({
    worldId:id,csp:"script-src 'self'; object-src 'none'",messaging:false
  }),worldId);
  await browser.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith('https://chatgpt.com/')){
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',
        headers:{'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; frame-src https://chatgpt.com"},
        body:fixture});
    }
    if(u.startsWith('chrome-extension://'))return route.continue();
    report.externalRequests.push(u);
    return route.abort();
  });
  const host=await browser.newPage();
  const hostURL='https://chatgpt.com/__r393_frame_probe_parent';
  const childURL='https://chatgpt.com/__r393_frame_probe_child';
  await host.goto(hostURL,{waitUntil:'domcontentloaded'});
  assert.equal(await host.locator('style#snowbrush_style').count(),0);
  const upcoming=host.waitForEvent('framenavigated',{
    predicate:f=>f.url()===childURL,timeout:15000});
  await host.evaluate(url=>{
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox','allow-scripts');
    frame.setAttribute('data-r393-real-sdk','');
    frame.src=url;
    frame.style.cssText='width:1050px;height:750px;display:block;border:0';
    document.body.append(frame);
  },childURL);
  await upcoming;
  const child=host.frames().find(f=>f.url()===childURL);
  assert(child,'sandboxed XMind frame failed to navigate');
  report.childOrigin=await child.evaluate(()=>self.origin);
  assert.equal(report.childOrigin,'null',
    'Iframe lacks an opaque origin: no isolation claim is allowed');
  const tabId=await panel.evaluate(async address=>
    (await chrome.tabs.query({url:'https://chatgpt.com/*'}))
      .find(t=>t.url===address)?.id??null,hostURL);
  assert(Number.isSafeInteger(tabId),'native tab ID not found');
  const frames=await panel.evaluate(async({tabId,worldId})=>
    chrome.userScripts.execute({target:{tabId,allFrames:true},world:'USER_SCRIPT',
      worldId,js:[{code:'({href:location.href,child:window!==window.top})'}]}),
  {tabId,worldId});
  const target=frames.find(x=>x.result?.href===childURL&&x.result?.child);
  assert(target&&Number.isSafeInteger(target.frameId),
    'Opaque iframe unavailable as Chrome native USER_SCRIPT injection target');
  report.childFrameId=target.frameId;
  const scripts=report.assets.map(x=>({file:'vendor/'+x.name}));
  const execution=await panel.evaluate(async({tabId,frameId,worldId,scripts,source})=>
    chrome.userScripts.execute({target:{tabId,frameIds:[frameId]},
      world:'USER_SCRIPT',worldId,
      js:[...scripts,{code:source+
        '\n;main().then(value=>({ok:true,value}),error=>({ok:false,code:error?.code,message:String(error?.message||error)}))'}]}),
  {tabId,frameId:target.frameId,worldId,scripts,source});
  assert.equal(execution.length,1);
  assert.equal(execution[0].error,undefined,JSON.stringify(execution[0].error));
  if(execution[0].result?.code==='E_XMIND_RUNTIME_UNAVAILABLE'){
    assert.equal(await child.locator('[data-opendesk-chatgpt-mindmap]').count(),0);
    report.parentSnowbrushStyle=await host.locator('style#snowbrush_style').count();
    report.childSnowbrushStyle=await child.locator('style#snowbrush_style').count();
    assert.equal(report.parentSnowbrushStyle,0);assert(report.childSnowbrushStyle>0);
    assert.equal(report.externalRequests.length,0);
    report.productionEntryGate='PASS_FAIL_CLOSED';
    report.result='BLOCKED_PRODUCTION_FRAME_LOADER_RENDER_NOT_TESTED';
    report.renderProof='Run chatgpt-mindmap-r394-business-frame-probe.mjs for current parent business and child renderer';
    throw Object.assign(new Error('Expected unapproved production frame loader gate'),{code:'E_R394_EXPECTED_ENTRY_GATE'});
  }
  assert.equal(execution[0].result?.ok,true,JSON.stringify(execution[0].result));
  const button=child.locator('[data-opendesk-chatgpt-mindmap="button"] button');
  const turns=child.locator('article[data-testid^="conversation-turn-"]');
  const viewer=index=>turns.nth(index).locator('[data-opendesk-chatgpt-mindmap="viewer"]');
  const originalA=await turns.nth(0).locator('.markdown').evaluate(el=>el.innerHTML);
  await button.first().waitFor({timeout:20000});
  assert.equal(await button.count(),3);
  for(let index=0;index<3;index++){
    await button.nth(index).click();
    await viewer(index).and(child.locator('[data-ready="true"]'))
      .waitFor({timeout:30000});
    assert((await viewer(index).locator('.topic').count())>=3,
      'Original XMind topics missing for independent reply '+index);
    assert.equal(await host.locator('style#snowbrush_style').count(),0,
      'Snowbrush host CSS leaked while opening answer '+index);
  }
  report.answerInstances=3;
  report.realTopics=await child.locator('.topic').count();
  assert(report.realTopics>=9,'Three independent XMind workbooks were not mounted');
  report.childSnowbrushStyle=await child.locator('style#snowbrush_style').count();
  report.parentSnowbrushStyle=await host.locator('style#snowbrush_style').count();
  assert(report.childSnowbrushStyle>0,'Snowbrush style not observed in child document');
  assert.equal(report.parentSnowbrushStyle,0,'Snowbrush CSS leaked into host');
  await viewer(0).getByRole('button',{name:'放大导图'}).click();
  const expanded=await viewer(1).locator('.topic:visible').count();
  await viewer(1).getByRole('button',{name:'折叠所有分支'}).click();
  await viewer(1).getByRole('button',{name:'展开所有分支'})
    .waitFor({timeout:30000});
  const collapsed=await viewer(1).locator('.topic:visible').count();
  assert(collapsed<expanded,'Original XMind branch fold did not change visible topic count');
  await viewer(1).getByRole('button',{name:'展开所有分支'}).click();
  report.fold={expanded,collapsed};
  await viewer(2).getByRole('button',{name:'进入全屏'}).click();
  const full=child.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen');
  await full.getByRole('button',{name:'退出全屏'}).waitFor({timeout:15000});
  await full.getByRole('button',{name:'退出全屏'}).click();
  await viewer(2).getByRole('button',{name:'进入全屏'})
    .waitFor({timeout:15000});
  await viewer(0).getByRole('button',{name:'恢复本条回复原文'}).click();
  await viewer(0).waitFor({state:'detached',timeout:30000});
  assert.equal(await turns.nth(0).locator('.markdown').evaluate(el=>el.innerHTML),
    originalA,'Closing A must restore its byte-identical original HTML');
  assert((await viewer(1).locator('.topic').count())>=3,
    'Retiring reply A accidentally closed reply B');
  assert((await viewer(2).locator('.topic').count())>=3,
    'Retiring reply A accidentally closed reply C');
  for(let index=1;index<3;index++){
    await viewer(index).getByRole('button',{name:'恢复本条回复原文'}).click();
    await viewer(index).waitFor({state:'detached',timeout:30000});
  }
  assert.equal(await child.locator('[data-opendesk-chatgpt-mindmap="viewer"]').count(),0);
  report.allAnswerViewsRetired=true;
  await host.locator('iframe[data-r393-real-sdk]').evaluate(frame=>frame.remove());
  assert.equal(await host.locator('style#snowbrush_style').count(),0);
  report.frameDisposed=true;
  assert.equal(report.externalRequests.length,0,
    'Isolated XMind attempted an unapproved third-party resource request');
  report.noThirdPartyNetworkAttempts=true;
  report.result='PASS_REAL_XMIND_IN_OPAQUE_TEST_FRAME';
  console.log('R393_REAL_XMIND_OPAQUE_FRAME_PASS');
}catch(error){
  if(error.code!=='E_R394_EXPECTED_ENTRY_GATE'){
  report.result='BLOCKED';
  report.error={code:error.code||'E_R393_SANDBOX_PROBE',
    message:String(error.message||error),stack:String(error.stack||'').slice(0,4000)};
  process.exitCode=1;
  console.error('R393_REAL_XMIND_SANDBOX_BLOCKED '+report.error.message);
  }
}finally{
  await browser?.close().catch(()=>{});
  await writeFile(join(out,'r393-sandbox-probe.json'),JSON.stringify(report,null,2)+'\n');
  await rm(temp,{recursive:true,force:true});
  console.log('R393_SANDBOX_EVIDENCE '+JSON.stringify({result:report.result,
    childOrigin:report.childOrigin,parentStyle:report.parentSnowbrushStyle,
    childStyle:report.childSnowbrushStyle,broker:report.actualBroker,
    license:report.license,error:report.error?.message||null}));
}

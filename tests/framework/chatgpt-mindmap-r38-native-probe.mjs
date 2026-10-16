// R3.8 native feasibility probe. NEVER a production installer or acceptance shortcut.
// Loads the ACTUAL OpenDesk extension build, the ACTUAL compiled Mind Map Program,
// and the four original preview SDK files in a temporary, non-distributed test
// package. This deliberately bypasses the installed-Program broker, so a PASS
// here is NOT NATIVE_EXTENSION_E2E_PASS or REAL_CHATGPT_PASS.
// No vendor files are uploaded with CI evidence or added to dist/production.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright-core';

const args={};
for(let i=2;i<process.argv.length;i+=2){
  assert.match(process.argv[i]||'',/^--[a-z-]+$/);
  args[process.argv[i].slice(2)]=process.argv[i+1];
}
for(const key of ['browser','extension','program','out'])assert(args[key],'Missing --'+key);
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const out=resolve(args.out);
const repo=resolve('.');
const vendorRoot=join(repo,'examples/programs/chatgpt-mindmap');
const expected=JSON.parse(await readFile(join(vendorRoot,'tests/xmind-provenance.json'),'utf8'));
const source=await readFile(resolve(args.program),'utf8');
const artifact=JSON.parse(await readFile(join(resolve(args.program),'..','artifact.json'),'utf8'));
assert.equal(artifact.status,'BUILT_UNVERIFIED');
assert.equal(artifact.installable,false);
assert.equal(sha(Buffer.from(source)),artifact.sourceHash);
assert.equal(artifact.programId,'opendesk.chatgpt-mindmap');
const report={
  format:'opendesk.mindmap.r38.native-feasibility.v1',
  scope:'TEMPORARY_CI_EXTENSION_WITH_AUDITED_PREVIEW_ASSETS_NOT_PRODUCTION_DISTRIBUTION',
  installation:'NOT_TESTED_EXISTING_BROKER_NOT_USED',
  realChatGPT:'NOT_TESTED_OFFLINE_ROUTED_FIXTURE',
  runtimeLicense:'BLOCKED_UNVERIFIED_REDISTRIBUTION',
  nativeResult:'NOT_TESTED',xmindWorldResult:'NOT_TESTED',
  sourceHash:artifact.sourceHash,sourceBytes:Buffer.byteLength(source),
  chrome:null,extensionId:null,extensionManifestHash:null,tests:[],error:null
};
await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'opendesk-r38-native-'));
const extension=join(temp,'extension');
let context;
const record=(test,result,details={})=>report.tests.push({test,result,...details});
const evidence=()=>writeFile(join(out,'r38-native-feasibility.json'),JSON.stringify(report,null,2)+'\n');
try{
  // Extension source must come from the WXT production output. The four
  // unapproved large JS files live ONLY in this disposable test copy.
  await cp(resolve(args.extension),extension,{recursive:true});
  const manifestBytes=await readFile(join(extension,'manifest.json'));
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.manifest_version,3);
  assert(manifest.permissions.includes('userScripts'));
  report.extensionManifestHash=sha(manifestBytes);
  await mkdir(join(extension,'__r38_probe'),{recursive:true});
  const verified=[];
  for(const row of expected.assets){
    const bytes=await readFile(join(vendorRoot,'preview',row.name));
    assert.equal(bytes.length,row.bytes,'Asset size mismatch: '+row.name);
    assert.equal(sha(bytes),row.sha256,'Asset SHA mismatch: '+row.name);
    await copyFile(join(vendorRoot,'preview',row.name),join(extension,'__r38_probe',row.name));
    verified.push({name:row.name,bytes:row.bytes,sha256:row.sha256});
  }
  report.vendorHashes=verified;
  record('EXACT_FOUR_VENDOR_BYTES_FROM_GIT','PASS');
  const html=(await readFile(join(vendorRoot,'preview/chatgpt.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link rel="stylesheet" href="\/preview\/chatgpt\.css">/,'');
  assert.equal((html.match(/data-message-author-role="assistant"/g)||[]).length,3);
  assert(!html.includes('<script'),'Fixture must not preload the original SDK or product app');
  context=await chromium.launchPersistentContext(join(temp,'profile'),{
    executablePath:resolve(args.browser),headless:false,
    viewport:{width:1220,height:850},
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--disable-extensions-except='+extension,'--load-extension='+extension]
  });
  report.chrome=context.browser()?.version()||'unknown';
  let sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:25000});
  const match=/^chrome-extension:\/\/([a-p]{32})\//.exec(sw.url());
  assert(match,'Real OpenDesk extension service worker is not present');
  const extensionId=match[1];report.extensionId=extensionId;
  record('ACTUAL_WXT_EXTENSION_SERVICE_WORKER','PASS',{url:sw.url()});
  const available=async()=>{
    sw=context.serviceWorkers().find(worker=>worker.url().startsWith('chrome-extension://'+extensionId+'/'))||sw;
    return sw.evaluate(async()=>{
      try{await chrome.userScripts.getScripts();return {ok:true};}
      catch(error){return {ok:false,message:String(error)};}
    }).catch(error=>({ok:false,message:String(error)}));
  };
  let access=await available();
  report.initialUserScriptsAccess=access;
  if(!access.ok){
    // Chrome 138+ requires a real, per-extension user enablement toggle.
    // Do not use developerPrivate, hidden preferences, or forged permissions.
    const details=await context.newPage();
    try{
      await details.goto('chrome://extensions/?id='+extensionId,{waitUntil:'domcontentloaded'});
      const label=details.getByText('Allow User Scripts',{exact:true});
      await label.waitFor({timeout:15000});
      // The visible Chrome Extensions WebUI is the ONLY authority here.
      const target=details.locator('extensions-detail-view')
        .locator('div:has-text("Allow User Scripts") cr-toggle').last();
      if(await target.count())await target.click();
      else await label.click();
      record('TRUSTED_CHROME_USER_SCRIPTS_TOGGLE','CLICKED');
      await details.waitForTimeout(1000);
    }finally{await details.close();}
    access=await available();
    if(!access.ok){
      // Reloading the real extension context is needed when the API property
      // was undefined before Chrome's trusted toggle was enabled.
      await sw.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
      await new Promise(r=>setTimeout(r,1500));
      sw=context.serviceWorkers().find(worker=>worker.url().startsWith('chrome-extension://'+extensionId+'/'))||
        await context.waitForEvent('serviceworker',{timeout:15000});
      access=await available();
    }
  }
  report.finalUserScriptsAccess=access;
  assert(access.ok,'E_NATIVE_USER_SCRIPTS_TOGGLE: '+access.message);
  record('CHROME_USER_SCRIPTS_AVAILABLE_WITH_USER_OPT_IN','PASS');

  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('https://chatgpt.com/')){
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',
        headers:{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"},
        body:html});
    }
    return route.abort();
  });
  const page=await context.newPage();
  const fixtureURL='https://chatgpt.com/__opendesk_r38_native_fixture';
  const markerId='opendesk-r38-native-registration';
  const worldId='opendesk-r38-native-feasibility';
  const native=async(callback,input)=>available().then(state=>{
    assert(state.ok,'userScripts became unavailable');
    return sw.evaluate(callback,input);
  });
  await native(async({worldId,markerId})=>{
    await chrome.userScripts.configureWorld({worldId,csp:"script-src 'self'; object-src 'none'",messaging:false});
    await chrome.userScripts.register([{id:markerId,matches:['https://chatgpt.com/*'],
      excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT',
      worldId,js:[{code:'globalThis.__odmmIsolated = "present"; document.documentElement.dataset.odmmNativeMarker = "registered";'}]}]);
    const scripts=await chrome.userScripts.getScripts({ids:[markerId]});
    if(scripts.length!==1||scripts[0].world!=='USER_SCRIPT'||scripts[0].worldId!==worldId)
      throw Error('Native register/getScripts roundtrip failed');
  },{worldId,markerId});
  await page.goto(fixtureURL,{waitUntil:'domcontentloaded'});
  await page.locator('html[data-odmm-native-marker="registered"]').waitFor({timeout:15000});
  assert.equal(await page.evaluate(()=>typeof window.__odmmIsolated),'undefined');
  report.nativeResult='PASS_NATIVE_REGISTER_AUTO_RUN_ISOLATION';
  record('REAL_NATIVE_REGISTER_GET_SCRIPTS_AND_AUTO_INJECTION','PASS');
  record('ISOLATED_USER_SCRIPT_GLOBAL_NOT_VISIBLE_IN_MAIN','PASS');

  // The tested resources below are deliberately NOT in the real dist/production.
  // This establishes feasibility of actual JS resource execution, NOT license.
  const tab=await native(async url=>{
    const hits=await chrome.tabs.query({url:'https://chatgpt.com/*'});
    const match=hits.find(row=>row.url===url);
    return match?.id??null;
  },fixtureURL);
  assert(Number.isSafeInteger(tab),'Native fixture tab ID not found');
  const js=verified.map(row=>({file:'__r38_probe/'+row.name}));
  const injected=await native(async({tabId,worldId,js})=>{
    return await chrome.userScripts.execute({target:{tabId},world:'USER_SCRIPT',worldId,js});
  },{tabId:tab,worldId,js});
  assert.equal(injected.length,1);
  assert.equal(injected[0].error,undefined,JSON.stringify(injected[0].error));
  const runtime=await native(async({tabId,worldId})=>{
    return chrome.userScripts.execute({target:{tabId},world:'USER_SCRIPT',worldId,
      js:[{code:'({JSZip:typeof JSZip,Workbook:typeof Workbook,Topic:typeof Topic,Dumper:typeof Dumper,renderer:typeof globalThis._SB_?.createWorkbookEditor})'}]});
  },{tabId:tab,worldId});
  assert.deepEqual(runtime[0]?.result,{JSZip:'function',Workbook:'function',Topic:'function',Dumper:'function',renderer:'function'});
  record('ORIGINAL_XMIND_RESOURCE_EXECUTES_IN_NAMED_USER_SCRIPT_WORLD','PASS');
  const started=await native(async({tabId,worldId,sourceUtf8})=>
    chrome.userScripts.execute({target:{tabId},world:'USER_SCRIPT',worldId,
      js:[{code:sourceUtf8+'\n;main().then(value=>({ok:true,value}),error=>({ok:false,code:error.code||null,message:String(error.message)}))'}]}),
  {tabId:tab,worldId,sourceUtf8:source});
  assert.equal(started.length,1);
  assert.equal(started[0]?.error,undefined,JSON.stringify(started[0]?.error));
  assert.equal(started[0]?.result?.ok,true,JSON.stringify(started[0]?.result));
  await page.locator('[data-opendesk-chatgpt-mindmap="button"] button').first().waitFor({timeout:15000});
  assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),3);
  await page.locator('[data-opendesk-chatgpt-mindmap="button"] button').first().click();
  await page.locator('.topic').first().waitFor({timeout:30000});
  assert((await page.locator('.topic').count())>=3,'Expected the real Snowbrush topic DOM');
  await page.screenshot({path:join(out,'r38-native-user-script-xmind.png'),fullPage:true});
  report.xmindWorldResult='PASS_REAL_XMIND_IN_USER_SCRIPT_TEST_STAGE';
  record('SAME_COMPILED_PROGRAM_AND_ACTUAL_XMIND_IN_REAL_CHROME','PASS',{
    topics:await page.locator('.topic').count(),buttons:3});
  assert.equal(await page.evaluate(()=>typeof window.JSZip),'undefined');
  record('XMind_GLOBALS_ISOLATED_FROM_PAGE_MAIN','PASS');
  report.globalSnowbrushStyles=await page.locator('style#snowbrush_style').count();
  await native(markerId=>chrome.userScripts.unregister({ids:[markerId]}),markerId);
  assert.equal((await native(markerId=>chrome.userScripts.getScripts({ids:[markerId]}),markerId)).length,0);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('html[data-odmm-native-marker]').count(),0);
  record('REAL_NATIVE_UNREGISTER_BLOCKS_FUTURE_PAGE_BOOTSTRAP','PASS');
  record('BROKER_INSTALL_DISABLE_REVOKE_UNINSTALL','NOT_TESTED',{reason:'Native feasibility probe intentionally does not mutate OpenDesk installed Program database'});
  record('AUTHENTICATED_CHATGPT_DOM','NOT_TESTED',{reason:'Route serves checked-in synthetic page without login'});
  record('PRODUCTION_XMIND_LICENSE_AND_STYLE_LIFECYCLE','BLOCKED',{reason:'Unapproved vendor redistribution and global Snowbrush style ownership'});
}catch(error){
  report.error={name:error.name,code:error.code||'E_NATIVE_PROBE',message:String(error.message||error),stack:String(error.stack||'').slice(0,4000)};
  console.error('R38_NATIVE_PROBE_BLOCKED '+report.error.message);
  process.exitCode=1;
}finally{
  await context?.close().catch(()=>{});
  await evidence();
  await rm(temp,{recursive:true,force:true});
  console.log('R38_NATIVE_EVIDENCE '+JSON.stringify({
    native:report.nativeResult,xmind:report.xmindWorldResult,license:report.runtimeLicense,
    installation:report.installation,realChatGPT:report.realChatGPT,error:report.error?.code||null}));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {composeExtensionEntries,filterExtensionEntries} from '../../src/ui/extension-center-model.js';
import {describeSendQueueProduct,queuePageIdentity,sameQueuePageIdentity,loadSendQueuePageCandidate} from '../../src/ui/send-queue-product.js';
import {SEND_QUEUE_PIN} from '../../src/platform/host/send-queue-admission.js';
import {digest} from '../../src/platform/protocol.js';
import {serializeSidebarToolPackage,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

const tool=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-tool.json',import.meta.url)));
const pagePackage=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-page.json',import.meta.url)));
const makePage=()=>({programId:SEND_QUEUE_PIN.pageProgramId,revision:SEND_QUEUE_PIN.pageRevision,
  sourceHash:SEND_QUEUE_PIN.pageSourceHash,manifestHash:'a'.repeat(64),enabled:true,nativeState:'registered',
  authorization:{installationId:'queue-install',generation:4,status:'active'},
  pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],world:'USER_SCRIPT',runAt:'document_idle',allFrames:false}});
const release={toolId:SEND_QUEUE_PIN.toolId,version:SEND_QUEUE_PIN.toolVersion,
  sha256:SEND_QUEUE_PIN.toolPackageSha256,packageTitle:'AI 消息发送队列',description:'队列'};
const trusted={isTrusted:true};
async function settle(fn){for(let i=0;i<120;i++){
  if(fn())return;await new Promise(r=>setTimeout(r,10));
}assert.ok(fn(),'product state did not settle');}

test('one product projects real independent records, partial recovery and blocked discovery',()=>{
  const page=makePage();
  const entries=composeExtensionEntries({installed:[tool],pages:[page],queueToolHash:SEND_QUEUE_PIN.toolPackageSha256});
  assert.equal(filterExtensionEntries(entries).length,1);
  assert.equal(entries.find(r=>r.kind==='app').queueProduct.state,'ready');
  assert.equal(filterExtensionEntries(entries,{kind:'page'}).length,1);
  const partial=composeExtensionEntries({pages:[page],official:[release]});
  assert.equal(filterExtensionEntries(partial).length,1);
  assert.equal(filterExtensionEntries(partial)[0].queueProduct.state,'partial');
  assert.equal(filterExtensionEntries(partial)[0].installed,false,'Page must not fabricate a Tool record');
  assert.equal(describeSendQueueProduct({toolInstalled:true,toolEnabled:true,page,pageStatusKnown:false}).state,'unknown');
  assert.equal(describeSendQueueProduct({toolInstalled:true,toolEnabled:true,page:{...page,managedCleanup:{state:'unknown'}}}).state,'restricted');
  assert.equal(describeSendQueueProduct({toolInstalled:true,toolEnabled:true,page:{...page,sourceHash:'0'.repeat(64)}}).state,'version-mismatch');
  const untrusted=composeExtensionEntries({installed:[tool],pages:[page],queueToolHash:'0'.repeat(64)});
  assert.equal(filterExtensionEntries(untrusted).length,2,'same ID cannot hide Page authority');
});

test('Page identities bind generation and installation, never ID alone',()=>{
  const page=makePage(),identity=queuePageIdentity(page);
  assert.ok(sameQueuePageIdentity(page,identity));
  assert.equal(sameQueuePageIdentity({...page,authorization:{...page.authorization,generation:5}},identity),false);
  assert.equal(queuePageIdentity({...page,authorization:{}}),null);
});

async function fixture(t,{mode='success',disabled=false,missingPage=false,missingTool=false,installedTool=tool,targetRelease=release}={}){
  const {doc,adapter,state}=createExtensionCenterDOM(t);
  let pages=[makePage()],enabled=!disabled;
  if(disabled){pages[0].enabled=false;pages[0].nativeState='disabled';pages[0].authorization.status='disabled';}
  if(missingPage)pages=[];
  let tools=missingTool?[]:[installedTool];const calls=[];
  const officialRelease={...targetRelease,id:'opendesk/'+tool.id,kind:'sidebar-tool',installationPolicy:'optional',
    capabilities:tool.capabilities,packagePath:'official-tools/'+tool.id+'/'+tool.id+'.opendesk-tool.json',
    bytes:new TextEncoder().encode(serializeSidebarToolPackage(tool)).length};
  t.mock.method(globalThis,'fetch',async url=>url.startsWith('https:')?new Response('',{status:404}):new Response(JSON.stringify(
    url.endsWith('official-tools/catalog.json')?{schema:'opendesk.official-tools.releases.v1',
      sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[officialRelease]}:
    url.endsWith('.opendesk-page.json')?pagePackage:{})));
  const api={runtime:{getURL:p=>'chrome-extension://fixture/'+p},
    permissions:{contains:async()=>true},
    storage:{local:{get:async()=>({[SIDEBAR_TOOL_STORE]:tools,[SIDEBAR_TOOL_ENABLE_STORE]:{[tool.id]:enabled}})},
      onChanged:{addListener(){},removeListener(){}}}};
  const client={async request(name,args){
    if(name==='listPagePrograms')return {installed:structuredClone(pages)};
    calls.push([name,args]);
    if(name==='uninstallPageProgram'){
      const page=pages[0];assert.deepEqual(args,queuePageIdentity(page));
      pages=[];
      if(mode==='unknown')throw Object.assign(new Error('lost response'),{code:'E_EFFECT_UNKNOWN'});
      return {uninstalled:true,nativeState:'unregistered',manifestHash:page.manifestHash,
        installationId:page.authorization.installationId};
    }
    assert.equal(name,'setInstalledPageEnabled');
    assert.equal(args.expectedGeneration,pages[0].authorization.generation);
    if(mode!=='ack-only'){
      pages[0].enabled=args.enabled;pages[0].nativeState=args.enabled?'registered':'disabled';
      pages[0].authorization.status=args.enabled?'active':'disabled';pages[0].authorization.generation++;
    }
    return {enabled:args.enabled};
  }};
  const host={openSendQueueProductReview(pkg,release){calls.push(['productReview',pkg,release]);return true;},openImportFiles(files){calls.push(['pageReview',files]);return true;},
    openOfficialReview(id){calls.push(['toolReview',id]);return true;},openSettings(){},openTool(){return true;},
    async toggleEnabled(id,event){assert.equal(event.isTrusted,true);calls.push(['toolToggle']);
      if(mode==='draft')return false;enabled=!enabled;return true;},
    async uninstallFromList(id,baseline,event){assert.equal(event.isTrusted,true);assert.deepEqual(baseline,tool);
      calls.push(['toolRemove']);tools=[];return true;}};
  const ui=createExtensionCenter({api,client,doc,sidebarTools:host,taskWorkbench:{},extensionList:adapter});
  t.after(()=>ui.dispose());
  if(missingTool)state.toolbarModel.onScope('available');
  await settle(()=>state.rowsModel.rows.some(r=>r.key==='app:'+tool.id));
  await settle(()=>state.rowsModel.rows.length&&state.toolbarModel);
  if(missingTool)state.rowsModel.onOpenRow('app:'+tool.id);
  else {state.rowsModel.onMore('app:'+tool.id,doc.getElementById('extension-center-more'));
    state.rowMenuModel.items.find(r=>r.id==='detail').onClick(trusted);}
  if(installedTool===tool&&targetRelease===release)
    assert.ok(state.detailModel.actions.some(r=>r.id===(missingTool?'queue-review':'queue-toggle')),'exact pinned Tool earns product management');
  return {state,calls,ui,host,doc,setPages:value=>{pages=value;},get pages(){return pages;},get enabled(){return enabled;}};
}

for(const disabled of [false,true])test(`product ${disabled?'restore':'disable'} reads both records and preserves the Page owner`,async t=>{
  const f=await fixture(t,{disabled});
  f.state.detailModel.actions.find(a=>a.id==='queue-toggle').onClick(trusted);
  await settle(()=>f.state.statusModel.state==='success');
  assert.equal(f.enabled,disabled);assert.equal(f.pages[0].enabled,disabled);
  assert.equal(f.pages[0].authorization.installationId,'queue-install');
  assert.deepEqual(f.calls.map(c=>c[0]),['setInstalledPageEnabled','toolToggle']);
});

for(const mode of ['ack-only','draft'])test(`partial ${mode} outcome stays visible and is not retried`,async t=>{
  const f=await fixture(t,{mode});
  f.state.detailModel.actions.find(a=>a.id==='queue-toggle').onClick(trusted);
  await settle(()=>f.state.statusModel.text.includes('不会自动重试'));
  assert.match(f.state.statusModel.text,/不会自动重试/);
  assert.equal(f.calls.filter(c=>c[0]==='setInstalledPageEnabled').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='toolToggle').length,mode==='draft'?1:0);
  assert.equal(f.enabled,true);
});

for(const mode of ['success','unknown'])test(`joint uninstall ${mode} requires native receipt and durable removal before Tool cleanup`,async t=>{
  const f=await fixture(t,{mode});
  f.state.detailModel.actions.find(a=>a.id==='queue-remove').onClick(trusted);
  assert.ok(f.state.uninstallModel);
  assert.equal(f.calls.length,0,'opening review does not revoke');
  f.state.uninstallModel.onConfirm(trusted);
  await settle(()=>f.state.statusModel.state===(mode==='success'?'success':'error'));
  assert.equal(f.calls.filter(c=>c[0]==='uninstallPageProgram').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='toolRemove').length,mode==='success'?1:0);
});

test('untrusted product actions do not mutate either installation',async t=>{
  const f=await fixture(t);
  for(const id of ['queue-toggle','queue-remove','queue-page-review'])
    f.state.detailModel.actions.find(a=>a.id===id).onClick({isTrusted:false});
  assert.equal(f.calls.length,0);assert.equal(f.state.uninstallModel,null);
});


test('fixed Page candidate is reviewed while publication remains blocked; changed version or package is rejected',async()=>{
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path}};
  let value=pagePackage;
  const fetcher=async(url,options)=>{assert.match(url,/official-pages\/opendesk.ai-send-queue\//);
    assert.equal(options.redirect,'error');return new Response(JSON.stringify(value));};
  const candidate=await loadSendQueuePageCandidate({api,fetcher});
  assert.equal(candidate.packageHash,SEND_QUEUE_PIN.pagePackageHash);
  assert.equal(candidate.version,SEND_QUEUE_PIN.pageVersion);
  const {packageHash,...payload}=pagePackage;
  const changed={...payload,version:'9.0.0'};
  value={...changed,packageHash:await digest(changed)};
  await assert.rejects(loadSendQueuePageCandidate({api,fetcher}),{code:'E_QUEUE_CANDIDATE'});
  value={...pagePackage,sourceHash:'0'.repeat(64)};
  await assert.rejects(loadSendQueuePageCandidate({api,fetcher}));
  await assert.rejects(loadSendQueuePageCandidate({api,fetcher:async()=>new Response('',{status:404})}),{code:'E_PACKAGE_MISSING'});
});

test('joint entry loads the pinned Page and invokes only the single-confirmation Host facade',async t=>{
  const f=await fixture(t,{missingPage:true,missingTool:true});
  f.state.detailModel.actions.find(a=>a.id==='queue-review').onClick(trusted);
  await settle(()=>f.calls.some(c=>c[0]==='productReview'));
  const call=f.calls.find(c=>c[0]==='productReview');
  assert.deepEqual(call[1],pagePackage);
  assert.equal(call[2].sha256,SEND_QUEUE_PIN.toolPackageSha256);
  assert.deepEqual(f.calls.map(c=>c[0]),['productReview']);
  assert.equal(f.pages.length,0,'opening review does not install');
});

for(const failure of ['missing','rejected'])test(`joint Host ${failure} cannot fall back to duplicate reviews`,async t=>{
  const f=await fixture(t,{missingPage:true,missingTool:true});
  f.host.openSendQueueProductReview=failure==='missing'?undefined:()=>false;
  f.state.detailModel.actions.find(a=>a.id==='queue-review').onClick(trusted);
  await settle(()=>f.state.statusModel.text.includes('联合安装审阅暂不可用'));
  assert.equal(f.calls.length,0,'no Page/Tool review or installer fallback');
});

test('a changed Page generation invalidates the whole-product uninstall confirmation',async t=>{
  const f=await fixture(t);
  f.state.detailModel.actions.find(a=>a.id==='queue-remove').onClick(trusted);
  const confirm=f.state.uninstallModel.onConfirm;
  f.pages[0].authorization.generation++;
  await f.ui.refresh();
  assert.equal(f.state.uninstallModel,null);
  await confirm(trusted);
  assert.equal(f.calls.length,0);
});

test('Page-only partial installation remains manageable through the product detail',async t=>{
  const f=await fixture(t,{missingTool:true});
  assert.match(f.state.detailModel.installationText,/侧栏：未安装.*网页能力：已注册/);
  assert.ok(f.state.detailModel.actions.some(a=>a.id==='queue-page-toggle'));
  assert.ok(f.state.detailModel.actions.some(a=>a.id==='queue-page-remove'));
  assert.equal(f.state.detailModel.actions.some(a=>a.id==='queue-remove'),false);
});


test('a Sidebar-only partial product can be disabled without requiring a new Page installation',async t=>{
  const f=await fixture(t,{missingPage:true});
  f.state.detailModel.actions.find(a=>a.id==='queue-disable').onClick(trusted);
  await settle(()=>f.state.statusModel.state==='success');
  assert.equal(f.enabled,false);
  assert.equal(f.pages.length,0);
  assert.deepEqual(f.calls.map(c=>c[0]),['toolToggle']);
});


for(const missingPage of [false,true])test(`legacy Tool upgrade uses joint review, missing Page ${missingPage}`,async t=>{
  const legacy={...tool,version:'0.1.13'};
  const f=await fixture(t,{installedTool:legacy,missingPage});
  const ids=f.state.detailModel.actions.map(a=>a.id);
  assert.ok(ids.includes('queue-review'),'current PIN release offers joint review for the old installed Tool');
  for(const id of ['update','queue-toggle','queue-disable','queue-remove','queue-page-toggle','queue-page-remove'])
    assert.equal(ids.includes(id),false,'legacy package earns no product management: '+id);
  if(!missingPage)assert.ok(f.state.rowsModel.rows.some(r=>r.key==='page:'+SEND_QUEUE_PIN.pageProgramId),
    'reviewable target must not hide independently installed Page');
  f.state.detailModel.actions.find(a=>a.id==='queue-review').onClick(trusted);
  await settle(()=>f.calls.some(c=>c[0]==='productReview'));
  assert.deepEqual(f.calls.map(c=>c[0]),['productReview']);
  assert.equal(f.calls[0][2].sha256,SEND_QUEUE_PIN.toolPackageSha256);
});

for(const change of [{toolId:'other-tool'},{version:'0.1.16'},{sha256:'0'.repeat(64)}])
  test(`candidate requires exact target release ${Object.keys(change)[0]}`,()=>{
    const entries=composeExtensionEntries({installed:[{...tool,version:'0.1.13'}],pages:[makePage()],
      official:[{...release,...change}],queueToolHash:SEND_QUEUE_PIN.toolPackageSha256});
    const app=entries.find(r=>r.key==='app:'+tool.id);
    assert.equal(app.queueReviewRelease,undefined);
    assert.equal(app.queueProduct,undefined);
    assert.ok(filterExtensionEntries(entries).some(r=>r.kind==='page'));
  });

test('legacy Tool row menu offers joint review without a normal Tool update',async t=>{
  const f=await fixture(t,{installedTool:{...tool,version:'0.1.13'}});
  f.state.onBack();
  f.state.rowsModel.onMore('app:'+tool.id,f.doc.getElementById('extension-center-more'));
  const items=f.state.rowMenuModel.items;
  assert.equal(items.some(a=>a.id==='product'),false);
  assert.equal(items.some(a=>a.id==='update'),false);
  assert.ok(items.some(a=>a.id==='queue-review'));
  items.find(a=>a.id==='queue-review').onClick(trusted);
  await settle(()=>f.calls.some(c=>c[0]==='productReview'));
  assert.deepEqual(f.calls.map(c=>c[0]),['productReview']);
});

for(const installedTool of [{...tool,version:'0.1.13'},tool])
  test(`review eligibility cannot grant installed authority to wrong bytes ${installedTool.version}`,()=>{
    const entries=composeExtensionEntries({installed:[installedTool],pages:[makePage()],official:[release],
      queueToolHash:'0'.repeat(64)});
    const app=entries.find(r=>r.key==='app:'+tool.id);
    assert.equal(app.queueReviewRelease,release);
    assert.equal(app.queueProduct,undefined);
    assert.equal(app.pageCompanion,undefined);
    assert.ok(filterExtensionEntries(entries).some(r=>r.kind==='page'));
  });

test('legacy candidate review requires a trusted click',async t=>{
  const f=await fixture(t,{installedTool:{...tool,version:'0.1.13'},missingPage:true});
  f.state.detailModel.actions.find(a=>a.id==='queue-review').onClick({isTrusted:false});
  assert.equal(f.calls.length,0);
});

test('current pinned Tool with missing Page offers joint recovery without ordinary Tool update',async t=>{
  const f=await fixture(t,{missingPage:true});
  assert.equal(f.state.detailModel.actions.some(a=>a.id==='update'),false);
  f.state.detailModel.actions.find(a=>a.id==='queue-review').onClick(trusted);
  await settle(()=>f.calls.some(c=>c[0]==='productReview'));
  assert.deepEqual(f.calls.map(c=>c[0]),['productReview']);
});

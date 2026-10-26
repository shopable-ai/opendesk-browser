// R6.2 path B extends the R5 driver's native input, HTTP fixtures and readbacks.
// No product API mocks, storage writes, synthetic events or permission grants.
import assert from 'node:assert/strict';
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';

export function marketDiscoveryFixture(url,{channel,release,alternate}){
  if(url.pathname!=='/_r61/declaration.html')return null;
  const fixed=row=>channel.origin+'/install/'+row.id+'/versions/'+row.version+'/';
  const href=fixed(release),mode=url.searchParams.get('case')||'valid';
  const link=value=>'<link rel="opendesk-install" href="'+value+'">';
  const declarations={valid:link(href),missing:'<link rel="opendesk-install">',
    duplicate:link(href)+link(href),'valid-plus-missing':link(href)+'<link rel="opendesk-install">',
    version:link(href.replace('/versions/'+release.version+'/', '/versions/999999.0.0/')),
    origin:link('https://example.invalid/install/'+release.id+'/versions/'+release.version+'/'),
    none:''};
  assert(Object.hasOwn(declarations,mode),'known discovery fixture case');
  return '<!doctype html><meta charset="utf-8"><title>R6.2 ordinary page declaration</title>'+declarations[mode]+
    '<h1>Ordinary webpage; no extension messaging</h1><button id="change-declaration">Change declared app</button>'+
    '<script>document.querySelector("#change-declaration").addEventListener("click",event=>{'+
    'if(!event.isTrusted)return;document.querySelector("link[rel=opendesk-install]")?.setAttribute("href",'+
    JSON.stringify(fixed(alternate))+');document.querySelector("#change-declaration").dataset.trusted="true";});</script>';
}

export async function runMarketDiscoveryAcceptance({d,origin,channel,release,mark,check}){
  const {evaluate,until,click,visible,openTab,activate,readStore,installed,screenshot}=d;
  const side=()=>d.getSide(),host=()=>d.getHost();
  const selector='#extension-center-discover';
  const status='#extension-center-discovery [role="status"]';
  const fixedURL='chrome-extension://'+d.getExtensionId()+'/ui/marketplace.html#/apps/'+release.id+'/versions/'+release.version;
  const targets=async()=>(await d.sendBrowser('Target.getTargets')).targetInfos;
  const marketTargets=async()=>(await targets()).filter(row=>row.url.startsWith('chrome-extension://'+
    d.getExtensionId()+'/ui/marketplace.html')).map(row=>({targetId:row.targetId,url:row.url})).sort((a,b)=>a.targetId.localeCompare(b.targetId));
  const authority=async()=>({registry:await installed(),
    provenance:(await readStore(MARKET_PROVENANCE_STORE,host()))||{},
    operations:(await readStore(MARKET_OPERATIONS_STORE,host()))||{},
    permissions:await evaluate(host(),'chrome.permissions.getAll()')});
  const receipts=d.evidence.r5.pathB={status:'IN_PROGRESS',entry:'ordinary HTTP page → React discovery → trusted fixed detail → existing installer',
    sourceOrigin:origin,release:{id:release.id,version:release.version,sha256:release.sha256},checks:[],
    notTested:['navigation-during-in-flight-discovery','catalog-byte-change-during-review','formal-HTTPS-channel']};
  const receipt=(name,detail)=>receipts.checks.push({name,status:'PASS',...detail});
  await mark('r62-path-b-ordinary-page-discovery');
  const baseline=await authority();
  assert(!baseline.registry.some(row=>row.id===release.toolId),'path B must exercise an actual installation');
  const beforeTargets=await marketTargets();
  await click(side(),'#tab-tools');
  await click(side(),'#extension-center-more');
  await click(side(),'#extension-center-menu [data-ec-kind="all"]');
  await click(side(),'#extension-center-menu [data-ec-scope="available"]');
  await click(side(),'#extension-center-more');
  await visible(side(),selector);
  const page=await openTab(origin+'/_r61/declaration.html?case=valid');
  let currentTarget;
  const waitCurrentTarget=async url=>{
    // These React fields remain mounted under the hidden Develop tab. URL
    // text alone can precede target readiness; use its published exact identity
    // as well. No runtime internals or extra refresh/activation are injected.
    currentTarget=await until(()=>evaluate(side(),`(()=>{
      const url=${JSON.stringify(url)},state=document.querySelector('#script-current-page-status');
      if(state?.dataset.state!=='available'||document.querySelector('#script-current-page-url')?.textContent!==url)return false;
      let target;try{target=JSON.parse(document.querySelector('#script-current-page-debug')?.textContent||'null');}catch{return false;}
      return target?.url===url&&target.origin===new URL(url).origin&&target.frameId===0&&
        Number.isSafeInteger(target.tabId)&&Number.isSafeInteger(target.windowId)&&
        typeof target.documentId==='string'&&target.documentId.length>0?target:false;
    })()`),'path B available current-page identity '+url);
    return currentTarget;
  };
  const waitDiscoveryCleared=async()=>{
    // Resolving/unavailable already clears a pinned discovery. Require the
    // persistent React entry to exist, not a missing node that looks "empty".
    await until(()=>evaluate(side(),`(()=>{
      const result=document.querySelector(${JSON.stringify(status)}),button=document.querySelector(${JSON.stringify(selector)});
      return !!result&&!result.hasAttribute('data-state')&&!!button&&!button.disabled&&
        button.textContent.trim()==='检查网页安装入口';
    })()`),'old discovery cleared after target change');
  };
  const navigate=async mode=>{
    const url=origin+'/_r61/declaration.html?case='+mode;
    await page.send('Page.navigate',{url});
    await until(()=>evaluate(page,'document.readyState==="complete"&&location.href==='+JSON.stringify(url)),'path B fixture '+mode);
    await activate(page);
    await waitCurrentTarget(url);await waitDiscoveryCleared();
    return url;
  };
  const detect=async expected=>{
    await click(side(),selector);
    await until(()=>evaluate(side(),'document.querySelector('+JSON.stringify(status)+')?.dataset.state==='+JSON.stringify(expected)),'React discovery '+expected);
    return evaluate(side(),'document.querySelector('+JSON.stringify(status)+').textContent');
  };
  const unchanged=async()=>{
    assert.deepEqual(await authority(),baseline,'discovery must not change installation authority or Chrome permissions');
    assert.deepEqual(await marketTargets(),beforeTargets,'rejected/stale discovery must not open a trusted detail');
    await d.assertNoFrames();
  };
  for(const [mode,state,code] of [
    ['none','empty',null],['missing','error','E_DISCOVERY_AMBIGUOUS'],
    ['duplicate','error','E_DISCOVERY_AMBIGUOUS'],['valid-plus-missing','error','E_DISCOVERY_AMBIGUOUS'],
    ['version','error','E_DISCOVERY_RELEASE'],['origin','error','E_DISCOVERY_ORIGIN']
  ]){
    const url=await navigate(mode),message=await detect(state);
    if(code)assert(message.includes(code),message);
    await unchanged();
    receipt('reject-'+mode,{url,state,code,message});
  }
  // Change only the owned fixture through a native trusted click. The product
  // must re-read the declaration before opening any trusted application detail.
  const url=await navigate('valid');await detect('found');await unchanged();
  await click(page,'#change-declaration');
  assert.equal(await evaluate(page,'document.querySelector("#change-declaration").dataset.trusted'),'true');
  await click(side(),selector);
  await until(()=>evaluate(side(),'document.querySelector('+JSON.stringify(status)+')?.textContent.includes("E_DISCOVERY_CHANGED")'),'changed declaration rejected on review');
  await unchanged();
  receipt('declaration-change-before-review',{url,code:'E_DISCOVERY_CHANGED'});

  await navigate('valid');await detect('found');
  const targetBeforeSwitch=currentTarget;
  const otherURL=origin+'/_r61/declaration.html?case=none&tab=other';
  const otherPage=await openTab(otherURL);await activate(otherPage);
  const switchedTarget=await waitCurrentTarget(otherURL);
  assert.equal(switchedTarget.windowId,targetBeforeSwitch.windowId,'switch stays in the panel window');
  assert.notEqual(switchedTarget.tabId,targetBeforeSwitch.tabId,'another ordinary tab is active');
  assert.notEqual(switchedTarget.documentId,targetBeforeSwitch.documentId,'another document is selected');
  await waitDiscoveryCleared();await unchanged();
  // This native click must detect the new page as empty, never review the app
  // found in the previous tab. Returning must not resurrect that old result,
  // even though the original document itself remains alive.
  await detect('empty');await unchanged();
  await activate(page);
  const returnedTarget=await waitCurrentTarget(targetBeforeSwitch.url);
  assert.deepEqual(returnedTarget,targetBeforeSwitch,'return selects the original still-live document');
  await waitDiscoveryCleared();await unchanged();
  await detect('found');await unchanged();
  assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:otherPage.targetId})).success,true);
  await unchanged();
  receipt('tab-switch-invalidates-discovery-without-reviving-on-return',{
    previousTarget:targetBeforeSwitch,switchedTarget,returnedTarget,
    otherPageState:'empty',returnedPageAfterExplicitDetection:'found'});

  await navigate('valid');await detect('found');
  const targetBeforeNavigation=currentTarget;
  const documentBefore=await page.send('Page.getFrameTree');
  await navigate('none');
  const documentAfter=await page.send('Page.getFrameTree');
  assert.notEqual(documentAfter.frameTree.frame.loaderId,documentBefore.frameTree.frame.loaderId,'real document navigation');
  assert.equal(currentTarget.tabId,targetBeforeNavigation.tabId,'navigation stays in the same tab');
  assert.notEqual(currentTarget.documentId,targetBeforeNavigation.documentId,'current Target resolves the new document');
  await detect('empty');await unchanged();
  receipt('navigation-invalidates-discovered-document',{targetId:page.targetId,
    previousTarget:targetBeforeNavigation,currentTarget,
    previousLoaderId:documentBefore.frameTree.frame.loaderId,loaderId:documentAfter.frameTree.frame.loaderId});

  await navigate('valid');await detect('found');
  const declaration=await evaluate(page,'({url:location.href,links:[...document.querySelectorAll("link[rel~=opendesk-install]")].map(node=>node.getAttribute("href"))})');
  assert.deepEqual(declaration.links,[channel.origin+'/install/'+release.id+'/versions/'+release.version+'/']);
  const found=await evaluate(side(),'document.querySelector("#extension-center-discovery").innerText');
  assert(found.includes(release.version));assert(found.includes(origin));
  await screenshot(side(),'r62-path-b-react-discovery.png');await unchanged();
  await click(side(),selector);
  const detailTarget=await until(async()=>(await targets()).find(row=>row.url===fixedURL&&
    !beforeTargets.some(before=>before.targetId===row.targetId)),'discovery opens new trusted fixed detail');
  assert.equal((await marketTargets()).length,beforeTargets.length+1);
  const detail=await d.attach(detailTarget.targetId);
  await visible(detail,'#market-root .detail-layout aside .actions button');
  const meta=await evaluate(detail,'({url:location.href,title:document.querySelector("#market-root h1").textContent,'+
    'specs:Object.fromEntries([...document.querySelectorAll(".spec-list dt")].map(e=>[e.textContent,e.nextElementSibling.textContent]))})');
  assert.equal(meta.url,fixedURL);assert.equal(meta.title,release.packageTitle);
  assert.equal(meta.specs['版本'],'v'+release.version);assert.equal(meta.specs['发布者'],'OpenDesk');
  assert.deepEqual(await authority(),baseline,'trusted detail still cannot install automatically');
  receipt('unique-declaration-opens-fixed-trusted-detail',{declaration,sourceTarget:currentTarget,targetId:detailTarget.targetId,...meta});
  await screenshot(detail,'r62-path-b-trusted-detail.png');
  await click(detail,'#market-root .detail-layout aside .actions button');
  await visible(detail,'[data-market-action="confirm-install"]');
  const review=await evaluate(detail,'document.querySelector(".review").innerText');
  assert(review.includes('发行：v'+release.version)&&review.includes('申请能力：'));
  assert.deepEqual(await authority(),baseline,'existing review must wait for explicit install confirmation');
  await screenshot(detail,'r62-path-b-install-review.png');
  await click(detail,'[data-market-action="confirm-install"]');
  const operation=await until(async()=>{
    const rows=(await authority()).operations;
    return Object.entries(rows).find(([key,row])=>!Object.hasOwn(baseline.operations,key)&&
      row.toolId===release.toolId&&row.version===release.version&&row.state==='succeeded');
  },'path B original installer transaction succeeds');
  await until(()=>evaluate(detail,'!document.querySelector(".review")'),'path B original review completes');
  const after=await authority(),tool=after.registry.find(row=>row.id===release.toolId);
  assert.deepEqual(tool,d.packages.get(release.toolId),'read back the exact installed candidate');
  assert.deepEqual(after.registry.filter(row=>row.id!==release.toolId),baseline.registry,'path B preserves other installed tools');
  assert.deepEqual(after.provenance[release.toolId],{marketId:release.id,version:release.version,sha256:release.sha256});
  assert.equal(operation[1].marketId,release.id);assert.equal(operation[1].sha256,release.sha256);
  assert.deepEqual(after.permissions,baseline.permissions,'install cannot silently grant Chrome permissions');
  await d.assertNoFrames();
  receipt('explicit-original-install-and-authority-readback',{operationId:operation[0],operation:operation[1],
    installed:{id:tool.id,version:tool.version},provenance:after.provenance[release.toolId],permissions:after.permissions});
  await screenshot(detail,'r62-path-b-installed.png');
  assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:detail.targetId})).success,true);
  assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:page.targetId})).success,true);
  // Restore the original driver's installed-list scope for its UI cleanup.
  await click(side(),'#extension-center-more');
  await click(side(),'#extension-center-menu [data-ec-scope="smart"]');
  await click(side(),'#extension-center-more');
  await d.uninstall(release.toolId);
  assert.deepEqual(await installed(),baseline.registry,'path B cleanup preserves the restart baseline');
  receipts.status='PASS';check('r62-path-b-react-discovery-fixed-review-real-install',{checks:receipts.checks.length,operationId:operation[0]});
}

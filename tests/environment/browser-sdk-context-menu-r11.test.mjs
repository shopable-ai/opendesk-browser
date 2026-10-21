import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContextMenuHost,formatBrowserMenuTitle} from '../../src/platform/chrome/context-menus.js';
import {sidebarToolPackageHash,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {BROWSER_MENU_ROOT,BROWSER_MENU_GRANTS_STORE,BROWSER_MENU_MATERIALIZED_STORE}
  from '../../src/framework/sdk/browser-contract.js';
import {BROWSER_MENU_LAUNCH_STORE,BROWSER_MENU_SOURCE_PROTOCOL,BROWSER_MENU_SELECTION_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {installReviewedSidebarTool,setInstalledSidebarToolEnabled,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';

const LEGACY_OPEN='opendesk.browser.open';
const toolId='opendesk.tool.selection-notes.capture-selection';
const linkId='opendesk.tool.selection-notes.capture-link';
const locks={request:(_name,work)=>work()};
const sourceFile=new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url);

async function fixture({actions=1,approved=true,chromeAllowed=true,brand={name:'OpenDesk Browser',short_name:'OD'}}={}){
  const tool=JSON.parse(await readFile(sourceFile,'utf8'));
  if(actions>1)tool.contributes.contextMenus.push({
    actionId:'capture-link',title:'OD · 保存链接',contexts:['link'],
    documentUrlPatterns:['https://example.com/*'],handler:'open-self'
  });
  validateSidebarToolPackage(tool);
  const grant={version:tool.version,packageHash:await sidebarToolPackageHash(tool),
    installEpoch:null,origins:['https://example.com'],
    activeActions:tool.contributes.contextMenus.map(row=>row.actionId)};
  const local=new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [BROWSER_MENU_GRANTS_STORE,approved?{[tool.id]:grant}:{}]]);
  const session=new Map(),menus=new Map(),events=[],log=[];
  const write=(map)=>({
    get:async key=>Object.fromEntries((Array.isArray(key)?key:[key])
      .map(name=>[name,map.get(name)])),
    set:async rows=>{for(const [name,value] of Object.entries(rows))map.set(name,structuredClone(value));}
  });
  let permission=chromeAllowed,site=true,failCreate=null;
  let manifest=brand;
  const api={
    runtime:{id:'menu-test',lastError:null,
      getManifest:()=>manifest,getURL:path=>'chrome-extension://menu-test/'+path},
    storage:{local:write(local),session:write(session),
      onChanged:{addListener(){}}},
    permissions:{contains:async request=>
      request.permissions?permission:request.origins?site:false},
    contextMenus:{
      onClicked:{addListener(fn){events.push(fn);}},
      create(item,cb){
        log.push(['create',item.id]);
        if(failCreate===item.id){
          failCreate=null;return chromeError('simulated create error',cb);
        }
        if(menus.has(item.id))return chromeError('duplicate id',cb);
        menus.set(item.id,structuredClone(item));cb();
      },
      update(id,properties,cb){
        log.push(['update',id]);
        if(!menus.has(id))return chromeError('Cannot find menu item',cb);
        menus.set(id,{...menus.get(id),...properties});cb();
      },
      remove(id,cb){
        log.push(['remove',id]);
        if(!menus.has(id))return chromeError('Cannot find menu item',cb);
        const deleteTree=key=>{
          for(const [child,value] of menus)
            if(value.parentId===key)deleteTree(child);
          menus.delete(key);
        };
        deleteTree(id);cb();
      },
      removeAll(){throw Error('removeAll() is forbidden');}
    },
    sidePanel:{open(){return Promise.resolve();}},
    webNavigation:{getFrame:async()=>null}
  };
  function chromeError(message,callback){
    api.runtime.lastError={message};
    callback();
    api.runtime.lastError=null;
  }
  function host(){return createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});}
  return {api,host,tool,grant,local,session,menus,events,log,
    setPermission(value){permission=value;},
    setSite(value){site=value;},
    failNextCreate(id){failCreate=id;},
    setManifest(value){manifest=value;}};
}

const instance='01234567-89ab-4def-8123-456789abcdef';
const hostSender={id:'menu-test',frameId:0,documentId:'host-document',documentLifecycle:'active',
  url:'chrome-extension://menu-test/sidepanel.html?hostInstanceId='+instance};
const menuStatus=(f,host,origin='https://example.com')=>host.handleHost({
  operation:'browser.contextMenu.getStatus',toolId:f.tool.id,hostInstanceId:instance,origin},hostSender);
const menuCall=async(f,host,operation,args={})=>host.handleTool({operation,args,
  toolId:f.tool.id,toolVersion:f.tool.version,packageHash:await sidebarToolPackageHash(f.tool),
  installEpoch:f.local.get(TOOL_REVOCATION_EPOCHS_STORE)?.[f.tool.id]??null,
  toolInstance:instance,hostInstanceId:instance},hostSender);

test('rich selection is fetched only after a verified native click and consumed with the same ticket',async()=>{
  for(const warm of [false,true]){
    const f=await fixture(),host=f.host(),url='https://example.com/post';
    const snapshotId=crypto.randomUUID().replaceAll('-',''),calls=[];
    f.api.webNavigation.getFrame=async()=>({url,documentId:'source-doc',documentLifecycle:'active'});
    f.api.tabs={sendMessage:async(...args)=>{calls.push(args);return {snapshotId,markdown:'## Heading\n\n- First\n  - Nested\n'};}};
    if(warm)await host.synchronize();
    assert.equal(host.receiveSourceContext({protocol:BROWSER_MENU_SOURCE_PROTOCOL,kind:'contextmenu',snapshotId},
      {id:'menu-test',tab:{id:9},frameId:0,documentId:'source-doc',url}),true);
    assert.equal(calls.length,0,'source proof never sends page content');
    host.onClicked({menuItemId:toolId,pageUrl:url,frameId:0,selectionText:'Heading First Nested'},
      {id:9,windowId:2,url,incognito:false});
    await host.synchronize();
    assert.deepEqual(calls,[[9,{protocol:BROWSER_MENU_SELECTION_PROTOCOL,snapshotId,url,selection:'Heading First Nested'},
      {frameId:0,documentId:'source-doc'}]]);
    const row=f.session.get(BROWSER_MENU_LAUNCH_STORE)[f.tool.id];
    await host.handleHost({operation:'browser.launch.bind',toolId:f.tool.id,launchId:row.ticketId,
      toolInstance:instance,hostInstanceId:instance},hostSender);
    const result=await menuCall(f,host,'browser.launch.consume');
    assert.equal(result.selectionMarkdown,'## Heading\n\n- First\n  - Nested\n');
    assert.equal(result.selection,'Heading First Nested','existing text consumers keep their field');
    assert.equal(f.session.get(BROWSER_MENU_LAUNCH_STORE)[f.tool.id].selectionMarkdown,null);
    await assert.rejects(menuCall(f,host,'browser.launch.consume'),{code:'E_LAUNCH_EXPIRED'});
  }
});

test('rich selection rejects stale documents, revocation and unbounded or mismatched replies',async()=>{
  for(const mode of ['navigate','revoke','permission','wrong-snapshot','oversize','missing']){
    const f=await fixture(),host=f.host(),url='https://example.com/post';
    const snapshotId=crypto.randomUUID().replaceAll('-','');let documentId='source-doc';
    f.api.webNavigation.getFrame=async()=>({url,documentId});
    f.api.tabs={sendMessage:async()=>{
      if(mode==='navigate')documentId='new-doc';
      if(mode==='revoke')f.local.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'revoked'});
      if(mode==='permission')f.setPermission(false);
      if(mode==='missing')throw Error('old content script');
      return {snapshotId:mode==='wrong-snapshot'?'wrong':snapshotId,
        markdown:mode==='oversize'?'x'.repeat(16385):'## Selected\n'};
    }};
    await host.synchronize();
    host.receiveSourceContext({protocol:BROWSER_MENU_SOURCE_PROTOCOL,kind:'contextmenu',snapshotId},
      {id:'menu-test',tab:{id:9},frameId:0,documentId:'source-doc',url});
    host.onClicked({menuItemId:toolId,pageUrl:url,frameId:0,selectionText:'Selected'},
      {id:9,windowId:2,url,incognito:false});
    await host.synchronize();
    const row=f.session.get(BROWSER_MENU_LAUNCH_STORE)?.[f.tool.id];
    if(['navigate','revoke','permission'].includes(mode))assert.equal(row,undefined,mode);
    else{assert.equal(row.selectionMarkdown,null,mode);assert.equal(row.selection,'Selected');}
  }
});

test('legacy positive menu grants reuse installation approval on other declared sites',async()=>{
  const f=await fixture();
  f.tool.contributes.contextMenus[0].documentUrlPatterns=['https://*/*'];
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:{...f.grant,packageHash:await sidebarToolPackageHash(f.tool)}});
  const host=f.host();
  assert.equal((await menuStatus(f,host,'https://another.example')).siteEnabled,true);
  assert.equal((await menuStatus(f,host,'http://another.example')).siteEnabled,false);
  assert.equal(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].defaults,undefined,
    'normal use does not rewrite old or sensitive grant data');
});

test('default menu declarations cover non-default ports while explicit stops remain exact Origins',async()=>{
  const f=await fixture({approved:false}),host=f.host();
  const origin='https://example.com:8443',url=origin+'/post';
  assert.equal((await menuStatus(f,host,origin)).siteEnabled,true);
  f.api.webNavigation.getFrame=async()=>({url,documentId:'source-doc',documentLifecycle:'active'});
  await host.handleHost({operation:'browser.contextMenu.userToggle',toolId:f.tool.id,
    hostInstanceId:instance,origin,enabled:false,document:{tabId:9,documentId:'source-doc',url}},hostSender);
  assert.equal((await menuStatus(f,host,origin)).siteEnabled,false);
  assert.equal((await menuStatus(f,host,'https://example.com')).siteEnabled,true);
  assert.equal((await menuStatus(f,host,'https://example.com:9443')).siteEnabled,true);
});

test('non-default port clicks retain source proof before and after menu synchronization',async()=>{
  for(const warm of [false,true]){
    const f=await fixture({approved:false}),host=f.host();
    const url='https://example.com:8443/post';
    f.api.webNavigation.getFrame=async()=>({url,documentId:'port-doc',documentLifecycle:'active'});
    if(warm)await host.synchronize();
    assert.equal(host.receiveSourceContext({protocol:BROWSER_MENU_SOURCE_PROTOCOL,kind:'contextmenu'},
      {id:'menu-test',tab:{id:9},frameId:0,documentId:'port-doc',url}),true);
    host.onClicked({menuItemId:toolId,pageUrl:url,frameId:0,selectionText:'port selection'},
      {id:9,windowId:2,url,incognito:false});
    await host.synchronize();
    assert.equal(f.session.get(BROWSER_MENU_LAUNCH_STORE)?.[f.tool.id]?.selection,'port selection',
      warm?'synchronized menus retain default scope':'cold start retains default scope');
  }
});

test('installed declarations serve status, cold-start click, one-use selection and register without a second grant',async()=>{
  const f=await fixture({approved:false}),host=f.host();
  const state=await menuStatus(f,host);
  assert.equal(state.enabled,true);assert.equal(state.siteEnabled,true);
  assert.deepEqual(state.activeActions,['capture-selection']);
  const url='https://example.com/post';
  f.api.webNavigation.getFrame=async()=>({url,documentId:'source-doc',documentLifecycle:'active'});
  assert.equal(host.receiveSourceContext({protocol:BROWSER_MENU_SOURCE_PROTOCOL,kind:'contextmenu'},
    {id:'menu-test',tab:{id:9,incognito:false},frameId:0,documentId:'source-doc',url}),true);
  host.onClicked({menuItemId:toolId,pageUrl:url,frameId:0,selectionText:'installed selection'},
    {id:9,windowId:2,url,incognito:false});
  await host.synchronize();
  const ticket=f.session.get(BROWSER_MENU_LAUNCH_STORE)[f.tool.id];
  assert.equal(ticket.selection,'installed selection');
  await host.handleHost({operation:'browser.launch.bind',toolId:f.tool.id,launchId:ticket.ticketId,
    toolInstance:instance,hostInstanceId:instance},hostSender);
  assert.equal((await menuCall(f,host,'browser.launch.consume')).selection,'installed selection');
  await assert.rejects(menuCall(f,host,'browser.launch.consume'),{code:'E_LAUNCH_EXPIRED'});
  assert.deepEqual(await menuCall(f,host,'browser.contextMenu.register',{actionIds:['capture-selection']}),
    {registered:true,actionIds:['capture-selection']});
  const oldHash=await sidebarToolPackageHash(f.tool);
  f.local.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-install-epoch'});
  await assert.rejects(host.handleTool({operation:'browser.contextMenu.getStatus',args:{},toolId:f.tool.id,
    toolVersion:f.tool.version,packageHash:oldHash,installEpoch:null,toolInstance:instance,hostInstanceId:instance},hostSender),
    {code:'E_TOOL_CHANGED'});
});

test('wildcard declarations default to available; exact site closure and unregister preserve sensitive sibling grants',async()=>{
  const f=await fixture({approved:false});
  f.tool.contributes.contextMenus[0].documentUrlPatterns=['http://*/*','https://*/*'];
  const sensitive={version:f.tool.version,packageHash:await sidebarToolPackageHash(f.tool),installEpoch:null,
    cookieSites:{'https://example.com':{read:true,grantEpoch:'cookie-epoch'}},bookmarkFull:true};
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:structuredClone(sensitive),peer:{bookmarkFull:false}});
  const host=f.host();await host.synchronize();
  assert.deepEqual(f.menus.get(toolId).documentUrlPatterns,['http://*/*','https://*/*']);
  assert.equal((await menuStatus(f,host,'https://other.example')).siteEnabled,true);
  f.api.webNavigation.getFrame=async()=>({url:'https://example.com/post',documentId:'doc'});
  await host.handleHost({operation:'browser.contextMenu.userToggle',toolId:f.tool.id,enabled:false,
    origin:'https://example.com',document:{tabId:1,url:'https://example.com/post',documentId:'doc'},hostInstanceId:instance},hostSender);
  assert.equal((await menuStatus(f,host)).siteEnabled,false);
  assert.equal((await menuStatus(f,host,'https://example.com:8443')).siteEnabled,true,'site exclusion retains its exact port');
  assert.deepEqual((await menuStatus(f,host)).disabledOrigins,['https://example.com']);
  await menuCall(f,host,'browser.contextMenu.unregister');
  assert.equal((await menuStatus(f,host,'https://other.example')).enabled,false);
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].contextMenu.activeActions,[]);
  const {contextMenu,...remaining}=f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id];
  assert.deepEqual(remaining,sensitive);assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE).peer,{bookmarkFull:false});
  await host.revokePermission();
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].contextMenu,contextMenu);
  f.setPermission(false);assert.equal((await menuStatus(f,host)).siteEnabled,false);
});

test('a Chrome hostname menu never authorizes a different exact port at cold start',async()=>{
  const f=await fixture();
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:{...f.grant,defaults:false,origins:['http://127.0.0.1:43111']}});
  const host=f.host();
  assert.equal((await menuStatus(f,host,'http://127.0.0.1:43111')).siteEnabled,true);
  assert.equal((await menuStatus(f,host,'http://127.0.0.1:43112')).siteEnabled,false);
  const url='http://127.0.0.1:43112/post';
  f.api.webNavigation.getFrame=async()=>({url,documentId:'port-doc'});
  host.receiveSourceContext({protocol:BROWSER_MENU_SOURCE_PROTOCOL,kind:'contextmenu'},
    {id:'menu-test',tab:{id:9},frameId:0,documentId:'port-doc',url});
  host.onClicked({menuItemId:toolId,pageUrl:url,frameId:0,selectionText:'must not escape'},
    {id:9,windowId:2,url,incognito:false});
  await host.synchronize();
  assert.equal(f.session.get(BROWSER_MENU_LAUNCH_STORE)?.[f.tool.id],undefined);
});

test('reviewed upgrades preserve closed menus and sensitive grant identities without another enable',async()=>{
  for(const closed of [false,true]){
    const f=await fixture({approved:false}),host=f.host();
    const sensitive={version:f.tool.version,packageHash:await sidebarToolPackageHash(f.tool),installEpoch:null,
      cookieSites:{'https://example.com':{read:true}},bookmarkFull:true};
    f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:sensitive});
    if(closed)await menuCall(f,host,'browser.contextMenu.unregister');
    const candidate=structuredClone(f.tool);candidate.version='1.0.1';
    await installReviewedSidebarTool({api:f.api,lockManager:locks,candidate,baseline:f.tool,reviewApproved:true});
    const status=await menuStatus(f,host);
    assert.equal(status.enabled,!closed);assert.equal(status.siteEnabled,!closed);
    const {contextMenu,...remaining}=f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id];
    assert.deepEqual(remaining,sensitive,'upgrade must not rebind sensitive authority to the new package');
    if(closed){
      assert.equal(contextMenu.version,candidate.version);
      assert.equal(contextMenu.packageHash,await sidebarToolPackageHash(candidate));
      await setInstalledSidebarToolEnabled({api:f.api,lockManager:locks,tool:candidate,enabled:false});
      await setInstalledSidebarToolEnabled({api:f.api,lockManager:locks,tool:candidate,enabled:true});
      assert.equal((await menuStatus(f,host)).enabled,false,'resume preserves explicit unregister');
    }
    await assert.rejects(menuCall(f,host,'browser.contextMenu.getStatus'),{code:'E_TOOL_CHANGED'});
  }
});

test('upgrade cancellation and failed registry commit leave menu preferences untouched',async()=>{
  const f=await fixture(),host=f.host();await menuCall(f,host,'browser.contextMenu.unregister');
  const before=structuredClone(f.local.get(BROWSER_MENU_GRANTS_STORE));
  const candidate=structuredClone(f.tool);candidate.version='1.0.1';
  assert.equal((await installReviewedSidebarTool({api:f.api,lockManager:locks,candidate,baseline:f.tool,
    reviewApproved:true,approveUpdate:()=>false})).state,'cancelled');
  const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE))throw Error('registry write failed');return set(rows);};
  await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:locks,candidate,baseline:f.tool,reviewApproved:true}));
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE),before);
  assert.equal((await menuStatus(f,host)).enabled,false);
});

test('interrupted menu preference migration preserves disabled actions with atomic generation',async()=>{
  for(const committed of [false,true]){
    const f=await fixture({actions:2}),host=f.host();
    await menuCall(f,host,'browser.contextMenu.register',{actionIds:['capture-selection']});
    const candidate=structuredClone(f.tool);candidate.version='1.0.1';
    const beforeGrants=structuredClone(f.local.get(BROWSER_MENU_GRANTS_STORE));
    const beforeEpochs=structuredClone(f.local.get(TOOL_REVOCATION_EPOCHS_STORE));
    const set=f.api.storage.local.set;let attempts=0;
    f.api.storage.local.set=async rows=>{
      if(Object.hasOwn(rows,BROWSER_MENU_GRANTS_STORE)){
        attempts++;
        assert.ok(Object.hasOwn(rows,SIDEBAR_TOOL_STORE),'menu preferences share the package commit');
        assert.ok(Object.hasOwn(rows,TOOL_REVOCATION_EPOCHS_STORE),'generation is present in the first registry commit');
        if(committed)await set(rows);
        throw Error(committed?'menu commit acknowledgement lost':'menu preference write refused');
      }
      return set(rows);
    };
    await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:locks,candidate,baseline:f.tool,
      reviewApproved:true}),{code:committed?'E_OUTCOME_UNKNOWN':'E_HOST_STORAGE_WRITE'});
    if(committed){
      assert.deepEqual(f.local.get(SIDEBAR_TOOL_STORE),[candidate]);
      const epoch=f.local.get(TOOL_REVOCATION_EPOCHS_STORE)[f.tool.id];
      assert.equal(typeof epoch,'string');assert.ok(epoch);
      assert.notEqual(epoch,beforeEpochs?.[f.tool.id]);
      const menu=f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].contextMenu;
      assert.equal(menu.installEpoch,epoch);assert.equal(menu.packageHash,await sidebarToolPackageHash(candidate));
      await assert.rejects(menuCall(f,host,'browser.contextMenu.getStatus'),{code:'E_TOOL_CHANGED'});
    }else{
      assert.deepEqual(f.local.get(SIDEBAR_TOOL_STORE),[f.tool]);
      assert.deepEqual(f.local.get(TOOL_REVOCATION_EPOCHS_STORE),beforeEpochs);
      assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE),beforeGrants);
    }
    const restarted=f.host();
    assert.deepEqual((await menuStatus(f,restarted)).activeActions,['capture-selection']);
    await restarted.synchronize();
    assert.equal(f.menus.has(toolId),true);assert.equal(f.menus.has(linkId),false);
    assert.equal(attempts,1,'a failed or unacknowledged commit is not replayed');
  }
});

test('R1.1 zero/one native entries: no permanent root, optional permission and top-level branding',async()=>{
  const f=await fixture({approved:false}),host=f.host();
  assert.equal((await host.synchronize()).enabled,true);
  assert.equal(f.menus.size,1,'reviewed installed contributions need no second grant');
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[toolId]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:f.grant});
  await host.synchronize();
  assert.equal(f.menus.size,1);
  const item=f.menus.get(toolId);
  assert(item);
  assert(!Object.hasOwn(item,'parentId'));
  assert.equal(item.title,'OD · 保存到选区笔记');
  assert.deepEqual(item.contexts,['selection']);
  assert.deepEqual(item.documentUrlPatterns,f.tool.contributes.contextMenus[0].documentUrlPatterns,
    'a legacy approval does not add a second allowlist to the installed declarations');
  assert(!f.menus.has(BROWSER_MENU_ROOT));
  assert(!f.menus.has(LEGACY_OPEN));
  assert.equal((await host.synchronize()).count,1);
  assert.equal(f.menus.size,1);
  await f.host().synchronize(); // New MV3 worker sees existing IDs.
  assert.equal(f.menus.size,1);
  const denied=await fixture({chromeAllowed:false});
  assert.equal((await denied.host().synchronize()).enabled,false);
  assert.equal(denied.menus.size,0);
});

test('R1.1 multiple matching actions are flat and preserve distinct Chrome contexts',async()=>{
  const f=await fixture({actions:2});
  await f.host().synchronize();
  assert.equal(f.menus.size,2);
  assert.deepEqual([...f.menus.values()].map(item=>item.contexts),[['selection'],['link']]);
  assert([...f.menus.values()].every(item=>!Object.hasOwn(item,'parentId')));
  assert.equal(f.menus.get(linkId).title,'OD · 保存链接');
  // The actual native collapse/uncollapse is Chromium UI behavior,
  // deliberately NOT inferred from this Map fixture.
});

test('R1.1 upgrades old explicit root by cascading children before recreating flat IDs',async()=>{
  const f=await fixture();
  f.menus.set(BROWSER_MENU_ROOT,{id:BROWSER_MENU_ROOT,title:'Old OpenDesk',contexts:['page']});
  f.menus.set(LEGACY_OPEN,{id:LEGACY_OPEN,parentId:BROWSER_MENU_ROOT,title:'Open'});
  f.menus.set(toolId,{id:toolId,parentId:BROWSER_MENU_ROOT,title:'legacy action'});
  f.menus.set('trusted.unrelated',{id:'trusted.unrelated',title:'Keep me'});
  f.local.set(BROWSER_MENU_MATERIALIZED_STORE,[BROWSER_MENU_ROOT,LEGACY_OPEN,toolId]);
  await f.host().synchronize();
  assert(!f.menus.has(BROWSER_MENU_ROOT));
  assert(!f.menus.has(LEGACY_OPEN));
  assert(!Object.hasOwn(f.menus.get(toolId),'parentId'));
  assert(f.menus.has('trusted.unrelated'),'foreign trusted menu must not be deleted');
  assert(f.log.findIndex(([op,id])=>op==='remove'&&id===BROWSER_MENU_ROOT)<
    f.log.findIndex(([op,id])=>op==='create'&&id===toolId));
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[toolId]);
  await f.host().synchronize();
  assert(!Object.hasOwn(f.menus.get(toolId),'parentId'));
  assert(f.menus.has('trusted.unrelated'));
});

test('R1.1 failed partial create journals native IDs; uninstall and SW restart clean orphan',async()=>{
  const f=await fixture({actions:2}),host=f.host();
  f.failNextCreate(linkId);
  await assert.rejects(host.synchronize(),{code:'E_CHROME'});
  const journal=f.local.get(BROWSER_MENU_MATERIALIZED_STORE);
  assert.deepEqual(journal,{phase:'reconciling',ids:[toolId,linkId]});
  assert(f.menus.has(toolId));
  assert(!f.menus.has(linkId));
  f.local.set(SIDEBAR_TOOL_STORE,[]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{});
  const restarted=f.host();
  assert.deepEqual(await restarted.synchronize(),{enabled:true,count:0});
  assert.equal(f.menus.size,0,'orphan must not persist after uninstall');
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[]);
  await restarted.synchronize();
  assert.equal(f.menus.size,0);
});

test('Chrome website access gates menus; a new install epoch uses declarations and explicit unregister stays closed',async()=>{
  const f=await fixture(),host=f.host();
  await host.synchronize();
  f.setSite(false);
  await host.synchronize();
  assert.equal(f.menus.size,0);
  f.setSite(true);
  await host.synchronize();
  assert.equal(f.menus.size,1);
  f.local.set('opendesk.sidebar-tools.revocation-epochs.v1',{[f.tool.id]:'epoch-2'});
  await host.synchronize();
  assert.equal(f.menus.size,1,'the new install can materialize its reviewed declarations');
  f.local.delete('opendesk.sidebar-tools.revocation-epochs.v1');
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:{...f.grant,activeActions:[]}});
  await host.synchronize();
  assert.equal(f.menus.size,0);
});

test('R1.1 manifest short_name is display-only, sanitized and never changes native IDs',async()=>{
  assert.equal(formatBrowserMenuTitle('OD · OD · 保存',{name:'Full Product',short_name:'OD'}),'OD · 保存');
  assert.equal(formatBrowserMenuTitle('保存',{name:'Full Product'}),'Full Product · 保存');
  assert.equal(formatBrowserMenuTitle('OD · \u202e恶意\n文字',{name:'OpenDesk Browser',short_name:'OD'}),'OD · 恶意 文字');
  assert.equal(formatBrowserMenuTitle('保存',{name:'New Product',short_name:'\u202eBAD'}),'New Product · 保存');
  assert.equal(formatBrowserMenuTitle('保存',{short_name:'A'.repeat(40)}),'保存');
  assert([...formatBrowserMenuTitle('X'.repeat(300),{short_name:'OD'})].length<=85);
  const f=await fixture(),host=f.host();
  await host.synchronize();
  f.setManifest({name:'New Product',short_name:'NP'});
  await host.synchronize();
  assert.equal(f.menus.get(toolId).title,'NP · 保存到选区笔记');
  assert.deepEqual([...f.menus.keys()],[toolId]);
});


test('R1.1 different tools share native grouping only when they have independent grants',async()=>{
  const f=await fixture(),first=f.tool;
  const second=structuredClone(first);
  second.id='second-notes';
  second.title='另一工具';
  second.contributes.contextMenus[0].title='保存到另一工具';
  validateSidebarToolPackage(second);
  const secondGrant={...f.grant,packageHash:await sidebarToolPackageHash(second)};
  f.local.set(SIDEBAR_TOOL_STORE,[first,second]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{
    [first.id]:f.grant,[second.id]:secondGrant
  });
  const secondId='opendesk.tool.second-notes.capture-selection';
  const host=f.host();
  assert.equal((await host.synchronize()).count,2);
  assert.deepEqual([...f.menus.keys()].sort(),[toolId,secondId].sort());
  assert([...f.menus.values()].every(item=>!item.parentId));
  // Only revoke one tool's action grant: neither the other tool's grant nor
  // its native menu may be deleted.
  f.local.set(BROWSER_MENU_GRANTS_STORE,{
    [first.id]:{...f.grant,activeActions:[]},[second.id]:secondGrant
  });
  assert.equal((await host.synchronize()).count,1);
  assert.deepEqual([...f.menus.keys()],[secondId]);
});

test('R1.1 native hostname match cannot express port, but grants retain exact origin',async()=>{
  const f=await fixture();
  f.tool.contributes.contextMenus[0].documentUrlPatterns=['http://127.0.0.1/*'];
  const grant={...f.grant,packageHash:await sidebarToolPackageHash(f.tool),defaults:false,origins:['http://127.0.0.1:43111']};
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:grant});
  const host=f.host();
  await host.synchronize();
  const row=f.menus.get(toolId);
  assert(row);
  assert.deepEqual(row.documentUrlPatterns,['http://127.0.0.1/*']);
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].origins,
    ['http://127.0.0.1:43111']);
  // A second port may still SHOW this native entry; it must not be treated
  // as an approved Origin or permission by the Host click verifier.
  const f2=await fixture({approved:false});
  const h2=f2.host();
  await h2.synchronize();
  assert.equal(f2.menus.size,1,'installed declared origin is sufficient without an extra site grant');
});


test('R1.6 explicit restricted menu preferences project exact Origins within declared templates',async()=>{
 const f=await fixture();
 f.tool.contributes.contextMenus[0].documentUrlPatterns=['http://*/*','https://*/*'];
 validateSidebarToolPackage(f.tool);
 f.grant.packageHash=await sidebarToolPackageHash(f.tool);
 f.local.set(SIDEBAR_TOOL_STORE,[f.tool]);
 f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:{...f.grant,defaults:false}});
 const host=f.host();
 await host.synchronize();
 const id='opendesk.tool.selection-notes.capture-selection';
 assert.deepEqual(f.menus.get(id)?.documentUrlPatterns,['https://example.com/*'],
  'do not install a global native all-site menu from a wildcard package template');
 const invalid=structuredClone(f.tool);
 invalid.contributes.contextMenus[0].documentUrlPatterns=['https://*.*/*'];
 assert.throws(()=>validateSidebarToolPackage(invalid),{code:'E_TOOL_SCHEMA'});
 f.setSite(false);
 await host.synchronize();
 assert.equal(f.menus.size,0,'revoked Chrome website access must remove projected native entries');
});

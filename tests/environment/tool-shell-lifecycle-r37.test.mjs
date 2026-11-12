import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

const entry=new URL('../../src/ui/tool-shell.js',import.meta.url).pathname;
const source=await readFile(entry,'utf8');
const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(([,names,path])=>[path,names.split(',').map(x=>x.trim())]));
const bundled=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'ToolShell',platform:'browser',plugins:[{name:'lifecycle-dependencies',setup(b){
  b.onResolve({filter:/.*/},args=>imports.has(args.path)?{path:args.path,namespace:'lifecycle-dependencies'}:null);
  b.onLoad({filter:/.*/,namespace:'lifecycle-dependencies'},args=>({contents:imports.get(args.path).map(name=>`export const ${name}=globalThis.dependencies[${JSON.stringify(name)}];`).join('\n'),loader:'js'}));
}}]});
const deferred=()=>{let resolve;return {promise:new Promise(ok=>{resolve=ok;}),resolve:value=>resolve(value)};};
const tick=()=>new Promise(ok=>setImmediate(ok));
const eventBus=()=>{const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)};};
function fixture({surface='panel',pendingMenu=false,lateAck=false,dependencyOverrides={}}={}){
  const tab=deferred(),context=deferred(),ready=deferred(),preview=deferred(),menu=deferred(),ack=deferred(),calls=[];
  const disposable=()=>({dispose(){},resourceSnapshot:()=>({subscriptions:0})});
  const toolView=createSidebarToolsView();
  const actions={},view={actions,field:()=>({}),setText(){},action:f=>f,dispose(){}};
  const tools={...disposable(),ready:ready.promise,setVisible:()=>true,isDirty:()=>false,
    openTool:(_id,options)=>{calls.push('openTool');options?.launchGate?.then(()=>calls.push('gate-open'),()=>calls.push('gate-reject'));return 'tool-instance';},
    openReadOnlyPreview:()=>calls.push('preview')};
  let toolsVisibility,shellOptions,panelNavigation;
  const task={...disposable(),navigate:destination=>{toolsVisibility?.(destination==='tools',destination);return true;},
    connectToolsView:listener=>{toolsVisibility=listener;},showCatalogPage:()=>calls.push('catalog')};
  const dependencies={};
  for(const names of imports.values())for(const name of names)dependencies[name]=()=>disposable();
  Object.assign(dependencies,{
    createCurrentPageTarget:()=>({...disposable(),snapshot:{windowId:1}}),
    createDeveloperView:()=>view,createMyWorkbenchView:()=>view,createSidebarToolsView:()=>toolView,
    createScriptEditor:()=>({...disposable(),host:{},connectLocalProjects(){}}),
    createSidebarTabMemory:()=>({...disposable(),record(){},restore:async()=>calls.push('restore')}),
    mountSidebarApp:(_document,options)=>{shellOptions=options;return {...disposable(),renderNavigation(){},connectWorkflowPage(){},connectMyAgent(){}};},
    MARKET_PANEL_NAV_PROTOCOL:'opendesk.market.panel-navigation.v1',
    UPDATE_NOTICE_PROTOCOL:'opendesk.update-notice.v1',
    createSidebarTools:()=>tools,isActualSidePanelContext:()=>context.promise,
    createMarketPanelNavigationReceiver:options=>{panelNavigation=options;return {...disposable(),start(){}};},
    createPanelToolIntentReceiver:()=>({...disposable(),start(){}}),
    requestedToolId:()=>surface==='tool'||surface==='app'?'quick-notes':null,
    APP_DOCUMENT_PATHNAME:'/app.html',
    createExtensionCenter:()=>{
      calls.push('extension-center');
      if(surface==='app')throw new Error('E_REACT_LIST_OWNERSHIP');
      return {refresh:()=>calls.push('extension-refresh'),dispose:()=>calls.push('extension-dispose')};
    },
    requestedPreviewId:()=>surface==='preview'?'preview-r37':null,
    validatePreviewSession:row=>{if(!row)throw new Error('expired preview');return row;},previewStorageKey:()=> 'preview-key',
    BROWSER_MENU_LAUNCH_STORE:'menu-key'
  });
  const api={tabs:{getCurrent:()=>tab.promise},windows:{getCurrent:async()=>({id:1})},
    runtime:{onMessage:eventBus(),sendMessage:async()=>{calls.push('send');return lateAck?ack.promise:{ok:true};}},
    storage:{local:{},onChanged:eventBus(),session:{get:async key=>{
      calls.push('session-read');return key==='preview-key'?preview.promise:pendingMenu?menu.promise:{};
    },remove:async()=>calls.push('preview-remove')}}};
  const window=new EventTarget();
  const sandbox={dependencies,window,chrome:api,URL,console,crypto:globalThis.crypto,
    location:{href:`chrome-extension://r37/${surface==='app'?'app':'sidepanel'}.html?hostInstanceId=00000000-0000-4000-8000-000000000001${surface==='preview'?'&previewId=preview-r37':''}`},
    __opendeskAppPageBound:surface==='app',
    document:{documentElement:{dataset:{}}},__opendeskTrustedHistoryUI:{
      create:()=>{calls.push('history');return disposable();},
      createTaskWorkbench:()=>task,createScheduledTaskWorkbench:()=>({...disposable(),shown:false}),
      createScheduledTaskHost:()=>{calls.push('schedule');return disposable();},
      createCloudHosting:()=>{calls.push('cloud');return disposable();}
    }};
  Object.assign(dependencies,dependencyOverrides);
  vm.createContext(sandbox);vm.runInContext(bundled.outputFiles[0].text,sandbox);
  sandbox.ToolShell.initToolShell();
  return {tab,context,ready,preview,menu,ack,calls,api,toolView,tools,dependencies,
    receiveNavigation:request=>panelNavigation.onNavigate(request),navigateTools:()=>task.navigate('tools'),
    reviewUpdate:row=>shellOptions.onOpenUpdateReview(row),
    close:()=>window.dispatchEvent(new Event('pagehide'))};
}
test('PC ignored update sends the exact candidate and succeeds only after review acceptance',async()=>{
  const f=fixture({surface:'app'}),messages=[];
  const protocol='opendesk.market.panel-navigation.v1';
  let reply={ok:true,protocol,status:'NAVIGATION_PENDING'};
  f.api.runtime.sendMessage=message=>{messages.push(message);return Promise.resolve(reply);};
  const row={kind:'sidebar-tool',status:'available',id:'quick-notes',version:'1.2.3',
    source:'opendesk/quick-notes',sha256:'a'.repeat(64),ignoredAt:123};
  const pending=f.reviewUpdate(row);
  assert.equal(messages.length,1,'send from the original click stack');
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])),{protocol,action:'NAVIGATE',target:'review',
    toolId:row.id,version:row.version,marketId:row.source,sha256:row.sha256});
  assert.equal(await pending,false,'opening a panel is not review acceptance');
  reply={ok:true,protocol,status:'REVIEW_REQUEST_ACCEPTED'};assert.equal(await f.reviewUpdate(row),true);
  for(const invalid of [
    {ok:true,protocol,status:'IDENTITY_CHANGED'},
    {ok:false,protocol,status:'REVIEW_REQUEST_ACCEPTED'},
    {ok:true,protocol:'other',status:'REVIEW_REQUEST_ACCEPTED'},
    undefined
  ]){reply=invalid;assert.equal(await f.reviewUpdate(row),false);}
  const before=messages.length;
  f.close();assert.equal(f.reviewUpdate(row),false,'closed owner cannot navigate');
  assert.equal(messages.length,before,'closed owner sends no navigation');
});
const ignoredUpdate=()=>({kind:'sidebar-tool',status:'available',id:'quick-notes',
  fromVersion:'1.2.2',version:'1.2.3',source:'opendesk/quick-notes',sha256:'a'.repeat(64),
  ignoredAt:123,requiresReview:true,newCapabilities:[]});
function updateReviewFixture(){
  const row=ignoredUpdate(),messages=[],reviews=[],catalogReads=[];
  let proof={ok:true,data:{verified:true,records:[{...row}]}},
    apps=[{id:row.source,toolId:row.id,version:row.version,sha256:row.sha256}],accepted=true;
  const f=fixture({dependencyOverrides:{
    loadOfficialCatalog:async()=>{catalogReads.push(true);return {apps};},
    verifyMarketPanelNavigationSource:async()=>true
  }});
  f.api.runtime.sendMessage=async message=>{messages.push(message);return proof;};
  f.tools.canPresentMarketReview=()=>true;
  f.tools.openOfficialReview=(id,candidate)=>{reviews.push({id,candidate});return accepted;};
  return {...f,row,messages,reviews,catalogReads,
    setProof:value=>{proof=value;},setApps:value=>{apps=value;},
    setAccepted:value=>{accepted=value;},
    startPanel:async()=>{f.tab.resolve(undefined);f.context.resolve(true);f.ready.resolve();await tick();}};
}
const assertFreshRead=f=>assert.deepEqual(JSON.parse(JSON.stringify(f.messages)),[
  {protocol:'opendesk.update-notice.v1',kind:'list',fresh:true}
]);
const assertExactReview=f=>assert.deepEqual(JSON.parse(JSON.stringify(f.reviews)),[
  {id:f.row.id,candidate:{id:f.row.source,version:f.row.version,sha256:f.row.sha256}}
]);
test('Side Panel manually reviews an ignored candidate only after fresh Worker and catalog checks',async()=>{
  const f=updateReviewFixture();
  try{
    const pending=f.reviewUpdate(f.row);
    assertFreshRead(f);
    await tick();assert.equal(f.reviews.length,0,'runtime readiness still gates review');
    assert.equal(f.catalogReads.length,1);
    f.ready.resolve();assert.equal(await pending,true);assertExactReview(f);
    f.setAccepted(false);assert.equal(await f.reviewUpdate(f.row),false,'review must accept');
    const before=f.messages.length;f.close();assert.equal(f.reviewUpdate(f.row),false);
    assert.equal(f.messages.length,before,'closed owner cannot query or open review');
  }finally{f.close();}
});
const invalidUpdateProofs=[
  ['unverified',row=>({ok:true,data:{verified:false,records:[row]}})],
  ['failed Worker reply',row=>({ok:false,data:{verified:true,records:[row]}})],
  ['unknown status',row=>({ok:true,data:{verified:true,records:[{...row,status:'unknown'}]}})],
  ...['kind','id','version','fromVersion','source','sha256'].map(field=>[
    `changed ${field}`,row=>({ok:true,data:{verified:true,records:[{...row,[field]:'changed'}]}})
  ])
];
for(const [label,proof] of invalidUpdateProofs)test(`Side Panel rejects ignored candidate with ${label}`,async()=>{
  const f=updateReviewFixture();
  try{
    f.setProof(proof(f.row));f.ready.resolve();
    assert.equal(await f.reviewUpdate(f.row),false);assertFreshRead(f);
    assert.equal(f.catalogReads.length,0,'invalid Worker proof stops before catalog');
    assert.equal(f.reviews.length,0);
  }finally{f.close();}
});
for(const field of ['toolId','version','id','sha256'])test(`Side Panel rejects catalog ${field} drift for ignored candidate`,async()=>{
  const f=updateReviewFixture();
  try{
    f.setApps([{toolId:f.row.id,id:f.row.source,version:f.row.version,sha256:f.row.sha256,[field]:'changed'}]);
    f.ready.resolve();assert.equal(await f.reviewUpdate(f.row),false);assertFreshRead(f);
    assert.equal(f.catalogReads.length,1);assert.equal(f.reviews.length,0);
  }finally{f.close();}
});
test('PC-to-Side Panel receiver accepts ignored candidates and retains fresh proof and closed fences',async()=>{
  const f=updateReviewFixture();
  try{
    await f.startPanel();f.messages.length=0;
    const request={action:'review',source:'built-in',sourceUrl:'chrome-extension://r37/app.html',
      toolId:f.row.id,marketId:f.row.source,releaseVersion:f.row.version,sha256:f.row.sha256};
    assert.equal((await f.receiveNavigation(request)).status,'REVIEW_REQUEST_ACCEPTED');
    assertFreshRead(f);assertExactReview(f);
    const rejected=[...invalidUpdateProofs.filter(([label])=>label!=='changed fromVersion'),
      ['missing installed version',row=>({ok:true,data:{verified:true,records:[{...row,fromVersion:undefined}]}})],
      ['duplicate identity',row=>({ok:true,data:{verified:true,records:[row,{...row}]}})],
      ['missing review requirement',row=>({ok:true,data:{verified:true,records:[{...row,requiresReview:false}]}})]
    ];
    for(const [label,proof] of rejected){
      f.setProof(proof(f.row));f.messages.length=0;
      assert.equal((await f.receiveNavigation(request)).status,'IDENTITY_CHANGED',label);
      assertFreshRead(f);assert.equal(f.reviews.length,1,label);
    }
    f.setProof({ok:true,data:{verified:true,records:[f.row]}});
    f.setApps([]);f.messages.length=0;
    assert.equal((await f.receiveNavigation(request)).status,'IDENTITY_CHANGED','catalog identity is checked');
    assert.equal(f.messages.length,0);assert.equal(f.reviews.length,1);
    f.close();
    assert.equal((await f.receiveNavigation(request)).status,'NAVIGATION_BLOCKED');
    assert.equal(f.messages.length,0);assert.equal(f.reviews.length,1);
  }finally{f.close();}
});
test('bound app.html opens its installed ToolHost without a Side Panel list controller',async()=>{
  const f=fixture({surface:'app'});f.tab.resolve({id:2});f.context.resolve(false);f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='openTool').length,1);
  assert.equal(f.calls.includes('extension-center'),false);
  assert.equal(f.calls.includes('extension-refresh'),false);
  f.close();
  assert.equal(f.calls.includes('extension-dispose'),false);
  assert.equal(f.api.runtime.onMessage.listeners.size,0);
  assert.equal(f.api.storage.onChanged.listeners.size,0);
});
test('Side Panel shell retains the Extension Center controller and disposes it',async()=>{
  const f=fixture();f.tab.resolve(undefined);f.context.resolve(true);f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='extension-center').length,1);
  f.navigateTools();assert.equal(f.calls.filter(x=>x==='extension-refresh').length,1);
  f.close();assert.equal(f.calls.filter(x=>x==='extension-dispose').length,1);
});
for(const late of ['tab','context'])test(`closed shell ignores late ${late} classification`,async()=>{
  const f=fixture({late});
  if(late==='context'){f.tab.resolve(undefined);await tick();}
  f.close();const before=[...f.calls];
  f.tab.resolve(undefined);f.context.resolve(true);f.ready.resolve();await tick();
  assert.deepEqual(f.calls,before,'closed documents cannot start hosts, restore navigation or consume menu tickets');
  assert.equal(f.api.runtime.onMessage.listeners.size,0);
  assert.equal(f.api.storage.onChanged.listeners.size,0);
});
test('closed tool document never opens a preview after storage resolves',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);await tick();
  f.close();f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});f.ready.resolve();await tick();
  assert.equal(f.calls.includes('preview'),false);assert.equal(f.calls.includes('preview-remove'),false);
});
test('closed standalone tool ignores late runtime readiness',async()=>{
  const f=fixture({surface:'tool'});f.tab.resolve({id:2});f.context.resolve(false);await tick();
  f.close();f.ready.resolve();await tick();assert.equal(f.calls.includes('openTool'),false);
});
test('late menu storage cannot reopen a closed host',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);await tick();f.close();
  f.menu.resolve({'menu-key':{pending:{state:'pending',windowId:1,expiresAt:Date.now()+1000,ticketId:'ticket',toolId:'quick-notes'}}});
  f.context.resolve(true);f.ready.resolve();await tick();
  assert.equal(f.calls.includes('openTool'),false);assert.equal(f.calls.includes('send'),false);
});
test('expired preview is projected through the React view',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);f.preview.resolve({});await tick();
  const notice=f.toolView.getSnapshot().fields['sidebar-tool-status'];
  assert.match(notice.textContent,/expired preview/);assert.equal(notice.hidden,false);
  assert.equal(notice.data.state,'error');f.close();
});
test('preview readiness is fenced after its storage read',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);
  f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});await tick();f.close();f.ready.resolve();await tick();
  assert.equal(f.calls.includes('preview'),false);assert.equal(f.calls.includes('preview-remove'),false);
});
test('a live preview opens and consumes its one-shot record',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);
  f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='preview').length,1);assert.equal(f.calls.filter(x=>x==='preview-remove').length,1);f.close();
});
const menuRecord=()=>({'menu-key':{pending:{state:'pending',windowId:1,expiresAt:Date.now()+1000,ticketId:'ticket',toolId:'quick-notes'}}});
test('menu readiness cannot open a tool after close',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());await tick();
  f.close();f.ready.resolve();f.context.resolve(true);await tick();
  assert.equal(f.calls.includes('openTool'),false);assert.equal(f.calls.includes('send'),false);
});
test('late launch acknowledgement rejects the old sandbox gate',async()=>{
  const f=fixture({pendingMenu:true,lateAck:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='send').length,1);f.close();f.ack.resolve({ok:true});f.context.resolve(true);await tick();
  assert.equal(f.calls.includes('gate-open'),false);assert.equal(f.calls.includes('gate-reject'),true);
});
test('live menu binding opens exactly one gate',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='send').length,1);assert.equal(f.calls.filter(x=>x==='gate-open').length,1);f.close();f.context.resolve(true);await tick();
});

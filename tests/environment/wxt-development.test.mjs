import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentWorker,developmentChanges,developmentRunHostIdle} from '../../src/development/worker.js';
import {installDevelopmentPage} from '../../src/development/page.js';
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:async(...args)=>{for(const fn of [...listeners])await fn(...args);}};};
const until=async condition=>{const deadline=Date.now()+2500;while(!condition()){if(Date.now()>deadline)throw Error('Development transition timed out');await new Promise(resolve=>setTimeout(resolve,10));}};
const revision=number=>String(number).padStart(64,'0');

function idleStorage({run={},operation={},receipt={},slot={}}={}){
  const rows={runs:{'@slot':{currentRunId:null,...slot},'retired-run':{
    tag:'controller-run',runId:'retired-run',state:'failed',workerRetired:true,
    retirementState:'released',retirementId:'retirement-1',...run}},commandJournal:{
    operation:{tag:'controller-operation',runId:'retired-run',state:'effect_unknown',
      envelope:{identity:{tag:'controller-run',runId:'retired-run'}},...operation},
    'controller-retirement:retirement-1':{tag:'controller-retirement',runId:'retired-run',
      retirementId:'retirement-1',releaseCount:1,...receipt}}};
  return {rows,transaction:async(stores,mode,read)=>{
    assert.deepEqual(stores,['runs','commandJournal']);assert.equal(mode,'readonly');
    return read({get:async(store,key)=>structuredClone(rows[store][key]),
      all:async store=>structuredClone(Object.values(rows[store]))});
  }};
}

test('released Controller history no longer blocks development reload and remains unknown',async()=>{
  const storage=idleStorage(),before=structuredClone(storage.rows);
  assert.equal(await developmentRunHostIdle(storage),true);
  assert.deepEqual(storage.rows,before);
  storage.rows.commandJournal.operation.tag='controller-navigation';
  assert.equal(await developmentRunHostIdle(storage),true);
});

for(const [name,options] of [
  ['active run',{slot:{currentRunId:'active'}}],['preview',{slot:{preview:{id:'preview'}}}],
  ['unreleased',{run:{retirementState:'pending'}}],['live Worker',{run:{workerRetired:false}}],
  ['paused outcome',{run:{state:'paused_unknown'}}],['inconsistent success',{run:{state:'completed'}}],
  ['unbound envelope',{operation:{envelope:{identity:{runId:'other'}}}}],
  ['dispatched effect',{operation:{state:'dispatched'}}],
  ['SDK unknown',{operation:{tag:'sdk-operation'}}],['other unknown',{operation:{state:'OUTCOME_UNKNOWN'}}],
  ['missing Run',{operation:{runId:'missing'}}],['missing retirement',{run:{retirementId:''}}],
  ['mismatched receipt',{receipt:{retirementId:'other'}}],['mismatched Run receipt',{receipt:{runId:'other'}}],
  ['unreleased receipt',{receipt:{releaseCount:0}}],['wrong receipt tag',{receipt:{tag:'sdk-operation'}}],
])test('development reload still blocks '+name,async()=>{
  assert.equal(await developmentRunHostIdle(idleStorage(options)),false);
});

test('development reload fails closed when the retirement receipt is missing',async()=>{
  const storage=idleStorage();delete storage.rows.commandJournal['controller-retirement:retirement-1'];
  assert.equal(await developmentRunHostIdle(storage),false);
});
function workerFixture({missingDocumentId=false,storage,retryDelayMs=0}={}){
  let update={protocol:'opendesk.development.v1',revision:revision(1),files:{'sw.js':'initial','ui/tool-shell.js':'initial','ui/tool-shell.css':'initial','agents/page-agent.js':'initial'}};
  const messages=[],contexts=[{contextType:'SIDE_PANEL',documentId:'document-1',documentUrl:'chrome-extension://extension/sidepanel.html?hostInstanceId=host-1',frameId:0,incognito:false}];
  let reloads=0,idle=true,reads=0;
  const saved={};const api={storage:{session:{get:async()=>structuredClone(saved),set:async value=>Object.assign(saved,structuredClone(value))}},runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,onConnect:event(),getContexts:async()=>contexts,reload:()=>reloads++}};
  const port={name:'opendesk.development.v1',sender:{id:'extension',url:contexts[0].documentUrl,...(!missingDocumentId&&{documentId:'document-1'})},onMessage:event(),onDisconnect:event(),disconnect(){this.onDisconnect.emit();},postMessage(message){messages.push(message);if(message.type==='prepare')this.onMessage.emit({type:'ready',token:message.token,ready:true});}};
  const worker=createDevelopmentWorker(api,{intervalMs:10,retryDelayMs,fetch:async()=>{reads++;return {ok:true,json:async()=>structuredClone(update)};}});
  return {worker,api,port,messages,get reloads(){return reloads;},get reads(){return reads;},setIdle:value=>{idle=value;},connect:()=>api.runtime.onConnect.emit(port),start:()=>worker.start(()=>idle&&!worker.nativePending&&(!storage||worker.runHostIdle(storage))),change:(file,hash)=>{update={...update,revision:revision(Number(update.revision)+1),files:{...update.files,[file]:hash}};}};
}
test('retired unknown history passes the update flow only after receipt, Native and host fences release',async()=>{
  const storage=idleStorage({receipt:{releaseCount:0}}),f=workerFixture({storage});
  let hostReady=false;
  f.port.postMessage=message=>{f.messages.push(message);if(message.type==='prepare')f.port.onMessage.emit({type:'ready',token:message.token,ready:hostReady});};
  try{
    await f.connect();f.start();await until(()=>f.reads>1);
    f.change('sw.js','retirement-aware-update');
    await until(()=>f.messages.some(message=>message.type==='waiting'));
    assert.equal(f.reloads,0);assert.equal(f.messages.some(message=>message.type==='prepare'),false);
    const nativeDone=f.worker.nativeStarted();
    storage.rows.commandJournal['controller-retirement:retirement-1'].releaseCount=1;
    const reads=f.reads;await until(()=>f.reads>reads+2);
    assert.equal(f.reloads,0);assert.equal(f.messages.some(message=>message.type==='prepare'),false);
    nativeDone();await until(()=>f.messages.some(message=>message.type==='prepare'));
    assert.equal(f.reloads,0);assert.equal((await f.api.storage.session.get())['opendesk.development.applied.v1'].revision,revision(1));
    const before=structuredClone(storage.rows);hostReady=true;
    await until(()=>f.reloads===1);
    assert.equal((await f.api.storage.session.get())['opendesk.development.applied.v1'].revision,revision(2));
    assert.deepEqual(storage.rows,before);assert.equal(storage.rows.commandJournal.operation.state,'effect_unknown');
  }finally{f.worker.dispose();}
});

test('real Side Panel context resolves missing sender documentId and rejects foreign senders',async()=>{
  const f=workerFixture({missingDocumentId:true});await f.connect();assert.equal(f.messages[0].type,'connected');assert.equal(f.messages[0].documentId,'document-1');
  const foreign=workerFixture();foreign.port.sender.id='other-extension';await foreign.connect();assert.equal(foreign.messages.length,0);f.worker.dispose();foreign.worker.dispose();
});

test('R37 development ports accept root documents and disconnect the legacy path',async()=>{
  const current=workerFixture(),legacy=workerFixture();let disconnected=false;
  legacy.port.sender.url=legacy.port.sender.url.replace('/sidepanel.html','/ui/tool.html');
  legacy.port.onDisconnect.addListener(()=>{disconnected=true;});
  try{
    await current.connect();assert.equal(current.messages[0].type,'connected');
    await legacy.connect();assert.equal(disconnected,true);assert.equal(legacy.messages.length,0);
  }finally{current.worker.dispose();legacy.worker.dispose();}
});
test('CSS updates apply without extension reload, fixed injected bytes require a safe reload',async()=>{
  const f=workerFixture();await f.connect();f.start();await until(()=>f.reads>1);
  f.change('ui/tool-shell.css','magenta');await until(()=>f.messages.some(m=>m.type==='css'));assert.equal(f.reloads,0);assert.equal(f.messages.find(m=>m.type==='css').hash,'magenta');
  f.setIdle(false);
  f.change('agents/page-agent.js','next-document');await until(()=>f.messages.some(m=>m.type==='waiting'));assert.equal(f.reloads,0);
  f.setIdle(true);await until(()=>f.reloads===1);assert.equal(f.messages.some(m=>m.type==='prepare'),true);f.worker.dispose();
});
test('fixed script safe reload persists the compiled revision before restarting Chrome',async()=>{
  const f=workerFixture();await f.connect();f.start();await until(()=>f.reads>1);
  f.change('framework/sdk-main.js','new-sdk');await until(()=>f.reloads===1);
  const saved=await f.api.storage.session.get('opendesk.development.applied.v1');
  assert.equal(saved['opendesk.development.applied.v1'].revision,revision(2));
  f.worker.dispose();
});
test('SDK MAIN, relay and built-in manifest changes are extension updates, not CSS hot swaps',()=>{
  const previous={files:{'framework/sdk-main.js':'old','agents/page-relay.js':'old','libs/manifest.json':'old'}};
  for(const file of Object.keys(previous.files)){
    const next={files:{...previous.files,[file]:'new'}};
    const changes=developmentChanges(previous,next);
    assert.deepEqual(changes.changed,[file]);
    assert.equal(changes.extension,true);
    assert.equal(changes.page,false);
  }
});
test('official package data keeps the live Native preview while trusted or unknown bytes still require reload',async()=>{
  const f=workerFixture();
  try{
    await f.connect();f.start();await until(()=>f.reads>1);
    f.change('official-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json','snapshot-1');
    f.change('official-tools/catalog.json','catalog-1');
    await until(()=>f.messages.some(message=>message.type==='revision'&&message.revision===revision(3)));
    assert.equal(f.reloads,0);assert.equal(f.messages.some(message=>message.type==='prepare'),false);
    for(const file of ['official-tools/prompt-shortcuts/trusted.js',
      'official-tools/prompt-shortcuts/other.opendesk-tool.json','libs/manifest.json','sw.js']){
      assert.equal(developmentChanges({files:{}},{files:{[file]:'new'}}).extension,true,file);
    }
    f.change('sw.js','trusted-change');await until(()=>f.reloads===1);
    assert.equal(f.messages.some(message=>message.type==='prepare'),true);
  }finally{f.worker.dispose();}
});
test('newly connected tools receive the existing reason a development update is waiting',async()=>{
  const f=workerFixture();
  try{
    await f.connect();f.start();await until(()=>f.reads>1);
    f.setIdle(false);f.change('sw.js','pending-update');
    await until(()=>f.messages.some(message=>message.type==='waiting'));
    const waiting=f.messages.find(message=>message.type==='waiting');
    f.messages.length=0;await f.connect();
    assert.deepEqual(f.messages.map(message=>message.type),['connected','waiting']);
    assert.equal(f.messages[1].reason,waiting.reason);
    assert.equal(f.messages[0].revision,revision(1));
    assert.equal(f.reloads,0);
  }finally{f.worker.dispose();}
});

test('background waits for idle, freezes admissions, acknowledges draft and reloads only once',async()=>{
  const f=workerFixture();await f.connect();f.setIdle(false);f.start();await until(()=>f.reads>1);f.change('sw.js','new');await until(()=>f.messages.some(m=>m.type==='waiting'));assert.equal(f.reloads,0);assert.equal(f.worker.held,false);
  f.setIdle(true);await until(()=>f.reloads===1);assert.equal(f.worker.held,true);const reads=f.reads;await new Promise(resolve=>setTimeout(resolve,50));assert.equal(f.reloads,1);assert.equal(f.reads,reads);f.worker.dispose();
});
function pageFixture(prepareReload){
  const ports=[],statuses=[],body={inert:false},link={href:'chrome-extension://extension/ui/tool-shell.css'};
  const doc={body,documentElement:{dataset:{}},
    createElement:()=>assert.fail('development status belongs to React'),
    getElementById:()=>assert.fail('development must not query legacy status nodes'),
    querySelector:()=>link};
  const api={runtime:{id:'extension',connect(){
    const port={onMessage:event(),onDisconnect:event(),sent:[],closed:false,
      postMessage(m){this.sent.push(m);},disconnect(){this.closed=true;this.onDisconnect.emit();}};
    ports.push(port);return port;
  }}};
  const urls=[];
  const dispose=installDevelopmentPage({api,prepareReload,document:doc,
    onStatus:value=>statuses.push(value===null?null:{...value}),
    location:{href:'chrome-extension://extension/sidepanel.html?hostInstanceId=old&toolId=quick-notes',replace:url=>urls.push(url)}});
  return {ports,statuses,body,link,urls,dispose,get status(){return statuses.at(-1);},get navigations(){return urls.length;}};
}

test('obsolete draft preparation cannot acknowledge or unfreeze a newer token',async()=>{
  const resolutions=[];const f=pageFixture(()=>new Promise(resolve=>resolutions.push(resolve))),p=f.ports[0];
  await p.onMessage.emit({type:'prepare',token:'old'});await until(()=>resolutions.length===1);await p.onMessage.emit({type:'abort',token:'old'});
  await p.onMessage.emit({type:'prepare',token:'new'});resolutions[0](false);await until(()=>resolutions.length===2);assert.equal(f.body.inert,true);assert.equal(p.sent.length,0);
  await p.onMessage.emit({type:'abort',token:'old'});assert.equal(f.body.inert,true);resolutions[1](true);await until(()=>p.sent.length===1);assert.deepEqual(p.sent[0],{type:'ready',token:'new',ready:true});assert.equal(f.body.inert,true);f.dispose();assert.equal(f.body.inert,false);
});
test('development panel labels its build fingerprint without claiming page re-injection',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];
  await p.onMessage.emit({type:'connected',revision:revision(3)});
  assert.match(f.status.text,/构建指纹/);
  assert.match(f.status.title,/构建 revision/);
  assert.match(f.status.title,/不证明已打开的网页重新注入/);
  f.dispose();
});
test('development publishes callback status and CSS updates keep it unchanged',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];
  assert.match(f.status.text,/正在连接/);
  await p.onMessage.emit({type:'connected',revision:revision(3)});
  const connected=f.status,count=f.statuses.length;
  await p.onMessage.emit({type:'css',hash:'style-rev-2'});
  assert.equal(f.statuses.length,count);assert.deepEqual(f.status,connected);
  assert.equal(new URL(f.link.href).searchParams.get('opendesk-dev'),'style-rev-2');
  assert.equal(f.body.inert,false);f.dispose();assert.equal(f.status,null);assert.equal(p.closed,true);
});
test('development waiting and revision messages publish callback state without injecting nodes',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];
  await p.onMessage.emit({type:'waiting',reason:'等待任务结束及草稿保存'});
  assert.equal(f.status.text,'等待任务结束及草稿保存');
  await p.onMessage.emit({type:'revision',revision:revision(4)});
  assert.match(f.status.text,new RegExp(revision(4).slice(0,12)));
  assert.match(f.status.title,new RegExp(revision(4)));
  assert.doesNotMatch(f.status.text,/样式已自动更新/);f.dispose();assert.equal(f.status,null);
});
test('development reload requires active prepared token and renews document identity',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];
  await p.onMessage.emit({type:'reload-page',token:'unknown'});assert.equal(f.navigations,0);
  await p.onMessage.emit({type:'prepare',token:'ready'});await until(()=>p.sent.length===1);
  assert.deepEqual(p.sent[0],{type:'ready',token:'ready',ready:true});
  assert.equal(f.body.inert,true);assert.match(f.status.text,/正在应用源码更新/);
  await p.onMessage.emit({type:'abort',token:'ready'});assert.equal(f.body.inert,false);
  await p.onMessage.emit({type:'reload-page',token:'ready'});assert.equal(f.navigations,0);
  await p.onMessage.emit({type:'prepare',token:'next'});await until(()=>p.sent.length===2);
  await p.onMessage.emit({type:'reload-page',token:'next'});assert.equal(f.navigations,1);
  const next=new URL(f.urls[0]);assert.equal(next.searchParams.has('hostInstanceId'),false);
  assert.equal(next.searchParams.get('toolId'),'quick-notes');f.dispose();
});
test('development dispose invalidates pending preparation and late callbacks',async()=>{
  let finish;const f=pageFixture(()=>new Promise(resolve=>{finish=resolve;})),p=f.ports[0];
  await p.onMessage.emit({type:'prepare',token:'late'});await until(()=>Boolean(finish));
  assert.equal(f.body.inert,true);f.dispose();assert.equal(f.body.inert,false);
  assert.equal(f.status,null);const count=f.statuses.length;
  finish(true);await new Promise(resolve=>setTimeout(resolve,20));
  await p.onMessage.emit({type:'connected',revision:revision(8)});
  await p.onMessage.emit({type:'reload-page',token:'late'});
  assert.equal(f.statuses.length,count);assert.equal(p.sent.length,0);assert.equal(f.navigations,0);
  assert.equal(p.closed,true);assert.equal(f.ports.length,1);
});

test('disconnect clears preparation and reconnects only development channel',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];await p.onMessage.emit({type:'prepare',token:'t'});await until(()=>p.sent.length===1);assert.equal(f.body.inert,true);
  await p.onDisconnect.emit();assert.equal(f.body.inert,false);await until(()=>f.ports.length===2);assert.equal(f.navigations,0);await f.ports[1].onMessage.emit({type:'connected'});assert.match(f.status.text,/已连接/);f.dispose();
});

test('worker recreation retains an unapplied update while a surviving host is busy',async()=>{
  const f=workerFixture();await f.connect();f.start();await until(()=>f.reads>1);f.setIdle(false);f.change('ui/tool-shell.js','unapplied');await until(()=>f.messages.some(m=>m.type==='waiting'));f.worker.dispose();
  // The real service-worker realm is recreated; Chrome storage.session survives
  // suspension, while the old tool document and compiled output remain.
  const worker=createDevelopmentWorker(f.api,{intervalMs:10,fetch:async()=>({ok:true,json:async()=>({protocol:'opendesk.development.v1',revision:revision(2),files:{'sw.js':'initial','ui/tool-shell.js':'unapplied','ui/tool-shell.css':'initial','agents/page-agent.js':'initial'}})})});
  try {await f.api.runtime.onConnect.emit(f.port);worker.start(()=>false);await until(()=>f.messages.filter(m=>m.type==='waiting').length>1);assert.equal(f.messages.some(m=>m.type==='reload-page'),false);assert.equal(f.reloads,0);}finally{worker.dispose();}
});
test('a disconnected acknowledgement cannot authorize extension reload',async()=>{
  const f=workerFixture();f.port.postMessage=message=>{f.messages.push(message);if(message.type==='prepare'){f.port.onMessage.emit({type:'ready',token:message.token,ready:true});f.port.onDisconnect.emit();}};
  await f.connect();f.start();await until(()=>f.reads>1);f.change('sw.js','new');await until(()=>f.messages.some(m=>m.type==='prepare'));await new Promise(resolve=>setTimeout(resolve,100));assert.equal(f.reloads,0);f.worker.dispose();
});
test('a busy host immediately releases other hosts instead of freezing them for the acknowledgement timeout',async()=>{
  const f=workerFixture();
  const context={...await f.api.runtime.getContexts({}).then(rows=>rows[0]),documentId:'document-2',documentUrl:'chrome-extension://extension/sidepanel.html?hostInstanceId=host-2'};
  (await f.api.runtime.getContexts({})).push(context);
  const busy={name:f.port.name,sender:{id:'extension',url:context.documentUrl,documentId:context.documentId},
    onMessage:event(),onDisconnect:event(),disconnect(){this.onDisconnect.emit();},
    postMessage(message){if(message.type==='prepare')this.onMessage.emit({type:'ready',token:message.token,ready:false});}};
  try{
    await f.connect();await f.api.runtime.onConnect.emit(busy);f.start();await until(()=>f.reads>1);
    f.change('sw.js','pending');await until(()=>f.messages.some(message=>message.type==='prepare'));
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(f.worker.held,false,'a negative vote must release the admission fence promptly');
    assert.equal(f.messages.some(message=>message.type==='abort'),true,'the ready host must become interactive again');
    assert.equal(f.reloads,0,'a busy host must continue to veto reload');
  }finally{f.worker.dispose();}
});

test('an unanswered preparation leaves an interactive retry gap and still requires fresh host and Native readiness',async()=>{
  const f=workerFixture({retryDelayMs:200});
  const context={...(await f.api.runtime.getContexts({}))[0],documentId:'document-2',documentUrl:'chrome-extension://extension/sidepanel.html?hostInstanceId=host-2'};
  (await f.api.runtime.getContexts({})).push(context);
  let ready=false;
  const slow={name:f.port.name,sender:{id:'extension',url:context.documentUrl,documentId:context.documentId},
    onMessage:event(),onDisconnect:event(),disconnect(){this.onDisconnect.emit();},
    postMessage(message){if(message.type==='prepare'&&ready)this.onMessage.emit({type:'ready',token:message.token,ready:true});}};
  try{
    await f.connect();await f.api.runtime.onConnect.emit(slow);f.start();await until(()=>f.reads>1);
    f.change('sw.js','pending');await until(()=>f.messages.some(message=>message.type==='abort'));
    const first=f.messages.find(message=>message.type==='prepare');
    assert.equal(f.worker.held,false);
    await slow.onMessage.emit({type:'ready',token:first.token,ready:true});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(f.messages.filter(message=>message.type==='prepare').length,1,'an aborted attempt must leave a usable gap');
    assert.equal(f.worker.held,false);assert.equal(f.reloads,0);
    assert.equal((await f.api.storage.session.get())['opendesk.development.applied.v1'].revision,revision(1));
    const nativeDone=f.worker.nativeStarted();ready=true;
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(f.messages.filter(message=>message.type==='prepare').length,1,'Native requests must still veto a retry');
    nativeDone();await until(()=>f.reloads===1);
    const attempts=f.messages.filter(message=>message.type==='prepare');
    assert.equal(attempts.length,2);assert.notEqual(attempts[1].token,first.token);
    assert.equal((await f.api.storage.session.get())['opendesk.development.applied.v1'].revision,revision(2));
  }finally{f.worker.dispose();}
});

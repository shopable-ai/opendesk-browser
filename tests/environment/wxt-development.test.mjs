import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentWorker,developmentChanges} from '../../src/development/worker.js';
import {installDevelopmentPage} from '../../src/development/page.js';
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:async(...args)=>{for(const fn of [...listeners])await fn(...args);}};};
const until=async condition=>{const deadline=Date.now()+2500;while(!condition()){if(Date.now()>deadline)throw Error('Development transition timed out');await new Promise(resolve=>setTimeout(resolve,10));}};
const revision=number=>String(number).padStart(64,'0');
function workerFixture({missingDocumentId=false}={}){
  let update={protocol:'opendesk.development.v1',revision:revision(1),files:{'sw.js':'initial','ui/tool-shell.js':'initial','ui/tool-shell.css':'initial','agents/page-agent.js':'initial'}};
  const messages=[],contexts=[{contextType:'SIDE_PANEL',documentId:'document-1',documentUrl:'chrome-extension://extension/ui/tool.html?hostInstanceId=host-1',frameId:0,incognito:false}];
  let reloads=0,idle=true,reads=0;
  const saved={};const api={storage:{session:{get:async()=>structuredClone(saved),set:async value=>Object.assign(saved,structuredClone(value))}},runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,onConnect:event(),getContexts:async()=>contexts,reload:()=>reloads++}};
  const port={name:'opendesk.development.v1',sender:{id:'extension',url:contexts[0].documentUrl,...(!missingDocumentId&&{documentId:'document-1'})},onMessage:event(),onDisconnect:event(),disconnect(){this.onDisconnect.emit();},postMessage(message){messages.push(message);if(message.type==='prepare')this.onMessage.emit({type:'ready',token:message.token,ready:true});}};
  const worker=createDevelopmentWorker(api,{intervalMs:10,fetch:async()=>{reads++;return {ok:true,json:async()=>structuredClone(update)};}});
  return {worker,api,port,messages,get reloads(){return reloads;},get reads(){return reads;},setIdle:value=>{idle=value;},connect:()=>api.runtime.onConnect.emit(port),start:()=>worker.start(()=>idle),change:(file,hash)=>{update={...update,revision:revision(Number(update.revision)+1),files:{...update.files,[file]:hash}};}};
}

test('real Side Panel context resolves missing sender documentId and rejects foreign senders',async()=>{
  const f=workerFixture({missingDocumentId:true});await f.connect();assert.equal(f.messages[0].type,'connected');assert.equal(f.messages[0].documentId,'document-1');
  const foreign=workerFixture();foreign.port.sender.id='other-extension';await foreign.connect();assert.equal(foreign.messages.length,0);f.worker.dispose();foreign.worker.dispose();
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
test('background waits for idle, freezes admissions, acknowledges draft and reloads only once',async()=>{
  const f=workerFixture();await f.connect();f.setIdle(false);f.start();await until(()=>f.reads>1);f.change('sw.js','new');await until(()=>f.messages.some(m=>m.type==='waiting'));assert.equal(f.reloads,0);assert.equal(f.worker.held,false);
  f.setIdle(true);await until(()=>f.reloads===1);assert.equal(f.worker.held,true);const reads=f.reads;await new Promise(resolve=>setTimeout(resolve,50));assert.equal(f.reloads,1);assert.equal(f.reads,reads);f.worker.dispose();
});
function pageFixture(prepareReload){
  const ports=[],body={inert:false,prepend(){}},link={href:'chrome-extension://extension/ui/tool-shell.css'},status={remove(){}};
  const doc={body,documentElement:{dataset:{}},createElement:()=>status,querySelector:()=>link};
  const api={runtime:{connect(){const port={onMessage:event(),onDisconnect:event(),sent:[],postMessage(m){this.sent.push(m);},disconnect(){this.onDisconnect.emit();}};ports.push(port);return port;}}};
  let navigations=0;const dispose=installDevelopmentPage({api,prepareReload,document:doc,location:{href:'chrome-extension://extension/ui/tool.html?hostInstanceId=old',replace:()=>navigations++}});
  return {ports,body,status,link,dispose,get navigations(){return navigations;}};
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
  assert.match(f.status.textContent,/构建指纹/);
  assert.match(f.status.title,/构建 revision/);
  assert.match(f.status.title,/不证明已打开的网页重新注入/);
  f.dispose();
});
test('disconnect clears preparation and reconnects only development channel',async()=>{
  const f=pageFixture(async()=>true),p=f.ports[0];await p.onMessage.emit({type:'prepare',token:'t'});await until(()=>p.sent.length===1);assert.equal(f.body.inert,true);
  await p.onDisconnect.emit();assert.equal(f.body.inert,false);await until(()=>f.ports.length===2);assert.equal(f.navigations,0);await f.ports[1].onMessage.emit({type:'connected'});assert.match(f.status.textContent,/已连接/);f.dispose();
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

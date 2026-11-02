// Component fixtures only: no real Chrome, installation, Authority or Native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=name=>readFileSync(fileURLToPath(new URL('../src/'+name,import.meta.url)),'utf8');
const html=source('index.html'),core=source('core.js'),main=source('main.js');
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const copy=value=>JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.text='';this.hidden=false;this.disabled=false;this.listeners={};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw Error('Untrusted result must never be rendered as HTML: '+value);}
  replaceChildren(...children){this.text='';this.children=children;}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);return child;}
  addEventListener(type,handler){this.listeners[type]=handler;}
}

async function fixture(shared={value:null}){
  const fields={},buttons={},doc={createElement:tag=>Object.assign(new Element(tag),{ownerDocument:doc})};
  for(const match of html.matchAll(/data-(field|action)="([^"]+)"/g)){
    const node=doc.createElement(match[1]==='action'?'button':'div');
    node.dataset={[match[1]]:match[2]};
    (match[1]==='field'?fields:buttons)[match[2]]=node;
  }
  const root={ownerDocument:doc,querySelectorAll:selector=>
    Object.values(selector==='[data-field]'?fields:buttons)};
  const calls=[],events={},timers=new Map();let nextTimer=0;
  const flags={writeDenied:false,readError:null,holdNextRead:false,currentUrl:'https://www.baidu.com/'};
  const ctx={URL,crypto:{randomUUID},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},
    clearTimeout:id=>timers.delete(id),addEventListener:(type,fn)=>{events[type]=fn;}};
  vm.runInNewContext(core,ctx,{timeout:2000});
  const M=ctx.OpenDeskTaskShopCore;
  const pin={...M.PIN,installationId:'fixture-install',generation:1};
  let startResolve,lastId,heldRead;
  const snapshot=(overrides={})=>({clientRequestId:lastId,runId:'fixture-run',resultId:'fixture-result',
    state:'completed',retirementState:'released',result:{tag:'controller-result',
      runId:'fixture-run',resultId:'fixture-result',state:'completed',
      revision:{scriptId:'task:baidu.search.top3:1.1.1',revision:1,sourceHash:M.PIN.contentHash},
      outcome:{ok:true}},value:{kind:'baidu.search.top3.result',version:2,query:M.JOB.args.query,
      status:'success',count:1,results:[{title:'<img src=x onerror=alert(1)>',
        summary:'公开商品参数',url:'https://example.com/product'}]},...overrides});
  const etag=()=>createHash('sha256').update(JSON.stringify(shared.value)).digest('hex');
  ctx.OpenDeskTool={root:{querySelector:selector=>selector==='#taskshop-app'?root:null},request:(op,args)=>{
    calls.push({op,args:copy(args)});
    if(op==='storage.get'){
      const response={value:copy(shared.value),...(args.withEtag?{etag:etag()}:{})};
      if(flags.holdNextRead){flags.holdNextRead=false;return new Promise(resolve=>{heldRead=()=>resolve(response);});}
      return Promise.resolve(response);
    }
    if(op==='storage.set'){
      if(flags.writeDenied)return Promise.reject(Object.assign(Error('Fixture storage unavailable'),{code:'E_STORAGE'}));
      if(args.ifMatch!==etag())return Promise.reject(Object.assign(Error('CAS conflict'),{code:'E_STORAGE_CONFLICT'}));
      shared.value=copy(args.value);return Promise.resolve({});
    }
    if(op==='currentPage.info')return Promise.resolve({status:'available',url:flags.currentUrl,title:'Fixture'});
    if(op==='tasks.read'&&args.taskId)return Promise.resolve({task:copy(pin)});
    if(op==='tasks.start'){lastId=args.clientRequestId;return new Promise(resolve=>{startResolve=resolve;});}
    if(op==='tasks.stop')return Promise.resolve(snapshot({state:'stopped',result:null,value:null}));
    if(op==='tasks.read')return flags.readError?
      Promise.reject(Object.assign(Error('Fixture unavailable'),{code:flags.readError})):Promise.resolve(snapshot());
    throw Error('Unexpected SDK call '+op);
  }};
  vm.runInNewContext(main,ctx,{timeout:2000});await flush();
  const click=async name=>{
    const button=buttons[name];
    if(button.hidden||button.disabled)return false;
    button.listeners.click();await flush();return true;
  };
  const prepare=async()=>{await click('claim');await click('prepare');};
  return {fields,buttons,shared,pin,flags,calls,events,click,prepare,snapshot,
    finish:async overrides=>{startResolve(snapshot(overrides));await flush();},
    releaseRead:async()=>{heldRead();await flush();},
    starts:()=>calls.filter(call=>call.op==='tasks.start')};
}

test('the component displays original rows as text and requires separate demo acceptance and settlement',async()=>{
  const f=await fixture();await f.prepare();await f.click('execute');await f.finish();
  assert.equal(f.shared.value.claim.state,'REVIEW_PENDING');
  assert.ok(f.fields.results,'search results need a visible output field');
  assert.ok(f.fields.results.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(f.fields.results.textContent.includes('公开商品参数'));
  assert.ok(f.fields.results.textContent.includes('https://example.com/product'));
  assert.equal(f.shared.value.claim.review,null);assert.equal(f.buttons.settle.hidden,true);
  await f.click('accept');assert.equal(f.shared.value.claim.state,'ACCEPTED');
  await f.click('settle');assert.equal(f.shared.value.claim.settlement.netPoints,18);
  assert.equal(f.shared.value.claim.settlement.kind,'SIMULATED_ONLY');
});

test('Stop remains available before the original start acknowledgement arrives',async()=>{
  const f=await fixture();await f.prepare();await f.click('execute');
  assert.equal(f.buttons.stop.disabled,false);
  assert.equal(await f.click('stop'),true);
  assert.equal(f.shared.value.claim.state,'STOP_REQUESTED');
  assert.equal(f.calls.filter(call=>call.op==='tasks.stop').length,1);
  assert.ok(f.fields.message.textContent.includes('不把 Stop 回执当成副作用已回滚'));
  await f.finish({state:'stopped',result:null,value:null});
  assert.equal(f.shared.value.claim.state,'NEEDS_ATTENTION');assert.equal(f.starts().length,1);
});

test('Stop and a concurrent start acknowledgement cannot discard the stop request through a CAS conflict',async()=>{
  for(const first of ['stop','ack']){
    const f=await fixture();await f.prepare();await f.click('execute');f.flags.holdNextRead=true;
    const ack=()=>f.finish({state:'running',resultId:null,result:null,value:null});
    if(first==='stop'){await f.click('stop');await ack();}
    else{await ack();await f.click('stop');}
    await f.releaseRead();
    assert.equal(f.calls.filter(call=>call.op==='tasks.stop').length,1,'first: '+first);
    assert.equal(f.shared.value.claim.state,'STOP_REQUESTED');
    assert.equal(f.starts().length,1);
  }
});

test('lost result and UNKNOWN writes never re-enable an already submitted request',async()=>{
  const f=await fixture();await f.prepare();await f.click('execute');
  f.flags.writeDenied=true;await f.finish();
  assert.equal(await f.click('execute'),false);
  assert.equal(f.starts().length,1);
});

test('claim refresh and rapid duplicate clicks keep one lease and one dispatch',async()=>{
  const f=await fixture();await f.click('claim');const id=f.shared.value.claim.claimId;
  await f.click('refresh');assert.equal(await f.click('claim'),false);
  assert.equal(f.shared.value.claim.claimId,id);await f.click('prepare');
  await f.click('execute');assert.equal(await f.click('execute'),false);await f.finish();
  assert.equal(f.starts().length,1);
  assert.equal(f.starts()[0].args.clientRequestId,f.shared.value.claim.clientRequestId);
  assert.deepEqual(f.starts()[0].args.task,f.pin);
});

test('wrong site and changed script pin prevent prepare and dispatch',async()=>{
  const f=await fixture();await f.click('claim');f.flags.currentUrl='https://evil.example/';
  await f.click('prepare');assert.ok(f.fields.error.textContent.includes('E_SITE_SCOPE'));
  f.flags.currentUrl='https://www.baidu.com/';f.pin.version='9.9.9';
  await f.click('prepare');assert.ok(f.fields.error.textContent.includes('E_REVISION'));
  assert.equal(f.shared.value.claim.state,'LEASED');assert.equal(f.starts().length,0);
});

test('revoked read moves to UNKNOWN without retry and reopened UI cannot reclaim old iframe requests',async()=>{
  for(const code of ['E_PERMISSION','E_DISCONNECTED']){
  const f=await fixture();await f.prepare();await f.click('execute');
  await f.finish({state:'running',resultId:null,result:null,value:null});
  f.flags.readError=code;await f.click('read');assert.equal(f.shared.value.claim.state,'UNKNOWN');
  assert.equal(await f.click('execute'),false);assert.equal(f.starts().length,1);
  f.events.pagehide();const reopened=await fixture(f.shared);
  assert.equal(reopened.buttons.read.hidden,true);assert.equal(reopened.buttons.execute.hidden,true);
  assert.ok(reopened.fields.message.textContent.includes('无法安全跨重开查询或重发'));
  assert.equal(reopened.starts().length,0);
  }
});

test('two open component instances compete for one persisted claim using the original ETag contract',async()=>{
  const shared={value:null};const first=await fixture(shared),second=await fixture(shared);
  await Promise.all([first.click('claim'),second.click('claim')]);
  assert.equal(shared.value.claim.state,'LEASED');
  const writes=[...first.calls,...second.calls].filter(call=>call.op==='storage.set'&&call.args.value.claim);
  assert.equal(writes.length,2);assert.notEqual(writes[0].args.value.claim.claimId,writes[1].args.value.claim.claimId);
  assert.equal(writes[0].args.ifMatch,writes[1].args.ifMatch);
  assert.ok([first.fields.error,second.fields.error].some(node=>node.textContent.includes('E_STORAGE_CONFLICT')));
  await first.click('refresh');await second.click('refresh');
  assert.equal(first.shared.value.claim.claimId,second.shared.value.claim.claimId);
  assert.equal(await first.click('claim'),false);assert.equal(await second.click('claim'),false);
});

import {runInNewContext} from 'node:vm';
// R2.3 source and contract tests. These do NOT claim Chrome/DNR execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initSidebarToolSandbox,sidebarToolRequestTimeout,ADBLOCK_CONFIRM_OPERATIONS}
  from '../../src/sidebar-tools/bridge.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_SHARED_UI_RUNTIME}
  from '../../src/ui/sidebar-tools/package.js';

test('all six AdBlock writes wait beyond the real host review deadline',()=>{
  assert.deepEqual([...ADBLOCK_CONFIRM_OPERATIONS],[
    'adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore',
    'adblock.cosmetic.add','adblock.cosmetic.replace']);
  for(const operation of ADBLOCK_CONFIRM_OPERATIONS)
    assert.ok(sidebarToolRequestTimeout(operation,'adblock')>90000,operation);
});
test('AdBlock status and unrelated tool request timing do not change',()=>{
  assert.equal(sidebarToolRequestTimeout('adblock.status','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.cosmetic.status','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.enable','quick-notes'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.cosmetic.add','quick-notes'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.cosmetic.replace','quick-notes'),8000);
  assert.equal(sidebarToolRequestTimeout('storage.get','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.status','stay-focus'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.enable','stay-focus'),120000);
});
// Run the production sandbox bridge with a controlled clock and Host messages.
// No tool script, trusted click, Chrome permission or DNR write is simulated.
function bridgeHarness(){
  const listeners=new Map(),messages=[],timers=new Map();
  let now=0,sequence=0;
  const node=()=>({append(){},addEventListener(){}});
  const root={...node(),replaceChildren(){}};
  const window={addEventListener(type,callback){
    const callbacks=listeners.get(type)||[];
    callbacks.push(callback);listeners.set(type,callbacks);
  }};
  const parent={postMessage(message){messages.push(message);}};
  const emit=(type,event)=>{for(const callback of listeners.get(type)||[])callback(event);};
  runInNewContext('('+initSidebarToolSandbox.toString()+')()',{
    SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_SHARED_UI_RUNTIME,ADBLOCK_CONFIRM_OPERATIONS,
    sidebarToolRequestTimeout,createBrowserSdk,
    window,parent,document:{getElementById:id=>id==='tool-root'?root:{dataset:{}},
      documentElement:{},head:node(),body:node(),createElement:node},
    Blob,URL:{createObjectURL:()=> 'blob:adblock-timeout',revokeObjectURL(){}},
    requestAnimationFrame:()=>0,
    setTimeout(callback,ms){const id=++sequence;timers.set(id,{callback,at:now+ms});return id;},
    clearTimeout(id){timers.delete(id);}
  });
  emit('message',{source:parent,data:{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',
    instance:'adblock-timeout',tool:{id:'adblock',html:'',css:'',js:'void 0;'}}});
  return {
    request:window.OpenDeskTool.request,
    get requests(){return messages.filter(message=>message.kind==='request');},
    get pendingTimers(){return timers.size;},
    advance(ms){
      const end=now+ms;
      for(;;){
        const next=[...timers].filter(([,timer])=>timer.at<=end)
          .sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        const [id,timer]=next;now=timer.at;timers.delete(id);timer.callback();
      }
      now=end;
    },
    respond(request,response){emit('message',{source:parent,data:{
      ...request,kind:'response',...response}});},
    dispose(){emit('pagehide',{});}
  };
}

for(const operation of ['adblock.cosmetic.add','adblock.cosmetic.replace']){
  test(operation+' bridge waits for long confirmation and returns the Host receipt',async()=>{
    const bridge=bridgeHarness();
    try{
      const pending=bridge.request(operation,{selector:'.advertisement'});
      let settled=false;void pending.then(()=>{settled=true;},()=>{settled=true;});
      bridge.advance(89999);await Promise.resolve();
      assert.equal(settled,false,'confirmation can remain pending beyond eight seconds');
      assert.equal(bridge.requests.length,1,'waiting must not replay the write');
      const receipt={saved:true};
      bridge.respond(bridge.requests[0],{ok:true,result:receipt});
      assert.deepEqual(await pending,receipt);
      assert.equal(bridge.pendingTimers,0,'Host receipt clears the bridge deadline');
      bridge.advance(120000);
      assert.equal(bridge.requests.length,1);
    }finally{bridge.dispose();}
  });

  test(operation+' bridge preserves the explicit Host review expiry',async()=>{
    const bridge=bridgeHarness();
    try{
      const pending=bridge.request(operation,{selector:'.advertisement'});
      const rejected=assert.rejects(pending,{code:'E_ADBLOCK_CONFIRM_TIMEOUT'});
      bridge.advance(90000);
      bridge.respond(bridge.requests[0],{ok:false,error:{
        code:'E_ADBLOCK_CONFIRM_TIMEOUT',message:'可信确认等待超时，操作尚未提交'}});
      await rejected;
      assert.equal(bridge.pendingTimers,0);
      bridge.advance(120000);
      assert.equal(bridge.requests.length,1);
    }finally{bridge.dispose();}
  });

  test(operation+' bridge reports unknown outcome and ignores a late write receipt',async()=>{
    const bridge=bridgeHarness();
    try{
      const pending=bridge.request(operation,{selector:'.advertisement'});
      let settled=false;void pending.then(()=>{settled=true;},()=>{settled=true;});
      bridge.advance(119999);await Promise.resolve();
      assert.equal(settled,false,'an approved write may still be awaiting its receipt');
      const rejected=assert.rejects(pending,error=>{
        assert.equal(error.code,'E_OUTCOME_UNKNOWN');
        assert.match(error.message,/结果未知.*不要重复提交/);
        return true;
      });
      bridge.advance(1);await rejected;
      assert.equal(bridge.pendingTimers,0);
      assert.equal(bridge.requests.length,1,'timeout must not replay a write');
      const readback=bridge.request('adblock.status');
      let readSettled=false;void readback.then(()=>{readSettled=true;},()=>{readSettled=true;});
      bridge.respond(bridge.requests[0],{ok:true,result:{saved:true}});
      await Promise.resolve();
      assert.equal(readSettled,false,'late write receipt cannot settle a subsequent status read');
      bridge.respond(bridge.requests[1],{ok:true,result:{enabled:true}});
      assert.deepEqual(await readback,{enabled:true});
      bridge.advance(120000);
      assert.deepEqual(bridge.requests.map(request=>request.operation),[operation,'adblock.status']);
      assert.equal(bridge.pendingTimers,0);
    }finally{bridge.dispose();}
  });
}
// Exercise the actual trusted-host review function, not a DOM assignment string.
function reviewHarness(source){
  const start=source.indexOf('  function requestBrowserClick(');
  const end=source.indexOf('  // chrome.storage may reorder',start);
  assert.ok(start>=0&&end>start,'trusted review implementation must exist');
  const timers=[],patches=[];
  const context={
    disposed:false,busy:false,pendingAction:null,ADBLOCK_ID:'adblock',
    view:{},actionReview:{},
    // Production updates lexical state; its plain call does not bind `this`.
    requestActionReview(options){context.pendingAction=options;},
    patchToolField(_view,_field,patch){patches.push(patch);},
    setTimeout(callback,ms){const item={callback,ms,active:true};timers.push(item);return timers.length;},
    clearTimeout(id){if(timers[id-1])timers[id-1].active=false;}
  };
  const request=runInNewContext('('+source.slice(start,end).trim()+')',context);
  return {request,context,timers,patches,
    expire(){for(const timer of timers)if(timer.active){timer.active=false;timer.callback();}},
    cancel(){context.pendingAction?.cancel?.();},
    confirm(event={isTrusted:true}){const action=context.pendingAction;
      context.pendingAction=null;action?.run(event);}
  };
}

test('trusted review expiry prevents writing and differs from user cancellation',async()=>{
  const source=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  const expired=reviewHarness(source);
  let writes=0;
  const awaiting=expired.request({toolId:'adblock',message:'开启？',button:'确认',
    run:()=>{writes++;return true;}});
  assert.equal(expired.timers[0]?.ms,90000);
  expired.expire();
  await assert.rejects(awaiting,{code:'E_ADBLOCK_CONFIRM_TIMEOUT'});
  assert.equal(writes,0,'unapproved review must not write Chrome DNR');
  assert.equal(expired.context.pendingAction,null);
  assert.ok(expired.patches.some(x=>x.hidden===true),'expired review closes');

  const cancelled=reviewHarness(source);
  const asking=cancelled.request({toolId:'adblock',message:'开启？',button:'确认',
    run:()=>{writes++;return true;}});
  cancelled.cancel();
  await assert.rejects(asking,{code:'E_CANCELLED'});
  cancelled.expire();
  assert.equal(writes,0,'cancellation must not write Chrome DNR');
});

test('real approval disarms review timer while the Chrome write is still unresolved',async()=>{
  const source=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  const h=reviewHarness(source);
  let writes=0,finishWrite;
  const result=h.request({toolId:'adblock',message:'开启？',button:'确认',
    run:()=>{writes++;return new Promise(resolve=>{finishWrite=resolve;});}});
  let settled=false;void result.then(()=>{settled=true;},()=>{settled=true;});
  h.confirm({isTrusted:true});
  assert.equal(writes,1,'approved operation executes once');
  assert.equal(h.timers[0]?.active,false,'approval timer is cleared at confirmation');
  h.expire();await Promise.resolve();
  assert.equal(settled,false,'slow Chrome write must not become unapproved timeout');
  finishWrite({enabled:true});
  assert.deepEqual(await result,{enabled:true});
  assert.equal(writes,1,'no automatic duplicate write');
});

test('React follows uncertain writes with a single status read, not replay',async()=>{
  const src=await readFile(new URL('../../examples/sidebar-tools/adblock/src/App.jsx',import.meta.url),'utf8');
  assert.match(src,/needsReadback=true/);
  assert.match(src,/if\(queued\.current\|\|needsReadback\)/);
  assert.match(src,/void refresh\(true\)/);
});

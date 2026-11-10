import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunContext} from '../../src/framework/context.js';
import {createControllerDriver} from '../../src/framework/control/native-driver.js';

function fixture({frameId=0,signal}={}) {
  const target={mode:'owned',tabId:17,frameId,documentId:'search-document',allowedOrigin:'https://example.test',url:'https://example.test/'};
  const identity={tag:'controller-run',runId:crypto.randomUUID(),ownerEpoch:1,target};
  const revision={scriptId:'search',revision:1,sourceHash:'a'.repeat(64),pinKey:'pin:search'};
  const calls=[],receipts=[],envelopes=[];
  let allowed=true,documentId=target.documentId;
  const api={runtime:{},webNavigation:{getAllFrames:(_query,cb)=>cb([{frameId,documentId,url:target.url}])},
    tabs:{get:(id,cb)=>cb({id,windowId:8,active:true,incognito:false}),update:(id,options,cb)=>{
      calls.push(['tabs.update',id,options]);cb({id,windowId:8,active:true});}},
    windows:{update:(id,options,cb)=>{calls.push(['windows.update',id,options]);cb({id,focused:true});},
      get:(id,cb)=>cb({id,focused:true})}};
  const driver=createControllerDriver({api,authorize:async()=>allowed,beforeEffect:async(_envelope,details)=>{
    calls.push(['fence',details.method]);
  }});
  const context=createRunContext({identity,revision,target,transport:{request:async envelope=>{
    envelopes.push(envelope);return driver.execute(envelope,{signal,deadlineAt:Date.now()+2000,recordReceipt:async row=>receipts.push(row)});
  }}});
  return {api,context,driver,calls,receipts,envelopes,revoke:()=>{allowed=false;},replace:()=>{documentId='replacement';}};
}

test('public Controller page activates only its bound tab and focuses that tab window through fenced native calls',async()=>{
  const f=fixture();
  try {
    assert.equal(await f.context.page.bringToFront(),undefined);
    assert.deepEqual(f.calls,[['fence','bringToFront'],['tabs.update',17,{active:true}],
      ['fence','bringToFront'],['windows.update',8,{focused:true}]]);
    assert.equal(f.envelopes[0].operation.kind,'browser');
    assert.ok(f.receipts.some(row=>row.stage==='tabs.update'));
    assert.ok(f.receipts.some(row=>row.stage==='windows.update'));
    assert.ok(f.receipts.some(row=>row.stage==='windows.get'));
    assert.ok(f.receipts.some(row=>row.stage==='result'));
    await assert.rejects(f.driver.execute(f.envelopes[0]),{code:'E_OPERATION_REPLAY'});
    assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
  } finally {f.context.dispose();}
});

test('window focus is confirmed by readback when the update callback contains the previous focus state',async()=>{
  for(const focused of [true,false]) {
    const f=fixture();
    f.api.windows.update=(id,options,cb)=>{f.calls.push(['windows.update',id,options]);cb({id,focused:false});};
    f.api.windows.get=(id,cb)=>cb({id,focused});
    try {
      if(focused)assert.equal(await f.context.page.bringToFront(),undefined);
      else await assert.rejects(f.context.page.bringToFront(),{code:'E_WINDOW_FOCUS_UNCONFIRMED'});
      assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,1);
      assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
    } finally {f.context.dispose();}
  }
});

test('foreground rejects arguments, child frames, revoked grants and replaced targets before any activation',async()=>{
  for(const mode of ['argument','frame','permission','replacement']) {
    const f=fixture({frameId:mode==='frame'?1:0});
    try {
      if(mode==='permission')f.revoke();
      if(mode==='replacement')f.replace();
      await assert.rejects(mode==='argument'?f.context.page.bringToFront(true):f.context.page.bringToFront(),
        {code:{argument:'E_OPTION_UNSUPPORTED',frame:'E_TOP_FRAME_REQUIRED',permission:'E_PERMISSION',replacement:'E_DOCUMENT_REPLACED'}[mode]});
      assert.deepEqual(f.calls,[]);
    } finally {f.context.dispose();}
  }
});

test('delayed window focus is observed without repeating either foreground effect',async()=>{
  const f=fixture();let reads=0;
  f.api.windows.update=(id,options,cb)=>{f.calls.push(['windows.update',id,options]);cb({id,focused:false});};
  f.api.windows.get=(id,cb)=>cb({id,focused:++reads>=3});
  try {
    assert.equal(await f.context.page.bringToFront(),undefined);
    assert.equal(reads,3);
    assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
    assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,1);
  } finally {f.context.dispose();}
});

test('unconfirmed focus stops the business continuation and cannot replay foreground effects',async()=>{
  const f=fixture();let continued=0;
  f.api.windows.get=(id,cb)=>cb({id,focused:false});
  try {
    await assert.rejects((async()=>{await f.context.page.bringToFront();continued++;})(),
      {code:'E_WINDOW_FOCUS_UNCONFIRMED'});
    assert.equal(continued,0);
    assert.equal(f.receipts.some(row=>row.stage==='result'),false);
    await assert.rejects(f.driver.execute(f.envelopes[0]),{code:'E_OPERATION_REPLAY'});
    assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
    assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,1);
  } finally {f.context.dispose();}
});

test('Stop during focus observation settles once and a late focus receipt cannot revive execution',async()=>{
  const controller=new AbortController(),f=fixture({signal:controller.signal});let settleCount=0,lateReceipt;
  f.api.windows.get=(_id,cb)=>{lateReceipt=cb;controller.abort(Object.assign(new Error('Stopped'),{code:'E_CANCELLED'}));};
  try {
    await assert.rejects(f.context.page.bringToFront().finally(()=>{settleCount++;}),{code:'E_CANCELLED'});
    lateReceipt({id:8,focused:true});
    await Promise.resolve();
    assert.equal(settleCount,1);
    assert.equal(f.receipts.some(row=>row.stage==='result'),false);
    assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,1);
    await assert.rejects(f.driver.execute(f.envelopes[0]),{code:'E_CANCELLED'});
  } finally {f.context.dispose();}
});

test('focus readback waiting still stops on revoked permission or a changed target',async()=>{
  for(const mode of ['permission','document','window','inactive']) {
    const f=fixture();let reads=0,changed=false;
    f.api.tabs.get=(id,cb)=>cb({id,windowId:changed&&mode==='window'?9:8,active:!(changed&&mode==='inactive'),incognito:false});
    f.api.windows.get=(id,cb)=>{
      reads++;changed=true;
      if(mode==='permission')f.revoke();
      if(mode==='document')f.replace();
      cb({id,focused:false});
    };
    try {
      await assert.rejects(f.context.page.bringToFront(),{code:{permission:'E_PERMISSION',document:'E_DOCUMENT_REPLACED',window:'E_TARGET',inactive:'E_TARGET'}[mode]});
      assert.equal(reads,1);
      assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,1);
      assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
    } finally {f.context.dispose();}
  }
});

test('moving or deactivating the bound tab stops foregrounding without another focus effect',async()=>{
  for(const changedAt of ['activation','focus'])for(const changedField of ['windowId','active']) {
    const f=fixture();let changed=false;
    f.api.tabs.get=(id,cb)=>cb({id,windowId:changed&&changedField==='windowId'?9:8,
      active:!(changed&&changedField==='active'),incognito:false});
    const owner=changedAt==='activation'?f.api.tabs:f.api.windows;
    const update=owner.update;
    owner.update=(id,options,cb)=>update(id,options,result=>{changed=true;cb(result);});
    try {
      await assert.rejects(f.context.page.bringToFront(),{code:'E_TARGET'});
      assert.equal(f.calls.filter(row=>row[0]==='tabs.update').length,1);
      assert.equal(f.calls.filter(row=>row[0]==='windows.update').length,changedAt==='focus'?1:0);
    } finally {f.context.dispose();}
  }
});

test('activation with lost acknowledgement is submitted once and never followed by a window focus or replay',async()=>{
  const f=fixture();let submitted=0;
  f.api.tabs.update=()=>{submitted++;};
  try {
    await assert.rejects(f.context.page.bringToFront());
    await assert.rejects(f.driver.execute(f.envelopes[0]),{code:'E_CANCELLED'});
    assert.equal(submitted,1);
    assert.equal(f.calls.some(row=>row[0]==='windows.update'),false);
  } finally {f.context.dispose();}
});

test('revocation after tab activation prevents window focus and success delivery',async()=>{
  const f=fixture();
  f.api.tabs.update=(id,_options,cb)=>{f.revoke();cb({id,windowId:8,active:true});};
  try {
    await assert.rejects(f.context.page.bringToFront(),{code:'E_PERMISSION'});
    assert.equal(f.calls.some(row=>row[0]==='windows.update'),false);
  } finally {f.context.dispose();}
});

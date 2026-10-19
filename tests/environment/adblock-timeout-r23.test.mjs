import {runInNewContext} from 'node:vm';
// R2.3 source and contract tests. These do NOT claim Chrome/DNR execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sidebarToolRequestTimeout,ADBLOCK_CONFIRM_OPERATIONS}
  from '../../src/sidebar-tools/bridge.js';

test('all four AdBlock writes wait beyond the real host review deadline',()=>{
  assert.deepEqual([...ADBLOCK_CONFIRM_OPERATIONS],[
    'adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore']);
  for(const operation of ADBLOCK_CONFIRM_OPERATIONS)
    assert.ok(sidebarToolRequestTimeout(operation,'adblock')>90000,operation);
});
test('AdBlock status and unrelated tool request timing do not change',()=>{
  assert.equal(sidebarToolRequestTimeout('adblock.status','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.enable','quick-notes'),8000);
  assert.equal(sidebarToolRequestTimeout('storage.get','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.status','stay-focus'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.enable','stay-focus'),120000);
});
test('timeout loss never masquerades as AdBlock cancellation',async()=>{
  const src=await readFile(new URL('../../src/sidebar-tools/bridge.js',import.meta.url),'utf8');
  assert.match(src,/error\.code=uncertain\?'E_OUTCOME_UNKNOWN':'E_TOOL_TIMEOUT'/);
  assert.match(src,/waiting\.delete\(requestId\)/);
});
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

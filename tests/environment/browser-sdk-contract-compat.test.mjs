import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_OPERATIONS,browserCapabilityList,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
const isCode=expected=>e=>e?.code===expected;
test('Browser SDK 32 original and three R5 owned Tabs methods have typed metadata',()=>{
  const rows=Object.values(BROWSER_OPERATIONS);
  assert.equal(rows.length,35);
  assert.deepEqual(Object.assign({HOST_ONLY:0},Object.fromEntries(Object.entries(Object.groupBy(rows,x=>x.implementation))
    .map(([key,values])=>[key,values.length]))),{IMPLEMENTED:26,PLANNED:7,HOST_ONLY:0,NOT_EXPOSED:2});
  for(const op of rows){
    assert.equal(op.inputSchema?.type,'object',op.operation);
    assert.equal(op.inputSchema.additionalProperties,false,op.operation);
    assert(['object','array'].includes(op.outputSchema?.type),op.operation);
  }
  assert.equal(browserCapabilityList('page-sdk').find(x=>x.operation==='browser.notifications.create').exposure,'not-exposed');
});
test('all ten implemented wrappers preserve original authenticated request path',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(op,args)=>{calls.push([op,args]);return {ok:true};}});
  await sdk.capabilities.list();
  await sdk.capabilities.getStatus({operation:'browser.contextMenu.register'});
  await sdk.contextMenu.getStatus();
  await sdk.contextMenu.register({actionIds:['capture-selection']});
  await sdk.contextMenu.unregister();
  await sdk.launch.consume();
  await sdk.page.getContext();
  await sdk.page.getSelection();
  await sdk.clipboard.writeText('note');
  await sdk.downloads.text({text:'note',filename:'note.md'});
  assert.deepEqual(calls.map(x=>x[0]),[
    'browser.capabilities.list','browser.capabilities.getStatus','browser.contextMenu.getStatus',
    'browser.contextMenu.register','browser.contextMenu.unregister','browser.launch.consume',
    'browser.page.getContext','browser.page.getSelection','clipboard.writeText','file.download']);
});
test('Page discovery validates inputs and does not expose privileged browser methods',async()=>{
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal((await page.capabilities.getStatus({operation:'browser.tabs.open'})).callableNow,false);
  assert.equal(typeof page.tabs,'undefined');
  assert.throws(()=>page.capabilities.getStatus({operation:42}),isCode('E_SCHEMA'));
  assert.throws(()=>page.capabilities.getStatus({operation:'browser.tabs.open',additional:true}),isCode('E_SCHEMA'));
  await assert.rejects(page.contextMenu.register({actionIds:['capture-selection']}),isCode('E_CONTEXT'));
});
test('Legacy exports reject unsafe values before dispatch',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(...args)=>{calls.push(args);return {ok:true};}});
  assert.throws(()=>sdk.clipboard.writeText(''),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.clipboard.writeText('界'.repeat(50001)),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'../bad.md'}),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'bad.txt'}),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'valid.md',extra:1}),isCode('E_SCHEMA'));
  assert.equal(calls.length,0);
  await sdk.clipboard.writeText('界'.repeat(50000));
  assert.equal(calls.length,1);
});
test('PLANNED, HOST_ONLY and NOT_EXPOSED operations fail closed',()=>{
  for(const op of Object.values(BROWSER_OPERATIONS).filter(x=>x.implementation!=='IMPLEMENTED'))
    assert.throws(()=>normalizeBrowserOperation(op.operation,{}),isCode('E_SERVICE_UNSUPPORTED'),op.operation);
});

test('R5 public Tabs wrappers route through original Host with no raw native tabId',async()=>{
 const calls=[],sdk=createBrowserSdk({request:async(op,args)=>{calls.push(op);return {ok:true}}});
 const tabRef='r'.repeat(32);
 await sdk.tabs.getOwned({tabRef});await sdk.tabs.listOwned();await sdk.tabs.closeOwned({tabRef});
 assert.deepEqual(calls,['browser.tabs.getOwned','browser.tabs.listOwned','browser.tabs.closeOwned']);
 assert.throws(()=>sdk.tabs.getOwned({tabId:1}),isCode('E_SCHEMA'));
 assert.throws(()=>sdk.tabs.closeOwned({tabId:1}),isCode('E_SCHEMA'));
 assert.throws(()=>sdk.tabs.listOwned({all:true}),isCode('E_SCHEMA'));
 assert.equal(typeof createBrowserSdk({context:'page-sdk'}).tabs,'undefined');
});

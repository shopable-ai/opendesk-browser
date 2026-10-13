import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_OPERATIONS,browserCapabilityList,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
const isCode=expected=>e=>e?.code===expected;
test('R9 Browser SDK exposes only real implemented operations and typed metadata',()=>{
  const rows=Object.values(BROWSER_OPERATIONS);
  // Prelaunch SDK grows as real Host-backed operations land: never freeze an
  // arbitrary historical count and then fail when a correctly wired API ships.
  assert.equal(rows.length,new Set(rows.map(row=>row.operation)).size,'Duplicate public operation');
  assert(rows.every(row=>row.implementation==='IMPLEMENTED'),'No planned/hidden APIs in public registry');
  for(const operation of ['browser.tabs.create','browser.tabs.activateOwned',
    'browser.tabs.getOwned','browser.tabs.listOwned','browser.tabs.pinOwned',
    'browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.tabs.removeOwned'])
    assert.equal(BROWSER_OPERATIONS[operation]?.implementation,'IMPLEMENTED',operation);
  for(const op of rows){
    assert.equal(op.inputSchema?.type,'object',op.operation);
    assert.equal(op.inputSchema.additionalProperties,false,op.operation);
    assert(['object','array'].includes(op.outputSchema?.type),op.operation);
  }
  assert.equal(browserCapabilityList('page-sdk').find(x=>x.operation==='browser.notifications.create'),undefined);
});
test('all ten implemented wrappers use canonical authenticated browser operations',async()=>{
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
    'browser.page.getContext','browser.page.getSelection','browser.clipboard.writeText','browser.downloads.text']);
});
test('Page discovery validates inputs and does not expose privileged browser methods',async()=>{
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal((await page.capabilities.getStatus({operation:'browser.tabs.create'})).callableNow,false);
  assert.equal(typeof page.tabs,'undefined');
  assert.throws(()=>page.capabilities.getStatus({operation:42}),isCode('E_SCHEMA'));
  assert.throws(()=>page.capabilities.getStatus({operation:'browser.tabs.create',additional:true}),isCode('E_SCHEMA'));
  await assert.rejects(page.contextMenu.register({actionIds:['capture-selection']}),isCode('E_CONTEXT'));
});
test('Browser exports reject unsafe values before canonical dispatch',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(...args)=>{calls.push(args);return {ok:true};}});
  assert.throws(()=>sdk.clipboard.writeText(''),isCode('E_LIMIT'));
  assert.throws(()=>sdk.clipboard.writeText('界'.repeat(50001)),isCode('E_LIMIT'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'../bad.md'}),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'bad.txt'}),isCode('E_SCHEMA'));
  assert.throws(()=>sdk.downloads.text({text:'x',filename:'valid.md',extra:1}),isCode('E_SCHEMA'));
  assert.equal(calls.length,0);
  await sdk.clipboard.writeText('界'.repeat(50000));
  assert.equal(calls.length,1);
});
test('Removed prelaunch placeholder operations cannot be invoked or discovered',()=>{
 const removed=['browser.media.recording.prepare','browser.media.recording.getStatus',
  'browser.media.recording.stop','browser.media.recording.discard','browser.speech.transcribe',
  'browser.speech.speak','browser.speech.stop','browser.notifications.create',
  'browser.notifications.clear'];
 for(const name of removed){
  assert.equal(Object.hasOwn(BROWSER_OPERATIONS,name),false,name);
  assert.equal(browserCapabilityList('sidebar-tool').some(x=>x.operation===name),false,name);
  assert.throws(()=>normalizeBrowserOperation(name,{}),isCode('E_SERVICE_UNSUPPORTED'),name);
 }
});

test('R5 public Tabs wrappers route through original Host with no raw native tabId',async()=>{
 const calls=[],sdk=createBrowserSdk({request:async(op,args)=>{calls.push(op);return {ok:true}}});
 const tabRef='r'.repeat(32);
 await sdk.tabs.getOwned({tabRef});await sdk.tabs.listOwned();await sdk.tabs.reloadOwned({tabRef});await sdk.tabs.navigateOwned({tabRef,url:'https://example.org'});await sdk.tabs.removeOwned({tabRef});
 assert.deepEqual(calls,['browser.tabs.getOwned','browser.tabs.listOwned','browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.tabs.removeOwned']);
 assert.throws(()=>sdk.tabs.getOwned({tabId:1}),isCode('E_SCHEMA'));
 assert.throws(()=>sdk.tabs.removeOwned({tabId:1}),isCode('E_SCHEMA'));
 assert.throws(()=>sdk.tabs.listOwned({all:true}),isCode('E_SCHEMA'));
 assert.equal(typeof createBrowserSdk({context:'page-sdk'}).tabs,'undefined');
});

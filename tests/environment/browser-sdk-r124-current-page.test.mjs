import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentPageReferences} from '../../src/platform/chrome/current-page-refs.js';

const code=name=>error=>error?.code===name;
const owner={toolId:'bookmark-manager',toolVersion:'0.3.0',packageHash:'a'.repeat(64),
  installEpoch:'install-1',
  hostInstanceId:'11111111-1111-4111-8111-111111111111',
  toolInstance:'22222222-2222-4222-8222-222222222222'};
function fixture(){
  const document={tabId:42,windowId:6,documentId:'document-1',origin:'https://example.org',
    url:'https://example.org/answer',title:'Example'};
  const state={active:true,incognito:false,pendingUrl:false,status:'complete',
    documentId:document.documentId,url:document.url,tabId:document.tabId,windowId:document.windowId};
  let now=1000,seq=0;
  const api={
    tabs:{query:async({active,windowId})=>active&&windowId===state.windowId
      ?[{id:state.tabId,windowId:state.windowId,active:state.active,incognito:state.incognito,
        pendingUrl:state.pendingUrl,status:state.status,url:state.url,title:'Chrome title'}]:[]},
    webNavigation:{getFrame:async({tabId,frameId})=>tabId===state.tabId&&frameId===0
      ?{url:state.url,documentId:state.documentId,documentLifecycle:'active'}:null}
  };
  const make=()=>createCurrentPageReferences({api,clock:{now:()=>now},
    makeRef:()=>String(++seq).padStart(36,'a')});
  return {make,document,state,advance:ms=>{now+=ms}};
}
test('R2.4: opaque current-page SDK references are stable only for the same live document/installed instance',async()=>{
  const f=fixture(),service=f.make();
  const first=await service.issue({document:f.document,context:owner});
  const second=await service.issue({document:f.document,context:owner});
  assert.deepEqual(first,second,'same active document must keep refs across getContext reads');
  assert.equal(first.title,'Chrome title');
  assert.equal(Object.hasOwn(first,'tabId'),false,'native Chrome IDs stay in Host');
  assert.equal(Object.hasOwn(first,'documentId'),false);
  assert.deepEqual(await service.verify({url:first.url,tabRef:first.tabRef,
    documentRef:first.documentRef},owner),{tabId:42,windowId:6,documentId:'document-1',url:first.url});
  for(const invalid of [
    {...owner,toolId:'other-tool'}, {...owner,packageHash:'b'.repeat(64)},
    {...owner,installEpoch:'install-2'},
    {...owner,toolInstance:'33333333-3333-4333-8333-333333333333'},
    {...owner,hostInstanceId:'33333333-3333-4333-8333-333333333333'}
  ])await assert.rejects(service.verify(first,invalid),code('E_DOCUMENT_STALE'));
  await assert.rejects(service.verify({...first,documentRef:'a'.repeat(36)},owner),code('E_DOCUMENT_STALE'));
});
test('R2.4: same URL with a replaced Chrome document is never a reusable bookmark source',async()=>{
  const f=fixture(),service=f.make(),first=await service.issue({document:f.document,context:owner});
  f.state.documentId='document-2';
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  const next=await service.issue({document:{...f.document,documentId:'document-2'},context:owner});
  assert.notEqual(next.documentRef,first.documentRef);
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  assert.equal((await service.verify(next,owner)).documentId,'document-2');
});
test('R2.4: tab switch, navigation, incognito, loading and lost focus fail closed',async()=>{
  const f=fixture(),service=f.make(),first=await service.issue({document:f.document,context:owner});
  const scenarios=[
    ['active',false],['incognito',true],['pendingUrl','https://example.org/new'],
    ['status','loading'],['url','https://example.org/new'],['tabId',43]
  ];
  for(const [field,value] of scenarios){
    const before=f.state[field];f.state[field]=value;
    await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'),field);
    f.state[field]=before;
  }
  service.invalidateTab(42);
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  const next=await service.issue({document:f.document,context:owner});
  f.advance(60001);
  await assert.rejects(service.verify(next,owner),code('E_DOCUMENT_STALE'));
});
test('R2.4: worker restart, tool disable/reinstall or explicit revocation never resurrects prior opaque refs',async()=>{
  const f=fixture(),first=f.make(),refs=await first.issue({document:f.document,context:owner});
  await assert.rejects(f.make().verify(refs,owner),code('E_DOCUMENT_STALE'));
  first.revokeAll();
  assert.equal(first.diagnostics().references,0);
  await assert.rejects(first.verify(refs,owner),code('E_DOCUMENT_STALE'));
  await assert.rejects(first.issue({document:f.document,context:{
    ...owner,hostInstanceId:''}}),code('E_OWNER'));
});

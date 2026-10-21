import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentPageReferences} from '../../src/platform/chrome/current-page-refs.js';
import {createBrowserFullBookmarksHost} from '../../src/platform/chrome/bookmarks-full.js';

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
  return {make,api,document,state,advance:ms=>{now+=ms}};
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
  f.advance(480000);
  await assert.rejects(service.verify(next,owner),code('E_DOCUMENT_STALE'));
});

test('R2.1.1: Send-bound document survives slow inference without refreshing its identity or fixed deadline',async()=>{
  const f=fixture(),service=f.make(),first=await service.issue({document:f.document,context:owner});
  f.advance(120000);
  assert.equal((await service.verify(first,owner)).documentId,f.document.documentId);
  assert.deepEqual(await service.issue({document:f.document,context:owner}),first);
  f.advance(359999);
  assert.equal((await service.verify(first,owner)).documentId,f.document.documentId);
  f.advance(1);
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  const next=await service.issue({document:f.document,context:owner});
  assert.notEqual(next.tabRef,first.tabRef,'expired references cannot be revived');
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
});

test('R2.1.1: asynchronous verification cannot cross the fixed expiry boundary',async()=>{
  const f=fixture(),service=f.make(),first=await service.issue({document:f.document,context:owner});
  f.advance(479999);
  // Advance while Chrome's asynchronous document validation is pending.
  const pending=service.verify(first,owner);
  f.advance(1);
  await assert.rejects(pending,code('E_DOCUMENT_STALE'));
});

test('R2.1.1: the original document and revocation checks remain mandatory after slow inference',async()=>{
  const f=fixture(),service=f.make(),first=await service.issue({document:f.document,context:owner});
  f.advance(120000);
  f.state.documentId='replacement-same-url';
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  f.state.documentId=f.document.documentId;
  await assert.rejects(service.verify(first,{...owner,installEpoch:'revoked'}),code('E_DOCUMENT_STALE'));
  service.revokeAll();
  await assert.rejects(service.verify(first,owner),code('E_DOCUMENT_STALE'));
  await assert.rejects(f.make().verify(first,owner),code('E_DOCUMENT_STALE'));
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

async function bookmarkFixture(){
  const f=fixture(),references=f.make(),creates=[],hooks={};
  const nodes=new Map([
    ['0',{id:'0',title:'root',parentId:null}],
    ['1',{id:'1',title:'Bookmarks bar',parentId:'0'}],
    ['5',{id:'5',title:'Target folder',parentId:'1'}]
  ]);
  f.api.bookmarks={
    get:async id=>{await hooks.parentRead?.(id);return [{...nodes.get(id)}];},
    create:async details=>{
      creates.push({...details});return {id:'6',index:0,...details};
    }
  };
  const host=createBrowserFullBookmarksHost({api:f.api,
    authorize:async({operation,context})=>{
      assert.equal(operation,'browser.bookmarks.create');assert.deepEqual(context,owner);
    },verifySourcePage:(source,context)=>references.verify(source,context)});
  const page=await references.issue({document:f.document,context:owner});
  const args={parentId:'5',title:page.title,url:page.url,
    sourcePage:{url:page.url,tabRef:page.tabRef,documentRef:page.documentRef}};
  return {...f,references,host,creates,hooks,args};
}

test('R2.1.1: current-page references and Full Bookmarks Host create the original URL after 120 seconds',async()=>{
  const f=await bookmarkFixture();
  f.advance(120000);
  const created=await f.host.create(f.args,owner);
  assert.equal(created.id,'6');assert.equal(created.url,f.document.url);
  assert.equal(created.parentId,'5');
  assert.deepEqual(f.creates,[{parentId:'5',title:'Chrome title',url:f.document.url}],
    'only the verified URL and bookmark fields reach Chrome create');
});

for(const change of ['expiry','document']){
  test('R2.1.1: Full Bookmarks Host rejects '+change+' during pending parent checks before Chrome create',async()=>{
    const f=await bookmarkFixture(),entered=Promise.withResolvers(),release=Promise.withResolvers();
    f.advance(change==='expiry'?479999:120000);
    f.hooks.parentRead=async id=>{
      if(id==='5'){entered.resolve();await release.promise;}
    };
    const pending=f.host.create(f.args,owner);
    await entered.promise;
    if(change==='expiry')f.advance(1);
    else f.state.documentId='replacement-same-url';
    release.resolve();
    await assert.rejects(pending,code('E_DOCUMENT_STALE'));
    assert.equal(f.creates.length,0,'the final source check must precede Chrome create');
  });
}

test('R2.1.1: revocation during asynchronous current-page verification rejects the pending check',async()=>{
  const f=fixture(),references=f.make(),source=await references.issue({document:f.document,context:owner});
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),query=f.api.tabs.query;
  f.api.tabs.query=async args=>{entered.resolve();await release.promise;return query(args);};
  const pending=references.verify(source,owner);
  await entered.promise;
  references.revokeAll();release.resolve();
  await assert.rejects(pending,code('E_DOCUMENT_STALE'));
  assert.equal(references.diagnostics().references,0);
});

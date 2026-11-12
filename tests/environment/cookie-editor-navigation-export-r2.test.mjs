import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyCookiePageTransition} from '../../src/ui/sidebar-tools/cookie-page-transition.js';
import {createCookieController} from '../../projects/cookie-editor/app/controller/cookie-controller.js';
import {parseTarget} from '../../projects/cookie-editor/app/domain/cookie-model.js';

const origin='https://shop.example.com';
const documentPage=(url=origin+'/a',extras={})=>({
  status:'available',windowId:1,tabId:2,frameId:0,documentId:'doc-a',
  origin,url,title:'Chat',reason:null,...extras
});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
const row=(name='sid',value='TEST_ONLY_SECRET')=>({
  name,value,domain:'shop.example.com',path:'/',hostOnly:true,session:true,
  secure:false,httpOnly:false,sameSite:'lax',storeId:'0'
});
function fixture(){
  let page=origin+'/a',store='0',partition=origin,allowed=true,values=[row()];
  let copyResult={copied:true},copies=[];
  const listCalls=[];
  const adapter={
    targetFor:async()=>({target:parseTarget(page)}),
    checkRead:async()=>({callableNow:allowed,reasonCode:allowed?null:'E_SITE_GRANT_REQUIRED'}),
    getStore:async()=>({storeId:store}),
    getPartition:async()=>({partitionKey:{topLevelSite:partition}}),
    list:async(at,{includeValues=false,isCurrent=()=>true}={})=>{
      listCalls.push({url:at.url,includeValues});
      if(!isCurrent())return null;
      return values.map(value=>includeValues?{...value,valueRedacted:false}:
        Object.fromEntries(Object.entries({...value,valueRedacted:true})
          .filter(([key])=>key!=='value')));
    },
    beginExportIntent:async()=>({authorized:true,ref:1}),
    finishExportIntent:async()=>({closed:true}),
    copy:async text=>{copies.push(text);if(copyResult instanceof Error)throw copyResult;return copyResult;},
    download:async()=>({started:true})
  };
  const observed=[];
  const controller=createCookieController({adapter,onChange:s=>observed.push(s)});
  return {controller,adapter,observed,listCalls,copies,
    page:value=>{page=value},scope:(s,p)=>{store=s;partition=p},
    allow:value=>{allowed=value},rows:value=>{values=value},
    copyResult:value=>{copyResult=value}};
}
test('title, unchanged URL and query/hash ignore; path reconciles; identity changes invalidate',()=>{
  const before=documentPage();
  for(const after of [
    {...before,title:'new title'}, {...before,reason:'new reason'},
    {...before,url:origin+'/a?secret=query#hash'}
  ])assert.equal(classifyCookiePageTransition(before,after),'ignore');
  assert.equal(classifyCookiePageTransition(before,{...before,url:origin+'/b'}),'sync');
  for(const after of [
    {...before,documentId:'doc-b'}, {...before,tabId:3},
    {...before,origin:'https://other.example',url:'https://other.example/a'},
    {...before,status:'unavailable'}, {...before,frameId:1}
  ])assert.equal(classifyCookiePageTransition(before,after),'invalidate');
});
test('same-document path sync retains redacted list during slow read and preserves metadata',async()=>{
  const f=fixture();await f.controller.load();
  const old=f.controller.snapshot().rows,started=deferred(),read=deferred();
  const original=f.adapter.list;
  f.adapter.list=async(...args)=>{started.resolve();await read.promise;return original(...args)};
  f.page(origin+'/b');const update=f.controller.syncNavigation();
  await started.promise;
  const pending=f.controller.snapshot();
  assert.equal(pending.phase,'ready');
  assert.equal(pending.navigationPending,true);
  assert.deepEqual(pending.rows,old);
  assert.equal(await f.controller.readValue(old[0].id),null);
  assert.equal(await f.controller.exportTo({method:'copy'}),false);
  read.resolve();assert.equal(await update,true);
  assert.equal(f.controller.snapshot().target.url,origin+'/b');
  assert.equal(f.controller.snapshot().navigationPending,false);
  assert.deepEqual(f.controller.snapshot().rows,old);
  assert.doesNotMatch(JSON.stringify(f.observed),/TEST_ONLY_SECRET/);
  f.controller.dispose();
});
test('new path rechecks live rows and changed Store or Partition fails closed',async()=>{
  for(const [store,partition] of [['other-store',origin],['0','https://other.example']]){
    const f=fixture();await f.controller.load();
    f.page(origin+'/b');f.rows([row(),row('theme','ONLY_FIXTURE')]);
    assert.equal(await f.controller.syncNavigation(),true);
    assert.deepEqual(f.controller.snapshot().rows.map(x=>x.name),['sid','theme']);
    f.scope(store,partition);f.page(origin+'/c');
    assert.equal(await f.controller.syncNavigation(),false);
    assert.equal(f.controller.snapshot().phase,'blocked');
    assert.deepEqual(f.controller.snapshot().rows,[]);
    assert.equal(f.controller.snapshot().target,null);
    f.controller.dispose();
  }
});
test('rapid path events coalesce; late results cannot repopulate an invalidated origin',async()=>{
  const f=fixture();await f.controller.load();
  f.page(origin+'/b');
  const started=deferred(),read=deferred(),original=f.adapter.list;
  f.adapter.list=async(...args)=>{started.resolve();await read.promise;return original(...args)};
  const first=f.controller.syncNavigation();await started.promise;
  for(let i=0;i<20;i++){f.page(origin+'/path-'+i);void f.controller.syncNavigation();}
  f.controller.invalidate('new document');
  read.resolve();await first;
  assert.equal(f.controller.snapshot().target,null);
  assert.deepEqual(f.controller.snapshot().rows,[]);
  assert.equal(f.controller.snapshot().navigationPending,false);
  f.controller.dispose();
});
test('unknown Clipboard outcome is not replayed; ten sanitized diagnostics survive success',async()=>{
  const f=fixture();await f.controller.load();
  f.copyResult(Object.assign(Error('PRIVATE_BROWSER_DETAIL'),{code:'E_OUTCOME_UNKNOWN'}));
  assert.equal(await f.controller.exportTo({format:'json',method:'copy'}),false);
  assert.equal(f.copies.length,1);
  let history=f.controller.snapshot().exportDiagnostics;
  assert.equal(history[0].code,'E_OUTCOME_UNKNOWN');
  assert.equal(history[0].outcomeUnknown,true);
  assert.equal(history[0].stage,'clipboard');
  f.copyResult({copied:true});
  assert.equal(await f.controller.exportTo({format:'json',method:'copy'}),true);
  history=f.controller.snapshot().exportDiagnostics;
  assert.equal(history.length,2);
  assert.equal(history[0].outcomeUnknown,true);
  assert.equal(history[1].code,'OK');
  const diagnosticText=f.controller.exportDiagnosticText();
  assert.doesNotMatch(diagnosticText,/TEST_ONLY_SECRET|PRIVATE_BROWSER_DETAIL|https:\/\/shop/);
  assert.equal(await f.controller.copyExportDiagnostics(),true);
  assert.match(f.copies.at(-1),/opendesk.cookie-export-diagnostic.v1/);
  for(let i=0;i<12;i++)await f.controller.exportTo({format:'json',method:'copy'});
  assert.equal(f.controller.snapshot().exportDiagnostics.length,10);
  f.controller.invalidate('permission revoked');
  assert.equal(f.controller.snapshot().exportDiagnostics.length,10);
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()),/TEST_ONLY_SECRET|PRIVATE_BROWSER_DETAIL/);
  f.controller.dispose();
});
test('Host preserves generic navigation; Cookie export gate survives same-document path only',async()=>{
  const [host,bridge,app]=await Promise.all([
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/sidebar-tools/bridge.js','utf8'),
    readFile('projects/cookie-editor/app/CookieEditorApp.jsx','utf8')
  ]);
  assert.match(host,/classifyCookiePageTransition/);
  assert.match(host,/cookieTransition!=='sync'\)cookieExportGate\.revoke/);
  assert.match(host,/cookieTransition==='sync'\?'cookie-path-changed':'page-changed'/);
  assert.match(bridge,/opendesk-cookie-path-changed/);
  assert.match(app,/controller\.syncNavigation\(\)/);
  assert.match(app,/snapshot\.navigationPending/);
});

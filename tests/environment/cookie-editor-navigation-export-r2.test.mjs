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
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};};
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
for(const code of ['E_DOCUMENT_CHANGED','E_DOCUMENT_STALE'])test('queued SPA path navigation retires stale '+code+' without clearing rows',async()=>{
  const f=fixture();await f.controller.load();
  const start=f.observed.length;
  const started=deferred(),release=deferred(),original=f.adapter.list;
  f.page(origin+'/b');
  f.adapter.list=async()=>{started.resolve();await release.promise;
    throw Object.assign(Error('OLD_URL_ONLY'),{code});};
  const first=f.controller.syncNavigation();await started.promise;
  f.page(origin+'/c');
  void f.controller.syncNavigation();
  f.adapter.list=original;release.resolve();
  await first;
  await new Promise(resolve=>setImmediate(resolve));
  const result=f.controller.snapshot();
  assert.equal(result.phase,'ready');
  assert.equal(result.target?.url,origin+'/c');
  assert.ok(result.rows.length>0);
  assert.ok(f.observed.slice(start).every(s=>s.phase==='ready'&&s.rows.length>0));
  f.controller.dispose();
});
test('retired passive document mismatch cannot invalidate a newer path verification',async()=>{
  const f=fixture();await f.controller.load();
  const passive=deferred(),path=deferred(),started=deferred(),original=f.adapter.list;
  f.adapter.list=()=>passive.promise;
  const syncing=f.controller.syncMetadata();
  f.page(origin+'/b');
  f.adapter.list=async(...args)=>{started.resolve();await path.promise;return original(...args);};
  const navigating=f.controller.syncNavigation();await started.promise;
  passive.reject(Object.assign(Error('OLD_PATH'),{code:'E_DOCUMENT_CHANGED'}));
  assert.equal(await syncing,false);
  assert.equal(f.controller.snapshot().navigationPending,true);
  assert.equal(f.controller.snapshot().rows.length,1);
  path.resolve();assert.equal(await navigating,true);
  assert.equal(f.controller.snapshot().target.url,origin+'/b');
  f.controller.dispose();
});
test('navigation retires old value-read document mismatch but still respects actual revocation',async()=>{
  for(const code of ['E_DOCUMENT_CHANGED','E_GRANT_REVOKED']){
    const f=fixture();await f.controller.load();
    const value=deferred(),path=deferred(),started=deferred(),original=f.adapter.list;
    f.adapter.readValue=()=>value.promise;
    const reading=f.controller.readValue(f.controller.snapshot().rows[0].id);
    f.page(origin+'/b');
    f.adapter.list=async(...args)=>{started.resolve();await path.promise;return original(...args);};
    const navigating=f.controller.syncNavigation();await started.promise;
    value.reject(Object.assign(Error('RETIRED_VALUE'),{code}));
    assert.equal(await reading,null);
    if(code==='E_GRANT_REVOKED'){
      assert.equal(f.controller.snapshot().phase,'blocked');
      assert.equal(f.controller.snapshot().target,null);
    }else{
      assert.equal(f.controller.snapshot().navigationPending,true);
      assert.equal(f.controller.snapshot().rows.length,1);
    }
    path.resolve();await navigating;
    assert.equal(f.controller.snapshot().target?.url,code==='E_GRANT_REVOKED'?undefined:origin+'/b');
    f.controller.dispose();
  }
});
test('successful Cookie mutation preserves queued navigation instead of loading the old path',async()=>{
  for(const operation of ['save','remove']){
    const f=fixture();await f.controller.load();
    const effect=deferred(),started=deferred();let writes=0;
    f.adapter.targetFor=async input=>({target:parseTarget(input||origin+'/b')});
    f.adapter.write=f.adapter.remove=async()=>{writes++;started.resolve();return effect.promise;};
    const pending=operation==='save'?f.controller.save(row('new')):
      f.controller.remove(f.controller.snapshot().rows[0].id);
    await started.promise;
    assert.equal(await f.controller.syncNavigation(),false,'Busy operation queues the path');
    effect.resolve(operation==='save'?{saved:true,verified:true}:{removed:true,verified:true});
    assert.equal(await pending,true,'Keep the actual native mutation receipt');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.controller.snapshot().target?.url,origin+'/b');
    assert.equal(f.controller.snapshot().phase,'ready');
    assert.equal(f.controller.snapshot().navigationPending,false);
    assert.equal(writes,1,'Reconciliation cannot replay the mutation');
    f.controller.dispose();
  }
});
test('old navigation completion or rejection cannot unlock or invalidate a new run',async()=>{
  for(const rejects of [false,true]){
    const f=fixture();await f.controller.load();
    const old=deferred(),oldStarted=deferred(),fresh=deferred(),freshStarted=deferred();
    const original=f.adapter.list;
    f.page(origin+'/b');
    f.adapter.list=async()=>{oldStarted.resolve();return old.promise;};
    const retired=f.controller.syncNavigation();await oldStarted.promise;
    f.controller.invalidate('real document changed');
    f.page(origin+'/c');f.adapter.list=original;await f.controller.load();
    f.page(origin+'/d');
    f.adapter.list=async(...args)=>{freshStarted.resolve();await fresh.promise;return original(...args);};
    const live=f.controller.syncNavigation();await freshStarted.promise;
    if(rejects)old.reject(Object.assign(Error('OLD_DOCUMENT'),{code:'E_DOCUMENT_CHANGED'}));
    else old.resolve([]);
    assert.equal(await retired,false);
    assert.equal(f.controller.snapshot().navigationPending,true);
    assert.equal(f.controller.snapshot().phase,'ready');
    assert.equal(await f.controller.exportTo({format:'json',method:'copy'}),false);
    assert.equal(f.copies.length,0);
    fresh.resolve();assert.equal(await live,true);
    assert.equal(f.controller.snapshot().target.url,origin+'/d');
    assert.equal(f.controller.snapshot().rows.length,1);
    f.controller.dispose();
  }
});
test('same-scope path verification preserves the change ledger used by the active filter',async()=>{
  const f=fixture();await f.controller.load();
  f.rows([row(),row('new-cookie')]);await f.controller.syncMetadata();
  const changes=f.controller.snapshot().changes;
  assert.ok(changes.length>0);
  f.page(origin+'/b');assert.equal(await f.controller.syncNavigation(),true);
  assert.deepEqual(f.controller.snapshot().changes,changes);
  f.controller.dispose();
});
test('navigation failure reports only a fixed read stage and allowlisted error code',async()=>{
  for(const code of ['E_TOOL_TIMEOUT','PRIVATE_CODE']){
    const f=fixture();await f.controller.load();f.page(origin+'/b');
    f.adapter.list=async()=>{throw Object.assign(Error('PRIVATE_HOST_DETAIL'),
      {code,url:origin+'/PRIVATE_QUERY',cookie:row()});};
    assert.equal(await f.controller.syncNavigation(),false);
    assert.deepEqual(f.controller.snapshot().readDiagnostic,{operation:'navigation',
      stage:'list',code:code==='E_TOOL_TIMEOUT'?code:'E_COOKIE_READ'});
    assert.doesNotMatch(JSON.stringify(f.controller.snapshot()),/PRIVATE_|TEST_ONLY_SECRET/);
    assert.equal(f.controller.snapshot().phase,'blocked');
    f.controller.dispose();
  }
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

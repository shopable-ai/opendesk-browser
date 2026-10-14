import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserDownloadsHost} from '../../src/platform/chrome/browser-downloads.js';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';

const SHA='a'.repeat(64);
const owner={toolId:'download-test',toolVersion:'1.0.0',packageHash:SHA,installEpoch:'install-1',
  approvedOrigin:null};
const error=code=>e=>e?.code===code;
function fixture(){
  let allowed=true,now=1000,nextId=40,nextRef=0,throwDownload=false,throwCancel=false,revokeOnEffect=false,revokeOnSearch=false;
  const downloads=new Map(),called=[],auth=[];
  const api={downloads:{
    async download(options){
      called.push(['download',structuredClone(options)]);
      if(throwDownload)throw Error('Chrome callback uncertain');
      const id=nextId++;downloads.set(id,{id,state:'in_progress',bytesReceived:5,totalBytes:1024});
      if(revokeOnEffect)allowed=false;
      return id;
    },
    async search(query){called.push(['search',structuredClone(query)]);
      const value=downloads.get(query.id);if(revokeOnSearch)allowed=false;return value?[{...value}]:[];},
    async cancel(id){called.push(['cancel',id]);if(throwCancel)throw Error('Chrome cancel reply uncertain');
      if(!downloads.has(id))throw Error('missing');
      downloads.get(id).state='interrupted'}
  }};
  const host=createBrowserDownloadsHost({api,clock:{now:()=>now},
    createRef:()=>('download-ref-'+(++nextRef)).padEnd(36,'x'),
    authorize:async({operation,context,origin})=>{
      auth.push({operation,origin});
      if(!allowed)throw Object.assign(Error('revoked'),{code:'E_SITE_PERMISSION_REVOKED'});
      if(context.packageHash!==SHA||context.toolId!=='download-test')
        throw Object.assign(Error('foreign'),{code:'E_TOOL_CHANGED'});
      if(origin&&origin!=='https://files.example')
        throw Object.assign(Error('not approved'),{code:'E_SITE_PERMISSION_REVOKED'});
    }});
  return {host,api,downloads,called,auth,
    revoke(){allowed=false},grant(){allowed=true},
    tick(ms){now+=ms},breakDownload(){throwDownload=true},breakCancel(){throwCancel=true},
    revokeOnEffect(){revokeOnEffect=true},revokeOnSearch(){revokeOnSearch=true}};
}
const request={url:'https://files.example/releases/archive.txt',filename:'exports/archive.txt'};
test('P3 downloads registry, SDK methods and strict schema are canonical',async()=>{
  const names=['download','getOwned','listOwned','cancelOwned'];
  const expected=names.map(name=>'browser.downloads.'+name);
  for(const id of expected){
    assert.equal(BROWSER_OPERATIONS[id]?.implementation,'IMPLEMENTED');
    assert.equal(BROWSER_OPERATIONS[id].inputSchema?.type,'object');
    assert.equal(BROWSER_OPERATIONS[id].inputSchema.additionalProperties,false);
  }
  const calls=[],sdk=createBrowserSdk({request:async(name,args)=>{calls.push({name,args});return args}});
  await sdk.downloads.download(request);
  await sdk.downloads.getOwned({downloadRef:'r'.repeat(32)});
  await sdk.downloads.listOwned({limit:2});
  await sdk.downloads.cancelOwned({downloadRef:'r'.repeat(32)});
  assert.deepEqual(calls.map(x=>x.name),expected);
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.download',{url:'file:///etc/passwd'}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.download',{url:request.url,filename:'../escape.txt'}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.download',{url:request.url,filename:'\\temp.exe'}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.download',{url:request.url,filename:'reports\\run.txt'}),error('E_SCHEMA'));
  assert.equal(normalizeBrowserOperation('browser.downloads.download',{url:request.url,filename:'reports/run.txt'}).filename,'reports/run.txt');
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.download',{url:request.url,secret:true}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.cancelOwned',{downloadRef:'x'}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.downloads.listOwned',{limit:51}),error('E_SCHEMA'));
  assert.equal(normalizeBrowserOperation('browser.downloads.download',request).url,request.url);
});
test('P3 download start has confirmed native ID inside Host only; reads, list and cancel stay owned',async()=>{
  const f=fixture(),created=await f.host.download(request,owner);
  assert.match(created.downloadRef,/^[A-Za-z0-9_-]{16,160}$/);
  assert.deepEqual(Object.keys(created).sort(),['downloadRef','status']);
  assert.equal(created.status,'started');
  assert.equal(f.called[0][0],'download');assert.equal(f.called[0][1].saveAs,true);
  const state=await f.host.getOwned({downloadRef:created.downloadRef},owner);
  assert.deepEqual(state,{downloadRef:created.downloadRef,state:'in_progress',bytesReceived:5,totalBytes:1024});
  const list=await f.host.listOwned({},owner);
  assert.deepEqual(list.items,[{downloadRef:created.downloadRef,state:'in_progress'}]);
  assert.equal(f.called.filter(([method])=>method==='search').every(([,query])=>Number.isSafeInteger(query.id)),true);
  assert.deepEqual(await f.host.cancelOwned({downloadRef:created.downloadRef},owner),{cancelled:true});
  assert.equal((await f.host.getOwned({downloadRef:created.downloadRef},owner)).state,'interrupted');
  assert.deepEqual(await f.host.cancelOwned({downloadRef:created.downloadRef},owner),{cancelled:false});
  assert.equal(f.called.filter(([method])=>method==='cancel').length,1);
});
test('P3 tool changes, foreign refs, site revocation and Worker disposal cannot escape DownloadRef',async()=>{
  const f=fixture();
  const one=await f.host.download(request,owner);
  await assert.rejects(f.host.getOwned({downloadRef:one.downloadRef},
    {...owner,toolVersion:'2.0.0'}),error('E_DOWNLOAD_REF_INVALID'));
  await assert.rejects(f.host.cancelOwned({downloadRef:one.downloadRef},
    {...owner,toolId:'another-tool'}),error('E_DOWNLOAD_REF_INVALID'));
  await assert.rejects(f.host.getOwned({downloadRef:'missing-opaque-token-000000'},owner),
    error('E_DOWNLOAD_REF_INVALID'));
  f.revoke();
  await assert.rejects(f.host.getOwned({downloadRef:one.downloadRef},owner),
    error('E_SITE_PERMISSION_REVOKED'));
  await assert.rejects(f.host.cancelOwned({downloadRef:one.downloadRef},owner),
    error('E_SITE_PERMISSION_REVOKED'));
  f.grant();
  const before=f.called.filter(([op])=>op==='cancel').length;
  f.host.revokeAll();
  await assert.rejects(f.host.getOwned({downloadRef:one.downloadRef},owner),
    error('E_DOWNLOAD_REF_INVALID'));
  assert.equal(f.called.filter(([op])=>op==='cancel').length,before);
  const second=await f.host.download(request,owner);
  f.tick(24*60*60*1000+1);
  await assert.rejects(f.host.getOwned({downloadRef:second.downloadRef},owner),
    error('E_DOWNLOAD_REF_INVALID'),'old ref must expire even if installed package did not change');
});
test('P3 unknown native outcome and post-effect revocation must not claim success or retry',async()=>{
  const f=fixture();
  f.breakDownload();
  await assert.rejects(f.host.download(request,owner),error('E_OUTCOME_UNKNOWN'));
  assert.equal(f.called.filter(([method])=>method==='download').length,1);
  assert.equal(f.host.diagnostics().count,0);
  const g=fixture();g.revokeOnEffect();
  await assert.rejects(g.host.download(request,owner),error('E_OUTCOME_UNKNOWN'));
  assert.equal(g.host.diagnostics().count,0);
  assert.equal(g.called.filter(([method])=>method==='download').length,1);
});
test('P3 uncertain native cancel is never silently retried and is not reported as success',async()=>{
  const f=fixture(),started=await f.host.download(request,owner);
  f.breakCancel();
  await assert.rejects(f.host.cancelOwned({downloadRef:started.downloadRef},owner),
    error('E_OUTCOME_UNKNOWN'));
  assert.equal(f.called.filter(([kind])=>kind==='cancel').length,1);
  // The reference remains scoped to its owner for explicit manual reconciliation.
  assert.equal((await f.host.getOwned({downloadRef:started.downloadRef},owner)).state,'in_progress');
});
test('P3 own-only cursor pagination never fetches global Chrome download history',async()=>{
  const f=fixture(),refs=[];
  for(let i=0;i<4;i++)refs.push((await f.host.download(request,owner)).downloadRef);
  const first=await f.host.listOwned({limit:2},owner);
  assert.deepEqual(first.items.map(x=>x.downloadRef),refs.slice(0,2));
  assert.equal(first.nextCursor,refs[1]);
  const last=await f.host.listOwned({cursor:first.nextCursor,limit:2},owner);
  assert.deepEqual(last.items.map(x=>x.downloadRef),refs.slice(2));
  assert.equal(last.nextCursor,undefined);
  await assert.rejects(f.host.listOwned({cursor:'other-opaque-token-xxxxxxxx',limit:2},owner),
    error('E_DOWNLOAD_REF_INVALID'));
  assert(f.called.filter(([op])=>op==='search').every(([,args])=>Object.keys(args).join(',')==='id'));
});

test('P3 own-download state enumeration revalidates exact Origin after each Chrome search',async()=>{
  const f=fixture(),started=await f.host.download(request,owner);
  f.revokeOnSearch();
  await assert.rejects(f.host.listOwned({},owner),error('E_SITE_PERMISSION_REVOKED'));
  assert(f.auth.filter(row=>row.operation==='browser.downloads.listOwned')
    .some(row=>row.origin==='https://files.example'));
  await assert.rejects(f.host.getOwned({downloadRef:started.downloadRef},owner),
    error('E_SITE_PERMISSION_REVOKED'));
});

test('P3 cancelOwned checks revoked Origin after Chrome search, before any cancel side effect',async()=>{
  const f=fixture(),started=await f.host.download(request,owner);
  f.revokeOnSearch();
  await assert.rejects(f.host.cancelOwned({downloadRef:started.downloadRef},owner),
    error('E_SITE_PERMISSION_REVOKED'));
  assert.equal(f.called.filter(([op])=>op==='cancel').length,0);
  assert(f.auth.filter(x=>x.operation==='browser.downloads.cancelOwned'&&x.origin==='https://files.example').length>=2);
});
test('P3 revocation while Chrome searches an owned download cannot cancel a stale ref',async()=>{
  const f=fixture(),started=await f.host.download(request,owner);
  const search=f.api.downloads.search;
  let entered,release;
  const searchEntered=new Promise(resolve=>{entered=resolve});
  const holdSearch=new Promise(resolve=>{release=resolve});
  f.api.downloads.search=async args=>{
    entered();
    await holdSearch;
    return search(args);
  };
  const pending=f.host.cancelOwned({downloadRef:started.downloadRef},owner);
  await searchEntered;
  f.host.revokeAll();
  release();
  await assert.rejects(pending,error('E_GRANT_REVOKED'));
  assert.equal(f.called.filter(([op])=>op==='cancel').length,0,
    'Revoked DownloadRef must not reach chrome.downloads.cancel');
});

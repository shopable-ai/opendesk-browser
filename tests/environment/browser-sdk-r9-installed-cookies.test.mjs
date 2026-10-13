import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedCookieHost} from '../../src/platform/chrome/browser-cookie-host.js';

const origin='https://shop.example.test';
const target=origin+'/account';
const partitionKey={topLevelSite:origin,hasCrossSiteAncestor:false};
const reject=code=>error=>error?.code===code;

// Component-level Chrome API callback fixture. Never a substitute for an
// installed tool's genuine Chrome sender, permission prompt or Native PASS.
function fixture(){
  const state={
    records:[
      {name:'sid',value:'PRIVATE_ROOT',domain:'shop.example.test',path:'/',storeId:'0',hostOnly:true,secure:true,httpOnly:true,session:true,sameSite:'lax'},
      {name:'sid',value:'PRIVATE_ACCOUNT',domain:'shop.example.test',path:'/account',storeId:'0',hostOnly:true,secure:true,httpOnly:true,session:true,sameSite:'lax'},
      {name:'parent',value:'PRIVATE_PARENT',domain:'.shop.example.test',path:'/',storeId:'0',hostOnly:false,secure:true,session:true},
      {name:'foreign',value:'OTHER_STORE',domain:'shop.example.test',path:'/',storeId:'1',hostOnly:true,secure:true,session:true},
      {name:'chips',value:'PARTITIONED',domain:'shop.example.test',path:'/',storeId:'0',hostOnly:true,secure:true,session:true,partitionKey}
    ],events:[],native:[],allowed:true,values:false,revokeOnSet:false
  };
  const samePartition=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const matches=(row,details)=>{
    if(details.storeId!==undefined&&row.storeId!==details.storeId)return false;
    if(!samePartition(row.partitionKey,details.partitionKey))return false;
    if(details.name!==undefined&&row.name!==details.name)return false;
    if(details.domain!==undefined&&row.domain.replace(/^\./,'')!==details.domain)return false;
    if(details.url){
      const url=new URL(details.url),domain=row.domain.replace(/^\./,'');
      if(url.hostname!==domain&& (row.hostOnly||!url.hostname.endsWith('.'+domain)))return false;
      const path=row.path;
      if(url.pathname!==path&&!url.pathname.startsWith(path.endsWith('/')?path:path+'/'))return false;
      if(row.secure&&url.protocol!=='https:')return false;
    }
    return true;
  };
  const choose=d=>state.records.filter(row=>matches(row,d)).sort((a,b)=>b.path.length-a.path.length);
  const callback=(method,fn)=>(details,cb)=>{
    state.native.push(method);
    cb(fn(details));
  };
  const api={runtime:{lastError:null},cookies:{
    onChanged:{addListener:callback=>state.events.push(callback)},
    getAll:callback('getAll',d=>choose(d).map(row=>({...row}))),
    get:callback('get',d=>choose(d)[0]??null),
    set:callback('set',d=>{
      const url=new URL(d.url),domain=d.domain??url.hostname,path=d.path??'/';
      const row={name:d.name,value:d.value,domain,path,
        storeId:d.storeId??'0',hostOnly:d.domain===undefined,
        secure:d.secure===true,httpOnly:d.httpOnly===true,
        sameSite:d.sameSite??'unspecified',session:d.expirationDate===undefined,
        ...(d.partitionKey?{partitionKey:d.partitionKey}:{})};
      state.records=state.records.filter(old=>!(old.name===row.name&&
        old.domain===row.domain&&old.path===row.path&&
        old.storeId===row.storeId&&samePartition(old.partitionKey,row.partitionKey)));
      state.records.push(row);
      if(state.revokeOnSet)state.allowed=false;
      return row;
    }),
    remove:callback('remove',d=>{
      const row=choose(d)[0];
      if(!row)return null;
      state.records.splice(state.records.indexOf(row),1);
      return {name:row.name,url:d.url,storeId:row.storeId};
    })
  }};
  const host=createTrustedCookieHost({api});
  const grant=(extra={})=>({
    origin,storeId:'0',partitionKey,ownerKey:'cookie-editor:2.0.0:epoch-1',
    authorize:async ({url,includeValues})=>{
      if(!state.allowed||new URL(url).origin!==origin)
        throw Object.assign(new Error('Cookie site or tool grant revoked'),{code:'E_GRANT_REVOKED'});
      if(includeValues&&!state.values)
        throw Object.assign(new Error('Sensitive values not approved'),{code:'E_COOKIE_VALUES_REQUIRED'});
    },...extra
  });
  const run=(op,args={},scope=grant())=>host.executeInstalled('browser.cookies.'+op,
    {url:target,...args},scope);
  return {state,host,run,grant,api};
}

test('R9 installed getAll returns a Chrome-shaped array, redacts values and isolates Store/Partition',async()=>{
  const f=fixture();
  const rows=await f.run('getAll');
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(row=>row.valueRedacted),[true,true,true]);
  assert(!JSON.stringify(rows).includes('PRIVATE'));
  assert(!rows.some(row=>row.storeId==='1'||row.partitionKey));
  assert.equal(rows[0].path,'/account');
  assert.equal((await f.run('getAll',{partitionKey})).length,1);
  await assert.rejects(f.run('getAll',{storeId:'1'}),reject('E_COOKIE_STORE'));
  await assert.rejects(f.run('getAll',{partitionKey:{topLevelSite:'https://foreign.test'}}),
    reject('E_COOKIE_PARTITION'));
  await assert.rejects(f.run('getAll',{},f.grant({origin:'https://other.test'})),
    reject('E_COOKIE_SCOPE'));
});

test('R9 sensitive value requires separate permission and exact identity avoids ambiguous name',async()=>{
  const f=fixture();
  await assert.rejects(f.run('getAll',{includeValues:true}),reject('E_COOKIE_VALUES_REQUIRED'));
  await assert.rejects(f.run('get',{name:'sid'}),reject('E_COOKIE_AMBIGUOUS'));
  f.state.values=true;
  const row=await f.run('get',{name:'sid',domain:'shop.example.test',path:'/account',includeValues:true});
  assert.equal(row.cookie.value,'PRIVATE_ACCOUNT');
  assert.equal(row.cookie.valueRedacted,false);
  f.state.values=false;
  await assert.rejects(f.run('get',{name:'sid',path:'/account',domain:'shop.example.test',includeValues:true}),
    reject('E_COOKIE_VALUES_REQUIRED'));
});

test('R9 native set/readback and precise removal never target another path or Cookie Store',async()=>{
  const f=fixture();
  const inserted=await f.run('set',{name:'new',value:'PRIVATE_NEW',path:'/',secure:true});
  assert.equal(inserted.saved,true);
  assert.equal(inserted.verified,true);
  assert(!JSON.stringify(inserted).includes('PRIVATE_NEW'));
  const removed=await f.run('remove',{name:'sid',domain:'shop.example.test',path:'/account'});
  assert.equal(removed.removed,true);
  assert.equal(removed.verified,true);
  assert(f.state.records.some(row=>row.name==='sid'&&row.path==='/'));
  assert(f.state.records.some(row=>row.name==='foreign'&&row.storeId==='1'));
  await assert.rejects(f.run('remove',{name:'sid',domain:'other.test',path:'/'}),
    reject('E_COOKIE_NOT_FOUND'));
});

test('R9 host-only site cleanup is previewed, count-fenced and preserves domain/other store',async()=>{
  const f=fixture(),preview=await f.run('clearSite',{preview:true,maxCookies:50});
  assert.equal(preview.preview,true);
  assert.equal(preview.matched,2);
  assert.equal(f.state.records.length,5);
  assert.match(preview.previewRef,/^[0-9a-f-]{36}$/i);
  await assert.rejects(f.run('clearSite',{expectedCount:1,previewRef:preview.previewRef,maxCookies:50}),reject('E_COOKIE_STALE'));
  const refreshed=await f.run('clearSite',{preview:true,maxCookies:50});
  const receipt=await f.run('clearSite',{expectedCount:2,previewRef:refreshed.previewRef,maxCookies:50});
  assert.equal(receipt.preview,false);
  assert.equal(receipt.removed,2);
  assert.equal(receipt.remaining,0);
  assert(f.state.records.some(row=>row.name==='parent'&&!row.hostOnly));
  assert(f.state.records.some(row=>row.name==='foreign'&&row.storeId==='1'));
  assert(f.state.records.some(row=>row.name==='chips'&&row.partitionKey));
  await assert.rejects(f.run('clearSite',{expectedCount:2,previewRef:refreshed.previewRef,maxCookies:50}),
    reject('E_COOKIE_STALE'),'A consumed preview must not permit a second deletion');
});
test('R9 clear preview refuses replacement cookies even when the count is unchanged',async()=>{
  const f=fixture(),preview=await f.run('clearSite',{preview:true,maxCookies:50});
  f.state.records=f.state.records.filter(row=>!(row.name==='sid'&&row.path==='/account'));
  f.state.records.push({name:'new-cookie',value:'NOT_APPROVED',domain:'shop.example.test',
    path:'/',hostOnly:true,secure:true,storeId:'0',session:true});
  await assert.rejects(f.run('clearSite',{expectedCount:preview.matched,
    previewRef:preview.previewRef,maxCookies:50}),reject('E_COOKIE_STALE'));
  assert(f.state.records.some(row=>row.name==='new-cookie'));
});


test('R9 observation sessions are tool-owned, bounded, redacted and revoked',async()=>{
  const f=fixture();
  const session=await f.run('observe.start',{durationMs:15000,maxEvents:5});
  for(const listener of f.state.events)listener({cookie:{
    name:'sid',value:'SHOULD_NEVER_LEAK',domain:'shop.example.test',hostOnly:true,
    path:'/account',storeId:'0',partitionKey:{topLevelSite:'https://foreign.test'}},removed:false,cause:'explicit'});
  for(const listener of f.state.events)listener({cookie:{
    name:'sid',value:'SHOULD_NEVER_LEAK',domain:'shop.example.test',hostOnly:true,
    path:'/account',storeId:'0'},removed:true,cause:'explicit'});
  const result=await f.run('observe.read',{sessionRef:session.sessionRef,cursor:'0',limit:5});
  assert.equal(result.events.length,1);
  assert(!JSON.stringify(result).includes('SHOULD_NEVER_LEAK'));
  assert.equal(result.events[0].removed,true);
  await assert.rejects(f.run('observe.read',{sessionRef:session.sessionRef},
    f.grant({ownerKey:'foreign-tool:other-epoch'})),reject('E_SESSION_EXPIRED'));
  f.host.revoke();
  await assert.rejects(f.run('observe.getStatus',{sessionRef:session.sessionRef}),reject('E_SESSION_EXPIRED'));
});

test('R9 revocation after native effect returns outcome unknown and never performs a second set',async()=>{
  const f=fixture();
  f.state.revokeOnSet=true;
  await assert.rejects(f.run('set',{name:'changed',value:'SECRET',path:'/',secure:true}),
    reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.state.native.filter(x=>x==='set').length,1);
  assert(f.state.records.some(x=>x.name==='changed'));
});

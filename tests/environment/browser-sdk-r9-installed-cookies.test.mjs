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
    ],events:[],native:[],allowed:true,values:false,revokeOnSet:false,revokeOnGetAll:false
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
    getAll:callback('getAll',d=>{
      const rows=choose(d).map(row=>({...row}));
      if(state.revokeOnGetAll)state.allowed=false;
      return rows;
    }),
    get:callback('get',d=>choose(d)[0]??null),
    set:callback('set',d=>{
      const url=new URL(d.url),domain=d.domain??url.hostname,
        path=d.path??(url.pathname.slice(0,url.pathname.lastIndexOf('/'))||'/');
      const row={name:d.name,value:d.value,domain,path,
        storeId:d.storeId??'0',hostOnly:d.domain===undefined,
        secure:d.secure===true,httpOnly:d.httpOnly===true,
        sameSite:d.sameSite??'unspecified',session:d.expirationDate===undefined,
        ...(d.expirationDate!==undefined?{expirationDate:d.expirationDate}:{}),
        ...(d.partitionKey?{partitionKey:d.partitionKey}:{})};
      state.records=state.records.filter(old=>!(old.name===row.name&&
        old.domain===row.domain&&old.path===row.path&&
        old.storeId===row.storeId&&samePartition(old.partitionKey,row.partitionKey)));
      if(d.expirationDate!==0)state.records.push(row);
      if(state.revokeOnSet)state.allowed=false;
      return d.expirationDate===0?null:row;
    }),
    remove:callback('remove',d=>{
      const rows=choose(d);
      if(!rows.length)return null;
      for(const row of rows)state.records.splice(state.records.indexOf(row),1);
      return {name:d.name,url:d.url,storeId:d.storeId};
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
test('R9 exact expiration preserves same-name Store, Partition and domain peers without reading Value',async()=>{
  const f=fixture();
  f.state.records.push(
    {name:'sid',value:'OTHER_STORE_SID',domain:'shop.example.test',path:'/account',storeId:'1',hostOnly:true,secure:true},
    {name:'sid',value:'PARTITION_SID',domain:'shop.example.test',path:'/account',storeId:'0',hostOnly:true,secure:true,partitionKey},
    {name:'sid',value:'DOMAIN_SID',domain:'.shop.example.test',path:'/account',storeId:'0',hostOnly:false,secure:true}
  );
  const nativeSet=f.api.cookies.set,writes=[];
  f.api.cookies.set=(details,callback)=>{writes.push(details);return nativeSet(details,callback);};
  await f.run('remove',{name:'sid',domain:'shop.example.test',path:'/account'});
  assert.deepEqual(writes,[{url:target,name:'sid',value:'',path:'/account',expirationDate:0,
    storeId:'0',secure:true,httpOnly:true,sameSite:'lax'}]);
  assert.equal(f.state.records.filter(row=>row.name==='sid').length,4);
  assert(!f.state.native.includes('remove'));
  assert.equal(f.state.values,false,'Deleting a selected Cookie does not require values permission');
});
test('R9 exact identity race preserves the same-name root sibling before expiration',async()=>{
  const f=fixture(),get=f.api.cookies.get,selections=[];
  const sibling=f.state.records.find(row=>row.name==='sid'&&row.path==='/');
  let gets=0,result,failure;
  f.api.cookies.get=(details,callback)=>{
    // Host scans with getAll and validates /account with get; the second get
    // is Driver's pre-expiration selection, after Host validation.
    // Rename cleanup uses this same exact removal boundary after saving a copy.
    if(++gets===2){
      assert.deepEqual(selections,['/account']);
      f.state.records=f.state.records.filter(row=>!(row.name==='sid'&&row.path==='/account'));
    }
    return get(details,row=>{selections.push(row?.path??null);callback(row);});
  };
  try{
    result=await f.run('remove',{name:'sid',domain:'shop.example.test',path:'/account'});
  }catch(error){failure=error;}
  assert.equal(selections[1],'/','The raced native lookup must select the surviving sibling');
  assert(f.state.records.includes(sibling),'The root sibling must survive the exact identity race');
  assert.equal(sibling.path,'/');
  assert.equal(sibling.value,'PRIVATE_ROOT');
  assert(!f.state.native.includes('set'),'A changed native selection must not dispatch expiration');
  assert(!f.state.native.includes('remove'),'A changed native selection must not dispatch native remove');
  if(failure)assert.equal(failure.code,'E_COOKIE_AMBIGUOUS');
  else assert.equal(result.removed,false,'An absent exact target may only return no deletion');
});
test('R9 revocation during the pre-delete native lookup dispatches no expiration',async()=>{
  const f=fixture(),get=f.api.cookies.get;
  f.api.cookies.get=(details,callback)=>get(details,row=>{
    f.state.allowed=false;
    callback(row);
  });
  await assert.rejects(f.run('remove',{name:'sid',domain:'shop.example.test',path:'/account'}),reject('E_GRANT_REVOKED'));
  assert(!f.state.native.includes('set'));
  assert(!f.state.native.includes('remove'));
  assert(f.state.records.some(row=>row.name==='sid'&&row.path==='/account'&&row.value==='PRIVATE_ACCOUNT'));
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


test('R10 clear preview rejects a changed value with an identical Cookie identity',async()=>{
  const f=fixture(),preview=await f.run('clearSite',{preview:true,maxCookies:50});
  const existing=f.state.records.find(row=>row.name==='sid'&&row.path==='/account');
  assert(existing,'fixture must include an authorized exact-host Cookie');
  existing.value='REPLACED_LOGIN_AFTER_PREVIEW';
  await assert.rejects(f.run('clearSite',{expectedCount:preview.matched,
    previewRef:preview.previewRef,maxCookies:50}),reject('E_COOKIE_STALE'));
  assert.equal(existing.value,'REPLACED_LOGIN_AFTER_PREVIEW');
  assert(f.state.records.includes(existing),'a stale destructive preview must not remove the replacement');
});

test('R10 clear preview rejects same-identity security attribute changes',async()=>{
  const f=fixture(),preview=await f.run('clearSite',{preview:true,maxCookies:50});
  const existing=f.state.records.find(row=>row.name==='sid'&&row.path==='/account');
  existing.httpOnly=false;
  await assert.rejects(f.run('clearSite',{expectedCount:preview.matched,
    previewRef:preview.previewRef,maxCookies:50}),reject('E_COOKIE_STALE'));
  assert(f.state.records.includes(existing));
});

test('R9 installed Cookie observer does not inherit the partition grant without an explicit partition selector',async()=>{
  const f=fixture();
  // The user has a partition receipt for this selected site, but the public
  // observe.start({url}) operation deliberately has no partitionKey argument.
  // Default observation must match default unpartitioned Cookie reads only.
  const session=await f.run('observe.start',{durationMs:15000,maxEvents:5});
  const common={name:'sid',domain:'shop.example.test',hostOnly:true,
    path:'/account',storeId:'0',value:'NEVER_LEAK_VALUE'};
  for(const listener of f.state.events)listener({cookie:{...common,partitionKey},
    removed:false,cause:'explicit'});
  assert.equal((await f.run('observe.getStatus',{sessionRef:session.sessionRef})).bufferedCount,0,
    'Partitioned Cookie metadata must not leak into a default observer');
  for(const listener of f.state.events)listener({cookie:{...common},
    removed:true,cause:'explicit'});
  const events=await f.run('observe.read',{sessionRef:session.sessionRef,cursor:'0'});
  assert.equal(events.events.length,1);
  assert.equal(events.events[0].removed,true);
  assert(!JSON.stringify(events).includes('NEVER_LEAK_VALUE'));
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

test('R9 set verifies the exact native identity with getAll despite an earlier same-name domain peer',async()=>{
  const f=fixture();
  f.state.records.unshift({name:'saved',value:'SAME_VALUE',domain:'.shop.example.test',path:'/account',
    storeId:'0',hostOnly:false,secure:true,httpOnly:true,sameSite:'strict',session:true});
  f.api.cookies.get=()=>{throw new Error('Single-cookie selection is not an exact write readback');};
  const result=await f.run('set',{name:'saved',value:'SAME_VALUE',path:'/account',secure:true,
    httpOnly:true,sameSite:'strict'});
  assert.equal(result.verified,true);
  assert.equal(result.cookie.domain,'shop.example.test');
  assert.equal(result.cookie.hostOnly,true);
  assert.equal(result.cookie.path,'/account');
  assert.equal(result.cookie.storeId,'0');
  assert.equal(result.cookie.valueRedacted,true);
  assert(!JSON.stringify(result).includes('SAME_VALUE'));
  assert.equal(f.state.native.filter(method=>method==='set').length,1);
});

test('R9 set rejects a missing exact target even when its same-value root sibling remains',async()=>{
  const f=fixture(),set=f.api.cookies.set;
  f.state.records.find(row=>row.name==='sid'&&row.path==='/').value='SAME_VALUE';
  f.api.cookies.set=(details,callback)=>set(details,row=>{
    f.state.records=f.state.records.filter(cookie=>cookie!==row);
    callback(row);
  });
  await assert.rejects(f.run('set',{name:'sid',value:'SAME_VALUE',path:'/account',secure:true}),
    reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.state.native.filter(method=>method==='set').length,1);
  assert(f.state.records.some(row=>row.name==='sid'&&row.path==='/'&&row.value==='SAME_VALUE'));
});

test('R9 set readback revocation fails closed with one write and no secret receipt',async()=>{
  const f=fixture(),getAll=f.api.cookies.getAll;
  f.api.cookies.getAll=(details,callback)=>getAll(details,rows=>{
    f.state.allowed=false;callback(rows);
  });
  await assert.rejects(f.run('set',{name:'changed',value:'SECRET',path:'/',secure:true}),
    reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.state.native.filter(method=>method==='set').length,1);
  assert(f.state.records.some(row=>row.name==='changed'));
});

test('R9 installed HTTP Partition supports exact set/remove and keeps Store, site, ancestor and grant checks',async()=>{
  const f=fixture(),httpPartition={topLevelSite:'http://shop.example.test',hasCrossSiteAncestor:false};
  const scope=f.grant({partitionKey:httpPartition});
  const args={name:'http-partition',value:'SECRET',path:'/account',secure:true,storeId:'0',partitionKey:httpPartition};
  assert.equal((await f.run('set',args,scope)).verified,true);
  assert.equal((await f.run('getAll',{partitionKey:httpPartition},scope)).length,1);
  for(const [patch,code] of [
    [{storeId:'1'},'E_COOKIE_STORE'],
    [{partitionKey:{...httpPartition,topLevelSite:'http://foreign.test'}},'E_COOKIE_PARTITION'],
    [{partitionKey:{...httpPartition,hasCrossSiteAncestor:true}},'E_COOKIE_PARTITION']
  ])await assert.rejects(f.run('set',{...args,...patch},scope),reject(code));
  assert.equal(f.state.native.filter(method=>method==='set').length,1);
  const removed=await f.run('remove',{name:args.name,domain:'shop.example.test',path:'/account',
    storeId:'0',partitionKey:httpPartition},scope);
  assert.deepEqual(removed,{removed:true,verified:true});
  assert(f.state.records.some(row=>row.name==='sid'&&row.path==='/account'&&!row.partitionKey));
  f.state.allowed=false;
  await assert.rejects(f.run('set',args,scope),reject('E_GRANT_REVOKED'));
  assert.equal(f.state.native.filter(method=>method==='set').length,2);
});

test('R9 ifAbsent rejects an existing exact new name before native effect and preserves conflict code',async()=>{
  const f=fixture(),prior={name:'new-name',value:'EXISTING_LOGIN',domain:'.shop.example.test',path:'/account',
    storeId:'0',hostOnly:false,secure:true,httpOnly:true,sameSite:'lax',session:true};
  f.state.records.push(prior);
  const before=structuredClone(f.state.records);
  await assert.rejects(f.run('set',{name:prior.name,value:'REPLACEMENT',path:prior.path,
    secure:true,storeId:'0',ifAbsent:true}),reject('E_COOKIE_CONFLICT'));
  assert.equal(f.state.native.includes('set'),false);
  assert.equal(f.state.native.includes('remove'),false);
  assert.deepEqual(f.state.records,before);
});

test('R9 ifAbsent allows and preserves same-name peers in other Paths, Stores and Partitions',async()=>{
  const f=fixture(),common={name:'new-name',value:'PEER_SECRET',domain:'shop.example.test',
    hostOnly:true,secure:true,httpOnly:true,sameSite:'lax',session:true};
  const peers=[
    {...common,path:'/',storeId:'0'},
    {...common,path:'/account',storeId:'1'},
    {...common,path:'/account',storeId:'0',partitionKey}
  ],before=structuredClone(peers),set=f.api.cookies.set,writes=[];
  f.state.records.push(...peers);
  f.api.cookies.set=(details,callback)=>{writes.push(details);return set(details,callback);};
  const saved=await f.run('set',{name:common.name,value:'NEW_VALUE',path:'/account',
    secure:true,storeId:'0',ifAbsent:true});
  assert.equal(saved.verified,true);
  assert.equal(saved.cookie.path,'/account');
  assert.equal(saved.cookie.storeId,'0');
  assert.equal(saved.cookie.partitionKey,undefined);
  assert.equal(writes.length,1);
  assert.equal(Object.hasOwn(writes[0],'ifAbsent'),false,'Host consumes ifAbsent before Driver schema validation');
  assert.deepEqual(peers,before);
  assert(peers.every(peer=>f.state.records.includes(peer)));
});

test('R9 set verifies persistent domain-cookie attributes and returns only redacted metadata',async()=>{
  const f=fixture(),expirationDate=Math.floor(Date.now()/1000)+3600;
  const saved=await f.run('set',{name:'persistent',value:'SECRET',domain:'.shop.example.test',path:'/account',
    secure:true,httpOnly:true,sameSite:'strict',expirationDate,storeId:'0',partitionKey});
  assert.equal(saved.verified,true);
  assert.equal(saved.cookie.domain,'.shop.example.test');
  assert.equal(saved.cookie.hostOnly,false);
  assert.equal(saved.cookie.secure,true);
  assert.equal(saved.cookie.httpOnly,true);
  assert.equal(saved.cookie.sameSite,'strict');
  assert.equal(saved.cookie.session,false);
  assert.equal(saved.cookie.expirationDate,expirationDate);
  assert.deepEqual(saved.cookie.partitionKey,partitionKey);
  assert.equal(saved.cookie.valueRedacted,true);
  assert.equal(Object.hasOwn(saved.cookie,'value'),false);
});


test('R9 revocation during no-overwrite scan prevents native writes',async()=>{
  const f=fixture();f.state.revokeOnGetAll=true;
  const before=structuredClone(f.state.records);
  await assert.rejects(f.run('set',{name:'fictional-revoked-new',value:'never-write',
    path:'/account',secure:true,storeId:'0',ifAbsent:true}),reject('E_GRANT_REVOKED'));
  assert.equal(f.state.native.filter(method=>method==='set').length,0);
  assert.deepEqual(f.state.records,before);
});

for(const path of ['/a/../b','/account?x']){
  test('R9 ifAbsent rejects an existing literal Cookie Path '+path+' before any write',async()=>{
    const f=fixture();
    f.state.records.push({name:'literal-path',value:'ORIGINAL',domain:'shop.example.test',
      path,storeId:'0',hostOnly:true,secure:true,httpOnly:false,sameSite:'unspecified',session:true});
    const before=structuredClone(f.state.records);
    await assert.rejects(f.run('set',{name:'literal-path',value:'REPLACEMENT',path,
      secure:true,storeId:'0',ifAbsent:true}),reject('E_COOKIE_CONFLICT'));
    assert.equal(f.state.native.includes('set'),false);
    assert.deepEqual(f.state.records,before);
  });
  test('R9 ifAbsent creates and verifies a new literal Cookie Path '+path,async()=>{
    const f=fixture();
    const result=await f.run('set',{name:'literal-path',value:'NEW_VALUE',path,
      secure:true,storeId:'0',ifAbsent:true});
    assert.equal(result.verified,true);
    assert.equal(result.cookie.path,path);
    assert.equal(f.state.native.filter(method=>method==='set').length,1);
  });
}

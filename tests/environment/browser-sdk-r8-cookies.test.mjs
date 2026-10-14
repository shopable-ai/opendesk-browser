import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieService} from '../../src/platform/chrome/cookies.js';
const url='https://example.org/page';
const context={origin:'https://example.org',documentId:'doc-1'};
const reject=code=>err=>err?.code===code;
function fixture(){
  const records=[],calls=[];
  let approved=true,doc='doc-1',lostReceipt=false;
  const api={runtime:{lastError:null},cookies:{
    get(d,cb){calls.push('get');cb(records.filter(row=>row.name===d.name&&
      (!d.storeId||row.storeId===d.storeId)&&
      JSON.stringify(row.partitionKey??null)===JSON.stringify(d.partitionKey??null)&&
      new URL(d.url).hostname===row.domain&&new URL(d.url).pathname.startsWith(row.path))
      .sort((a,b)=>b.path.length-a.path.length)[0]??null);},
    getAll(d,cb){calls.push('getAll');cb(records.filter(row=>
      (!d.name||d.name===row.name)&&
      (!d.storeId||d.storeId===row.storeId)&&
      JSON.stringify(row.partitionKey??null)===JSON.stringify(d.partitionKey??null)&&
      (d.domain?row.domain===d.domain:new URL(d.url).hostname===row.domain&&
        new URL(d.url).pathname.startsWith(row.path))));},
    set(d,cb){calls.push('set');const value={name:d.name,value:d.value,
      domain:d.domain??new URL(d.url).hostname,
      path:d.path??(new URL(d.url).pathname.slice(0,new URL(d.url).pathname.lastIndexOf('/'))||'/'),hostOnly:!d.domain,
        storeId:d.storeId??'0',secure:d.secure??false,httpOnly:d.httpOnly??false,
        sameSite:d.sameSite??'unspecified',session:d.expirationDate===undefined,
        ...(d.expirationDate!==undefined?{expirationDate:d.expirationDate}:{}),
      ...(d.partitionKey?{partitionKey:d.partitionKey}:{})};
      const same=row=>row.name===value.name&&row.domain===value.domain&&row.path===value.path&&
        row.storeId===value.storeId&&JSON.stringify(row.partitionKey??null)===JSON.stringify(value.partitionKey??null);
      for(let i=records.length-1;i>=0;i--)if(same(records[i]))records.splice(i,1);
      if(d.expirationDate===0){
        if(lostReceipt)api.runtime.lastError={message:'Native callback lost after expiration'};
        cb(null);api.runtime.lastError=null;
      }else{records.push(value);cb(value);}},
    remove(d,cb){calls.push('remove');
      const rows=records.filter(value=>value.name===d.name&&
        value.domain===new URL(d.url).hostname&&
        new URL(d.url).pathname.startsWith(value.path)&&
        (!d.storeId||value.storeId===d.storeId)&&
        JSON.stringify(value.partitionKey??null)===JSON.stringify(d.partitionKey??null))
        .sort((a,b)=>b.path.length-a.path.length);
      for(const row of rows)records.splice(records.indexOf(row),1);
      cb(lostReceipt?null:rows.length?{name:d.name,url:d.url}:null);},
    getAllCookieStores(cb){cb([{id:'0',tabIds:[10]},{id:'other',tabIds:[999]}]);},
    getPartitionKey(_d,cb){cb({partitionKey:{topLevelSite:'https://example.org',hasCrossSiteAncestor:false}});}
  }};
  const authorize=async (req,ctx)=>{
    if(!approved||ctx?.documentId!==doc||(req.origin??new URL(req.url).origin)!==ctx.origin)
      throw Object.assign(new Error('revoked'),{code:'E_PERMISSION'});
    return true;
  };
  const resolveTarget=async (_req,ctx)=>ctx.documentId===doc?
    {tabId:10,frameId:0,documentId:doc,origin:ctx.origin}:null;
  const service=createCookieService({api,authorize,resolveTarget});
  return {api,service,records,calls,revoke:()=>{approved=false;},navigate:()=>{doc='doc-2';},
    loseReceipt:()=>{lostReceipt=true;}};
}
test('R8 Host-only Cookie read/write handles partition and value redaction',async()=>{
  const f=fixture();
  const partitionKey={topLevelSite:'https://example.org',hasCrossSiteAncestor:false};
  const saved=await f.service.set({url,name:'__Host-sid',value:'SECRET',path:'/',secure:true,partitionKey},context);
  assert.equal(saved.verified,true);
  assert.equal(saved.cookie.value,undefined);
  assert.equal((await f.service.get({url,name:'__Host-sid',partitionKey},context)).valueRedacted,true);
  assert.equal(await f.service.get({url,name:'__Host-sid'},context),null);
  const list=await f.service.getAll({url,partitionKey},context);
  assert.equal(JSON.stringify(list).includes('SECRET'),false);
  assert.equal((await f.service.remove({url,name:'__Host-sid',partitionKey},context)).verified,true);
  f.revoke();
  await assert.rejects(f.service.getAll({url},context),reject('E_PERMISSION'));
});
test('R8 Cookie validates prefixes and never reports full-site delete incorrectly',async()=>{
  const f=fixture();
  for(const d of [{url,name:'__Host-sid',value:'x',secure:true},
    {url,name:'sid',value:'x',sameSite:'no_restriction'},
    {url,name:'sid',value:'x',domain:'.foreign.org'},
    {url,name:'sid',value:'x',partitionKey:{topLevelSite:'https://foreign.org/page'}}])
    await assert.rejects(f.service.set(d,context));
  assert.equal(f.calls.includes('set'),false);
  await f.service.set({url,name:'one',value:'1',path:'/'},context);
  await f.service.set({url,name:'two',value:'2',path:'/other/'},context);
  f.records.push({name:'domain',value:'3',domain:'example.org',path:'/',hostOnly:false,storeId:'0'});
  const cleared=await f.service.clearSite({url,maxCookies:5},context);
  assert.equal(cleared.removed,2);
  assert.equal(cleared.siteFullyCleared,false);
  assert.equal(f.records.length,1);
});
test('R8 ambiguous native effect is never automatically retried',async()=>{
  const f=fixture();
  await f.service.set({url,name:'x',value:'y'},context);
  f.loseReceipt();
  await assert.rejects(f.service.remove({url,name:'x'},context),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.filter(x=>x==='set').length,2,'One create and one exact expiration; no retry');
  assert.equal(f.calls.filter(x=>x==='remove').length,0);
});
test('R8 Store/partition need real document and do not expose other tabId',async()=>{
  const f=fixture();
  assert.deepEqual(await f.service.getStores({url},context),{storeId:'0'});
  assert.deepEqual(await f.service.getPartitionKey({url},context),
    {partitionKey:{topLevelSite:'https://example.org',hasCrossSiteAncestor:false}});
  f.navigate();
  await assert.rejects(f.service.getStores({url},context),reject('E_PERMISSION'));
});
test('R8 preserves Controller getCookies/setCookies/deleteCookiesByUrl contracts',async()=>{
  const f=fixture();
  await f.service.setCookies([{url,name:'old',value:'token'}],context);
  assert.equal((await f.service.getCookies(url,context))[0].value,'token');
  await f.service.deleteCookiesByUrl(url,context);
  assert.equal(f.records.length,0);
});

test('R8 cleanup checks native Store and Partition even if Chrome getAll returns wider data',async()=>{
  const f=fixture(),partitionKey={topLevelSite:'https://example.org',hasCrossSiteAncestor:false};
  f.records.push(
    {name:'selected',value:'delete',domain:'example.org',path:'/',storeId:'0',hostOnly:true},
    {name:'wrong-store',value:'keep',domain:'example.org',path:'/',storeId:'other',hostOnly:true},
    {name:'wrong-partition',value:'keep',domain:'example.org',path:'/',storeId:'0',
      hostOnly:true,partitionKey}
  );
  f.api.cookies.getAll=(_details,callback)=>callback(f.records.map(row=>({...row})));
  const receipt=await f.service.clearSite({url,storeId:'0',maxCookies:5},context);
  assert.equal(receipt.removed,1);
  assert.deepEqual(f.records.map(row=>row.name).sort(),['wrong-partition','wrong-store']);
});

test('R8 remove verifies exact Cookie identity when a shorter same-name Path survives',async()=>{
  const f=fixture(),account='https://example.org/account';
  await f.service.set({url:'https://example.org/',name:'sid',value:'root',path:'/'},context);
  await f.service.set({url:account,name:'sid',value:'account',path:'/account'},context);
  const receipt=await f.service.remove({url:account,name:'sid'},context);
  assert.deepEqual(receipt,{removed:true,verified:true});
  assert.deepEqual(f.records.map(row=>[row.name,row.path,row.value]),[['sid','/','root']]);
  assert.equal(f.calls.filter(x=>x==='set').length,3,'One exact expiration; no retry');
  assert.equal(f.calls.filter(x=>x==='remove').length,0,'URL/name native removal can delete multiple Paths');
});
test('R8 clearSite does not misreport surviving same-name paths as failed deletions',async()=>{
  const f=fixture();
  await f.service.set({url:'https://example.org/',name:'sid',value:'root',path:'/'},context);
  await f.service.set({url:'https://example.org/account',name:'sid',value:'account',path:'/account'},context);
  const result=await f.service.clearSite({url,maxCookies:5},context);
  assert.equal(result.removed,2);
  assert.equal(result.remaining,0);
  assert.equal(f.records.length,0);
});

const writePartition={topLevelSite:'https://example.org',hasCrossSiteAncestor:false};
const verifiedWrite={url,name:'sid',value:'SAME_VALUE',path:'/account',storeId:'0',
  partitionKey:writePartition,secure:true,httpOnly:true,sameSite:'strict',expirationDate:2000000000};
const corruptWrites=[
  ['Name',{name:'other'}],
  ['Domain',{domain:'foreign.org'}],
  ['Path',{path:'/'}],
  ['Store',{storeId:'other'}],
  ['Partition site',{partitionKey:{...writePartition,topLevelSite:'https://foreign.org'}}],
  ['Partition ancestor',{partitionKey:{...writePartition,hasCrossSiteAncestor:true}}],
  ['HostOnly',{hostOnly:false}],
  ['Value',{value:'DIFFERENT_VALUE'}],
  ['Secure',{secure:false}],
  ['HttpOnly',{httpOnly:false}],
  ['SameSite',{sameSite:'lax'}],
  ['Session',{session:true}],
  ['Expiry',{expirationDate:2000000001}]
];
for(const phase of ['receipt','readback'])for(const [label,patch] of corruptWrites)
test('R8 set rejects mismatched '+phase+' '+label+' without retry',async()=>{
  const f=fixture();
  if(phase==='receipt'){
    const set=f.api.cookies.set;
    f.api.cookies.set=(details,callback)=>set(details,row=>callback({...row,...patch}));
  }else{
    const getAll=f.api.cookies.getAll;
    f.api.cookies.getAll=(details,callback)=>getAll(details,rows=>callback(rows.map(row=>({...row,...patch}))));
  }
  await assert.rejects(f.service.set(verifiedWrite,context),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.filter(method=>method==='set').length,1);
  assert.equal(f.calls.includes('remove'),false);
});

test('R8 set cannot verify a vanished target using its same-value shorter Path sibling',async()=>{
  const f=fixture(),set=f.api.cookies.set;
  f.records.push({name:'sid',value:'SAME_VALUE',domain:'example.org',path:'/',storeId:'0',
    hostOnly:true,secure:true,httpOnly:true,sameSite:'strict',session:false,
    expirationDate:2000000000,partitionKey:writePartition});
  f.api.cookies.set=(details,callback)=>set(details,row=>{
    f.records.splice(f.records.indexOf(row),1);
    callback(row);
  });
  await assert.rejects(f.service.set(verifiedWrite,context),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.records.length,1);
  assert.equal(f.records[0].path,'/');
  assert.equal(f.calls.filter(method=>method==='set').length,1);
});

for(const [label,reply] of [
  ['missing',()=>[]],['duplicate',rows=>[rows[0],{...rows[0]}]],
  ['invalid',()=>null],['oversized',rows=>Array.from({length:10001},()=>rows[0])]
])test('R8 set rejects '+label+' exact readback without retry',async()=>{
  const f=fixture(),getAll=f.api.cookies.getAll;
  f.api.cookies.getAll=(details,callback)=>getAll(details,rows=>callback(reply(rows)));
  await assert.rejects(f.service.set(verifiedWrite,context),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.filter(method=>method==='set').length,1);
});

test('R8 set fails before writing when exact getAll readback is unavailable',async()=>{
  const f=fixture();delete f.api.cookies.getAll;
  await assert.rejects(f.service.set(verifiedWrite,context),reject('E_CHROME_UNSUPPORTED'));
  assert.equal(f.calls.includes('set'),false);
});

test('R8 HTTP schemeful Partition permits authorized HTTPS writes and exact reads/removal',async()=>{
  const f=fixture(),partitionKey={topLevelSite:'http://example.org',hasCrossSiteAncestor:false};
  const args={url,name:'http-partition',value:'SECRET',path:'/',secure:true,storeId:'0',partitionKey};
  assert.equal((await f.service.set(args,context)).verified,true);
  assert.equal((await f.service.get({url,name:args.name,storeId:'0',partitionKey},context)).valueRedacted,true);
  assert.equal((await f.service.getAll({url,storeId:'0',partitionKey},context)).count,1);
  assert.deepEqual(await f.service.remove({url,name:args.name,storeId:'0',partitionKey},context),
    {removed:true,verified:true});
  f.revoke();
  await assert.rejects(f.service.set(args,context),reject('E_PERMISSION'));
  assert.equal(f.calls.filter(method=>method==='set').length,2,'Only one create and one expiration');
});

test('R8 HTTP Partition still rejects non-origin identifiers before any write',async()=>{
  const f=fixture();
  for(const topLevelSite of ['http://example.org/path','http://example.org/','http://example.org?x=1',
    'ftp://example.org','http://user:secret@example.org'])
    await assert.rejects(f.service.set({...verifiedWrite,partitionKey:{topLevelSite}},context));
  assert.equal(f.calls.includes('set'),false);
});

test('R8 set binds omitted Path and Store to native defaults and accepts missing/false partition ancestor',async()=>{
  const f=fixture(),set=f.api.cookies.set;
  f.api.cookies.set=(details,callback)=>set(details,row=>{
    row.partitionKey={topLevelSite:row.partitionKey.topLevelSite};callback(row);
  });
  const saved=await f.service.set({url:'https://example.org/account/settings',name:'defaults',
    value:'SECRET',partitionKey:writePartition},context);
  assert.equal(saved.verified,true);
  assert.equal(saved.cookie.path,'/account');
  assert.equal(saved.cookie.storeId,'0');
  assert.equal(saved.cookie.hostOnly,true);
  assert.equal(saved.cookie.session,true);
  assert.equal(f.calls.includes('get'),false);
  assert.equal(f.calls.filter(method=>method==='set').length,1);
});

test('R8 native getAll failure after set returns outcome unknown without replay',async()=>{
  const f=fixture();
  f.api.cookies.getAll=(_details,callback)=>{
    f.calls.push('getAll');f.api.runtime.lastError={message:'Native readback unavailable'};
    callback(undefined);f.api.runtime.lastError=null;
  };
  await assert.rejects(f.service.set(verifiedWrite,context),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.filter(method=>method==='set').length,1);
  assert.equal(f.records.length,1);
});

for(const path of ['/a/../b','/account?x'])
test('R8 exact write readback preserves literal Cookie Path '+path,async()=>{
  const f=fixture();
  const saved=await f.service.set({url,name:'literal-path',value:'SECRET',path,storeId:'0'},context);
  assert.equal(saved.verified,true);
  assert.equal(saved.cookie.path,path);
  assert.equal(f.calls.filter(method=>method==='set').length,1);
});

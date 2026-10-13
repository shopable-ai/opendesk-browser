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
      domain:d.domain??new URL(d.url).hostname,path:d.path??'/',hostOnly:!d.domain,
      storeId:d.storeId??'0',secure:d.secure??false,
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

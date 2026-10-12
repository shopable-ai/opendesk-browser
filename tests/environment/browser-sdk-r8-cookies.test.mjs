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
    get(d,cb){calls.push('get');cb(records.find(row=>row.name===d.name&&
      (!d.storeId||row.storeId===d.storeId)&&
      JSON.stringify(row.partitionKey??null)===JSON.stringify(d.partitionKey??null)&&
      new URL(d.url).hostname===row.domain&&new URL(d.url).pathname.startsWith(row.path))??null);},
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
      records.push(value);cb(value);},
    remove(d,cb){calls.push('remove');const i=records.findIndex(row=>row.name===d.name&&
      row.domain===new URL(d.url).hostname&&new URL(d.url).pathname.startsWith(row.path)&&
      JSON.stringify(row.partitionKey??null)===JSON.stringify(d.partitionKey??null));
      if(i>=0)records.splice(i,1);cb(lostReceipt?null:i<0?null:{name:d.name,url:d.url});},
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
  return {service,records,calls,revoke:()=>{approved=false;},navigate:()=>{doc='doc-2';},
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
  assert.equal(f.calls.filter(x=>x==='remove').length,1);
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

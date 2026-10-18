import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTarget,normalizeCookie,key,redactMetadata,
  nativeInput,inspectImport,rejectImportDuplicates,exportText,
  scopedLiveCookies
} from '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-model.js';
import {createCookieSdkAdapter,safeCode} from '../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js';

const site=parseTarget('https://shop.example.com/cart?session=private#token');
const row=(patch={})=>({
  name:'session',value:'s3cr3t',domain:'shop.example.com',path:'/',
  hostOnly:true,secure:true,httpOnly:true,sameSite:'lax',session:true,
  ...patch
});
test('native normalization preserves identity and validates cookie prefixes',()=>{
  assert.equal(site.url,'https://shop.example.com/cart');
  const valid=normalizeCookie(row(),'shop.example.com');
  assert.equal(nativeInput(valid,site).url,'https://shop.example.com/');
  assert.throws(()=>normalizeCookie(row({name:'__Host-bad',path:'/x'}),'shop.example.com'));
  assert.throws(()=>normalizeCookie(row({domain:'evil.example',hostOnly:false}),'shop.example.com'));
  assert.throws(()=>nativeInput(row({path:'/a?b'}),site));
});
test('store, partition and host-only are part of identity; never expose a value',()=>{
  const a=row({storeId:'1',partitionKey:{topLevelSite:'https://example.com'}});
  assert.notEqual(key(a),key({...a,storeId:'2'}));
  assert.notEqual(key(a),key({...a,partitionKey:{topLevelSite:'https://another.com'}}));
  const [metadata]=redactMetadata([a]);
  assert.equal('value' in metadata,false);
  assert.equal(metadata.valueRedacted,true);
});
test('import inspection rejects duplicate identities and expired entries',()=>{
  const input=JSON.stringify([row(),row(),row({name:'expired',session:false,expirationDate:1})]);
  const plan=inspectImport(input,'json','shop.example.com');
  rejectImportDuplicates(plan.records);
  assert.deepEqual(plan.records.map(x=>x.status),['invalid','invalid','expired']);
  assert.equal(exportText('header',[row()]),'session=s3cr3t\n');
  const partitioned=row({partitionKey:{topLevelSite:'https://partner.example.com'}});
  assert.throws(()=>exportText('header',[partitioned]),/不支持分区 Cookie/);
  assert.throws(()=>exportText('netscape',[partitioned]),/不支持分区 Cookie/);
  assert.match(exportText('json',[partitioned]),/topLevelSite/);
});
test('scoped reads page ordinary and partitioned results without stale values',async()=>{
  const seen=[];
  const sdk={cookies:{
    getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://shop.example.com'}}),
    getAll:async({partitionKey})=>{
      seen.push(Boolean(partitionKey));
      return [row({name:partitionKey?'partitioned':'ordinary',
        ...(partitionKey?{partitionKey}:{} )})];
    }
  }};
  const results=await scopedLiveCookies(sdk,site);
  assert.deepEqual(seen,[false,true]);
  assert.equal(results.length,2);
});
test('adapter honors consent, exact identity and readValue receipt',async()=>{
  const calls=[];
  const browser={capabilities:{getStatus:async()=>({callableNow:false,reasonCode:'E_PERMISSION_REQUIRED'})},
    cookies:{
      getAll:async()=>[],
      getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://shop.example.com'}}),
      get:async args=>{calls.push(args);return {cookie:{...row(),valueRedacted:false}};}
    }
  };
  const adapter=createCookieSdkAdapter({
    getBrowser:()=>browser,request:async()=>({status:'available',url:site.url})
  });
  assert.equal((await adapter.checkRead(site)).callableNow,false);
  assert.equal(await adapter.readValue(site,row()),'s3cr3t');
  assert.equal(calls[0].includeValues,true);
  assert.equal(safeCode({code:'secret-value'},'E_COOKIE_READ'),'E_COOKIE_READ');
});

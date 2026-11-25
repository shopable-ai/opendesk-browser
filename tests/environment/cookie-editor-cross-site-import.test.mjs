import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectImport,cookieImportTarget,nativeInput} from '../../projects/cookie-editor/app/domain/cookie-model.js';
import {createMockSdk} from '../../projects/cookie-editor/preview/react/src/mock-sdk.js';
import {createCookieSdkAdapter} from '../../projects/cookie-editor/app/adapters/browser-sdk.js';
import {createCookieController} from '../../projects/cookie-editor/app/controller/cookie-controller.js';

test('cross-site Cookie parsing requires explicit all-sites mode and preserves identity',()=>{
  const source=JSON.stringify([{name:'remote_sid',value:'PRIVATE',
    domain:'accounts.example.net',hostOnly:true,path:'/',session:true,secure:true}]);
  assert.equal(inspectImport(source,'json','shop.example.com').records[0].status,'invalid');
  const parsed=inspectImport(source,'json','shop.example.com',true).records[0];
  assert.equal(parsed.status,'ready');
  assert.equal(parsed.cookie.domain,'accounts.example.net');
  assert.equal(parsed.cookie.hostOnly,true);
  const site={hostname:'shop.example.com',origin:'https://shop.example.com',url:'https://shop.example.com/'};
  const target=cookieImportTarget(parsed.cookie,site);
  assert.equal(nativeInput(parsed.cookie,target).url,'https://accounts.example.net/');
  assert.throws(()=>nativeInput(parsed.cookie,site));
});

test('30 fictional Cookies for two other websites use two verified Host batches',async()=>{
  const mock=createMockSdk({scenario:'ready'});
  const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
  const snapshots=[];
  const controller=createCookieController({adapter,onChange:s=>snapshots.push(s)});
  try{
    await controller.load();
    const records=Array.from({length:30},(_,i)=>({
      name:'import_'+i,value:'PRIVATE_COOKIE_'+i,
      domain:i<15?'accounts.example.net':'auth.example.org',
      hostOnly:true,path:'/',session:true,secure:true,sameSite:'lax'
    }));
    const source=JSON.stringify(records);
    const plan=await controller.previewImport(source,'json',false,{allSites:true});
    assert.equal(plan.accepted,30);
    assert.equal(plan.skipped,0);
    assert.equal(await controller.executeImport(source,'json',false,{allSites:true}),true);
    const calls=mock.inspect().calls.filter(item=>item.op==='setMany');
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(item=>new URL(item.args.url).hostname),
      ['accounts.example.net','auth.example.org']);
    assert.deepEqual(calls.map(item=>item.args.cookies.length),[15,15]);
    assert.ok(calls.every(call=>call.args.cookies.every(item=>item.ifAbsent===true)),
      'Explicit overwrite=false import must not replace existing Chrome Cookie slots');
    assert.equal(mock.inspect().rows.filter(item=>item.name.startsWith('import_')).length,30);
    assert.doesNotMatch(JSON.stringify(snapshots),/PRIVATE_COOKIE_/);
    // This transport is explicitly fictional; the real Chrome acceptance
    // must separately verify this overwrite=false protection on native stores.
    const original=mock.inspect().rows.filter(item=>item.name.startsWith('import_'));
    const mixed=JSON.stringify([...records.slice(0,2),{...records[0],name:'after_conflict'}]);
    const again=await controller.previewImport(mixed,'json',false,{allSites:true});
    assert.equal(again.accepted,3,'foreign site has no arbitrary read grant');
    assert.equal(await controller.executeImport(mixed,'json',false,{allSites:true}),true);
    assert.equal(controller.snapshot().importConflicts,2);
    const {confirmed,skipped}=controller.snapshot().importResult;
    assert.deepEqual({confirmed,skipped},{confirmed:1,skipped:2});
    assert.ok(mock.inspect().rows.some(item=>item.name==='after_conflict'));
    assert.deepEqual(mock.inspect().rows.filter(item=>item.name.startsWith('import_')),original,
      'conflicting backup must leave previously written Cookies unchanged');
    assert.doesNotMatch(JSON.stringify(snapshots),/PRIVATE_COOKIE_/);
  }finally{controller.dispose();mock.dispose();}
});

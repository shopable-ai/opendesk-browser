import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectImport,cookieImportTarget,nativeInput} from '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-model.js';
import {createMockSdk} from '../../examples/sidebar-tools/cookie-editor/preview/react/src/mock-sdk.js';
import {createCookieSdkAdapter} from '../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js';
import {createCookieController} from '../../examples/sidebar-tools/cookie-editor/app/controller/cookie-controller.js';
import {readFile} from 'node:fs/promises';

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
    const plan=await controller.previewImport(source,'json',true,{allSites:true});
    assert.equal(plan.accepted,30);
    assert.equal(plan.skipped,0);
    assert.equal(await controller.executeImport(source,'json',true,{allSites:true}),true);
    const calls=mock.inspect().calls.filter(item=>item.op==='setMany');
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(item=>new URL(item.args.url).hostname),
      ['accounts.example.net','auth.example.org']);
    assert.deepEqual(calls.map(item=>item.args.cookies.length),[15,15]);
    assert.equal(mock.inspect().rows.filter(item=>item.name.startsWith('import_')).length,30);
    assert.doesNotMatch(JSON.stringify(snapshots),/PRIVATE_COOKIE_/);
  }finally{controller.dispose();mock.dispose();}
});

test('existing Host limits multi-origin writes to the trusted Cookie Editor import intent',async()=>{
  const [panel,host]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/platform/chrome/context-menus.js',import.meta.url),'utf8')
  ]);
  assert.match(panel,/admittedOfficialCookieImport\(tool,revocationEpoch\)/);
  assert.match(panel,/cookieImportGate\.acquire/);
  assert.match(panel,/cookieImportSource:sourceOrigin,document/);
  assert.match(panel,/captureCookieImportDocument/);
  assert.match(host,/identity\.toolId!=='cookie-editor'/);
  assert.match(host,/operation!=='browser\.cookies\.setMany'/);
  assert.match(host,/await authorizedCookie\(identity,operation,sourceOrigin\)/);
  assert.match(host,/await verifyBrowserOwner\(identity,operation,destination\.origin\)/);
  assert.match(host,/cookieImportSource!==undefined/);
  assert.match(host,/verifyCookieImportDocument/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {validateSidebarToolPackage,sidebarToolPackageHash,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from '../../src/framework/sdk/browser-direct.generated.js';

// Production Registry, generated facade, package validator, sender verifier and
// single Host/Dispatcher. Only Chrome primitives are fixtures; NOT native proof.
const uuid='01234567-89ab-4def-8123-456789abcdef';
const sender={id:'direct-host',frameId:0,documentId:'side-panel-doc',documentLifecycle:'active',
  url:'chrome-extension://direct-host/ui/tool.html?hostInstanceId='+uuid};
const code=value=>error=>error?.code===value;
const samples={
  'browser.runtime.getPlatformInfo':{args:{},result:{os:'mac',arch:'arm64',nacl_arch:'arm'}},
  'browser.i18n.getAcceptLanguages':{args:{},result:['zh-CN','en']},
  'browser.i18n.detectLanguage':{args:{text:'Hello, this is a language test.'},
    result:{isReliable:true,languages:[{language:'en',percentage:100}]}}
};
async function fixture({caps=['browser.runtime','browser.i18n'],override={},missing=null}={}){
  const pkg=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'direct-probe',
    version:'1.0.0',title:'Direct probe',description:'Formal compiled API probe',
    capabilities:caps,html:'<main>probe</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
  const local=new Map([[SIDEBAR_TOOL_STORE,[pkg]],[TOOL_REVOCATION_EPOCHS_STORE,{[pkg.id]:'epoch-1'}]]);
  const store=map=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(map.get(k))])),
    set:async values=>{for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value));}});
  const calls=[];
  const api={runtime:{id:sender.id,getURL:path=>'chrome-extension://direct-host/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
      documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:store(local),session:store(new Map()),onChanged:{addListener(){}}},
    permissions:{contains:async()=>true},tabs:{},webNavigation:{}};
  for(const row of APPROVED_BROWSER_DIRECT_BINDINGS){
    const [,namespace,method]=row.operation.split('.');
    api[namespace]??={};
    if(row.operation===missing)continue;
    api[namespace][method]=async function(...args){
      assert.equal(this,api[namespace]);calls.push({operation:row.operation,args});
      return override[row.operation]?override[row.operation]({local,pkg}):structuredClone(samples[row.operation].result);
    };
  }
  const host=createContextMenuHost({api,lockManager:{request:(_key,work)=>work()},logger:{warn(){}}});
  const identity={toolId:pkg.id,toolVersion:pkg.version,packageHash:await sidebarToolPackageHash(pkg),
    installEpoch:'epoch-1',hostInstanceId:uuid,toolInstance:uuid};
  const call=(operation,args={},extra={},from=sender)=>host.handleTool({...identity,operation,args,...extra},from);
  return {api,local,pkg,calls,call,host,identity,sdk:createBrowserSdk({request:call})};
}
for(const row of APPROVED_BROWSER_DIRECT_BINDINGS){
  const name=row.operation;
  test('R11.3 formal Host positive and capability denial: '+name,async()=>{
    const f=await fixture(),sample=samples[name];
    const [,namespace,method]=name.split('.');
    const status=await f.sdk.capabilities.getStatus({operation:name});
    assert.equal(status.callableNow,true);assert.equal(status.requiresUserGesture,false);
    assert.deepEqual(await f.sdk[namespace][method](sample.args),sample.result);
    assert.deepEqual(f.calls,[{operation:name,args:row.parameters.map(p=>sample.args[p.name])}]);
    const denied=await fixture({caps:[]});
    assert.equal((await denied.sdk.capabilities.getStatus({operation:name})).reasonCode,'E_TOOL_CAPABILITY_REQUIRED');
    await assert.rejects(denied.call(name,sample.args),code('E_TOOL_CAPABILITY_REQUIRED'));
    assert.equal(denied.calls.length,0);
  });
  test('R11.3 installed sender/package/epoch isolation: '+name,async()=>{
    const f=await fixture(),args=samples[name].args;
    for(const extra of [{packageHash:'b'.repeat(64)},{installEpoch:'old'},
      {toolVersion:'9.0.0'},{toolId:'another-tool'}])
      await assert.rejects(f.call(name,args,extra),code('E_TOOL_CHANGED'));
    await assert.rejects(f.call(name,args,{}, {...sender,id:'foreign'}));
    await assert.rejects(f.call(name,args,{hostInstanceId:'11111111-1111-4111-8111-111111111111'}),code('E_OWNER'));
    assert.equal(f.calls.length,0);
    const revoked=await fixture({override:{[name]:({local,pkg})=>{
      local.set(TOOL_REVOCATION_EPOCHS_STORE,{[pkg.id]:'epoch-2'});return samples[name].result;
    }}});
    await assert.rejects(revoked.call(name,args),code('E_TOOL_CHANGED'));
    assert.equal(revoked.calls.length,1,'a revoked read is never automatically replayed');
  });
}
test('R11.3 formal DIRECT rejects unapproved methods, input/output schema and byte overruns',async()=>{
  const f=await fixture();
  await assert.rejects(f.call('browser.runtime.getManifest'),code('E_SERVICE_UNSUPPORTED'));
  assert.throws(()=>f.sdk.runtime.getPlatformInfo({method:'getManifest'}),code('E_SCHEMA'));
  assert.throws(()=>f.sdk.i18n.detectLanguage({text:'x'.repeat(4097)}),code('E_SCHEMA'));
  // 4096 UTF-16 chars still exceed the byte budget when multibyte encoded.
  assert.throws(()=>f.sdk.i18n.detectLanguage({text:'中'.repeat(4096)}),code('E_LIMIT'));
  await assert.rejects(f.call('browser.i18n.detectLanguage',{text:'中'.repeat(4096)}),code('E_LIMIT'));
  assert.equal(f.calls.length,0);
  for(const result of [{os:'mac'}, {os:'mac',arch:'arm',secret:'unapproved'},
    {os:7,arch:'arm'}, {os:'x'.repeat(33),arch:'arm'}]){
    const bad=await fixture({override:{'browser.runtime.getPlatformInfo':()=>result}});
    await assert.rejects(bad.sdk.runtime.getPlatformInfo(),code('E_SCHEMA'));
  }
  const huge=await fixture({override:{'browser.runtime.getPlatformInfo':()=>({os:'x'.repeat(2000),arch:'arm'})}});
  await assert.rejects(huge.sdk.runtime.getPlatformInfo(),code('E_LIMIT'));
  const nested=await fixture({override:{'browser.i18n.detectLanguage':()=>({isReliable:true,languages:[{language:'en',percentage:101}]})}});
  await assert.rejects(nested.sdk.i18n.detectLanguage({text:'hello'}),code('E_SCHEMA'));
  const list=await fixture({override:{'browser.i18n.getAcceptLanguages':()=>Array(65).fill('en')}});
  await assert.rejects(list.sdk.i18n.getAcceptLanguages(),code('E_SCHEMA'));
});
test('R11.3 missing Chrome method is unsupported; page SDK never exposes DIRECT namespaces',async()=>{
  const f=await fixture({missing:'browser.i18n.detectLanguage'});
  const status=await f.sdk.capabilities.getStatus({operation:'browser.i18n.detectLanguage'});
  assert.equal(status.platform,'unsupported');assert.equal(status.callableNow,false);
  await assert.rejects(f.sdk.i18n.detectLanguage({text:'hello'}),code('E_CHROME_UNSUPPORTED'));
  assert.equal(f.calls.length,0);
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal(page.runtime,undefined);assert.equal(page.i18n,undefined);
  assert.equal((await page.capabilities.getStatus({operation:'browser.i18n.detectLanguage'})).reasonCode,'E_CONTEXT');
  assert.equal(Object.keys(BROWSER_OPERATIONS).length,68);
});

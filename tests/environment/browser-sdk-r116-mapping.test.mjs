import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,deriveBrowserDirectOperations} from '../../src/framework/sdk/browser-contract.js';
import {operationSchemas,validateDirectBrowserValue} from '../../src/framework/sdk/browser-schemas.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';
import {APPROVED_BROWSER_SCOPED_BINDINGS} from '../../src/framework/sdk/browser-services.generated.js';
import {deriveBrowserDirectBindings,deriveBrowserScopedServiceBindings,deriveBrowserBindingCatalog,
  syncBrowserBindings,syncBrowserDeveloperSurface} from '../../scripts/generate-browser-bindings.mjs';
const matrix=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-interface-matrix.json',import.meta.url),'utf8'));
const codeIs=value=>error=>error?.code===value;
test('R11.6 generated SCOPED/EXISTING_SERVICE metadata has one approved source',async()=>{
  const ids=['browser.storage.local.keys','browser.tabs.create','browser.tabs.getOwned'];
  assert.deepEqual(deriveBrowserScopedServiceBindings(matrix),APPROVED_BROWSER_SCOPED_BINDINGS);
  assert.deepEqual(APPROVED_BROWSER_SCOPED_BINDINGS.map(row=>row.operation),ids);
  assert.equal(Object.keys(BROWSER_OPERATIONS).length,73);
  for(const id of ids){
    const approval=matrix.approvedOperations.find(row=>row.id===id);
    const live=BROWSER_OPERATIONS[id];
    assert.deepEqual(operationSchemas(id),{input:approval.inputSchema,output:approval.outputSchema});
    assert.deepEqual(live.requiredCapabilities,approval.toolCapabilities);
    assert.deepEqual(live.requiredChromePermissions,approval.chromePermissions);
  }
  const contract=await readFile(new URL('../../src/framework/sdk/browser-contract.js',import.meta.url),'utf8');
  const schemas=await readFile(new URL('../../src/framework/sdk/browser-schemas.js',import.meta.url),'utf8');
  for(const id of ids){
    assert.equal(contract.includes("'"+id+"':entry("),false);
    assert.equal(schemas.includes("'"+id+"':["),false);
  }
  assert.equal((await syncBrowserBindings({check:true})).scoped,3);
  assert.equal((await syncBrowserDeveloperSurface({check:true})).publicCount,73);
  const types=await readFile(new URL('../../docs/api/browser-sdk.developer.generated.d.ts',import.meta.url),'utf8');
  assert(types.includes('declare global {'));
  assert.match(types,/const OpenDeskSDK: OpenDeskDeveloperSdk;/);
});
test('R11.6 positional alias and differently named SDK call require reciprocal Native mapping',async()=>{
  const row=structuredClone(matrix.approvedOperations.find(x=>x.id==='browser.i18n.detectLanguage'));
  row.id='browser.i18n.analyzeLanguage';
  row.argumentAliases={text:'message'};
  row.inputSchema={type:'object',additionalProperties:false,
    properties:{message:{type:'string',maxLength:4096}},required:['message']};
  const fixture=structuredClone(matrix);
  fixture.approvedOperations=[row];
  fixture.nativeInterfaces.find(x=>x.nativeApi==='chrome.i18n.detectLanguage')
    .approvedOperationIds.push(row.id);
  const [descriptor]=deriveBrowserDirectBindings(fixture);
  assert.equal(descriptor.nativeApi,'chrome.i18n.detectLanguage');
  assert.deepEqual(descriptor.argumentAliases,{text:'message'});
  const registry=deriveBrowserDirectOperations([descriptor]);
  let count=0;
  const native={i18n:{detectLanguage:async text=>{
    count++;assert.equal(text,'Hello');return {isReliable:true,languages:[]};
  }}};
  const runtime=createApprovedBrowserBindings({},{
    registry,normalize:(_op,args)=>validateDirectBrowserValue(args,row.inputSchema),
    nativeDirect:{api:native,descriptors:[descriptor]}
  });
  let capability=false;
  const call=args=>runtime.dispatch(row.id,args,{},{
    authorize:async()=>{if(!capability)throw Object.assign(Error('denied'),{code:'E_TOOL_CAPABILITY_REQUIRED'});}
  });
  await assert.rejects(call({message:'Hello'}),codeIs('E_TOOL_CAPABILITY_REQUIRED'));
  assert.equal(count,0);
  capability=true;
  assert.deepEqual(await call({message:'Hello'}),{isReliable:true,languages:[]});
  await assert.rejects(call({text:'Hello'}),codeIs('E_SCHEMA'));
  assert.equal(count,1);
  assert.equal(BROWSER_OPERATIONS[row.id],undefined);
  fixture.nativeInterfaces.find(x=>x.nativeApi==='chrome.i18n.detectLanguage').approvedOperationIds=[];
  assert.throws(()=>deriveBrowserDirectBindings(fixture));
});
test('R11.6 scoped service preserves opaque TabRef, permissions and negative return checks',async()=>{
  const tabRef='r'.repeat(32);
  const details={tabRef,url:'https://example.org/',origin:'https://example.org',expiresAt:1000};
  let effects=0,allowed=false;
  const tabs={
    create:async()=>{effects++;return {tabRef};},
    getOwned:async()=>{effects++;return details;}
  };
  const binding=createApprovedBrowserBindings({tabs});
  const authorize=async()=>{if(!allowed)throw Object.assign(Error('denied'),{code:'E_TOOL_CAPABILITY_REQUIRED'});};
  const run=(operation,args)=>binding.dispatch(operation,args,{}, {authorize});
  await assert.rejects(run('browser.tabs.create',{url:'https://example.org/'}),codeIs('E_TOOL_CAPABILITY_REQUIRED'));
  assert.equal(effects,0);
  allowed=true;
  await assert.rejects(run('browser.tabs.create',{url:'file:///etc/passwd'}),codeIs('E_SCHEMA'));
  assert.deepEqual(await run('browser.tabs.create',{url:'https://example.org/'}),{tabRef});
  assert.deepEqual(await run('browser.tabs.getOwned',{tabRef}),details);
  assert.equal(effects,2);
  assert.equal(binding.has('browser.tabs.queryAll'),false);
  assert.equal(Object.hasOwn(details,'tabId'),false);
  // Native numeric tab IDs and arbitrary receipt properties never cross to tools.
  const badWrite=createApprovedBrowserBindings({tabs:{
    create:async()=>({tabRef,tabId:123})
  }});
  await assert.rejects(badWrite.dispatch('browser.tabs.create',
    {url:'https://example.org/'},{},{authorize:async()=>{}}),codeIs('E_OUTCOME_UNKNOWN'));
  const badRead=createApprovedBrowserBindings({tabs:{
    getOwned:async()=>({...details,tabId:123})
  }});
  await assert.rejects(badRead.dispatch('browser.tabs.getOwned',{tabRef},{},
    {authorize:async()=>{}}),codeIs('E_SCHEMA'));
  let steps=0,called=0;
  const denied=createApprovedBrowserBindings({tabs:{
    getOwned:async()=>{called++;return details;}
  }});
  await assert.rejects(denied.dispatch('browser.tabs.getOwned',{tabRef},{},
    {authorize:async()=>{if(++steps===1)throw Object.assign(Error('denied'),
      {code:'E_CHROME_PERMISSION_REQUIRED'});}}),codeIs('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(called,0);
  steps=0;
  await assert.rejects(denied.dispatch('browser.tabs.getOwned',{tabRef},{},
    {authorize:async()=>{if(++steps===2)throw Object.assign(Error('revoked'),
      {code:'E_TOOL_DISABLED'});}}),codeIs('E_TOOL_DISABLED'));
  assert.equal(called,1,'Revoked read receipt cannot be returned');
  const mutated=structuredClone(matrix);
  mutated.approvedOperations.find(x=>x.id==='browser.tabs.getOwned').chromePermissions=[];
  assert.throws(()=>deriveBrowserBindingCatalog(mutated),/security contract drift/);
});

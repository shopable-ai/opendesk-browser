import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,normalizeBrowserOperation,deriveBrowserDirectOperations} from '../../src/framework/sdk/browser-contract.js';
import {normalizeDirectBrowserArguments,deriveBrowserDirectSchemas} from '../../src/framework/sdk/browser-schemas.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from '../../src/framework/sdk/browser-direct.generated.js';
import {deriveBrowserBindingCatalog,deriveBrowserDirectBindings,renderBrowserDirectModule} from '../../scripts/generate-browser-bindings.mjs';

const pinned=JSON.parse(await readFile(
  new URL('../../docs/api/browser-sdk-interface-matrix.json',import.meta.url),'utf8'));
const code=value=>error=>error?.code===value;
const op='browser.runtime.getPlatformInfo';

// This is an injected, local TEST approval fixture. It is never persisted in
// the repository Registry and never delivered to an installed sandbox.
function fixture(){
  const matrix=structuredClone(pinned);
  const native=matrix.nativeInterfaces.find(x=>x.nativeApi==='chrome.runtime.getPlatformInfo');
  assert(native&&native.kind==='METHOD'&&native.returnType.startsWith('Promise<'));
  native.approvedOperationIds.push(op);
  const row={
    id:op,visibility:'APPROVED_TOOL_REGISTERED',mappingKind:'DIRECT',
    nativeApis:[native.nativeApi],allowedWorlds:['sidebar-tool'],
    siteScope:'none',userGesture:false,chromePermissions:[],toolCapabilities:[],
    maxRequestBytes:12000,maxResponseBytes:12000,lifecycle:'request',
    support:{desktopChromeMinimum:138},
    inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    outputSchema:{type:'object',properties:{os:{type:'string'},arch:{type:'string'}},
      required:['os','arch'],additionalProperties:false}
  };
  matrix.approvedOperations.push(row);
  // No hand-written Registry row: compile the same approved descriptor and
  // expose it to the existing Host/SDK operation table automatically.
  const descriptors=deriveBrowserDirectBindings(matrix);
  assert.equal(descriptors.length,1);
  const registry={...BROWSER_OPERATIONS,...deriveBrowserDirectOperations(descriptors)};
  assert.equal(registry[op].requiredCapabilities.length,0);
  assert.deepEqual(registry[op].inputSchema,row.inputSchema);
  assert.deepEqual(registry[op].outputSchema,row.outputSchema);
  const pair=deriveBrowserDirectSchemas(descriptors).get(op);
  assert.deepEqual(pair,[row.inputSchema,row.outputSchema]);
  const projected=deriveBrowserBindingCatalog(matrix,registry);
  assert.equal(projected.counts.public,54,'The synthetic approval adds one API only to this test');
  assert.equal(projected.counts.approved,56);
  return {matrix,registry,descriptors};
}

test('R11 native: current 55 approved operations cannot silently become arbitrary Chrome RPC',()=>{
  assert.deepEqual(deriveBrowserDirectBindings(pinned),[]);
  assert.deepEqual(APPROVED_BROWSER_DIRECT_BINDINGS,[]);
  assert.match(renderBrowserDirectModule(APPROVED_BROWSER_DIRECT_BINDINGS),
    /APPROVED_BROWSER_DIRECT_BINDINGS=Object.freeze\(\[\]\)/);
  assert.throws(()=>createApprovedBrowserBindings({},{nativeDirect:{
    api:{runtime:{getPlatformInfo:()=>({os:'mac'})}},
    descriptors:[{operation:op,mode:'DIRECT',
      nativeApi:'chrome.runtime.getPlatformInfo',parameters:[]}]
  }}),code('E_CONTRACT'));
});

test('R11 native: a fixed, approved Promise Chrome method executes without a Host per-method handler',async()=>{
  const {registry,descriptors}=fixture();
  const order=[],api={runtime:{getPlatformInfo(){
    order.push('chrome');return Promise.resolve({os:'mac',arch:'arm'});
  }}};
  const route=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api,descriptors},
    normalize:(_operation,input)=>input
  });
  assert.equal(route.has(op),true);
  assert.equal(route.has('browser.runtime.getManifest'),false);
  const owner={toolId:'approved-tool'};
  const result=await route.dispatch(op,{},owner,{
    authorize:async(name,input,context)=>{
      assert.equal(name,op);assert.deepEqual(input,{});assert.strictEqual(context,owner);
      order.push('authorize');
    }
  });
  assert.deepEqual(result,{os:'mac',arch:'arm'});
  assert.deepEqual(order,['authorize','chrome','authorize']);
});

test('R11 native: changing matrix name or scoped/mutating operation cannot grant DIRECT rights',()=>{
  const {matrix,registry,descriptors}=fixture();
  for(const [field,value] of [
    ['nativeApis',['chrome.runtime.getManifest']],
    ['userGesture',true],['siteScope','all-sites'],['allowedWorlds',['page-sdk']]
  ]){
    const forged=structuredClone(matrix);
    forged.approvedOperations.find(x=>x.id===op)[field]=value;
    assert.throws(()=>deriveBrowserDirectBindings(forged,registry),/unsafe native\/authority/);
  }
  assert.throws(()=>createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime:{getPlatformInfo:()=>({})}},
      descriptors:[{...descriptors[0],nativeApi:'chrome.runtime.getManifest'}]}
  }),code('E_CONTRACT'));
  const fake={...registry,[op]:{...registry[op],effectClass:'write'}};
  assert.throws(()=>createApprovedBrowserBindings({},{
    registry:fake,nativeDirect:{api:{runtime:{getPlatformInfo:()=>({})}},descriptors}
  }),code('E_CONTRACT'));
  assert.throws(()=>createApprovedBrowserBindings({},{
    nativeDirect:{api:{tabs:{create:()=>({})}},
      descriptors:[{operation:'browser.tabs.create',mode:'DIRECT',
        nativeApi:'chrome.tabs.create',parameters:[{name:'createProperties',type:'object',optional:false}]}]}
  }),code('E_CONTRACT'));
});

test('R11 native: getter, inherited and absent Chrome methods fail closed',async()=>{
  const {registry,descriptors}=fixture();
  let touched=0;
  const runtime=Object.create({getPlatformInfo(){touched++;return {os:'mac'}}});
  const routes=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime},descriptors},normalize:(_,args)=>args
  });
  await assert.rejects(routes.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_CHROME_UNSUPPORTED'));
  Object.defineProperty(runtime,'getPlatformInfo',{get(){touched++;throw Error('getter must never execute')}});
  const accessor=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime},descriptors},normalize:(_,args)=>args
  });
  await assert.rejects(accessor.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_CHROME_UNSUPPORTED'));
  assert.equal(touched,0);
});

test('R11 native: denial precedes call, revoke fences results, and malformed return does not escape',async()=>{
  const {registry,descriptors}=fixture();let effects=0,passes=0;
  const api={runtime:{async getPlatformInfo(){effects++;return {os:'mac',arch:'arm'}}}};
  const route=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api,descriptors},normalize:(_,args)=>args
  });
  await assert.rejects(route.dispatch(op,{}, {},{authorize:async()=>{throw Error('denied')}}),/denied/);
  assert.equal(effects,0);
  await assert.rejects(route.dispatch(op,{}, {},{
    authorize:async()=>{if(++passes===2)throw Object.assign(Error('revoked'),{code:'E_TOOL_DISABLED'})}
  }),code('E_TOOL_DISABLED'));
  assert.equal(effects,1);
  const invalid=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime:{getPlatformInfo:async()=>JSON.parse('{"__proto__":{"polluted":true}}')}},descriptors},
    normalize:(_,args)=>args
  });
  await assert.rejects(invalid.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_VALUE_SERIALIZATION'));
  assert.equal({}.polluted,undefined);
  const noPromise=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime:{getPlatformInfo:()=>({os:'mac'})}},descriptors},
    normalize:(_,args)=>args
  });
  await assert.rejects(noPromise.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_CHROME_UNSUPPORTED'));
  const rejected=createApprovedBrowserBindings({},{
    registry,nativeDirect:{api:{runtime:{getPlatformInfo:()=>Promise.reject(Error('raw native detail'))}},descriptors},
    normalize:(_,args)=>args
  });
  await assert.rejects(rejected.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_CHROME'));
});

test('R11 native: old special operations and custom schema validation stay unchanged',()=>{
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.getTree',{}),code('E_SERVICE_UNSUPPORTED'));
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.create',{title:'Folder'}),code('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.create',{url:'file:///secret'}),code('E_SCHEMA'));
});

test('R11 native: bounded generic DIRECT argument schemas need no operation switch',()=>{
  const name='browser.tabs.getOwned';
  const valid={tabRef:'r'.repeat(24)};
  assert.deepEqual(normalizeDirectBrowserArguments(name,valid),valid);
  assert.throws(()=>normalizeDirectBrowserArguments(name,{tabRef:'native-id'}),code('E_SCHEMA'));
  assert.throws(()=>normalizeDirectBrowserArguments(name,{...valid,forged:true}),code('E_SCHEMA'));
  const polluted=JSON.parse('{"tabRef":"rrrrrrrrrrrrrrrrrrrrrrrr","__proto__":{"isAdmin":true}}');
  assert.throws(()=>normalizeDirectBrowserArguments(name,polluted),code('E_VALUE_SERIALIZATION'));
  assert.equal({}.isAdmin,undefined);
  const sample='browser.downloads.listOwned';
  assert.deepEqual(normalizeDirectBrowserArguments(sample,{limit:20}),{limit:20});
  assert.throws(()=>normalizeDirectBrowserArguments(sample,{limit:1000}),code('E_SCHEMA'));
  assert.throws(()=>normalizeDirectBrowserArguments(sample,{limit:'20'}),code('E_SCHEMA'));
});

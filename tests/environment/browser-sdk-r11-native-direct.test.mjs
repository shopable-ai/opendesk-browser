import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from '../../src/framework/sdk/browser-direct.generated.js';
import {deriveBrowserDirectBindings,renderBrowserDirectModule} from '../../scripts/generate-browser-bindings.mjs';

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
    siteScope:'none',userGesture:false,
    inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    outputSchema:{type:'object',properties:{os:{type:'string'},arch:{type:'string'}},
      required:['os','arch'],additionalProperties:false}
  };
  matrix.approvedOperations.push(row);
  const registry={...BROWSER_OPERATIONS,[op]:Object.freeze({
    operation:op,namespace:'browser.runtime',implementation:'IMPLEMENTED',
    supportedContexts:['sidebar-tool'],effectClass:'read',siteScope:'none',
    requiresUserGesture:false,requiredCapabilities:[],requiredChromePermissions:[],
    maxRequestBytes:12000,maxResponseBytes:12000
  })};
  const descriptors=deriveBrowserDirectBindings(matrix,registry);
  assert.equal(descriptors.length,1);
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
    registry,nativeDirect:{api:{runtime:{getPlatformInfo:()=>JSON.parse('{"__proto__":{"polluted":true}}')}},descriptors},
    normalize:(_,args)=>args
  });
  await assert.rejects(invalid.dispatch(op,{}, {},{authorize:async()=>{}}),
    code('E_VALUE_SERIALIZATION'));
  assert.equal({}.polluted,undefined);
});

test('R11 native: old special operations and custom schema validation stay unchanged',()=>{
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.getTree',{}),code('E_SERVICE_UNSUPPORTED'));
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.create',{title:'Folder'}),code('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.create',{url:'file:///secret'}),code('E_SCHEMA'));
});

// Finite trusted binding table for the one installed-tool Browser Host.
// Registry is authority for method exposure and budgets; this table contains
// only precompiled audited adapters, never an untrusted native method string.
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from './browser-contract.js';
import {fail,jsonValue} from './registry.js';

const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));

// Native DIRECT mappings are supplied only by the fixed build-generated
// approval artifact. They never come from an installed package or RPC payload.
// Only same-named, Promise-based, read-only, no-site-scope calls may use this
// generic v1 route; any scoped/mutating API continues through its audited Driver.
function nativeDirectRoute(descriptor,api,registry){
  const keys=['effectClass','inputSchema','lifecycle','maxRequestBytes',
    'maxResponseBytes','minChrome','mode','nativeApi','operation','outputSchema',
    'parameters','requiredCapabilities','requiredChromePermissions',
    'requiresUserGesture','riskLevel','siteScope','supportedContexts'];
  if(!isRecord(descriptor)||Object.keys(descriptor).sort().join(',')!==keys.sort().join(',')||
     descriptor.mode!=='DIRECT'||typeof descriptor.operation!=='string'||
     typeof descriptor.nativeApi!=='string'||!Array.isArray(descriptor.parameters))
    throw fail('E_CONTRACT','Invalid compiled Native DIRECT descriptor');
  const op=Object.hasOwn(registry,descriptor.operation)?registry[descriptor.operation]:null;
  if(!op||op.implementation!=='IMPLEMENTED'||!op.supportedContexts?.includes('sidebar-tool')||
     op.requiresUserGesture||op.effectClass!=='read'||op.siteScope!=='none'||
     descriptor.nativeApi!=='chrome.'+descriptor.operation.slice('browser.'.length)||
     descriptor.requiresUserGesture||descriptor.effectClass!=='read'||descriptor.siteScope!=='none'||
     JSON.stringify(descriptor.requiredCapabilities)!==JSON.stringify(op.requiredCapabilities)||
     JSON.stringify(descriptor.requiredChromePermissions)!==JSON.stringify(op.requiredChromePermissions)||
     JSON.stringify(descriptor.inputSchema)!==JSON.stringify(op.inputSchema)||
     JSON.stringify(descriptor.outputSchema)!==JSON.stringify(op.outputSchema))
    throw fail('E_CONTRACT','Unsafe or unapproved Native DIRECT operation');
  const path=descriptor.nativeApi.split('.');
  if(path.length!==3||path[0]!=='chrome'||path.slice(1).some(part=>
    !/^[A-Za-z][A-Za-z0-9]*$/.test(part)||['constructor','prototype','__proto__'].includes(part)))
    throw fail('E_CONTRACT','Invalid Native DIRECT path');
  if(descriptor.parameters.length>4||descriptor.parameters.some(p=>
     !isRecord(p)||Object.keys(p).sort().join(',')!=='name,optional,type'||
     typeof p.name!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(p.name)||
     ['constructor','prototype','__proto__'].includes(p.name)||
     typeof p.optional!=='boolean'||typeof p.type!=='string'||
     !['string','number','integer','boolean','object','array'].includes(p.type)))
    throw fail('E_CONTRACT','Unsupported Native DIRECT argument signature');
  // Runtime namespace lookup occurs only for a build-pinned, approved path.
  // Data descriptors prevent inherited functions or accessors from executing.
  const ns=Object.getOwnPropertyDescriptor(api??{},path[1]);
  const owner=ns?.value;
  const method=owner&&Object.getOwnPropertyDescriptor(owner,path[2]);
  if(typeof method?.value!=='function')
    return ()=>{throw fail('E_CHROME_UNSUPPORTED','Approved Chrome API is unavailable')};
  return input=>{
    // For one native object parameter the public SDK object is the native
    // argument itself; scalar and multi-param APIs pick named input fields.
    const params=descriptor.parameters;
    const args=params.length===1&&params[0].type==='object'
      ?[input]:params.map(p=>Object.hasOwn(input,p.name)?input[p.name]:undefined);
    while(args.length&&args.at(-1)===undefined)args.pop();
    return method.value.apply(owner,args);
  };
}

export function createApprovedBrowserBindings(routes,{
  registry=BROWSER_OPERATIONS,nativeDirect=null,normalize=normalizeBrowserOperation
}={}){
  if(!isRecord(routes))throw fail('E_CONTRACT','Trusted Browser binding table required');
  const table=Object.create(null);
  const register=(operation,run)=>{
    const entry=Object.hasOwn(registry,operation)?registry[operation]:null;
    if(!entry||entry.implementation!=='IMPLEMENTED'||
       !entry.supportedContexts?.includes('sidebar-tool')||
       typeof run!=='function'||Object.hasOwn(table,operation))
      throw fail('E_CONTRACT','Unapproved or invalid Browser binding: '+operation);
    table[operation]=run;
  };
  for(const [key,handler] of Object.entries(routes)){
    if(key.startsWith('browser.')){
      // Keep explicitly composed adapters for exceptional operations.
      register(key,handler);
      continue;
    }
    // A trusted namespace service is bound ONCE. Its own methods are matched
    // against the already-approved operation Registry; unmatched methods,
    // including internal resolve/revokeAll, are never exposed.
    const parts=key.split('.');
    if(parts.some(part=>!/^[A-Za-z][A-Za-z0-9]*$/.test(part)||
       ['constructor','prototype','__proto__'].includes(part))||
       typeof handler!=='function'&&!isRecord(handler))
      throw fail('E_CONTRACT','Invalid trusted Browser namespace service: '+key);
    const namespace='browser.'+key;
    let matched=0;
    for(const [operation,entry] of Object.entries(registry)){
      if(entry?.namespace!==namespace)continue;
      const method=operation.slice(namespace.length+1);
      if(!method||method.includes('.'))continue;
      if(typeof handler==='function'){
        register(operation,(input,context)=>handler(input,context,operation));
      }else{
        // Get the own DATA descriptor; never execute getters or inherited
        // methods while deriving the finite set of approved routes.
        const own=Object.getOwnPropertyDescriptor(handler,method);
        if(!own||typeof own.value!=='function')continue;
        const fn=own.value;
        register(operation,(input,context)=>fn.call(handler,input,context));
      }
      matched++;
    }
    if(!matched)throw fail('E_CONTRACT','No approved methods for trusted service: '+namespace);
  }
  if(nativeDirect!==null){
    if(!isRecord(nativeDirect)||!Array.isArray(nativeDirect.descriptors))
      throw fail('E_CONTRACT','Compiled Native DIRECT binding list required');
    // No handler strings are read from tool input. Duplicate/unknown bindings
    // fail at construction, before any request can reach a native method.
    for(const descriptor of nativeDirect.descriptors)
      register(descriptor.operation,nativeDirectRoute(descriptor,nativeDirect.api,registry));
  }
  Object.freeze(table);
  return Object.freeze({
    has:operation=>typeof operation==='string'&&Object.hasOwn(table,operation),
    // Caller is the verified trusted Host. Revalidate the installed identity,
    // operation capability, Chrome permission and exact site before dispatch.
    // Side-effect adapters retain their own after-effect / UNKNOWN guards.
    async dispatch(operation,input,context,{authorize}={}){
      if(typeof operation!=='string'||!Object.hasOwn(table,operation))
        throw fail('E_SERVICE_UNSUPPORTED','No approved Browser operation binding');
      if(typeof authorize!=='function')
        throw fail('E_CONTEXT','Trusted Browser Host authorizer required');
      const entry=registry[operation];
      const checked=normalize(operation,input??{});
      await authorize(operation,checked,context);
      const result=await table[operation](checked,context);
      // Do not deliver data after revoke/disable/update. For already-completed
      // mutations the result is now uncertain; never report ordinary success.
      try{await authorize(operation,checked,context);}
      catch(error){
        if(entry.effectClass!=='read')
          throw fail('E_OUTCOME_UNKNOWN','Browser effect may have completed before authorization changed');
        throw error;
      }
      try{
        jsonValue(result);
        const encoded=JSON.stringify(result);
        if(typeof encoded!=='string')throw fail('E_VALUE_SERIALIZATION','Browser result is not JSON');
        if(new TextEncoder().encode(encoded).byteLength>entry.maxResponseBytes)
          throw fail('E_LIMIT','Browser result exceeds declared IPC budget');
      }catch(error){
        if(entry.effectClass!=='read')
          throw fail('E_OUTCOME_UNKNOWN','Browser effect completed but its receipt is invalid');
        throw error;
      }
      return result;
    }
  });
}

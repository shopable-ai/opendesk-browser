// Finite trusted binding table for the one installed-tool Browser Host.
// Registry is authority for method exposure and budgets; this table contains
// only precompiled audited adapters, never an untrusted native method string.
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from './browser-contract.js';
import {fail,jsonValue} from './registry.js';

const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));

export function createApprovedBrowserBindings(routes,{registry=BROWSER_OPERATIONS}={}){
  if(!isRecord(routes))throw fail('E_CONTRACT','Trusted Browser binding table required');
  const table=Object.create(null);
  for(const [operation,run] of Object.entries(routes)){
    const entry=Object.hasOwn(registry,operation)?registry[operation]:null;
    if(!entry||entry.implementation!=='IMPLEMENTED'||
       !entry.supportedContexts?.includes('sidebar-tool')||
       typeof run!=='function'||Object.hasOwn(table,operation))
      throw fail('E_CONTRACT','Unapproved or invalid Browser binding: '+operation);
    table[operation]=run;
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
      const checked=normalizeBrowserOperation(operation,input??{});
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

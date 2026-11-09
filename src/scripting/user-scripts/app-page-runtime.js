// Serialized fixed code; only installed USER_SCRIPT worlds receive this global.
export function installAppPageRuntime(binding,managed,send){
  let handler=null,closed=false;
  const pending=new Set();
  const check=()=>{if(closed||managed.isRetiring())throw Object.assign(new Error('App Page disposed'),{code:'E_DISPOSED'});};
  const request=async(operation,payload={})=>{
    check();const receipt=await send({...binding,operation,payload});check();
    if(!receipt?.ok)throw Object.assign(new Error(receipt?.error?.message||'App Page request failed'),{code:receipt?.error?.code||'E_EFFECT_UNKNOWN'});
    return receipt.data;
  };
  managed.enroll('app-page:'+binding.receiptNonce,async()=>{closed=true;handler=null;await Promise.allSettled([...pending]);},
    ()=>({clean:closed&&pending.size===0}));
  Object.defineProperty(globalThis,'OpenDeskAppPage',{value:Object.freeze({
    readContext:()=>request('readContext'),
    storage:Object.freeze({get:payload=>request('storage.get',payload),set:payload=>request('storage.set',payload)}),
    onRequest(callback){check();if(typeof callback!=='function')throw new Error('Expected request handler');handler=callback;
      return ()=>{if(handler===callback)handler=null;};}
  })});
  return Object.freeze({async dispatch(nonce,operation,payload){
    check();if(nonce!==binding.receiptNonce||!handler)throw new Error('E_APP_PAGE_NOT_READY');
    const task=(async()=>{
    const authorization=await request('authorize');check();
    if(authorization?.ready!==true)throw new Error('E_APP_PAGE_NOT_READY');
    if(!handler)throw new Error('E_APP_PAGE_NOT_READY');
    const value=await handler({operation,payload});check();await request('authorize');return value;
    })();
    pending.add(task);try{return await task;}finally{pending.delete(task);}
  }});
}
export const appPageBootstrapSource=binding=>'Object.defineProperty(globalThis,"__opendeskAppPageRuntimeV1",{value:('+installAppPageRuntime.toString()+')('+JSON.stringify(binding)+',__opendeskManagedUIRegistryV1,chrome.runtime.sendMessage.bind(chrome.runtime))});';
export const appPageDispatchSource=(nonce,operation,payload)=>'globalThis.__opendeskAppPageRuntimeV1.dispatch('+JSON.stringify(nonce)+','+JSON.stringify(operation)+','+JSON.stringify(payload)+')';

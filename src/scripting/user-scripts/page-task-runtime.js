// Fixed code installed before reviewed source in its unique USER_SCRIPT world.
// Nothing here accepts a Host receipt, callback or authority from page data.
export function installPageTaskRuntime(binding,managed,send){
  let closed=false,requested=false;
  const trustedGetter=Object.getOwnPropertyDescriptor(new Event('opendesk-task'),'isTrusted')?.get;
  const check=()=>{if(closed||managed.isRetiring())throw Object.assign(new Error('Page task client retired'),{code:'E_DISPOSED'});};
  const call=async(operation,payload={})=>{
    check();const reply=await send({...binding,operation,payload});check();
    if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'Page task request is unconfirmed'),
      {code:reply?.error?.code||'E_EFFECT_UNKNOWN'});
    return reply.data;
  };
  managed.enroll('page-task:'+binding.receiptNonce,()=>{closed=true;},()=>({clean:closed}));
  return Object.freeze({
    request(event,payload){
      check();let trusted=false;try{trusted=trustedGetter?.call(event)===true;}catch{}
      if(!trusted||!['click','keydown'].includes(event.type))
        throw Object.assign(new Error('A real user action is required'),{code:'E_USER_GESTURE_REQUIRED'});
      if(requested)throw Object.assign(new Error('Only the original request may be queried'),{code:'E_EFFECT_UNKNOWN'});
      requested=true;
      return call('request',structuredClone(payload));
    },
    read:query=>call('read',query),
    restore:()=>call('restore')
  });
}
export const pageTaskBootstrapSource=binding=>'Object.defineProperty(globalThis,"__opendeskPageTasksV1",{value:('+installPageTaskRuntime.toString()+')('+JSON.stringify(binding)+',__opendeskManagedUIRegistryV1,chrome.runtime.sendMessage.bind(chrome.runtime))});';

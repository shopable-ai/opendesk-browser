// Fixed bootstrap installed in a proven named USER_SCRIPT world BEFORE project
// code. It holds no extension capability and is inaccessible to the page world.
// Only resources enrolled by createPageUI belong to this lifecycle.
export function installManagedUILifecycle(nonce) {
  const format='opendesk.managed-ui.v1',NativePromise=Promise,root=globalThis;
  const freeze=Object.freeze,resolve=Promise.resolve.bind(Promise),all=Promise.all.bind(Promise);
  const create=Object.create,keys=Object.keys,objectPrototype=Object.prototype,arrayPrototype=Array.prototype;
  const control=value=>{const result=create(null);for(const key of keys(value))result[key]=value[key];return freeze(result);};
  const apply=Reflect.apply,thenMethod=Promise.prototype.then,resolveMethod=Promise.resolve,allMethod=Promise.all,finallyMethod=Promise.prototype.finally;
  const then=(value,ok,fail)=>apply(thenMethod,value,[ok,fail]),later=globalThis.setTimeout.bind(globalThis),cancel=globalThis.clearTimeout.bind(globalThis);
  const records=[];let retiring=false,retirement,invalid=false;
  const error=message=>Object.assign(new Error(message),{code:'E_UI_CLEANUP'});
  function assertRuntime(){
    if(invalid||'then' in objectPrototype||'then' in arrayPrototype||root.Promise!==NativePromise||NativePromise.resolve!==resolveMethod||NativePromise.all!==allMethod||NativePromise.prototype.then!==thenMethod||NativePromise.prototype.finally!==finallyMethod){invalid=true;throw error('Promise runtime changed; safe cleanup cannot be confirmed');}
  }
  function assertMount(id){
    assertRuntime();
    if(retiring)throw error('This managed preview is retiring; run a new preview');
    for(let i=0;i<records.length;i++)if(records[i].id===id&&!records[i].status().clean)throw error('The prior managed UI has not completed cleanup');
  }
  function enroll(id,retire,status){
    assertMount(id);
    if(records.length>=128||typeof retire!=='function'||typeof status!=='function')throw error('Invalid or excessive managed UI registrations');
    records[records.length]={id,retire,status};
  }
  function retire(requestNonce){
    if(!retirement){
      retiring=true;
      retirement=new NativePromise(done=>{
        let finished=false;
        const finish=value=>{if(finished)return;finished=true;cancel(timer);done(control(value));};
        const timer=later(()=>finish({ok:false,code:'E_UI_CLEANUP_TIMEOUT',message:'Managed cleanup did not settle within five seconds',instances:records.length}),5000);
        try{assertRuntime();}catch(e){finish({ok:false,code:'E_UI_CLEANUP_FAILED',message:e.message,instances:records.length});return;}
        if(!records.length){finish({ok:true,instances:0});return;}
        const tasks=[];
        for(let i=0;i<records.length;i++){
          try{tasks[i]=then(resolve(records[i].retire()),()=>null,e=>String(e?.message||e).slice(0,1024));}
          catch(e){tasks[i]=resolve(String(e?.message||e).slice(0,1024));}
        }
        then(all(tasks),failures=>{
          try{assertRuntime();}catch(e){finish({ok:false,code:'E_UI_CLEANUP_FAILED',message:e.message,instances:records.length});return;}
          for(let i=0;i<records.length;i++)if(failures[i]||!records[i].status().clean){finish({ok:false,code:'E_UI_CLEANUP_FAILED',message:failures[i]||'Managed callbacks are still active',instances:records.length});return;}
          finish({ok:true,instances:records.length});
        },e=>finish({ok:false,code:'E_UI_CLEANUP_FAILED',message:String(e?.message||e).slice(0,1024),instances:records.length}));
      });
    }
    return then(retirement,result=>control({format,nonce,requestNonce,scope:'managed-ui-only',...result}));
  }
  return freeze({format,nonce,assertRuntime,assertMount,enroll,retire,isRetiring:()=>retiring});
}

// A global lexical const remains authoritative even if project code replaces
// globalThis/window aliases or properties. The existing world probe proves that
// lexical bindings survive separate native.execute calls in this named world.
export const managedUIBootstrapSource=nonce=>'const __opendeskManagedUIRegistryV1=('+installManagedUILifecycle.toString()+')('+JSON.stringify(nonce)+');\n({format:"opendesk.managed-ui.v1",nonce:__opendeskManagedUIRegistryV1.nonce,ready:true})';
export const managedUIRetireSource=(nonce,requestNonce)=>'(()=>{const r=__opendeskManagedUIRegistryV1;if(!r||r.format!=="opendesk.managed-ui.v1"||r.nonce!=='+JSON.stringify(nonce)+')throw new Error("E_UI_LIFECYCLE_IDENTITY");return r.retire('+JSON.stringify(requestNonce)+');})()';

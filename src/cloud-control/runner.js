// The hidden Chrome document owns the SAME RunHost as the visible Side Panel.
// This loop never parses scripts, invents a Run, or sends a provider receipt.
export function createCloudRunnerLoop({client,host,schedule=setTimeout,unschedule=clearTimeout,log=console.warn}={}){
  if(!client?.cloud||typeof host?.start!=='function')throw Error('E_CLOUD_RUNNER_CONTRACT');
  let disposed=false,claiming=false,started=false,timer=null,shutdownPromise,preferApp=true;
  async function appRequest(){
    if(typeof client.request!=='function')return null;
    const {fires=[]}=await client.request('listDueSchedules',{profile:'app-service'});
    const fire=fires[0];
    if(!fire||disposed)return null;
    return {profile:'app-service',appId:fire.appId??fire.appBinding?.appId,
      scheduledFireId:fire.fireId,requestId:fire.fireId,
      expectedScheduleOwner:fire.expectedScheduleOwner??fire.owner,
      deadlineAt:Date.now()+30000};
  }
  async function cloudRequest(){
    const state=await client.cloud.cloudStatus({includeRequests:false});
    if(disposed||!state?.enabled||!state.online||!state.reconciled||state.slotAvailable!==true)return null;
    const next=await client.cloud.cloudNext({});
    if(disposed||!next)return null;
    return client.cloud.cloudResolve(next);
  }
  async function tick(){
    if(disposed||claiming||host.executionPending)return null;
    claiming=true;
    try{
      if(preferApp){const request=await appRequest();if(request){preferApp=false;return await host.start(request);}}
      let request;
      try{request=await cloudRequest();}
      catch(error){if(!disposed)log('[cloud runner]',error?.code||error?.message||error);}
      if(disposed)return null;
      if(!request){
        request=await appRequest();if(request){preferApp=false;return await host.start(request);}return null;
      }
      // Original Controller admission checks source/version, grant, target,
      // permit, execution deadline and durable one-run slot.
      preferApp=true;return await host.start(request);
    }finally{claiming=false;}
  }
  async function pump(){
    if(disposed)return;
    try{
      const admitted=await tick();
      if(admitted)await host.completion;
    }catch(error){if(!disposed)log('[cloud runner]',error?.code||error?.message||error);}
    finally{if(!disposed)timer=schedule(pump,2000);}
  }
  function start(){if(started||disposed)return;started=true;void pump();}
  function dispose(){
    if(disposed)return shutdownPromise;
    disposed=true;unschedule(timer);
    let drain;
    try{drain=host.dispose?.();}catch(error){log('[cloud runner shutdown]',error?.code||error?.message||error);}
    // The original RunHost can still be committing an E_HOST_CLOSED fence
    // and settling its one native Run. Do not close its shared RPC transport
    // first: that turns a known interruption into an avoidable unknown result.
    const release=()=>{try{client.dispose?.();}catch(error){log('[cloud runner release]',error?.code||error?.message||error);}};
    if(drain&&typeof drain.then==='function'){
      shutdownPromise=Promise.resolve(drain).catch(error=>{
        log('[cloud runner shutdown]',error?.code||error?.message||error);
      }).then(release);
    }else{release();shutdownPromise=Promise.resolve();}
    return shutdownPromise;
  }
  return Object.freeze({start,tick,dispose});
}

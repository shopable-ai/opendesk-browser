// The hidden Chrome document owns the SAME RunHost as the visible Side Panel.
// This loop never parses scripts, invents a Run, or sends a provider receipt.
export function createCloudRunnerLoop({client,host,schedule=setTimeout,unschedule=clearTimeout,log=console.warn}={}){
  if(!client?.cloud||typeof host?.start!=='function')throw Error('E_CLOUD_RUNNER_CONTRACT');
  let disposed=false,claiming=false,started=false,timer=null;
  async function tick(){
    if(disposed||claiming||host.executionPending)return null;
    claiming=true;
    try{
      const state=await client.cloud.cloudStatus({includeRequests:false});
      if(disposed||!state?.enabled||!state.online||!state.reconciled||state.slotAvailable!==true)return null;
      const next=await client.cloud.cloudNext({});
      if(disposed||!next)return null;
      const request=await client.cloud.cloudResolve(next);
      if(disposed||!request)return null;
      // Original Controller admission checks source/version, grant, target,
      // permit, execution deadline and durable one-run slot.
      return await host.start(request);
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
  function dispose(){if(disposed)return;disposed=true;unschedule(timer);host.dispose?.();client.dispose?.();}
  return Object.freeze({start,tick,dispose});
}

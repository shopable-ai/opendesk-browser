// Orchestrates the existing bounded, redacted public observer. No renewal,
// Cookie value reads, storage, native writes, or replacement authority.
export function createCookieObservation({adapter,controller,canRun,onChange=()=>{},onObservedChange=()=>{},now=Date.now}){
  let generation=0,session=null,pending=false,closed=false;
  let state={phase:'idle',expiresAt:0,gap:false,detected:false};
  const publish=patch=>{state={...state,...patch};if(!closed)onChange({...state});};
  const release=value=>{
    if(value)void Promise.resolve().then(()=>adapter.observeStop(value.target,value.ref)).catch(()=>{});
  };
  function stop(phase='idle',gap=state.gap){
    generation++;pending=false;
    const old=session;session=null;release(old);
    publish({phase,expiresAt:0,gap});
  }
  async function start(){
    const target=controller.snapshot().target;
    if(closed||state.phase==='starting'||session||!canRun()||!target)return;
    const ticket=++generation,epoch=controller.snapshot().epoch;
    publish({phase:'starting',gap:false,detected:false});
    try{
      const result=await adapter.observeStart(target);
      const value={target,ref:result?.sessionRef,cursor:'0',epoch};
      if(closed||ticket!==generation||!canRun()||controller.snapshot().epoch!==epoch){release(value);return;}
      if(typeof result?.sessionRef!=='string'||!result.sessionRef||
        !Number.isFinite(result.expiresAt)||result.expiresAt<=now()||result.expiresAt>now()+30000)
        {release(value);throw Error('E_COOKIE_OBSERVE');}
      session=value;publish({phase:'running',expiresAt:result.expiresAt});
    }catch(error){
      if(!closed&&ticket===generation){controller.observationAccessLost(error);publish({phase:'error',expiresAt:0});}
    }
  }
  async function poll(){
    if(closed||!session)return;
    if(!canRun()||controller.snapshot().epoch!==session.epoch){stop();return;}
    if(now()>=state.expiresAt){stop('ended',state.gap||pending);return;}
    if(pending)return;
    const value=session,ticket=generation;
    const current=()=>!closed&&ticket===generation&&session===value&&
      controller.snapshot().epoch===value.epoch;
    const valid=()=>current()&&canRun();
    pending=true;
    try{
      const result=await adapter.observeRead(value.target,value.ref,value.cursor);
      if(!valid())return;
      if(result?.sessionRef!==value.ref||!Array.isArray(result.events)||result.events.length>50||
        !/^\d{1,12}$/.test(result.nextCursor)||Number(result.nextCursor)<Number(value.cursor)||
        !Number.isSafeInteger(result.gapCount)||result.gapCount<0)throw Error('E_COOKIE_OBSERVE');
      const gap=result.gapCount>0;
      if(result.events.length||gap){
        const applied=await controller.syncMetadata({events:result.events,canApply:valid});
        if(!valid()||!applied)return;
      }
      value.cursor=result.nextCursor;
      if((gap&&!state.gap)||(result.events.length>0&&!state.detected))
        publish({gap:state.gap||gap,detected:state.detected||result.events.length>0});
      if(result.events.length)onObservedChange();
    }catch(error){
      if(current()){
        controller.observationAccessLost(error);
        const expired=error?.code==='E_SESSION_EXPIRED'&&now()>=state.expiresAt;
        stop(expired?'ended':'error',state.gap||expired);
      }
    }finally{if(ticket===generation)pending=false;}
  }
  return {start,poll,stop,snapshot:()=>({...state}),dispose(){stop();closed=true;}};
}

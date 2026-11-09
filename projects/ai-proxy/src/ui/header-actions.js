import {useEffect,useRef,useState} from 'react';

export const HEADER_ACTIONS_KEY='ai-proxy.header-actions.v1';
export const DEFAULT_HEADER_ACTIONS=['add-proxy','diagnostics','subscriptions','settings'];
export const HEADER_ACTION_IDS=[...DEFAULT_HEADER_ACTIONS,'official'];
const scope='settings-header-actions';
function validate(value){
 if(value==null)return [...DEFAULT_HEADER_ACTIONS];
 if(!Array.isArray(value)||value.length>6||new Set(value).size!==value.length||
  value.some(id=>!HEADER_ACTION_IDS.includes(id)))throw new Error('Invalid header actions');
 return [...value];
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// One instance belongs to the App, not to the Settings section's mount lifetime.
export function createHeaderActions(env){
 let state={saved:[...DEFAULT_HEADER_ACTIONS],draft:[...DEFAULT_HEADER_ACTIONS],ready:false,busy:false,unknown:false,readRequired:false,error:null,savedNotice:false};
 let active=false,revision=0,reading=0,lifetime=0,writing=false;
 const focusTarget=globalThis.window,visibilityTarget=globalThis.document;
 const subscribers=new Set();
 const publish=patch=>{if(!active)return;state={...state,...patch};for(const fn of subscribers)fn();};
 const dirty=()=>!equal(state.saved,state.draft);
 const mark=()=>env.setDraftDirty(dirty(),scope);
 const store={
  // Construction happens during render; external listeners belong to the Effect.
  start(){
   if(active)return;
   active=true;
   env.events.addEventListener('ai-proxy-draft',discard);
   focusTarget?.addEventListener('focus',resume);
   visibilityTarget?.addEventListener('visibilitychange',resume);
  },
  getSnapshot:()=>state,
  subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},
  async reload(){
   if(state.busy||!active)return;
   const generation=++reading,started=revision;
   publish({busy:true,error:null,savedNotice:false});
   try{
    const items=await env.storage.local.get(HEADER_ACTIONS_KEY);
    const saved=validate(items[HEADER_ACTIONS_KEY]);
    if(!active||generation!==reading)return;
    if(revision!==started){publish({readRequired:true,error:'apHeaderConflict'});return;}
    publish({saved,draft:[...saved],ready:true,unknown:false,readRequired:false});mark();
   }catch{if(active&&generation===reading&&revision===started)publish({readRequired:true,error:'apHeaderReadFailed'});}
   finally{if(active&&generation===reading)publish({busy:false});}
  },
  edit(next){
   if(!active||!state.ready||state.unknown)return;
   const draft=validate(next);revision++;
   publish({draft,error:state.readRequired?state.error:null,savedNotice:false});mark();
  },
  async save(){
   if(!active||!state.ready||state.busy||state.unknown||state.readRequired||!dirty())return;
   const submitted=[...state.draft],started=revision,owner=lifetime;
   writing=true;
   publish({busy:true,error:null,savedNotice:false});
   try{
    await env.storage.local.set({[HEADER_ACTIONS_KEY]:submitted});
    if(!active||owner!==lifetime)return;
    // The storage adapter resolves only after the CAS receipt and readback.
    publish({saved:submitted,savedNotice:revision===started});mark();
   }catch(error){
    if(!active||owner!==lifetime)return;
    const code=error?.code;
    publish({readRequired:code==='E_CONFLICT'||code==='E_OUTCOME_UNKNOWN',unknown:code==='E_OUTCOME_UNKNOWN',error:code==='E_OUTCOME_UNKNOWN'?'apHeaderUnknown':code==='E_CONFLICT'?'apHeaderConflict':'apHeaderSaveFailed'});
   }finally{if(active&&owner===lifetime){writing=false;publish({busy:false});}}
  },
  dispose(){
   if(!active)return;
   active=false;reading++;lifetime++;
   // Late adapter reads may change the CAS base; writes may have reached storage.
   // Remounting must require an explicit reread rather than silently rebase/retry.
   state={...state,busy:false,...(writing?{unknown:true,readRequired:true,error:'apHeaderUnknown'}:
    state.busy&&state.ready?{readRequired:true,error:'apHeaderConflict'}:{})};
   writing=false;subscribers.clear();env.events.removeEventListener('ai-proxy-draft',discard);
   focusTarget?.removeEventListener('focus',resume);
   visibilityTarget?.removeEventListener('visibilitychange',resume);
  }
 };
 function resume(){
  if(!active||state.busy||state.unknown||state.readRequired||visibilityTarget?.visibilityState==='hidden')return;
  // Even a read updates the adapter's CAS ETag. Never rebase an existing draft
  // on a focus notification; only the explicit cancel/reread may do that.
  if(dirty()){publish({readRequired:true,error:'apHeaderConflict',savedNotice:false});return;}
  void store.reload();
 }
 function discard(){
  if(active&&dirty()&&!env.isDraftDirty(scope)){
   revision++;publish({draft:[...state.saved],savedNotice:false});
  }
 }
 return store;
}

export function useHeaderActions(env){
 const ref=useRef(null);
 if(!ref.current)ref.current=createHeaderActions(env);
 const store=ref.current;
 const [,render]=useState(0);
 useEffect(()=>{
  store.start();
  const unsubscribe=store.subscribe(()=>render(value=>value+1));
  if(!store.getSnapshot().ready)void store.reload();
  return()=>{unsubscribe();store.dispose();};
 },[store]);
 return store;
}

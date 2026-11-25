import {SIDEBAR_LAST_EXTENSION_DETAIL_KEY,isExtensionDetailKey} from '../ui/sidebar-extension-detail-memory.js';

// Serve-only, bounded and volatile. Observe the existing key without joining its
// Web Lock, writing storage, or keeping a closing Side Panel alive.
export function createDetailMemoryObserver({storage,publish,now=Date.now,id=crypto.randomUUID()}){
  let disposed=false,version=0,current={state:'unknown'},events=[];
  const valueOf=value=>value==null?null:isExtensionDetailKey(value)?value:'invalid';
  const snapshot=()=>({observer:id,current:{...current},events:[...events]});
  const report=event=>{
    if(disposed)return;
    events=[...events,event].slice(-16);
    publish(snapshot());
  };
  const changed=(changes,area)=>{
    if(disposed||area!=='local'||!Object.hasOwn(changes,SIDEBAR_LAST_EXTENSION_DETAIL_KEY))return;
    version++;
    const change=changes[SIDEBAR_LAST_EXTENSION_DETAIL_KEY];
    current={state:'known',value:valueOf(change.newValue)};
    report({type:'change',observedAt:now(),previous:valueOf(change.oldValue),value:current.value});
  };
  storage.onChanged?.addListener(changed);
  return {
    async read(){
      const started=version;
      try{
        const result=await storage.local.get(SIDEBAR_LAST_EXTENSION_DETAIL_KEY);
        if(disposed||version!==started)return;
        if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid storage read');
        current={state:'known',value:valueOf(result[SIDEBAR_LAST_EXTENSION_DETAIL_KEY])};
        report({type:'read',observedAt:now(),value:current.value});
      }catch{
        if(disposed||version!==started)return;
        current={state:'unknown'};
        report({type:'read-failed',observedAt:now()});
      }
    },
    snapshot,
    dispose(){disposed=true;storage.onChanged?.removeListener(changed);events=[];}
  };
}

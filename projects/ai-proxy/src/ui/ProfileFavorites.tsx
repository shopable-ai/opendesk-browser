import {useEffect,useRef,useState} from 'react';
import {getEnvironment} from '../environment';

export const PROFILE_FAVORITES_KEY='ai-proxy.profile-favorites.v1';

function readIds(value:unknown):string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id):id is string=>typeof id==='string'&&!!id.trim()))]
    : [];
}

/** UI metadata only; the existing storage adapter owns CAS and write receipts. */
export function useProfileFavorites() {
  const env=getEnvironment();
  const [ids,setIds]=useState<string[]>([]);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  // The consumer renders its localized persistent alert when this is true.
  const [error,setError]=useState(false);
  const session=useRef({alive:false,ready:false,writing:false,failed:false,
    revision:0,ids:[] as string[]});

  useEffect(()=>{
    const current={alive:true,ready:false,writing:false,failed:false,
      revision:0,ids:[] as string[]};
    session.current=current;
    setIds([]);setReady(false);setBusy(false);setError(false);
    const changed=(changes:Record<string,{newValue?:unknown}>,area:string)=>{
      if(!current.alive||current.failed||area!=='local'||
        !Object.hasOwn(changes,PROFILE_FAVORITES_KEY))return;
      current.revision++;
      current.ids=readIds(changes[PROFILE_FAVORITES_KEY]?.newValue);
      setIds(current.ids);
    };
    env.storage.onChanged.addListener(changed);
    void (async()=>{
      try {
        const items=await env.storage.local.get(PROFILE_FAVORITES_KEY);
        if(!current.alive)return;
        // Events may be newer than the initial snapshot, but only a completed
        // read establishes the adapter's CAS baseline for a subsequent write.
        if(current.revision===0){
          current.ids=readIds(items[PROFILE_FAVORITES_KEY]);setIds(current.ids);
        }
        current.ready=true;setReady(true);
      } catch {
        if(current.alive){current.failed=true;setError(true);setReady(false);}
      }
    })();
    return()=>{current.alive=false;env.storage.onChanged.removeListener(changed);};
  },[env]);

  async function toggle(id:string):Promise<void> {
    const current=session.current;
    if(!current.alive||!current.ready||current.failed||current.writing||
      typeof id!=='string'||!id.trim())return;
    const next=current.ids.includes(id)?current.ids.filter(value=>value!==id):[...current.ids,id];
    const revision=current.revision;
    current.writing=true;setBusy(true);
    try {
      await env.storage.local.set({[PROFILE_FAVORITES_KEY]:next});
      if(current.alive&&current.revision===revision){current.ids=next;setIds(next);}
    } catch {
      if(current.alive){
        // A rejection may mean conflict or unknown outcome. Never replay it,
        // even through a stale handler or a later storage event.
        current.failed=true;current.ready=false;setError(true);setReady(false);
      }
    } finally {
      current.writing=false;
      if(current.alive)setBusy(false);
    }
  }
  return {ids,ready,busy,error,toggle};
}

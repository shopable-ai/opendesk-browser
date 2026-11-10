// Tab-scoped, origin-local refresh backup. Cached text is untrusted data,
// never a native send receipt, DOM identity or permission record.
const PREFIX='opendesk.ai-send-queue.session.v1:';
const validRoute=value=>typeof value==='string'&&value.length<=256&&/^c\/[a-z0-9-]{8,}$/.test(value);
const validText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=8192;
const states=new Set(['queued','paused','sending','waiting','unknown']);
export function normalizeQueueCache(record,route){
  if(!record||record.version!==1||record.route!==route||!validRoute(route)||
    !Array.isArray(record.items)||record.items.length>20||
    (record.expanded!==undefined&&typeof record.expanded!=='boolean'))return null;
  const ids=new Set(),items=[];
  for(const item of record.items){
    if(!item||!/^q[1-9]\d{0,14}$/.test(item.id)||ids.has(item.id)||
      !validText(item.text)||!states.has(item.state))return null;
    ids.add(item.id);items.push({id:item.id,text:item.text,state:item.state});
  }
  let inFlight=record.inFlight??null;
  if(inFlight!==null&&(!inFlight||!ids.has(inFlight.id)))return null;
  const uncertain=items.filter(item=>['sending','waiting','unknown'].includes(item.state));
  if(uncertain.length>1||inFlight&&uncertain.some(item=>item.id!==inFlight.id))return null;
  if(!inFlight&&uncertain.length)inFlight={id:uncertain[0].id};
  const draft=record.draft??null;
  if(draft!==null&&(!draft||!validText(draft.text)))return null;
  return {version:1,route,items,expanded:record.expanded===true,
    inFlight:inFlight?{id:inFlight.id}:null,
    draft:draft?{text:draft.text}:null};
}
export function createQueueCache({storage=()=>window.sessionStorage}={}){
  const writable=new Set();
  function read(route){
    if(!validRoute(route))return {status:'invalid'};
    try{
      const raw=storage().getItem(PREFIX+route);
      if(raw===null){writable.add(route);return {status:'empty'};}
      // Bound parsing cost; the queue and one transfer copy fit well below this.
      if(typeof raw!=='string'||raw.length>1200000)return {status:'invalid'};
      const data=normalizeQueueCache(JSON.parse(raw),route);
      if(!data)return {status:'invalid'};
      writable.add(route);return {status:'ready',data};
    }catch{return {status:'unavailable'};}
  }
  function write(record){
    const data=normalizeQueueCache(record,record?.route);
    if(!data||!writable.has(data.route))return false;
    try{
      const target=storage(),key=PREFIX+data.route;
      if(!data.items.length&&!data.draft)target.removeItem(key);
      else target.setItem(key,JSON.stringify(data));
      return true;
    }catch{return false;}
  }
  return Object.freeze({read,write});
}

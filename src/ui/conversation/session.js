// A trusted, business-neutral conversation lifetime and presentation store.
// Provider transport, business references, grants and Host writes stay with their owners.
const failure=(code,message)=>Object.assign(new Error(message),{code});
const phaseNames=new Set(['idle','thinking','writing','reading','stopping']);
const empty=()=>({open:false,draft:'',rows:[],needsReview:false,busy:false,phase:'idle',revision:0});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const sanitizeRows=(rows,limit)=>rows.slice(-limit).filter(row=>
  row&&typeof row.id==='string'&&row.id&&
  typeof row.speaker==='string'&&typeof row.message==='string'
).map(row=>Object.freeze({id:row.id.slice(0,100),
  speaker:row.speaker.slice(0,64),message:row.message.slice(0,3500)}));

export function createConversationSession({identity,rowsLimit=32}={}) {
  if(!identity||!['consumerId','instanceId','hostInstanceId'].every(key=>
    typeof identity[key]==='string'&&identity[key].length>0&&identity[key].length<=160)||
    identity.installEpoch!=null&&typeof identity.installEpoch!=='string'||
    !Number.isSafeInteger(rowsLimit)||rowsLimit<1||rowsLimit>100)
    throw failure('E_CONVERSATION_IDENTITY','对话实例身份无效');
  const owner=Object.freeze({consumerId:identity.consumerId,
    instanceId:identity.instanceId,hostInstanceId:identity.hostInstanceId,
    installEpoch:identity.installEpoch??null});
  let disposed=false,sequence=0,round=null;
  const listeners=new Set();
  let snapshot=Object.freeze({...empty(),rows:Object.freeze([])});
  const ensure=()=>{if(disposed)throw failure('E_TOOL_CHANGED','对话实例已经关闭');};
  function publish(patch) {
    const next={...snapshot,...patch,revision:snapshot.revision+1};
    next.rows=Object.freeze(next.rows);
    snapshot=Object.freeze(next);
    for(const listener of [...listeners])listener();
  }
  function update(patch={}) {
    ensure();
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||
      Object.keys(patch).some(key=>!['open','draft','rows','needsReview'].includes(key)))
      throw failure('E_CONVERSATION_STATE','对话展示状态无效');
    const next={};
    if(own(patch,'open'))next.open=patch.open===true;
    if(own(patch,'needsReview'))next.needsReview=patch.needsReview===true;
    if(own(patch,'draft'))next.draft=typeof patch.draft==='string'?patch.draft.slice(0,4000):'';
    if(own(patch,'rows'))next.rows=Array.isArray(patch.rows)?
      sanitizeRows(patch.rows,rowsLimit):snapshot.rows;
    if(!Object.keys(next).length)return snapshot;
    if(Object.entries(next).every(([key,value])=>
      key==='rows'?JSON.stringify(value)===JSON.stringify(snapshot.rows):value===snapshot[key]))
      return snapshot;
    publish(next);
    return snapshot;
  }
  function append(speaker,message){
    ensure();
    const id='conversation-'+(++sequence);
    update({rows:[...snapshot.rows,{id,speaker:String(speaker),message:String(message)}]});
    return id;
  }
  function replaceMessage(id,message){
    ensure();
    if(!snapshot.rows.some(row=>row.id===id))return false;
    update({rows:snapshot.rows.map(row=>row.id===id?
      {id:row.id,speaker:row.speaker,message:String(message)}:row)});
    return true;
  }
  function finish(token) {
    if(round!==token)return;
    token.signal?.removeEventListener?.('abort',token.onAbort);
    round=null;
    if(!disposed)publish({busy:false,phase:'idle'});
  }
  function cancel(reason=failure('E_CANCELLED','本轮对话已停止')){
    if(!round)return false;
    round.controller.abort(reason);
    if(!disposed&&snapshot.phase!=='stopping')publish({phase:'stopping'});
    return true;
  }
  function begin({signal=null,providerGeneration=null}={}){
    ensure();
    if(round)throw failure('E_CONVERSATION_BUSY','当前会话已经在执行');
    if(signal?.aborted)throw signal.reason||failure('E_CANCELLED','本轮已取消');
    const controller=new AbortController();
    const token={controller,signal,onAbort:()=>controller.abort(
      signal?.reason||failure('E_CANCELLED','本轮对话已停止')),providerGeneration};
    signal?.addEventListener('abort',token.onAbort,{once:true});
    round=token;
    publish({busy:true,phase:'thinking'});
    return Object.freeze({
      signal:controller.signal,
      assertCurrent(currentGeneration=providerGeneration){
        ensure();
        if(round!==token||controller.signal.aborted)
          throw controller.signal.reason||failure('E_CONVERSATION_STALE','旧会话回执已失效');
        if(currentGeneration!==providerGeneration)
          throw failure('E_CONVERSATION_STALE','模型配置改变，旧会话回执已失效');
      },
      finish:()=>finish(token)
    });
  }
  function setPhase(phase){
    ensure();
    if(!round||!phaseNames.has(phase))return;
    if(snapshot.phase!==phase)publish({phase});
  }
  function reset(){
    ensure();cancel(failure('E_CONVERSATION_STALE','对话已切换'));
    if(round)finish(round);
    update({open:false,draft:'',rows:[],needsReview:false});
  }
  return Object.freeze({
    identity:()=>owner,getSnapshot:()=>snapshot,
    subscribe(listener){ensure();if(typeof listener!=='function')
      throw failure('E_CONVERSATION_STATE','对话监听器无效');
      listeners.add(listener);return ()=>listeners.delete(listener);},
    update,append,replaceMessage,begin,cancel,setPhase,reset,
    dispose(){if(disposed)return;cancel(failure('E_TOOL_CHANGED','对话实例已关闭'));
      if(round)finish(round);
      disposed=true;listeners.clear();
      snapshot=Object.freeze({...empty(),rows:Object.freeze([])});}
  });
}

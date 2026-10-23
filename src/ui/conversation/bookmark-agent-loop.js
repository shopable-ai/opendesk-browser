// A bounded task loop for the existing Bookmark Conversation adapter.
// It neither owns a Provider nor performs Chrome writes outside executeBookmarkPlan.
import {bookmarkConversationContext,executeBookmarkPlan,validateBookmarkPlan,
  verifyBookmarkCompletion} from './bookmark-actions.js';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const LIMITS=Object.freeze({rounds:8,actions:24,durationMs:480000});
function interrupted(signal){
 if(!signal?.aborted)return;
 throw typeof signal.reason?.code==='string'?signal.reason:
  failure('E_CANCELLED','已停止，未执行后续书签操作');
}
function publicObservation(row){
 // Never pass Chrome node IDs, URLs, document refs or permission tokens to AI.
 return {kind:row.kind,status:row.status,
  ...(row.query?{query:String(row.query).slice(0,200)}:{}),
  ...(row.title?{title:String(row.title).slice(0,256)}:{}),
  ...(row.path?{path:String(row.path).slice(0,512)}:{}),
  ...(Array.isArray(row.matches)?{matches:row.matches.slice(0,12).map(match=>({
   reference:match.reference,title:String(match.title||'').slice(0,256),
   path:String(match.path||'').slice(0,512),kind:match.kind
  }))}:{})};
}
// Derive the destination from the user's goal when explicitly named.
// A model's unrelated completion condition cannot change that goal.
function filingTarget(goal){
 if(!/当前(?:网页|页面|页)/.test(goal))return {filing:false,name:null};
 const filing=/(?:收藏|放入|放到|存入|保存|加入|添加|移动)/.test(goal);
 if(!filing)return {filing:false,name:null};
 const patterns=[
  /当前(?:网页|页面|页)[^。；;\n]{0,120}?(?:放入|放到|收藏到|保存到|存入|加入|添加到|移动到)\s*(.+)/,
  /(?:收藏|保存|移动|添加)[^。；;\n]{0,20}?当前(?:网页|页面|页)[^。；;\n]{0,120}?(?:到|进|入|至)\s*(.+)/
 ];
 const matched=patterns.map(p=>goal.match(p)?.[1]).find(Boolean);
 if(!matched)return {filing:true,name:null};
 let name=matched.split(/[，,。？！!?；;\n]|(?:如果|假如|若不存在|若没有)/)[0].trim();
 name=name.replace(/^(?:到|至|名为|名称为|叫做|叫|文件夹|目录)\s*/,'').trim();
 const quote=name.match(/^[「“『"']([^」”』"']+)[」”』"']/);
 if(quote)name=quote[1].trim();
 if(!name||name.length>256)return {filing:true,name:null};
 return {filing:true,name};
}
function requiredChecks(goal){
 // Bind the two parts to the user's named folder, not a model's $lastFolder.
 // Only the complete create-and-file intent is accepted here; extra commands
 // still need clarification rather than a weaker completion condition.
 // Strip only a bounded polite preamble; the entire remaining goal must still
 // match a strict completion contract, so extra instructions are never ignored.
 const text=goal.trim().replace(/^(?:请\s*)?(?:帮我\s*)?/u,'');
 const compound=text.match(/^(?:请)?(?:创建|新建)\s*(?:一个)?(?:名为|叫做)?\s*([「“『"'][^」”』"']+[」”』"']|[^，,。；;\n]+?)\s*(?:的)?(?:文件夹|目录)\s*[，,；;]?\s*(?:并且|并|然后|再|同时)\s*(.+?)[。！!]?$/)||
  text.match(/^(?:请)?(?:创建|新建)\s*(?:一个)?(?:文件夹|目录)\s*([「“『"'][^」”』"']+[」”』"']|[^，,。；;\n]+?)\s*[，,；;]?\s*(?:并且|并|然后|再|同时)\s*(.+?)[。！!]?$/);
 if(compound){
  const name=compound[1].trim().replace(/^[「“『"'](.+)[」”』"']$/,'$1');
  const filing=compound[2].trim();
  const pageFirst=filing.match(/^(?:把|将)?\s*当前(?:网页|页面|页)\s*(?:(?:收藏|保存|添加)(?:到|至|进)|放(?:入|到)|存入|加入)\s*(.+)$/);
  const verbFirst=filing.match(/^(?:收藏|保存|添加)\s*当前(?:网页|页面|页)(?:\s*(?:到|至|进)\s*(.+))?$/);
  const destination=(pageFirst||verbFirst)?.[1]?.trim();
  const sameFolder=destination===undefined||/^(?:该|这个|新建的|新创建的)(?:文件夹|目录)(?:里|中)?$/.test(destination)||
   destination.replace(/^[「“『"'](.+)[」”』"']$/,'$1')===name;
  // Completion's folder field accepts paths and references. Ambiguous literal
  // names must be clarified rather than reinterpreted as another destination.
  if(name&&name.length<=256&&!name.startsWith('$')&&!name.includes('/')&&
    (pageFirst||verbFirst)&&sameFolder)
   // The user's newly named folder belongs under the folder selected at Send,
   // never under some unrelated existing folder with the same title.
   return [{kind:'bookmark.title',target:'$lastFolder',title:name},
    {kind:'bookmark.parent',target:'$lastFolder',folder:'$currentFolder'},
    {kind:'bookmark.inFolder',folder:'$lastFolder',url:'$currentPage'}];
  return null;
 }
 const {filing,name}=filingTarget(goal);
 if(filing){
  // A compound creation request that failed full parsing (including multiline
  // suffixes) must not fall through to the weaker filing-only contract.
  if(/^(?:请)?(?:创建|新建)/.test(text))return null;
  if(/(?:[，,；;\n]|并|然后|同时|再)\s*(?:(?:把|将).{0,80})?(?:重命名|改名|修改|删除|移动|创建|新建|搜索|查找)/.test(goal))
   return null;
  if(!name&&!/^(?:请)?(?:收藏|保存)当前(?:网页|页面|页)[。！!]?$/.test(goal.trim()))
   return null;
  return [{kind:'bookmark.inFolder',folder:name||'$currentFolder',url:'$currentPage'}];
 }
 const search=text.match(/^(?:搜索|查找|找出|检索)\s*(.+?)\s*(?:相关(?:的)?书签|书签)?[。！!]?$/);
 if(search)return [{kind:'search.observed',query:search[1].trim()}];
 const folder=text.match(/^确保\s*(.+?)(?:文件夹|目录)存在[。！!]?$/)||
  text.match(/^(?:创建|新建)\s*(?:一个)?(?:名为|叫做)?\s*(.+?)(?:的)?(?:文件夹|目录)[。！!]?$/)||
  text.match(/^(?:创建|新建)\s*(?:一个)?(?:文件夹|目录)\s*(.+?)[。！!]?$/);
 if(folder){
  const title=folder[1].trim().replace(/^[「“『"'](.+)[」”』"']$/,'$1');
  // A create/new request must independently verify BOTH the title and the
  // actual parent of the Host-resolved folder ID. A generic "exists" check
  // alone can succeed when the model wrote under the wrong directory.
  if(/^(?:请)?(?:创建|新建)/.test(text))
   return [{kind:'bookmark.title',target:'$lastFolder',title},
    {kind:'bookmark.parent',target:'$lastFolder',folder:'$currentFolder'}];
  return [{kind:'folder.exists',folder:title}];
 }
 // An unrecognized or compound intent must be clarified, never reduced to
 // whichever weaker condition the model happened to claim.
 return null;
}
export async function runBookmarkAgentLoop({goal,initialProposal,nextProposal,service,
 context,refs={},expectedTree=null,signal,beforeWrite=()=>{
  throw failure('E_MODEL_GRANT_REQUIRED','未确认本次书签任务的写入授权');
 },onStep=()=>{},
 onPhase=()=>{},retryModel=false,limits=LIMITS}={}){
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000||
   typeof nextProposal!=='function'||typeof service?.load!=='function')
  throw failure('E_AI_REQUEST','无法建立可信书签任务');
 const maximum={rounds:Math.min(8,limits.rounds||8),
  actions:Math.min(24,limits.actions||24),
  durationMs:Math.min(480000,limits.durationMs||480000)};
 const started=Date.now(),history=[],allMessages=[],searched=new Set();
 const goalConditions=requiredChecks(goal),parentSignal=signal,controller=new AbortController();
 const stop=()=>{try{interrupted(parentSignal);}catch(error){controller.abort(error);}};
 parentSignal?.addEventListener('abort',stop,{once:true});
 if(parentSignal?.aborted)stop();
 signal=controller.signal;
 const timeout=setTimeout(()=>controller.abort(failure('E_AGENT_LIMIT',
  '运行时间已达上限。已完成的操作保留，请核对书签后继续。')),maximum.durationMs);
 let proposal=initialProposal,latest=expectedTree,nextRefs={...refs,
  matches:[...(refs.matches||[]).slice(0,12)]};
 let modelCalls=1,actionCount=0,lastFingerprint='',stallCount=0;
 const bound=()=>{
  interrupted(signal);
  if(Date.now()-started>=maximum.durationMs)
   throw failure('E_AGENT_LIMIT','运行时间已达上限。已完成的操作保留，请核对书签后继续。');
 };
 try{
  for(let round=0;round<maximum.rounds;round++){
   bound();
   let checked,observed=[];
   try{checked=validateBookmarkPlan(proposal);}
   catch(error){
    // Only this pre-execution validation may ask for a corrected plan.
    // Keep feedback fixed: invalid payloads and raw errors may contain private data.
    if(error?.code!=='E_CONVERSATION_SCHEMA')throw error;
    observed=[{kind:'validation',status:'INVALID',
     title:'计划格式校验失败（E_CONVERSATION_SCHEMA）。actions 的动作使用 type，complete 的条件使用 kind；仅提交 actions、complete 或 question 之一。示例：{"actions":[{"type":"folder.ensure","title":"目录","parent":"$currentFolder"}]}'}];
   }
   if(checked?.question)return {question:checked.question,refs:nextRefs,
    completed:false,messages:allMessages,modelCalls,actionCount};
   if(checked?.complete){
    onPhase('verifying');
    const verification=await verifyBookmarkCompletion({checks:checked.complete,
     requiredChecks:goalConditions||[],service,context,refs:nextRefs,signal,searched});
    latest=verification.tree;
    bound();
    if(verification.complete&&goalConditions){
     return {completed:true,question:null,refs:nextRefs,tree:latest,
      messages:allMessages,modelCalls,actionCount,
      summary:verification.summary};
    }
    observed=[{kind:'verification',status:'NOT_MET',
     title:!goalConditions?
      '无法独立核实原始用户目标，请明确目标条件或询问必要信息':
      verification.reason||'目标仍未满足'}];
   }else if(checked){
    if(actionCount+checked.actions.length>maximum.actions)
     throw failure('E_AGENT_LIMIT','本次操作数达到安全上限；请核对已完成操作。');
    actionCount+=checked.actions.length;
    const writing=checked.actions.some(action=>action.type!=='bookmark.search');
    onPhase(writing?'writing':'observing');
    try{
     const execute=()=>executeBookmarkPlan({plan:checked,service,context,
      refs:nextRefs,expectedTree:latest,signal,beforeWrite,onStep});
     let executed;
     try{executed=await execute();}
     catch(error){
      // Retry only a read-only plan with no confirmed steps or issued writes.
      // E_CHROME is the full Bookmarks Host's native read-failure encoding.
      if(writing||signal?.aborted||error?.writeIssued===true||error?.partial?.length||
        error?.outcome==='OUTCOME_UNKNOWN'||error?.upstreamTermination==='NOT_CONFIRMED'||
        !['E_CHROME','E_BOOKMARK_READ_RETRYABLE','E_NETWORK','E_FETCH_FAILED','E_TIMEOUT'].includes(error?.code))
       throw error;
      bound();executed=await execute();
     }
     nextRefs=executed.refs;latest=executed.tree;
     allMessages.push(...executed.messages);
     observed=executed.observations||[];
     for(const item of observed)if(item.kind==='search')searched.add(item.query);
    }catch(error){
     if(error?.refs)nextRefs=error.refs;
     if(error?.code==='E_BOOKMARK_AMBIGUOUS'){
      if(error?.partial?.length)allMessages.push(...error.partial);
      return {question:error.message,refs:nextRefs,completed:false,
       messages:allMessages,modelCalls,actionCount};
     }
     // Keep the failing plan's partial journal on the thrown error. The outer
     // task catch combines it with prior rounds exactly once.
     if(error?.writeIssued===true||
       !['E_BOOKMARK_NOT_FOUND','E_BOOKMARK_REFERENCE'].includes(error?.code))
      throw error;
     if(error?.partial?.length)allMessages.push(...error.partial);
     // A failed resolution before dispatch is an observation, not a terminal
     // user failure. The next model round may propose folder.ensure.
     bound();latest=await service.load();
     observed=[{kind:'resolution',status:'NOT_FOUND',title:String(error.message).slice(0,240)}];
    }
   }
   const serial=JSON.stringify({observed,refs:nextRefs,
    tree:[...(latest?.byId?.values()||[])].map(node=>
     [node.id,node.parentId,node.title,node.url]).sort((a,b)=>a[0].localeCompare(b[0]))});
   stallCount=serial===lastFingerprint?stallCount+1:0;
   lastFingerprint=serial;
   if(stallCount>=1)
    throw failure('E_AGENT_NO_PROGRESS','连续两轮没有进展，已停止以避免重复操作。请核对书签后补充目标位置。');
   history.push({round:round+1,observations:observed.map(publicObservation)});
   if(history.length>6)history.shift();
   if(round===maximum.rounds-1)break;
   bound();onPhase('thinking');
   const modelContext={goal,bookmarkState:bookmarkConversationContext(latest,{
    selectedId:context.selectedId,currentFolderId:context.currentFolderId,refs:nextRefs}),
    currentPageAvailable:context.pageContext?.status==='available',
    progress:history,remainingActions:maximum.actions-actionCount,
    instructions:'原始用户目标尚未核实；根据真实观察继续，或提交可读回验证的 complete 条件。'};
   const ask=async()=>{
    bound();
    let onAbort;
    const stopped=new Promise((_,reject)=>{
     onAbort=()=>{try{interrupted(signal);}catch(error){reject(error);}};
     signal.addEventListener('abort',onAbort,{once:true});
     if(signal.aborted)onAbort();
    });
    try{
     const result=await Promise.race([stopped,Promise.resolve().then(()=>{
      bound();return nextProposal(modelContext,{signal});
     })]);
     bound();return result;
    }finally{signal.removeEventListener('abort',onAbort);}
   };
   let next;
   try{next=await ask();}
   catch(error){
    // Structured inference has no write authority. Only stateless HTTPS
    // transient transport failures are eligible for one same-run retry.
    const knownHTTP=error?.code==='E_AI_PROVIDER'&&[502,503].includes(error.httpStatus);
    if(!retryModel||signal?.aborted||error?.writeIssued===true||error?.partial?.length||
      error?.outcome==='OUTCOME_UNKNOWN'||error?.upstreamTermination==='NOT_CONFIRMED'||
      (!knownHTTP&&!['E_AI_NETWORK','E_NETWORK','E_FETCH_FAILED','E_AI_HTTP_502','E_AI_HTTP_503'].includes(error?.code)))
     throw error;
    bound();next=await ask();
   }
   modelCalls++;proposal=next?.proposal||next;
  }
  throw failure('E_AGENT_LIMIT','达到本次最大决策轮次，未确认完整目标；已完成操作不会回滚。');
 }catch(error){
  // Service preflight reports cancellation for an expired task signal. Keep
  // the task's deadline reason, but never relabel an issued UNKNOWN write.
  if(error?.code==='E_CANCELLED'&&error.writeIssued!==true&&signal.reason?.code==='E_AGENT_LIMIT'){
   error.code='E_AGENT_LIMIT';error.message=signal.reason.message;
  }
  // Retain the entire verified multi-round journal without marking UNKNOWN safe.
  const current=Array.isArray(error.partial)?error.partial:[];
  error.partial=[...allMessages,...current];
  error.refs=error.refs||nextRefs;
  throw error;
 }finally{
  clearTimeout(timeout);parentSignal?.removeEventListener('abort',stop);
 }
}

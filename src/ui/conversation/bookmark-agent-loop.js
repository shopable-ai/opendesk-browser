// A bounded task loop for the existing Bookmark Conversation adapter.
// It neither owns a Provider nor performs Chrome writes outside executeBookmarkPlan.
import {bookmarkConversationContext,executeBookmarkPlan,validateBookmarkPlan,
  verifyBookmarkCompletion} from './bookmark-actions.js';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const LIMITS=Object.freeze({rounds:8,actions:24,durationMs:480000});
function interrupted(signal){
 if(!signal?.aborted)return;
 throw signal.reason?.code?signal.reason:failure('E_CANCELLED','已停止，未执行后续书签操作');
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
function requiredChecks(goal,checks,tree,refs,context){
 const {filing,name}=filingTarget(goal);
 if(!filing){
  if(/^(?:搜索|查找|找出|检索)/.test(goal.trim()))return true;
  return !/(?:创建|新建|收藏|移动|重命名|改名|放入|放到)/.test(goal)||
   checks.some(check=>check.kind!=='search.observed');
 }
 return checks.some(check=>{
  if(check.kind!=='bookmark.inFolder'||check.url!=='$currentPage')return false;
  if(!name)return true;
  const id=check.folder==='$lastFolder'?refs.folderId:
   check.folder==='$currentFolder'?context.currentFolderId:
   check.folder==='$selected'?context.selectedId:null;
  const actual=id?tree?.byId?.get(id)?.title:null;
  const label=actual||check.folder.split(/\s*\/\s*/).at(-1);
  return label===name;
 });
}
export async function runBookmarkAgentLoop({goal,initialProposal,nextProposal,service,
 context,refs={},expectedTree=null,signal,beforeWrite=()=>{},onStep=()=>{},
 onPhase=()=>{},retryModel=false,limits=LIMITS}={}){
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000||
   typeof nextProposal!=='function'||typeof service?.load!=='function')
  throw failure('E_AI_REQUEST','无法建立可信书签任务');
 const maximum={rounds:Math.min(8,limits.rounds||8),
  actions:Math.min(24,limits.actions||24),
  durationMs:Math.min(480000,limits.durationMs||480000)};
 const started=Date.now(),history=[],allMessages=[],searched=new Set();
 let proposal=initialProposal,latest=expectedTree,nextRefs={...refs,
  matches:[...(refs.matches||[]).slice(0,12)]};
 let modelCalls=1,actionCount=0,lastFingerprint='',stallCount=0;
 const bound=()=>{
  interrupted(signal);
  if(Date.now()-started>maximum.durationMs)
   throw failure('E_AGENT_LIMIT','运行时间已达上限。已完成的操作保留，请核对书签后继续。');
 };
 try{
  for(let round=0;round<maximum.rounds;round++){
   bound();
   const checked=validateBookmarkPlan(proposal);
   if(checked.question)return {question:checked.question,refs:nextRefs,
    completed:false,messages:allMessages,modelCalls,actionCount};
   let observed=[];
   if(checked.complete){
    onPhase('verifying');
    const verification=await verifyBookmarkCompletion({checks:checked.complete,
     service,context,refs:nextRefs,signal,searched});
    latest=verification.tree;
    if(verification.complete&&requiredChecks(goal,checked.complete,verification.tree,nextRefs,context)){
     return {completed:true,question:null,refs:nextRefs,tree:latest,
      messages:allMessages,modelCalls,actionCount,
      summary:verification.summary};
    }
    observed=[{kind:'verification',status:'NOT_MET',
     title:!requiredChecks(goal,checked.complete,verification.tree,nextRefs,context)?
      '用户目标尚未满足：必须核实当前网页确实位于用户指定的目标文件夹':
      verification.reason||'目标仍未满足'}];
   }else{
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
      // Only a failed read with zero confirmed steps and zero issued writes
      // may be retried. Never retry a partially executed model plan.
      if(signal?.aborted||error?.writeIssued===true||error?.partial?.length||
        !['E_BOOKMARK_READ_RETRYABLE','E_NETWORK','E_FETCH_FAILED','E_TIMEOUT'].includes(error?.code))
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
   const serial=JSON.stringify({proposal:checked,observed});
   stallCount=serial===lastFingerprint?stallCount+1:0;
   lastFingerprint=serial;
   if(stallCount>=1)
    throw failure('E_AGENT_NO_PROGRESS','连续两轮没有进展，已停止以避免重复操作。请核对书签后补充目标位置。');
   history.push({round:round+1,observations:observed.map(publicObservation)});
   if(history.length>6)history.shift();
   if(round===maximum.rounds-1)break;
   bound();onPhase('thinking');
   const modelContext={bookmarkState:bookmarkConversationContext(latest,{
    selectedId:context.selectedId,currentFolderId:context.currentFolderId,refs:nextRefs}),
    currentPageAvailable:context.pageContext?.status==='available',
    progress:history,remainingActions:maximum.actions-actionCount,
    instructions:'原始用户目标尚未核实；根据真实观察继续，或提交可读回验证的 complete 条件。'};
   const ask=()=>nextProposal(modelContext);
   let next;
   try{next=await ask();}
   catch(error){
    // Structured inference has no write authority. Only stateless HTTPS
    // transient transport failures are eligible for one same-run retry.
    if(!retryModel||signal?.aborted||
      !['E_AI_NETWORK','E_NETWORK','E_FETCH_FAILED','E_AI_HTTP_502','E_AI_HTTP_503'].includes(error?.code))
     throw error;
    bound();next=await ask();
   }
   modelCalls++;proposal=next?.proposal||next;
  }
  throw failure('E_AGENT_LIMIT','达到本次最大决策轮次，未确认完整目标；已完成操作不会回滚。');
 }catch(error){
  // Retain the entire verified multi-round journal without marking UNKNOWN safe.
  const current=Array.isArray(error.partial)?error.partial:[];
  error.partial=[...allMessages,...current];
  error.refs=error.refs||nextRefs;
  throw error;
 }
}
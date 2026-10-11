// Trusted first-install coordinator. Only the service worker invokes this module;
// no page, tool iframe, imported JSON or message may request a default installation.
import {loadOfficialCatalog,loadOfficialTool,matchesOfficialRelease} from './official-catalog.js';
import {getInstalledSidebarTools,installReviewedSidebarTool,reconcileMarketOperation,
  recoverMarketOperation,MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE,
  TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE} from '../ui/sidebar-tools/installation.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';

export const DEFAULT_PREINSTALL_STORE='opendesk.sidebar-tools.bootstrap.v1';
const SCHEMA='opendesk.sidebar-tools.bootstrap.v1';
const LOCK='opendesk.sidebar-tools:bootstrap';
const fail=(message,code='E_PREINSTALL')=>Object.assign(new Error(message),{code});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const version=api=>api.runtime.getManifest().version;
const locked=(lockManager,work)=>{
  if(!lockManager?.request)throw fail('缺少可信浏览器存储锁','E_TOOL_LOCK');
  return lockManager.request(LOCK,work);
};
const read=async api=>(await api.storage.local.get(DEFAULT_PREINSTALL_STORE))[DEFAULT_PREINSTALL_STORE];
async function save(api,previous,next){
  await writeVerifiedLocalValue(api,DEFAULT_PREINSTALL_STORE,next,previous,'官方默认预装进度');
  return next;
}
function validMarker(marker){
  if(!isObject(marker)||marker.schema!==SCHEMA||
     !['pending','complete','attention','skipped-existing'].includes(marker.state)||
     typeof marker.extensionVersion!=='string'||!Array.isArray(marker.completed)||
     !marker.completed.every(id=>typeof id==='string')||
     !(marker.plan===null||Array.isArray(marker.plan)))throw fail('默认预装标记损坏，已停止自动恢复');
  return marker;
}
function validPlan(plan,releases){
  if(!Array.isArray(plan)||plan.length>releases.length)throw fail('默认预装计划损坏');
  const seen=new Set();
  for(const entry of plan){
    const release=releases.find(row=>row.toolId===entry?.toolId&&row.installationPolicy==='preinstalled');
    if(!release||seen.has(entry.toolId)||entry.version!==release.version||entry.sha256!==release.sha256||
      typeof entry.operationId!=='string'||!/^[a-f0-9-]{36}$/.test(entry.operationId))
      throw fail('默认预装计划与可信发行资源不一致');
    seen.add(entry.toolId);
  }
  return plan;
}
// The *only* point that can create an intent is runtime.onInstalled(reason=install).
// An existing registry, uninstall epoch or unfinished cleanup is treated as
// historical user state; lack of a marker alone is never proof of a new user.
export async function registerDefaultPreinstall({api,lockManager,reason}){
  if(reason!=='install')return {state:'not-new-install'};
  return locked(lockManager,async()=>{
    const before=await read(api);
    if(before!==undefined)return {state:validMarker(before).state};
    const installed=await getInstalledSidebarTools(api);
    const stores=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE,
      MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE]);
    // A historical (possibly empty) registry is evidence of previous user
    // choices. Missing bootstrap metadata must not override it.
    const historical=stores[SIDEBAR_TOOL_STORE]!==undefined||installed.length>0||[
      TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE,MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE
    ].some(key=>isObject(stores[key])&&Object.keys(stores[key]).length>0);
    const marker={schema:SCHEMA,state:historical?'skipped-existing':'pending',
      extensionVersion:version(api),plan:null,completed:[]};
    await save(api,undefined,marker);
    return {state:marker.state};
  });
}
// A worker restart may continue only a *persisted install intent* bound to
// the same extension version, never an update or an existing profile.
export async function resumeDefaultPreinstall({api,lockManager,fetcher=globalThis.fetch}){
  return locked(lockManager,async()=>{
    let marker=await read(api);
    if(marker===undefined)return {state:'not-requested'};
    marker=validMarker(marker);
    if(marker.state!=='pending')return {state:marker.state};
    if(marker.extensionVersion!==version(api))return {state:'version-changed'};
    const {apps}=await loadOfficialCatalog({api,fetcher});
    let plan=marker.plan;
    if(plan===null){
      plan=apps.filter(row=>row.installationPolicy==='preinstalled').map(row=>({
        toolId:row.toolId,version:row.version,sha256:row.sha256,operationId:crypto.randomUUID()
      }));
      marker=await save(api,marker,{...marker,plan});
    }
    validPlan(plan,apps);
    for(const entry of plan){
      if(marker.completed.includes(entry.toolId))continue;
      const release=apps.find(row=>row.toolId===entry.toolId);
      const installed=await getInstalledSidebarTools(api);
      const existing=installed.find(tool=>tool.id===entry.toolId);
      const changes=await api.storage.local.get([
        TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE,MARKET_OPERATIONS_STORE]);
      const revoked=isObject(changes[TOOL_REVOCATION_EPOCHS_STORE])&&
        Object.hasOwn(changes[TOOL_REVOCATION_EPOCHS_STORE],entry.toolId);
      const cleanup=isObject(changes[TOOL_CLEANUP_STORE])&&
        Object.hasOwn(changes[TOOL_CLEANUP_STORE],entry.toolId);
      if(revoked||cleanup){
        marker=await save(api,marker,{...marker,completed:[...marker.completed,entry.toolId]});
        continue;
      }
      const journal=isObject(changes[MARKET_OPERATIONS_STORE])?
        changes[MARKET_OPERATIONS_STORE][entry.operationId]:null;
      if(existing){
        // Never replace a user's package, including a different version or
        // source. A partially committed exact first-party install may only be
        // finalized through the existing market recovery journal.
        if(journal){
          const checked=await reconcileMarketOperation(api,entry.operationId,
            await matchesOfficialRelease(release,existing)?existing:null);
          if(checked.state==='needs-finalization'){
            const recovered=await recoverMarketOperation({api,lockManager,operationId:entry.operationId,
              expectedIdentity:{toolId:entry.toolId,marketId:release.id,
                version:entry.version,sha256:entry.sha256}});
            if(recovered.state!=='succeeded')throw fail('预装事务需要人工核对','E_OUTCOME_UNKNOWN');
          }else if(checked.state!=='succeeded'){
            marker=await save(api,marker,{...marker,state:'attention'});
            return {state:'attention',toolId:entry.toolId};
          }
        }
        marker=await save(api,marker,{...marker,completed:[...marker.completed,entry.toolId]});
        continue;
      }
      if(journal&&journal.state!=='failed'){
        // An operation already touched the durable journal: do not create a
        // second submission when its registry outcome cannot be established.
        marker=await save(api,marker,{...marker,state:'attention'});
        return {state:'attention',toolId:entry.toolId};
      }
      if(journal?.state==='failed'){
        // Failed is a confirmed pre-commit result, unlike outcome-unknown.
        const revised=plan.map(row=>row.toolId===entry.toolId?
          {...row,operationId:crypto.randomUUID()}:row);
        marker=await save(api,marker,{...marker,plan:revised});
        entry.operationId=revised.find(row=>row.toolId===entry.toolId).operationId;
      }
      const {tool}=await loadOfficialTool(release,{api,fetcher});
      try{
        const result=await installReviewedSidebarTool({api,lockManager,candidate:tool,
          baseline:null,reviewApproved:true,
          market:{marketId:release.id,sha256:release.sha256,operationId:entry.operationId},
          approveUpdate:()=>false,approveSourceChange:()=>false});
        if(!['installed','already-installed'].includes(result.state))
          throw fail('官方预装未成功提交');
      }catch(error){
        if(['E_OUTCOME_UNKNOWN','E_TOOL_CHANGED','E_MARKET_IDENTITY'].includes(error?.code)){
          // Do not replay unknown effects or undo user changes.
          marker=await save(api,marker,{...marker,state:'attention'});
          return {state:'attention',toolId:entry.toolId};
        }
        throw error; // transient errors retain a pending plan for a later safe attempt
      }
      marker=await save(api,marker,{...marker,completed:[...marker.completed,entry.toolId]});
    }
    marker=await save(api,marker,{...marker,state:'complete'});
    return {state:'complete',installed:marker.completed.length};
  });
}

// Bounded, audited compatibility adapter for an already-installed Stay Focus 1.0.10.
// This never executes code from the reviewed candidate package. Installer owns
// the original journal/locks; the public Driver owns all new native state.
// Remove this adapter only after a separately verified archival upgrade path.
import {FOCUS_ID,FOCUS_STORE,FOCUS_ALARM,FOCUS_RULE_FIRST,FOCUS_RULE_LAST,
  focusPackageHash} from '../../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {migrateLegacyFocusV1Snapshot} from './legacy-focus-v1-snapshot.js';
import {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';
import {sidebarToolPackageHash} from './package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from './lifecycle.js';
import {stableStorageString,writeVerifiedLocalValue,sameStorageValue} from './storage-state.js';
import {normalizeManagedSiteV3Policy,canonicalManagedSiteV3ModelBytes}
  from '../../framework/sdk/site-budget-v3-policy.js';
import {extendReviewedManagedSiteScopes,managedSiteV3RequiredOrigins,
  MANAGED_SITE_REVIEWED_SCOPE_STORE} from '../../framework/host/managed-site-reviewed-scopes.js';
import {stageManagedSiteV3MigrationLocked,stopManagedSiteBudgetForTool,
  MANAGED_SITE_BUDGET_STORE,MANAGED_SITE_BUDGET_ALARM}
  from '../../platform/chrome/browser-managed-site-budget.js';
import {desiredManagedSiteV3Rules,isManagedSiteV3RuleId} from '../../platform/chrome/managed-site-v3-rules.js';
import {stopStayFocusForTool} from '../../../examples/sidebar-tools/stay-focus/trusted/lifecycle.js';

export const LEGACY_FOCUS_SNAPSHOT_PREFIX='opendesk.market.legacy-focus.v1:';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const shaPattern=/^[a-f0-9]{64}$/;
const sha256=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  typeof data==='string'?new TextEncoder().encode(data):data)),
  v=>v.toString(16).padStart(2,'0')).join('');
const isValidOld=tool=>tool?.id===FOCUS_ID&&tool.format==='opendesk.sidebar-tool.v1'&&
  tool.version==='1.0.10'&&tool.capabilities.includes('focus.control');
const isValidNew=tool=>tool?.id===FOCUS_ID&&tool.format==='opendesk.sidebar-tool.v2'&&
  tool.capabilities.includes('browser.siteBudget')&&
  !tool.capabilities.includes('focus.control')&&
  tool.backgroundPolicy?.kind==='site-budget.v3';

// Verify the whole native DNR rule after the Driver's reconciliation.
// Matching only ID, action type and priority can falsely accept a changed URL
// scope, exemption or redirect destination during a legacy upgrade.
function canonicalManagedNativeRule(rule){
  if(!rule||typeof rule!=='object')return null;
  const condition={...rule.condition};
  if(condition.isUrlFilterCaseSensitive===false)
    delete condition.isUrlFilterCaseSensitive;
  return {id:rule.id,priority:rule.priority,action:rule.action,condition};
}
export function matchesManagedSiteV3NativeRules(actual,expected,slot){
  if(!Array.isArray(actual)||!Array.isArray(expected))return false;
  const owned=actual.filter(rule=>isManagedSiteV3RuleId(slot,rule?.id))
    .sort((a,b)=>a.id-b.id);
  const wanted=expected.slice().sort((a,b)=>a.id-b.id);
  return owned.length===wanted.length&&owned.every((rule,index)=>
    sameStorageValue(canonicalManagedNativeRule(rule),
      canonicalManagedNativeRule(wanted[index])));
}

// Called read-only under the Installer's original tool/catalog locks.
// A malformed, undocumented or different-source legacy owner is left intact.
export async function prepareLegacyFocusUpgrade({api,existing,candidate,source,
  previousProvenance,oldEpoch,newEpoch,operationId}){
  if(!isValidOld(existing)||!isValidNew(candidate)||
     source!=='opendesk/'+FOCUS_ID||
     previousProvenance?.marketId!==source||
     !shaPattern.test(previousProvenance?.sha256)||
     typeof oldEpoch!=='string'||!oldEpoch||
     typeof newEpoch!=='string'||!newEpoch||
     typeof operationId!=='string'||!/^[a-f0-9-]{36}$/.test(operationId))
    fail('E_MIGRATION_IDENTITY','旧版来源、安装代际或 v3 迁移目标无法确认');
  const oldHash=await focusPackageHash(existing);
  const newHash=await sidebarToolPackageHash(candidate);
  const raw=(await api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  const prepared=migrateLegacyFocusV1Snapshot(raw,{at:Date.now()});
  // Only the old trusted Worker could have stored this legacy digest/epoch.
  // A missing/revoked pair cannot be recreated from the new package claim.
  const previouslyGranted=prepared.legacyAuthorizedHash===oldHash&&
    prepared.legacyAuthorizedEpoch===oldEpoch;
  if(prepared.enabled&&!previouslyGranted)
    fail('E_MIGRATION_GRANT','旧版启用状态的原始 Hash 或 Epoch 不符，禁止继承原生授权');
  const policy=normalizeManagedSiteV3Policy(prepared.desiredPolicy);
  const requested=managedSiteV3RequiredOrigins({...policy,enabled:true});
  // Even a STOP upgrade must prove the old DNR range can be read and
  // retired; it is unsafe to commit the new owner with orphan native rules.
  const dnrAvailable=await api.permissions.contains({
    permissions:['declarativeNetRequestWithHostAccess']});
  if(!dnrAvailable||!api.declarativeNetRequest?.getDynamicRules||
     !api.declarativeNetRequest?.updateDynamicRules||
     !api.alarms?.get||!api.alarms?.clear)
    fail('E_MIGRATION_NATIVE_UNAVAILABLE','无法核对或清理旧版 Chrome 原生资源，旧安装保持不变');
  const nativeGrant=await api.permissions.contains({permissions:['idle',
    'declarativeNetRequestWithHostAccess']});
  const originGrant=!requested.length||await api.permissions.contains({origins:requested});
  if(prepared.enabled&&(!nativeGrant||!originGrant))
    fail('E_MIGRATION_GRANT','原生网站权限已变化，禁止静默恢复启用的网站限制');
  const sourceHash=await sha256(stableStorageString(existing));
  const modelRef=await sha256(canonicalManagedSiteV3ModelBytes(prepared.sealedModel));
  const snapshot={
    schema:'opendesk.legacy-focus-upgrade.v1',
    legacy:{version:existing.version,epoch:oldEpoch,focusHash:oldHash,
      marketId:source,sourcePackageSha256:previousProvenance.sha256,
      installedValueHash:sourceHash,raw:structuredClone(raw)},
    target:{version:candidate.version,epoch:newEpoch,packageHash:newHash,marketId:source},
    prepared:structuredClone(prepared),modelRef,
    // A user STOP is never resumed just because a historical grant was valid.
    inheritReview:previouslyGranted&&nativeGrant&&originGrant,
    createdAt:Date.now()
  };
  const descriptor={snapshotKey:LEGACY_FOCUS_SNAPSHOT_PREFIX+operationId,
    snapshotSha256:await sha256(stableStorageString(snapshot)),
    fromVersion:existing.version,fromEpoch:oldEpoch,fromHash:oldHash,
    toEpoch:newEpoch,toHash:newHash};
  return {snapshot,descriptor};
}
export async function writeLegacyFocusUpgradeSnapshot(api,{snapshot,descriptor}){
  const key=descriptor.snapshotKey;
  const old=(await api.storage.local.get(key))[key];
  if(old!==undefined)
    fail('E_MIGRATION_CONFLICT','本次升级审计快照已存在，必须通过原事务恢复');
  if(await sha256(stableStorageString(snapshot))!==descriptor.snapshotSha256)
    fail('E_MIGRATION_SNAPSHOT','旧版升级快照提交前发生变化');
  await writeVerifiedLocalValue(api,key,snapshot,undefined,'旧版专注不可变迁移快照');
}
async function verifiedLegacyFocusSnapshot(api,descriptor){
  if(typeof descriptor?.snapshotKey!=='string'||
     !/^opendesk\.market\.legacy-focus\.v1:[a-f0-9-]{36}$/.test(descriptor.snapshotKey)||
     !shaPattern.test(descriptor.snapshotSha256))
    fail('E_MIGRATION_SNAPSHOT','升级快照标识无效');
  const snapshot=(await api.storage.local.get(descriptor.snapshotKey))[descriptor.snapshotKey];
  if(!snapshot||await sha256(stableStorageString(snapshot))!==descriptor.snapshotSha256||
     snapshot.schema!=='opendesk.legacy-focus-upgrade.v1'||
     snapshot.legacy?.version!==descriptor.fromVersion||
     snapshot.legacy?.epoch!==descriptor.fromEpoch||
     snapshot.legacy?.focusHash!==descriptor.fromHash||
     snapshot.target?.epoch!==descriptor.toEpoch||
     snapshot.target?.packageHash!==descriptor.toHash||
     snapshot.target?.marketId!=='opendesk/'+FOCUS_ID)
    fail('E_MIGRATION_SNAPSHOT','升级审计快照缺失、变化或与安装事务身份不符');
  return snapshot;
}
// Called AFTER registry+epoch+source commits while holding the original locks.
// Every stage is read-before-write and repeatable only after identity checks.
// Unknown native effects are resolved with the existing Driver's DNR readback,
// never with legacy checkpoint replay or a fresh migration computation.
export async function finishLegacyFocusUpgradeLocked({api,lockManager,descriptor}){
  const snapshot=await verifiedLegacyFocusSnapshot(api,descriptor);
  const {legacy,target,prepared,modelRef,inheritReview}=snapshot;
  const [installed,epochs,sources,old]=await Promise.all([
    api.storage.local.get('opendesk.sidebar-tools.installed.v1'),
    api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE),
    api.storage.local.get(MARKET_PROVENANCE_STORE),
    api.storage.local.get(FOCUS_STORE)
  ]);
  const current=installed['opendesk.sidebar-tools.installed.v1']?.find(row=>row.id===FOCUS_ID);
  const currentSource=sources[MARKET_PROVENANCE_STORE]?.[FOCUS_ID];
  if(!isValidNew(current)||current.version!==target.version||
     await sidebarToolPackageHash(current)!==target.packageHash||
     epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[FOCUS_ID]!==target.epoch||
     currentSource?.marketId!==target.marketId||
     currentSource?.version!==target.version||
     !sameStorageValue(old[FOCUS_STORE],legacy.raw))
    fail('E_MIGRATION_IDENTITY','原始专注记录、新应用身份、来源或安装代际已变化');
  const policies=normalizeManagedSiteV3Policy(prepared.desiredPolicy);
  if(prepared.enabled&&!inheritReview)
    fail('E_MIGRATION_GRANT','原始授权不合法，禁止恢复启用的网站规则');
  await stageManagedSiteV3MigrationLocked(api,{
    id:FOCUS_ID,source:target.marketId,epoch:target.epoch,
    packageHash:target.packageHash,desiredPolicy:policies,
    modelRef,sealedModel:prepared.sealedModel,usage:prepared.usage,
    day:prepared.day,clockHighWater:prepared.clockHighWater,
    notices:prepared.notices
  },{lockManager});
  if(inheritReview){
    // Recheck LIVE native origins, never trust only an old install snapshot.
    const reviewPolicy={...policies,enabled:true};
    const origins=managedSiteV3RequiredOrigins(reviewPolicy);
    if(origins.length&&!await api.permissions.contains({origins}))
      fail('E_MIGRATION_GRANT','网站权限已撤销，不能继承旧版网站授权');
    await lockManager.request('opendesk.browser:managed-site-site-grants',async()=>{
      const raw=(await api.storage.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE))
        [MANAGED_SITE_REVIEWED_SCOPE_STORE];
      const existing=raw?.[FOCUS_ID];
      if(existing&&(existing.installEpoch!==target.epoch||
          existing.packageHash!==target.packageHash))
        fail('E_MIGRATION_SCOPE_CHANGED','新代际网站授权已被其他操作占用');
      const next=extendReviewedManagedSiteScopes(raw,{id:FOCUS_ID,
        installEpoch:target.epoch,packageHash:target.packageHash,policy:reviewPolicy});
      if(!sameStorageValue(next,raw??{}))
        await writeVerifiedLocalValue(api,MANAGED_SITE_REVIEWED_SCOPE_STORE,
          next,raw,'旧版网站范围授权转移');
    });
  }
  // First establish and independently verify the NEW public Driver. Only
  // then may the old native DNR/Alarm owner be retired: never introduce a
  // protection gap or discard historical counters before v3 is live.
  await stopManagedSiteBudgetForTool(api,FOCUS_ID,{lockManager});
  const saved=(await api.storage.local.get(MANAGED_SITE_BUDGET_STORE))
    [MANAGED_SITE_BUDGET_STORE]?.[FOCUS_ID];
  if(saved?.kind!=='site-budget.v3'||saved.epoch!==target.epoch||
     saved.packageHash!==target.packageHash||saved.source!==target.marketId||
     saved.modelRef!==modelRef||
     !sameStorageValue(saved.policy,policies)||
     saved.appliedPolicyRev!==saved.desiredPolicyRev||
     saved.status!==(policies.enabled?'applied':'inactive'))
    fail('E_OUTCOME_UNKNOWN','公共 Driver 接管状态及策略修订未通过独立读回');
  if(saved.day===prepared.day){
    if(saved.clockHighWater<prepared.clockHighWater||
       Object.entries(prepared.usage).some(([pool,ms])=>
         (saved.usage[pool]??0)<ms))
      fail('E_MIGRATION_LOSS','原计量池用量或时钟水位未在公共 Driver 守恒');
    // New actual observations may add reminders but may never forget any
    // old already-triggered threshold for its specific metering pool.
    const retained=saved.notices?.pools??{};
    if(Object.entries(prepared.notices.pools).some(([pool,record])=>
       retained[pool]?.limitMs!==record.limitMs||
       record.thresholds.some(min=>!retained[pool]?.thresholds.includes(min))))
      fail('E_MIGRATION_LOSS','公共 Driver 未保留全部已触发提醒去重记录');
  }
  if(policies.enabled&&!await api.alarms.get(MANAGED_SITE_BUDGET_ALARM))
    fail('E_OUTCOME_UNKNOWN','公共 Driver 后台闹钟没有通过 Chrome 回读');
  const actual=await api.declarativeNetRequest.getDynamicRules();
  const expected=desiredManagedSiteV3Rules(saved.policy,saved.usage,Date.now(),saved.slot);
  if(!matchesManagedSiteV3NativeRules(actual,expected,saved.slot))
    fail('E_OUTCOME_UNKNOWN','公共 Driver DNR 原生规则尚未通过独立回读');
  // The new native owner has passed readback. Retire the fixed legacy range
  // (never all DNR rules or shared alarms) and prove it is actually gone.
  await stopStayFocusForTool(api,FOCUS_ID);
  const native=await api.declarativeNetRequest.getDynamicRules();
  if(native.some(rule=>rule.id>=FOCUS_RULE_FIRST&&rule.id<=FOCUS_RULE_LAST)||
     await api.alarms.get(FOCUS_ALARM))
    fail('E_OUTCOME_UNKNOWN','旧版网站规则或专用计时仍未确认退休');
  // Read back the public effects again after retiring old resources.
  const finalRules=await api.declarativeNetRequest.getDynamicRules();
  if(!matchesManagedSiteV3NativeRules(finalRules,expected,saved.slot))
    fail('E_OUTCOME_UNKNOWN','退休旧资源后公共网站规则未能独立验证');
  return {state:'native-verified',day:saved.day,usage:structuredClone(saved.usage),
    modelRef,desiredPolicyRev:saved.desiredPolicyRev,
    appliedPolicyRev:saved.appliedPolicyRev};
}

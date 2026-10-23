// Product-owned, side-effect-free legacy migration preparation. Installer
// owns the durable transaction; neither this function nor a candidate package
// may read Chrome Storage, change an epoch or execute native rules.
import {readFocus} from './model.js';
import {FOCUS_DEFAULT_GROUP} from './catalog.js';
import {compileFocusPolicy} from './compile-site-policy.js';
import {normalizeManagedSiteV3Policy,normalizeManagedSiteV3Usage}
  from '../../../../src/framework/sdk/site-budget-v3-policy.js';
import {normalizeManagedSiteV3Notices}
  from '../../../../src/framework/sdk/site-budget-v3-reminders.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function migrateFocusState(legacy,{at=Date.now()}={}){
  // Absence of the old key is NOT evidence that an installed legacy owner had
  // an empty policy. The Installer must distinguish fresh install from upgrade.
  if(legacy===undefined||!Number.isSafeInteger(at)||at<0)
    fail('E_MIGRATION_SOURCE','缺少可核对的旧状态快照或迁移时间');
  const state=readFocus(legacy,at);
  const desiredPolicy=normalizeManagedSiteV3Policy(compileFocusPolicy(state));
  const usage=normalizeManagedSiteV3Usage(state.usage);
  const usedBefore=Object.values(state.usage).reduce((a,b)=>a+b,0);
  const usedAfter=Object.values(usage).reduce((a,b)=>a+b,0);
  if(usedBefore!==usedAfter||Object.entries(state.usage).some(([pool,ms])=>usage[pool]!==ms))
    fail('E_MIGRATION_LOSS','迁移后的每池用量与旧账本不守恒');
  if(state.enabled&&!state.authorizedHash)
    fail('E_MIGRATION_GRANT','旧启用状态缺少原授权，不能直接恢复');

  // Legacy reminders were only generated for the product's default shared
  // group. Transfer the exact threshold ledger, not a new notification.
  // A stale day has no current dedupe authority; the original record remains
  // in the immutable source snapshot for recovery.
  const prior=state.notices;
  if(prior.day===state.day&&prior.thresholds.length&&prior.budgetMs===null)
    fail('E_MIGRATION_NOTICE','旧提醒已有阈值但缺少额度，无法无损迁移');
  const pools=prior.day===state.day&&prior.budgetMs!==null?
    {'g:'+FOCUS_DEFAULT_GROUP:{limitMs:prior.budgetMs,
      thresholds:[...prior.thresholds]}}:{};
  const notices=normalizeManagedSiteV3Notices({day:state.day,pools},state.day);

  // Driver's usage, checkpoint, clock and notices are the sole native truth.
  // A sealed app model only carries business preferences and MUST NOT retain
  // an independently chargeable balance or a reusable old authorization.
  const sealedModel={...structuredClone(state),usage:{},checkpoint:null,clockHighWater:0,
    authorizedHash:null,authorizedEpoch:null,
    notices:{day:state.day,revision:0,budgetMs:null,thresholds:[]}};
  // This preparation is NOT a successful installation or native migration.
  // The trusted Installer must still attest the old hash/epoch, persist a
  // journaled snapshot, bind a reviewed v3 scope and reconcile Chrome rules.
  return Object.freeze({
    model:structuredClone(state),sealedModel,desiredPolicy,usage,notices,
    day:state.day,clockHighWater:state.clockHighWater,
    checkpoint:state.checkpoint===null?null:structuredClone(state.checkpoint),
    legacyAuthorizedHash:state.authorizedHash,
    legacyAuthorizedEpoch:state.authorizedEpoch,
    enabled:state.enabled,usedBefore,usedAfter
  });
}

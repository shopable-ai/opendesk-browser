// Lossless product-only legacy v1 migration preparation. No privileged
// storage or Chrome APIs: the trusted Installer must supply a verified source
// snapshot and atomically carry its counters into the generic v3 ledger.
import {readFocus} from './model.js';
import {compileFocusPolicy} from './compile-site-policy.js';
import {normalizeManagedSiteV3Policy,normalizeManagedSiteV3Usage}
  from '../../../../src/framework/sdk/site-budget-v3-policy.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function migrateFocusState(legacy,{at=Date.now()}={}){
  const state=readFocus(legacy,at);
  const desiredPolicy=normalizeManagedSiteV3Policy(compileFocusPolicy(state));
  const usage=normalizeManagedSiteV3Usage(state.usage);
  const usedBefore=Object.values(state.usage).reduce((a,b)=>a+b,0);
  const usedAfter=Object.values(usage).reduce((a,b)=>a+b,0);
  if(usedBefore!==usedAfter)fail('E_MIGRATION_LOSS','迁移后的用量与旧账本不守恒');
  if(state.enabled&&!state.authorizedHash)
    fail('E_MIGRATION_GRANT','旧启用状态缺少原授权，不能直接恢复');
  // Immutable source receipts let the Installer validate before switching the
  // installed epoch, without copying app algorithms into the Browser bundle.
  return Object.freeze({
    model:structuredClone(state),desiredPolicy,usage,
    day:state.day,clockHighWater:state.clockHighWater,
    checkpoint:state.checkpoint===null?null:structuredClone(state.checkpoint),
    legacyAuthorizedHash:state.authorizedHash,
    legacyAuthorizedEpoch:state.authorizedEpoch,
    enabled:state.enabled,usedBefore,usedAfter
  });
}

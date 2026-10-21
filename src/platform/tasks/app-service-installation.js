// An admission projection of the existing installed-tool registry, not another
// registry or grant. App code never supplies the namespace or this binding.
import {invariant,canonical} from '../protocol.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash,verifySidebarToolBackground} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,requireToolRevocationEpochs} from '../../ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';

export const APP_SERVICE_PROFILE='app-service';
export const APP_SERVICE_OPERATIONS=Object.freeze([
  'browser.storage.local.get','browser.storage.local.set','browser.storage.local.getQuota',
  'browser.capabilities.list','browser.capabilities.getStatus'
]);
export async function readAppServiceInstallation(api,appId){
  invariant(typeof appId==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(appId),'E_OWNER');
  const rows=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_PROVENANCE_STORE]);
  const installed=rows[SIDEBAR_TOOL_STORE];
  invariant(Array.isArray(installed)&&installed.filter(row=>row?.id===appId).length===1,'E_OWNER','Installed app is missing or ambiguous');
  const tool=validateSidebarToolPackage(installed.find(row=>row?.id===appId));
  invariant(tool.background?.kind==='opendesk.app-service.v1'&&tool.capabilities.includes('browser.storage')&&tool.capabilities.includes('browser.scheduler'),'E_CAPABILITY','App has no approved background entry');
  await verifySidebarToolBackground(tool);
  invariant(requireToolEnableRecords(rows[SIDEBAR_TOOL_ENABLE_STORE])[appId]!==false,'E_TOOL_DISABLED');
  const generation=requireToolRevocationEpochs(rows[TOOL_REVOCATION_EPOCHS_STORE])[appId];
  invariant(typeof generation==='string'&&generation.length>0,'E_OWNER','App installation generation is missing');
  const packageHash=await sidebarToolPackageHash(tool),provenance=rows[MARKET_PROVENANCE_STORE]?.[appId];
  // A reviewed local file has no authenticated publisher. A package hash is
  // integrity, never a claim that its self-declared author is trusted.
  const sourceIdentity=provenance?{kind:'market',marketId:provenance.marketId,sha256:provenance.sha256,version:provenance.version}:{kind:'local-reviewed'};
  invariant(!provenance||typeof provenance.marketId==='string'&&/^[a-f0-9]{64}$/.test(provenance.sha256)&&typeof provenance.version==='string','E_OWNER','Installation provenance is incomplete');
  return {tool,binding:{appId,packageHash,codeHash:tool.background.sha256,generation,sourceIdentity}};
}
export async function assertAppServiceBinding(api,binding){
  const current=await readAppServiceInstallation(api,binding?.appId);
  invariant(canonical(current.binding)===canonical(binding),'E_OWNER','App package, source or installation generation changed');
  return current;
}

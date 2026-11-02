// A projection of the original installed App. No Task record or second grant.
import {canonical,invariant} from '../protocol.js';
import {SIDEBAR_TOOL_STORE,verifySidebarToolBackground,sidebarToolPackageHash} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,requireToolRevocationEpochs} from '../../ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';

export async function readAppControllerInstallation(api,appId){
  invariant(typeof appId==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(appId),'E_OWNER');
  const rows=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_PROVENANCE_STORE]);
  const installed=rows[SIDEBAR_TOOL_STORE];
  invariant(Array.isArray(installed)&&installed.filter(row=>row?.id===appId).length===1,'E_OWNER');
  const tool=await verifySidebarToolBackground(installed.find(row=>row?.id===appId));
  invariant(tool.controller&&tool.capabilities.includes('controllers.run'),'E_CAPABILITY');
  invariant(requireToolEnableRecords(rows[SIDEBAR_TOOL_ENABLE_STORE])[appId]!==false,'E_TOOL_DISABLED');
  const generation=requireToolRevocationEpochs(rows[TOOL_REVOCATION_EPOCHS_STORE])[appId];
  invariant(typeof generation==='string'&&generation.length>0,'E_OWNER');
  const packageHash=await sidebarToolPackageHash(tool),provenance=rows[MARKET_PROVENANCE_STORE]?.[appId];
  invariant(!provenance||typeof provenance.marketId==='string'&&provenance.sha256===packageHash&&provenance.version===tool.version,'E_OWNER');
  const sourceIdentity=provenance?{kind:'market',marketId:provenance.marketId,sha256:provenance.sha256,version:provenance.version}:{kind:'local-reviewed'};
  return {tool,binding:{appId,packageHash,generation,controller:{sourceHash:tool.controller.sourceHash},sourceIdentity}};
}
export async function assertAppControllerBinding(api,binding){
  invariant(binding&&typeof binding.instanceId==='string'&&binding.instanceId.length>0,'E_OWNER');
  const current=await readAppControllerInstallation(api,binding.appId);
  const {instanceId,...installed}=binding;
  invariant(canonical(current.binding)===canonical(installed),'E_PERMISSION','App source or installation changed');
  return current;
}

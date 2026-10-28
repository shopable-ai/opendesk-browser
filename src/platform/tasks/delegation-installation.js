// Projection of the original App installation, never a second grant store.
import {canonical,invariant} from '../protocol.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,requireToolRevocationEpochs} from '../../ui/sidebar-tools/lifecycle.js';
import {normalizeTaskDelegations,sameTaskPin} from './delegation-contract.js';
export async function readTaskDelegationApp(api,appId){
  const rows=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
  const installed=rows[SIDEBAR_TOOL_STORE];
  invariant(Array.isArray(installed)&&installed.filter(row=>row?.id===appId).length===1,'E_OWNER');
  const tool=validateSidebarToolPackage(installed.find(row=>row?.id===appId));
  invariant(tool.capabilities.includes('tasks.run'),'E_CAPABILITY');
  const tasks=normalizeTaskDelegations(tool.delegatedTasks);
  invariant(requireToolEnableRecords(rows[SIDEBAR_TOOL_ENABLE_STORE])[appId]!==false,'E_TOOL_DISABLED');
  const generation=requireToolRevocationEpochs(rows[TOOL_REVOCATION_EPOCHS_STORE])[appId];
  invariant(typeof generation==='string'&&generation.length>0,'E_OWNER');
  return {appId,packageHash:await sidebarToolPackageHash(tool),generation,tasks};
}
export async function assertTaskDelegationApp(api,binding){
  invariant(binding&&typeof binding.instanceId==='string'&&binding.instanceId.length>0,'E_OWNER');
  const current=await readTaskDelegationApp(api,binding.appId);
  const {instanceId,task,...app}=binding;
  invariant(canonical(current)===canonical(app)&&current.tasks.some(pin=>sameTaskPin(pin,task)),'E_PERMISSION');
  return current;
}

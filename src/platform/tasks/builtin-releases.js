import baidu from '../../../examples/tasks/baidu.search.top3.v1.opendesk-task.json' with {type:'json'};
import google from '../../../examples/tasks/google.search.top3.v1.opendesk-task.json' with {type:'json'};
import chatgptDraft from '../../../projects/webflow/tasks/chatgpt.conversation.create.v1.opendesk-task.json' with {type:'json'};
import chatgptSend from '../../../projects/webflow/tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json' with {type:'json'};
import {invariant} from '../protocol.js';
import {verifyTaskPackage} from './contract.js';

// Build-owned bytes and immutable release pins. Author/source labels and IDs
// supplied by importers never confer this trust. No native run is asserted.
const releases=[
  {taskId:'baidu.search.top3',version:'1.1.4',manifestHash:'3d86dfa83de51535fef2f7a5d7ac81ec0d6905273191d1785e68881a28212bac',
    sourceHash:'14b8dd8d53484dfc527cbb710b0df27c9bc11db2c3d78f8225eedd9a46264269',package:baidu},
  {taskId:'google.search.top3',version:'1.0.0',manifestHash:'c66250e9e7002f0968a9f38935bcbe565fe37f9109cfa04e6005ff3058c04261',
    sourceHash:'f3d3e21b8d9467366708745b6207a9d70d2b6fc7a401d71798bbb2ef823fd7ad',package:google},
  // Latest reviewed Task version for NEW installations. No grant inherits
  // send:true; an exact installed version and per-request authorization remain
  // mandatory. The old draft hash stays immutable and restorable below.
  {taskId:'chatgpt.conversation.create',version:'0.2.0',manifestHash:'0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146',
    sourceHash:'90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c',package:chatgptSend}
];
const historicalReleases=[
  {taskId:'chatgpt.conversation.create',version:'0.1.0',manifestHash:'9cc34831cf5ea39654534219baef90ef2eccf3c274f5f20ce4c10eb2bb864bec',
    sourceHash:'6ae168d4039ac2ef12dceb7888125f4a5561a3f44dcb8bfdf78d43836678fd9d',package:chatgptDraft}
];
// Exactly one latest release per taskId is auto-provisioned; historical bytes
// remain verifiable for existing authorized installations and explicit restore.
export const BUILTIN_TASK_RELEASES=Object.freeze(releases.map(({package:pkg,...pin})=>Object.freeze(pin)));
export function loadPackagedTask(release) {
  const row=[...releases,...historicalReleases].find(row=>row.taskId===release.taskId&&
    row.version===release.version&&row.sourceHash===release.sourceHash&&row.manifestHash===release.manifestHash);
  return row?structuredClone(row.package):null;
}
export async function assertPackagedTask(value) {
  const pkg=await verifyTaskPackage(value);
  invariant([...releases,...historicalReleases].some(pin=>pin.taskId===pkg.manifest.taskId&&
    pin.version===pkg.manifest.version&&pin.manifestHash===pkg.manifestHash&&
    pin.sourceHash===pkg.manifest.program.sourceHash),
    'E_VERIFICATION','Task is not an exact packaged builtin release');
  return pkg;
}
export const builtinTaskStateKey=(namespace,taskId)=>`task-builtin-state:${JSON.stringify([namespace,taskId])}`;
export const taskRemovalKey=(namespace,taskId)=>`task-removed:${JSON.stringify([namespace,taskId])}`;

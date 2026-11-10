import {invariant} from '../protocol.js';
import {verifyTaskPackage} from './contract.js';
import {TASK_PACKAGE_LIMIT} from '../source-budgets.js';

// Build-owned bytes and immutable release pins. Author/source labels and IDs
// supplied by importers never confer this trust. No native run is asserted.
const releases=[
  {taskId:'baidu.search.top3',version:'1.1.5',manifestHash:'f49e274aadfeed12540aff028ff267b3772ebe35a2f16c154008542b76a5bf38',
    sourceHash:'2b0f31c0d485355576cac11968170bb9eb41c9076df5bb6659f93d0173286181',sourcePath:'examples/tasks/baidu.search.top3.v1.opendesk-task.json'},
  {taskId:'google.search.top3',version:'1.0.3',manifestHash:'e1d6b92ac83fc3eb9b21a9b7b420e808e69326f4764fdb8c6d4ee88bef7271b3',
    sourceHash:'241575bb72dccd1106132fc5561c7322fcb11b927e1940e30eda66bec38a09ee',sourcePath:'examples/tasks/google.search.top3.v1.opendesk-task.json'},
  // Latest reviewed Task version for NEW installations. No grant inherits
  // send:true; an exact installed version and per-request authorization remain
  // mandatory. The old draft hash stays immutable and restorable below.
  {taskId:'chatgpt.conversation.create',version:'0.2.0',manifestHash:'0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146',
    sourceHash:'90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c',sourcePath:'projects/webflow/tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json'}
];
const historicalReleases=[
  {taskId:'chatgpt.conversation.create',version:'0.1.0',manifestHash:'9cc34831cf5ea39654534219baef90ef2eccf3c274f5f20ce4c10eb2bb864bec',
    sourceHash:'6ae168d4039ac2ef12dceb7888125f4a5561a3f44dcb8bfdf78d43836678fd9d',sourcePath:'projects/webflow/tasks/chatgpt.conversation.create.v1.opendesk-task.json'}
];
// Exactly one latest release per taskId is auto-provisioned; historical bytes
// remain verifiable for existing authorized installations and explicit restore.
export const BUILTIN_TASK_RELEASES=Object.freeze(releases.map(({sourcePath,...pin})=>Object.freeze(pin)));
export const REVIEWED_BUILTIN_TASK_RELEASES=Object.freeze([...releases,...historicalReleases].map(({sourcePath,...pin})=>Object.freeze(pin)));
// Data assets, never fixed executable inputs or web-accessible scripts. The
// build and original Task loader share this exact immutable resource set.
export const PACKAGED_TASK_RESOURCES=Object.freeze([...releases,...historicalReleases].map(row=>Object.freeze({
  ...row,path:`tasks/builtin/${row.taskId}/${row.version}.json`
})));
export async function loadPackagedTask(release,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  const row=PACKAGED_TASK_RESOURCES.find(row=>row.taskId===release.taskId&&
    row.version===release.version&&row.sourceHash===release.sourceHash&&row.manifestHash===release.manifestHash);
  if(!row)return null;
  invariant(typeof runtime?.getURL==='function'&&typeof fetchImpl==='function','E_BUILTIN_RESOURCE','Task resource unavailable');
  const root=runtime.getURL(''),url=runtime.getURL(row.path);
  invariant(/^chrome-extension:\/\/[^/?#]+\/$/.test(root)&&url===root+row.path&&
    (!runtime.id||root==='chrome-extension://'+runtime.id+'/'),'E_BUILTIN_RESOURCE','Task resource must belong to this extension');
  let text;
  try{
    const reply=await fetchImpl(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});
    invariant(reply?.ok&&!reply.redirected&&reply.url===url,'E_BUILTIN_RESOURCE','Task resource unavailable or redirected');
    text=await reply.text();
  }catch{
    invariant(false,'E_BUILTIN_RESOURCE','Task resource could not be read');
  }
  invariant(typeof text==='string'&&new TextEncoder().encode(text).length<=TASK_PACKAGE_LIMIT,
    'E_LIMIT','Task resource exceeds package limit');
  let value;
  try{value=JSON.parse(text);}catch{invariant(false,'E_SCHEMA','Invalid Task resource JSON');}
  const pkg=await assertPackagedTask(value);
  invariant(pkg.manifest.taskId===row.taskId&&pkg.manifest.version===row.version&&
    pkg.manifestHash===row.manifestHash&&pkg.manifest.program.sourceHash===row.sourceHash,
    'E_VERIFICATION','Task resource does not match requested release');
  return pkg;
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

import {invariant} from '../protocol.js';
import {verifyTaskPackage} from './contract.js';
import {TASK_PACKAGE_LIMIT} from '../source-budgets.js';

// Build-owned bytes and immutable release pins. Author/source labels and IDs
// supplied by importers never confer this trust. No native run is asserted.
const releases=[
  {taskId:'baidu.search.top3',version:'1.1.5',manifestHash:'f49e274aadfeed12540aff028ff267b3772ebe35a2f16c154008542b76a5bf38',
    sourceHash:'2b0f31c0d485355576cac11968170bb9eb41c9076df5bb6659f93d0173286181',sourcePath:'task-packs/baidu.search/releases/baidu.search.top3.v1.opendesk-task.json'},
  {taskId:'google.search.top3',version:'1.0.3',manifestHash:'e1d6b92ac83fc3eb9b21a9b7b420e808e69326f4764fdb8c6d4ee88bef7271b3',
    sourceHash:'241575bb72dccd1106132fc5561c7322fcb11b927e1940e30eda66bec38a09ee',sourcePath:'task-packs/google.search/releases/google.search.top3.v1.opendesk-task.json'}

];
const historicalReleases=[
  // Former automatic 0.2.0 release stays immutable for existing installs/restores.
  {taskId:'chatgpt.conversation.create',version:'0.2.0',manifestHash:'0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146',
    sourceHash:'90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c',sourcePath:'task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.0.opendesk-task.json'},
  {taskId:'chatgpt.conversation.create',version:'0.1.0',manifestHash:'9cc34831cf5ea39654534219baef90ef2eccf3c274f5f20ce4c10eb2bb864bec',
    sourceHash:'6ae168d4039ac2ef12dceb7888125f4a5561a3f44dcb8bfdf78d43836678fd9d',sourcePath:'task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.v1.opendesk-task.json'}
];
// Version 0.3.0 is an explicitly installable immutable resource,
// NOT a new automatic release. No 0.2.0 installation, grant or ongoing Run
// is silently upgraded to a two-stage task.
const optionalReleases=[
  // R11 modern complete-turn and official-message readback; explicit upgrade.
  {taskId:'chatgpt.conversation.create',version:'0.2.2',
    manifestHash:'907ed4de341c42dc3aa7890a8ce99afee30a63b8a971a8b28126e74271083050',
    sourceHash:'0d9eea01b8e5f4ff4433cba0f52b5fd80979870e7c0a118b0beffcb9fa02b8b4',
    sourcePath:'task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.2.opendesk-task.json'},
  // R11 minimal composer compatibility patch; requires explicit installation.
  // The 0.2.0 release and existing grants remain immutable.
  {taskId:'chatgpt.conversation.create',version:'0.2.1',
    manifestHash:'e071bfaf539fdc96e31c4b9a21c9dbd7d509fbfbbe249ea5af757dd098a33264',
    sourceHash:'8c078f3acf5ca9608cffc2cd9a2e6c1b4c11b0b0bf121396ffeab89c27ac94c6',
    sourcePath:'task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.1.opendesk-task.json'},
  {taskId:'chatgpt.conversation.create',version:'0.3.0',
    manifestHash:'758c6d0aa2100cff0e2197dbfd5141532e76e4a7c0410a355ec8e5795255b559',
    sourceHash:'2bfe2d610d63d5204edc4c2dd5b240a9771bede88ae1994ac92bde6dd0e40a42',
    sourcePath:'task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.3.0.opendesk-task.json'}
];
const packagedReleases=[...releases,...historicalReleases,...optionalReleases];
// Only the two introductory search Tasks are default-provisioned on a new Task namespace.
// ChatGPT stays packaged, but 0.2.2 is catalog-only and requires explicit installation.
export const BUILTIN_TASK_RELEASES=Object.freeze(releases.map(({sourcePath,...pin})=>Object.freeze(pin)));
export const OPTIONAL_TASK_RELEASES=Object.freeze(optionalReleases.filter(row=>row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.2')
  .map(({sourcePath,...pin})=>Object.freeze(pin)));
export const REVIEWED_BUILTIN_TASK_RELEASES=Object.freeze(packagedReleases.map(({sourcePath,...pin})=>Object.freeze(pin)));
// Data assets, never fixed executable inputs or web-accessible scripts. The
// build and original Task loader share this exact immutable resource set.
export const PACKAGED_TASK_RESOURCES=Object.freeze(packagedReleases.map(row=>Object.freeze({
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
  invariant(packagedReleases.some(pin=>pin.taskId===pkg.manifest.taskId&&
    pin.version===pkg.manifest.version&&pin.manifestHash===pkg.manifestHash&&
    pin.sourceHash===pkg.manifest.program.sourceHash),
    'E_VERIFICATION','Task is not an exact packaged builtin release');
  return pkg;
}
export const builtinTaskStateKey=(namespace,taskId)=>`task-builtin-state:${JSON.stringify([namespace,taskId])}`;
export const taskRemovalKey=(namespace,taskId)=>`task-removed:${JSON.stringify([namespace,taskId])}`;

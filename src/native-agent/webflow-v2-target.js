// OD-AI-WORKFLOW-BRIDGE: compiled first-party V2 fixed-entry mapping.
// This is target resolution only, never a permission grant or a Task dispatch.
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../platform/tasks/builtin-releases.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {WEBFLOW_TASK_INTENT_V2_PROTOCOL} from './chatgpt-task-request.js';
import {webFlowV2ReviewedEntry,webFlowV2ReviewedArgs} from './webflow-v2-entry.js';
export {webFlowV2ReviewedEntry,webFlowV2ReviewedArgs} from './webflow-v2-entry.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

// Must be called with manifest/installation returned by the EXISTING trusted
// installed-Task verifier. It cannot grant V2 automatic execution or inherit
// any V1 approval. Unknown, current-page and dynamic targets fail closed.
export function resolveWebFlowV2FixedTarget({intent,manifest,installation}={}){
  if(!intent||Object.keys(intent).sort().join(',')!=='args,candidateId,protocol,taskId'||
    intent.protocol!==WEBFLOW_TASK_INTENT_V2_PROTOCOL||
    typeof intent.taskId!=='string'||!intent.args||typeof intent.args!=='object'||Array.isArray(intent.args))
    throw fail('E_WEBFLOW_V2_SCHEMA','需要严格四字段 V2 意图');
  const entryUrl=webFlowV2ReviewedEntry(intent.taskId);
  const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>row.taskId===intent.taskId&&row.version===manifest?.version);
  if(!pin||manifest?.taskId!==pin.taskId||manifest.version!==pin.version||
    manifest.program?.sourceHash!==pin.sourceHash||
    !Array.isArray(manifest.siteOrigins)||manifest.siteOrigins.length!==1||
    manifest.siteOrigins[0]!==new URL(entryUrl).origin||
    installation?.version!==pin.version||installation.manifestHash!==pin.manifestHash||
    installation.contentHash!==pin.sourceHash||
    installation.scriptId!==`task:${pin.taskId}:${pin.version}`||
    installation.revision!==manifest.program.revision||
    !Number.isSafeInteger(installation.generation)||installation.generation<1||
    typeof installation.installationId!=='string'||!installation.installationId)
    throw fail('E_WEBFLOW_TARGET_BINDING','固定入口、原生可信包或安装身份不匹配');
  // Validation against the verified manifest is strict: do not silently fill
  // missing Task defaults. This is still not execution authorization.
  let args;
  const reviewedArgs=webFlowV2ReviewedArgs(intent);
  try{args=validateTaskParams(manifest.paramsSchema,reviewedArgs);}
  catch{throw fail('E_WEBFLOW_V2_SCHEMA','任务参数不符合可信安装的 Schema');}
  if(canonical(args)!==canonical(reviewedArgs))
    throw fail('E_WEBFLOW_V2_SCHEMA','V2 必须提供完整参数，不能隐式补齐');
  return Object.freeze({taskId:pin.taskId,targetUrl:entryUrl,
    args:structuredClone(args),installation:structuredClone(installation)});
}

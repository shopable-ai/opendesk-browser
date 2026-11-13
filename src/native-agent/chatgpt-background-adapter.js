import {CHATGPT_BRIDGE_PROTOCOL,validChatGPTBridgeSource} from './chatgpt-bridge-trigger-gate.js';
import {assertWebFlowReplyCandidate} from './workspace-chatgpt.js';
import {validateWebFlowTaskIntent,validateWebFlowTaskIntentV2,WEBFLOW_TASK_INTENT_V2_PROTOCOL} from './chatgpt-task-request.js';
import {webFlowV2ReviewedEntry,resolveWebFlowV2FixedTarget} from './webflow-v2-target.js';
import {CHATGPT_TASK_PROFILE} from '../page-events/web-task-contract.js';
import {formatChatGPTInstalledResult} from './chatgpt-fixed-bridge-host.js';
import {assertInstalledTask,ensureBuiltinTasks} from '../platform/tasks/service.js';
import {BUILTIN_TASK_RELEASES,taskRemovalKey} from '../platform/tasks/builtin-releases.js';
import {installedKey,taskKey,validateTaskParams} from '../platform/tasks/contract.js';
import {loadBuiltinWorkerSource} from '../libs/loader.js';
import {builtinIdentity} from '../libs/identity.js';
import {FoundationError} from '../platform/protocol.js';
import {requiresChatGPTOriginalAProof} from '../../projects/webflow/trusted/chatgpt-result-adapter.js';

const fail=(code,message)=>new FoundationError(code,message);
const pinKeys=['version','manifestHash','contentHash','scriptId','revision','installationId','generation'];
const sameSource=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&a?.url===b?.url;
// Compare only the reviewed, normalized task arguments; property insertion order is not authority.
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
// Only confirmed mismatches retire a queued candidate. Browser/read failures,
// incomplete replies and unavailable resources retain the original row.
const invalidCandidateCodes=new Set(['E_BRIDGE_CONTEXT','E_CHAT_TURN','E_CHAT_REQUEST_MARKER','E_CHAT_ROUTE']);
const invalidTaskCodes=new Set(['E_BRIDGE_INSTALL','E_BRIDGE_UNSUPPORTED_SCOPE','E_BRIDGE_REVISION','E_BRIDGE_CONTEXT',
  'E_TASK_NOT_INSTALLED','E_TASK_REMOVED','E_TASK_DISABLED',
  'E_PERMISSION','E_REVISION','E_PARAMS','E_OWNER','E_HASH','E_BUILTIN_VERSION_UNAVAILABLE',
  'E_WEBFLOW_TARGET_UNBOUND','E_WEBFLOW_TARGET_BINDING','E_WEBFLOW_V2_SCHEMA']);

// Read the existing installed Task through its original integrity/permission
// validator. Builtin initialization only installs packaged fixed Tasks; it
// creates no execution approval, Host or Run and preserves removal decisions.
export async function verifyChatGPTBackgroundTask({api,broker,scope}){
  const namespace='tool:'+api.runtime.id,current=builtinIdentity(await loadBuiltinWorkerSource({runtime:api.runtime}));
  const builtin=BUILTIN_TASK_RELEASES.some(row=>row.taskId===scope.taskId);
  const initialization=builtin?await ensureBuiltinTasks({storage:broker.storage,namespace,environment:current}):null;
  return broker.storage.transaction(['frameworkKV','scriptRevisions'],'readonly',async tx=>{
    const installed=await tx.get('frameworkKV',installedKey(namespace,scope.taskId));
    if(!installed){
      if(await tx.get('frameworkKV',taskRemovalKey(namespace,scope.taskId)))
        throw fail('E_TASK_REMOVED','此脚本已卸载，不会自动装回。请在 Web Flow 脚本列表打开安装审阅。');
      if(initialization?.status==='failed')throw fail('E_TASK_INITIALIZATION',
        '内置脚本初始化失败：'+initialization.message+'。请在脚本列表重试初始化。');
      throw fail('E_TASK_NOT_INSTALLED','此任务尚未安装。请在 Web Flow 脚本列表打开安装审阅。');
    }
    if(!installed.enabled)throw fail('E_TASK_DISABLED','此脚本已停用。请从 Web Flow 脚本列表打开任务管理恢复。');
    const stored=await tx.get('frameworkKV',taskKey(namespace,scope.taskId,installed.version));
    const contentHash=stored?.package?.manifest?.program?.sourceHash;
    const checked=await assertInstalledTask(tx,namespace,{scriptId:installed.scriptId,contentHash,
      origin:new URL(scope.targetUrl).origin,params:scope.args,builtinIdentity:current});
    const manifest=checked.candidate.package.manifest;
    if(manifest.siteOrigins.length!==1)throw fail('E_BRIDGE_UNSUPPORTED_SCOPE','此入口仅允许单站点任务');
    const installation={version:installed.version,manifestHash:installed.manifestHash,contentHash,
      scriptId:installed.scriptId,revision:manifest.program.revision,
      installationId:installed.authorization?.installationId,generation:installed.authorization?.generation};
    if(scope.installation&&pinKeys.some(key=>scope.installation[key]!==installation[key]))
      throw fail('E_BRIDGE_REVISION','任务版本或安装授权已改变，请重新审阅');
    validateTaskParams(manifest.paramsSchema,scope.args);
    if(manifest.paramsSchema.required.some(key=>!Object.hasOwn(scope.args,key)))
      throw fail('E_BRIDGE_CONTEXT','自动候选必须包含完整参数');
    return {...manifest,installation};
  });
}

export function createChatGPTBackgroundAdapter({api,ledger,loadFoundation,captureSource,ensureRunner,
  verifyCandidate=assertWebFlowReplyCandidate,verifyTaskScope}={}){
  const task=async scope=>verifyTaskScope?verifyTaskScope(scope):
    verifyChatGPTBackgroundTask({api,broker:await loadFoundation(),scope});
  async function sourceFor(sender){
    // MessageSender.url can retain the pre-conversation SPA path. Obtain the
    // current path from Chrome, then apply the SAME exact-document checks.
    if(new URL(sender?.url??'about:blank').origin!=='https://chatgpt.com')throw fail('E_BRIDGE_SOURCE','不是官方 ChatGPT 来源');
    const frame=await api.webNavigation.getFrame({tabId:sender?.tab?.id,frameId:0});
    const source=await captureSource({...sender,url:frame?.url});
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','必须是官方 ChatGPT 原对话');
    return source;
  }
  async function verify(row){
    try{
      const observed=await verifyCandidate(api,row.source,row.candidate);
      if(row.originalAAnchorMessageId&&observed?.officialUserMessageId!==row.originalAAnchorMessageId)
        throw fail('E_BRIDGE_CONTEXT','原用户消息的官方身份已改变');
    }
    catch(error){
      if(invalidCandidateCodes.has(error?.code))error.webTaskInvalid=true;
      throw error;
    }
    try{
      const manifest=await task(row.scope);
      if(row.intentProtocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL){
        const intent=validateWebFlowTaskIntentV2(row.candidate.text);
        const target=resolveWebFlowV2FixedTarget({intent,manifest,installation:manifest.installation});
        if(row.scope.targetUrl!==target.targetUrl||canonical(row.scope.args)!==canonical(target.args))
          throw fail('E_WEBFLOW_TARGET_BINDING','原 V2 执行目标或参数在验收期间改变');
      }
      return manifest;
    }
    catch(error){
      if(invalidTaskCodes.has(error?.code))error.webTaskInvalid=true;
      throw error;
    }
  }
  async function handle(message,sender){
    const source=await sourceFor(sender);
    if(message.kind==='auto-task'){
      if(message.persistentAuto!==true)throw fail('E_BRIDGE_SCHEMA','持续授权仅接受新固定协议');
      const v2=JSON.parse(message.candidateText).protocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL;
      const intent=(v2?validateWebFlowTaskIntentV2:validateWebFlowTaskIntent)(message.candidateText);
      const candidate={candidateId:intent.candidateId,text:message.candidateText,turnKey:message.turnKey,answerKey:message.answerKey};
      const observed=await verifyCandidate(api,source,candidate);
      // The AI never supplies a V2 URL. A compiled entry is used only for
      // looking up the actual installed task, then checked again against its pin.
      const targetUrl=v2?webFlowV2ReviewedEntry(intent.taskId):intent.targetUrl;
      const manifest=await task({...intent,targetUrl});
      const bound=v2?resolveWebFlowV2FixedTarget({intent,manifest,installation:manifest.installation}):
        {taskId:intent.taskId,args:intent.args,targetUrl,installation:manifest.installation};
      const checked=await verifyCandidate(api,source,candidate);
      if(observed?.officialUserMessageId!==checked?.officialUserMessageId)
        throw fail('E_BRIDGE_CONTEXT','准入期间原用户消息的官方身份已改变');
      if(requiresChatGPTOriginalAProof(bound)&&
        (typeof checked?.officialUserMessageId!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/u.test(checked.officialUserMessageId)))
        throw fail('E_CHAT_DELIVERY_PROOF','新自动任务缺少原用户消息的官方身份');
      const admitted=await ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,candidate,allowPending:true,
        ...bound,sourceOrigin:CHATGPT_TASK_PROFILE.origin,
        ...(checked?.officialUserMessageId?{originalAAnchorMessageId:checked.officialUserMessageId}:{})});
      const final=await verifyCandidate(api,source,candidate);
      if(checked?.officialUserMessageId!==final?.officialUserMessageId)
        throw fail('E_BRIDGE_CONTEXT','准入后原用户消息的官方身份已改变');
      await sourceFor(sender);
      return {...admitted,executionOwner:'background',taskName:manifest.title};
    }
    const row=await ledger.inspectWebTask(message.requestId);
    if(row?.site?.adapter!=='chatgpt'||!sameSource(row.source,source))throw fail('E_BRIDGE_SOURCE','不是此原对话的后台请求');
    if(message.kind==='background-ready'){
      await verify(row);await ledger.armWebTask(message.requestId,source);await ensureRunner();
      return {requestId:message.requestId,ready:true};
    }
    throw fail('E_BRIDGE_SCHEMA','未知后台操作');
  }
  function delivery(row,durable,requestId){
    return {protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'deliver',requestId,mode:'auto',sourceUrl:row.source.url,
      turnKey:row.candidate.turnKey,answerKey:row.candidate.answerKey,runId:durable.runId,resultId:durable.resultId,
      text:formatChatGPTInstalledResult({requestId,...row.scope},durable)};
  }
  return Object.freeze({handle,verify,delivery});
}

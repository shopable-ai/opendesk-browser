import {resolveToolSender,permissionPattern} from '../environment.js';
import {requireCloudRunnerSender,requireCloudSidePanelSender} from '../platform/host/cloud-observer.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {validateWebFlowTaskIntent} from '../native-agent/chatgpt-task-request.js';
import {verifyChatGPTTaskDurableResult} from '../native-agent/chatgpt-fixed-bridge-host.js';
import {assertAutoGrant} from '../../projects/webflow/src/auto-grants.js';
import {registeredSiteRegistry,loadSiteProfiles} from './site-catalog.js';
import {SITE_PROFILES_KEY,WEB_TASK_PROTOCOL,validWebTaskSource} from './web-task-contract.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const sameSource=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&a?.url===b?.url;
const sameProfile=(a,b)=>['id','version','origin','adapter','adapterVersion','enabled'].every(key=>a?.[key]===b?.[key])&&
  JSON.stringify(a?.protocols)===JSON.stringify(b?.protocols);
const sameProfiles=(a,b)=>a.length===b.length&&a.every((profile,index)=>sameProfile(profile,b[index]));

// Routes reviewed website candidates to the ORIGINAL trigger ledger and
// Offscreen RunHost. This module neither creates Runs nor executes scripts.
export function createWebTaskIngress({api,ledger,loadFoundation,ensureRunner}={}){
  let epoch=0,profileWrites=Promise.resolve();
  const sourceEpochs=new Map();
  const sourceChanged=tabId=>sourceEpochs.set(tabId,(sourceEpochs.get(tabId)??0)+1);
  for(const event of [api.webNavigation.onCommitted,api.webNavigation.onHistoryStateUpdated,
    api.webNavigation.onReferenceFragmentUpdated])event?.addListener(info=>{if(info.frameId===0)sourceChanged(info.tabId);});
  api.tabs.onRemoved?.addListener(sourceChanged);
  const changed=()=>{epoch++;};
  api.permissions.onRemoved.addListener(changed);
  api.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes[SITE_PROFILES_KEY])changed();});
  const profileFor=async url=>registeredSiteRegistry(await loadSiteProfiles(api)).select(url);
  async function captureSource(sender){
    if(sender?.id!==api.runtime.id||sender.frameId!==0||sender.documentLifecycle&&sender.documentLifecycle!=='active'||
      !validWebTaskSource({tabId:sender.tab?.id,documentId:sender.documentId,url:sender.url})||sender.tab.incognito)
      throw fail('E_WEB_TASK_SOURCE','必须由已授权网站的真实顶层文档发送');
    const source={tabId:sender.tab.id,documentId:sender.documentId,url:sender.url};
    await assertSource(source);return source;
  }
  async function assertSource(source){
    if(!validWebTaskSource(source))throw fail('E_WEB_TASK_SOURCE','网页文档身份无效');
    const [frame,tab,permitted]=await Promise.all([
      api.webNavigation.getFrame({tabId:source.tabId,frameId:0}),api.tabs.get(source.tabId),
      api.permissions.contains({origins:[permissionPattern(source.url)]})]);
    if(permitted!==true||frame?.documentId!==source.documentId||frame.url!==source.url||
      frame.documentLifecycle!=='active'||frame.errorOccurred||tab?.id!==source.tabId||
      tab.url!==source.url||tab.incognito||tab.pendingUrl)
      throw fail('E_WEB_TASK_SOURCE','网站权限、地址或原文档已改变');
  }
  async function runner(sender){
    const resolved=await resolveToolSender(api,sender);
    await requireCloudRunnerSender(api,resolved);return resolved;
  }
  async function settingsSender(sender){
    const resolved=await resolveToolSender(api,sender);
    const route=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),resolved.url);
    if(resolved.tab||!route?.hostInstanceId||route.hasLocator)throw fail('E_WEB_TASK_SENDER','仅可信侧栏可管理网站');
    await requireCloudSidePanelSender(api,resolved);return resolved;
  }
  async function verifySite(row){
    const ticket=epoch,sourceTicket=sourceEpochs.get(row.source.tabId)??0;
    await assertSource(row.source);
    const current=await profileFor(row.source.url);
    if(!current||!sameProfile(row.site,current))throw fail('E_WEB_TASK_PROFILE','网站配置已停用、升级或不匹配');
    const final=()=>{if(ticket!==epoch||sourceTicket!==(sourceEpochs.get(row.source.tabId)??0))
      throw fail('E_WEB_TASK_REVOKED','验证期间网站配置、权限或来源文档已改变');};
    final();return final;
  }
  async function verifySubmission(row,sender){
    const actual=await runner(sender);
    if(row.webHostDocumentId!==actual.documentId)throw fail('E_WEB_TASK_OWNER','已消费请求不能转交新宿主');
    return verifySite(row);
  }
  async function candidate(message,sender){
    const ticket=epoch,source=await captureSource(sender),site=await profileFor(source.url);
    if(!site)throw fail('E_WEB_TASK_PROFILE','网站未登记或已停用');
    const intent=validateWebFlowTaskIntent(message.candidateText),settings=await ledger.readAutoSettings();
    const scope=settings.grants[intent.taskId]?.scope;
    assertAutoGrant(settings,scope,{sourceUrl:source.url});
    // The strict candidate must equal reviewed parameters, target and installation.
    const row=await ledger.admitWebTask({source,site,...scope,candidate:{candidateId:intent.candidateId,
      text:message.candidateText,turnKey:'event:'+intent.candidateId,answerKey:'event:'+intent.candidateId}});
    await assertSource(source);
    if(ticket!==epoch||!sameProfile(site,await profileFor(source.url)))
      throw fail('E_WEB_TASK_REVOKED','准入期间网站配置或权限已改变');
    await ensureRunner();
    return {requestId:row.requestId,candidateId:intent.candidateId,state:'approved'};
  }
  async function claim(sender){
    const actual=await runner(sender),broker=await loadFoundation();
    const slot=await broker.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'));
    if(slot?.currentRunId||slot?.preview)return null;
    const row=await ledger.claimWebTask({documentId:actual.documentId,verify:verifySite});
    if(!row)return null;
    const pin=row.scope.installation;
    return {requestId:row.requestId,source:{kind:'saved',scriptId:pin.scriptId,revision:pin.revision,contentHash:pin.contentHash},
      params:row.scope.args,target:{mode:'owned',url:row.scope.targetUrl},
      expectedTaskGeneration:pin.generation,expectedTaskInstallationId:pin.installationId,deadlineAt:Date.now()+30000};
  }
  async function observation(requestId){
    const row=await ledger.inspectWebTask(requestId);
    if(!row)throw fail('E_WEB_TASK_REQUEST','未知网页请求');
    const broker=await loadFoundation();
    const runs=await broker.storage.transaction(['runs'],'readonly',tx=>tx.all('runs'));
    const matches=runs.filter(run=>run?.tag==='controller-run'&&run.namespace==='tool:'+api.runtime.id&&
      run.requestId===requestId&&run.hostDocumentId===row.webHostDocumentId);
    if(matches.length>1)throw fail('E_WEB_TASK_UNKNOWN','存在歧义执行身份，只能人工对账');
    return {row,broker,run:matches[0]};
  }
  async function query(message,sender){
    const approval=ledger.captureAutoPolicyEpoch();
    const source=await captureSource(sender),{row,run}=await observation(message.requestId);
    if(!sameSource(row.source,source))throw fail('E_WEB_TASK_SOURCE','不能查询其他网页文档的请求');
    const final=await verifySite(row);
    assertAutoGrant(await ledger.readAutoSettings(),row.scope,{sourceUrl:source.url,
      grantId:row.autoGrantId,epoch:row.autoEpoch});
    if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','查询期间持续批准已改变');
    final();
    return {requestId:message.requestId,state:run?.state??(row.status==='consumed'?'UNKNOWN':row.status),
      runId:run?.runId??null,resultId:run?.resultId??null,delivery:row.webDelivery??'not-sent'};
  }
  async function settle(message,sender){
    const actual=await runner(sender),{row,broker,run}=await observation(message.requestId);
    if(row.webHostDocumentId!==actual.documentId)throw fail('E_WEB_TASK_OWNER','不能对账其他宿主请求');
    if(!run)return {requestId:message.requestId,state:'UNKNOWN'};
    if(run.state!=='completed'||run.retirementState!=='released')return {requestId:message.requestId,state:run.state};
    await verifySubmission(row,actual);
    const snapshot=await broker.authority.snapshotControllerRun({runId:run.runId},actual);
    const durable=verifyChatGPTTaskDurableResult(snapshot,run.runId,row.scope.installation,row.scope);
    const result={protocol:'opendesk.task.result.v1',taskId:row.scope.taskId,requestId:message.requestId,
      runId:durable.runId,resultId:durable.resultId,revision:durable.revision,
      sourceHash:durable.sourceHash,status:'completed',data:durable.value};
    // Same durable trigger row carries only a delivery fence, never a second Result.
    const approval=ledger.captureAutoPolicyEpoch();
    await ledger.markWebTaskDelivery(message.requestId,'dispatching');
    const final=await verifySubmission(row,actual);final();
    if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','交付期间持续批准已改变');
    const reply=await api.tabs.sendMessage(row.source.tabId,{protocol:WEB_TASK_PROTOCOL,kind:'deliver',
      sourceUrl:row.source.url,requestId:message.requestId,result},{documentId:row.source.documentId});
    if(reply?.ok!==true)throw fail('E_WEB_TASK_UNKNOWN','结果交付回执未知，禁止自动重发');
    await ledger.markWebTaskDelivery(message.requestId,'delivered');
    return {requestId:message.requestId,state:'completed',runId:durable.runId,resultId:durable.resultId};
  }
  async function saveProfiles(message,sender){
    await settingsSender(sender);
    const previous=await loadSiteProfiles(api);
    try{registeredSiteRegistry(message.expectedProfiles);}catch{
      throw fail('E_WEB_TASK_PROFILE_CHANGED','网站登记已改变，请重新读取后审阅');
    }
    if(!sameProfiles(message.expectedProfiles,previous))
      throw fail('E_WEB_TASK_PROFILE_CHANGED','网站登记已改变，请重新读取后审阅');
    const profiles=structuredClone(message.profiles);registeredSiteRegistry(profiles);
    // This function never requests Chrome permission or grants Task execution.
    await api.storage.local.set({[SITE_PROFILES_KEY]:profiles});epoch++;
    const saved=await loadSiteProfiles(api);
    if(!sameProfiles(saved,profiles))throw fail('E_WEB_TASK_UNKNOWN','网站登记写入回执未知');
    return {profiles:saved};
  }
  async function handle(message,sender){
    if(message?.protocol!==WEB_TASK_PROTOCOL)throw fail('E_WEB_TASK_PROTOCOL','未知网页任务协议');
    if(message.kind==='site-profile'){
      const source=await captureSource(sender);return {profile:await profileFor(source.url)};
    }
    if(message.kind==='candidate')return candidate(message,sender);
    if(message.kind==='claim')return claim(sender);
    if(message.kind==='query')return query(message,sender);
    if(message.kind==='settle')return settle(message,sender);
    if(message.kind==='profiles-read'){await settingsSender(sender);return {profiles:await loadSiteProfiles(api)};}
    if(message.kind==='profiles-save'){
      const result=profileWrites.then(()=>saveProfiles(message,sender));profileWrites=result.catch(()=>{});return result;
    }
    throw fail('E_WEB_TASK_PROTOCOL','未知网页任务操作');
  }
  return Object.freeze({handle,verifySubmission});
}

import {resolveToolSender,permissionPattern} from '../environment.js';
import {digestUtf8} from '../platform/protocol.js';
import {requireCloudRunnerSender,requireCloudSidePanelSender} from '../platform/host/cloud-observer.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH,CLOUD_RUNNER_DOCUMENT_PATH} from '../tool-document-url.js';
import {validateWebFlowTaskIntent,WEBFLOW_TASK_INTENT_V2_PROTOCOL} from '../native-agent/chatgpt-task-request.js';
import {verifyChatGPTTaskDurableResult} from '../native-agent/chatgpt-fixed-bridge-host.js';
import {assertAutoGrant} from '../../projects/webflow/src/auto-grants.js';
import {registeredSiteRegistry,loadSiteProfiles} from './site-catalog.js';
import {SITE_PROFILES_KEY,WEB_TASK_PROTOCOL,validWebTaskSource} from './web-task-contract.js';
import {CHATGPT_TASK_PROFILE} from './web-task-contract.js';
import {createChatGPTBackgroundAdapter} from '../native-agent/chatgpt-background-adapter.js';
import {activateWebFlowExecutionTarget} from '../native-agent/webflow-execution-view.js';
import {isReviewedBPrepare,attestReviewedBPrepare} from '../../projects/webflow/trusted/chatgpt-b-prepare-stage.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const sameSource=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&a?.url===b?.url;
const sameProfile=(a,b)=>['id','version','origin','adapter','adapterVersion','enabled'].every(key=>a?.[key]===b?.[key])&&
  JSON.stringify(a?.protocols)===JSON.stringify(b?.protocols);
const sameProfiles=(a,b)=>a.length===b.length&&a.every((profile,index)=>sameProfile(profile,b[index]));

// Routes reviewed website candidates to the ORIGINAL trigger ledger and
// Offscreen RunHost. This module neither creates Runs nor executes scripts.
export function createWebTaskIngress({api,ledger,loadFoundation,ensureRunner,verifyChatGPTCandidate,verifyTaskScope}={}){
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
  const chatgpt=createChatGPTBackgroundAdapter({api,ledger,loadFoundation,captureSource,ensureRunner,
    verifyCandidate:verifyChatGPTCandidate,verifyTaskScope});
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
    const taskFinal=row.site.adapter==='chatgpt'?
      (await loadFoundation()).authority.captureInstalledTaskFence(row.scope.taskId):null;
    await assertSource(row.source);
    const current=row.site.adapter==='chatgpt'?CHATGPT_TASK_PROFILE:await profileFor(row.source.url);
    if(!current||!sameProfile(row.site,current))throw fail('E_WEB_TASK_PROFILE','网站配置已停用、升级或不匹配');
    if(row.site.adapter==='chatgpt')await chatgpt.verify(row);
    const final=()=>{if(ticket!==epoch||sourceTicket!==(sourceEpochs.get(row.source.tabId)??0))
      throw fail('E_WEB_TASK_REVOKED','验证期间网站配置、权限或来源文档已改变');taskFinal?.();};
    final();return final;
  }
  // V2 has an independent one-candidate grant in the original ledger.
  // Never consult V1 task-wide approvals when disclosing V2 Run results.
  async function assertTaskApproval(row,requestId,source=row.source){
    if(row.intentProtocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL)
      return ledger.assertV2WebTaskGrant({requestId,source,scope:row.scope,
        grantId:row.autoGrantId,epoch:row.autoEpoch});
    return assertAutoGrant(await ledger.readAutoSettings(),row.scope,{
      sourceUrl:source.url,grantId:row.autoGrantId,epoch:row.autoEpoch});
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
    const installed=await broker.authority.resolveInstalledTask({taskId:row.scope.taskId},actual);
    if(installed.taskId!==row.scope.taskId||Object.keys(pin).some(key=>installed[key]!==pin[key]))
      throw fail('E_REVISION','任务安装在后台领取期间改变，禁止提交原请求');
    return {requestId:row.requestId,source:{kind:'saved',scriptId:pin.scriptId,revision:pin.revision,contentHash:pin.contentHash},
      params:row.scope.args,target:{mode:'owned',url:row.scope.targetUrl},
      expectedTaskGeneration:pin.generation,expectedTaskInstallationId:pin.installationId,
      deadlineAt:Date.now()+(installed.manifest.deadlineMs??30000)};
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
  // Trusted Side Panel ONLY. View an EXISTING background Run in its exact
  // owned document. No Task params, new Run, result delivery, or focus retry.
  async function activateRun(message,sender){
    await settingsSender(sender);
    if(!validWebTaskSource(message?.source)||typeof message.requestId!=='string'||
      typeof message.runId!=='string')
      throw fail('E_WEB_TASK_VIEW','没有可核验的原请求与目标来源');
    const initial=await observation(message.requestId),row=initial.row;
    if(row.site?.adapter!=='chatgpt'||row.status!=='consumed'||!row.controllerSubmitted||
      !sameSource(row.source,message.source)||!row.webHostDocumentId)
      throw fail('E_WEB_TASK_VIEW','仅能查看当前原聊天已经提交的后台任务');
    const pin=row.scope.installation;
    const approval=ledger.captureAutoPolicyEpoch();
    const assertAuthorized=async()=>{
      const final=await verifySite(row);
      await assertTaskApproval(row,message.requestId);
      if(approval!==ledger.captureAutoPolicyEpoch())
        throw fail('E_WEBFLOW_AUTO_DENIED','查看过程中批准或权限已改变');
      final();
    };
    const readRun=async()=>{
      const current=await observation(message.requestId);
      const run=current.run;
      if(!sameSource(current.row.source,row.source)||current.row.status!=='consumed'||
        current.row.webHostDocumentId!==row.webHostDocumentId||
        JSON.stringify(current.row.scope)!==JSON.stringify(row.scope)||
        run?.runId!==message.runId||run.requestId!==message.requestId||
        run.namespace!=='tool:'+api.runtime.id||run.hostDocumentId!==row.webHostDocumentId||
        run.sourceKind!=='saved'||run.scriptId!==pin.scriptId||
        run.contentHash!==pin.contentHash||run.revision?.scriptId!==pin.scriptId||
        run.revision?.revision!==pin.revision||run.revision?.sourceHash!==pin.contentHash)
        throw fail('E_WEB_TASK_VIEW','运行、安装或原后台 Host 身份不匹配');
      const slot=await current.broker.storage.transaction(['runs'],'readonly',
        tx=>tx.get('runs','@slot'));
      return {run,slot};
    };
    return activateWebFlowExecutionTarget({api,runId:message.runId,readRun,
      assertAuthorized,reserveActivation:()=>ledger.reserveWebTaskActivation({
        requestId:message.requestId,source:row.source,runId:message.runId})});
  }
  async function query(message,sender){
    const approval=ledger.captureAutoPolicyEpoch();
    const source=await captureSource(sender),{row,run}=await observation(message.requestId);
    if(!sameSource(row.source,source))throw fail('E_WEB_TASK_SOURCE','不能查询其他网页文档的请求');
    const final=await verifySite(row);
    await assertTaskApproval(row,message.requestId,source);
    if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','查询期间持续批准已改变');
    final();
    return {requestId:message.requestId,state:row.webBPrepared&&isReviewedBPrepare(row)?'prepared-account-unverified':
      run?.state??(row.status==='consumed'?'UNKNOWN':row.status),
      runId:run?.runId??null,resultId:run?.resultId??null,delivery:row.webDelivery??'not-sent'};
  }
  async function settle(message,sender){
    const actual=await runner(sender),{row,broker,run}=await observation(message.requestId);
    if(row.webHostDocumentId!==actual.documentId)throw fail('E_WEB_TASK_OWNER','不能对账其他宿主请求');
    const isChatGPT=row.site.adapter==='chatgpt';
    if(isChatGPT)await ledger.recordWebTaskObservation(message.requestId,
      Object.fromEntries(Object.entries(receiptFor(row,run)).filter(([,value])=>value!==null)));
    if(!run)return {requestId:message.requestId,state:'UNKNOWN'};
    if(run.state!=='completed'||run.retirementState!=='released')return {requestId:message.requestId,state:run.state};
    // Reconciliation is a read of the SAME identity. An ambiguous dispatch is
    // permanently fenced; it must not fall through to a second send.
    if(isChatGPT&&row.webDelivery)return {requestId:message.requestId,state:'completed',
      runId:run.runId,resultId:run.resultId,delivery:row.webDelivery==='delivered'?'confirmed':'unknown'};
    await verifySubmission(row,actual);
    const snapshot=await broker.authority.snapshotControllerRun({runId:run.runId},actual);
    const durable=verifyChatGPTTaskDurableResult(snapshot,run.runId,row.scope.installation,
      {...row.scope,requestId:message.requestId});
    if(isReviewedBPrepare(row)){
      // The PREPARE Run is final only as an unsent draft, NOT as the B reply.
      // Verify the real surviving B document and persist its proof on the
      // existing trigger row; never send a success message to A here.
      const proof=await attestReviewedBPrepare({api,row,requestId:message.requestId,snapshot,durable});
      await verifySubmission(row,actual);
      await ledger.recordWebTaskPreparedB(message.requestId,proof);
      return {requestId:message.requestId,state:'prepared-account-unverified',
        runId:durable.runId,resultId:durable.resultId,delivery:'not-sent'};
    }
    if(isChatGPT)await ledger.recordWebTaskObservation(message.requestId,{execution:'completed',persistence:'verified',
      release:'released',runId:durable.runId,resultId:durable.resultId});
    const result={protocol:'opendesk.task.result.v1',taskId:row.scope.taskId,requestId:message.requestId,
      runId:durable.runId,resultId:durable.resultId,revision:durable.revision,
      sourceHash:durable.sourceHash,status:'completed',data:durable.value};
    // Same durable trigger row carries only a delivery fence, never a second Result.
    const approval=ledger.captureAutoPolicyEpoch();
    await ledger.markWebTaskDelivery(message.requestId,'dispatching');
    let reply,observedMessageProof=null;
    try{
      // The dispatch fence already exists. Retain final-check failures too,
      // without reopening this request for another delivery attempt.
      const final=await verifySubmission(row,actual);
      const deliveryFinal=await ledger.assertWebTaskDelivery(message.requestId,row.source);
      if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','交付期间持续批准已改变');
      final();deliveryFinal();
      const outgoing=isChatGPT?chatgpt.delivery(row,durable,message.requestId):
        {protocol:WEB_TASK_PROTOCOL,kind:'deliver',sourceUrl:row.source.url,requestId:message.requestId,result};
      reply=await api.tabs.sendMessage(row.source.tabId,outgoing,{documentId:row.source.documentId});
      if(isChatGPT&&reply?.ok===false&&typeof reply.error?.code==='string'&&typeof reply.error.message==='string')
        throw fail(reply.error.code.slice(0,128),reply.error.message.slice(0,2048));
      if(reply?.ok!==true||isChatGPT&&(reply.data?.sent!==true||reply.data?.userObserved!==true))
        throw fail('E_WEB_TASK_UNKNOWN','结果交付回执未知，禁止自动重发');
      // Proof is accepted only when it binds an official observed A message ID
      // to the exact original Controller text. Reject incomplete or forged
      // evidence without ever re-opening the one-use send tombstone.
      if(isChatGPT&&(Object.hasOwn(reply.data,'messageId')||Object.hasOwn(reply.data,'contentSha256'))){
        const {messageId,contentSha256}=reply.data;
        if(typeof messageId!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/u.test(messageId)||
          contentSha256!==await digestUtf8(outgoing.text))
          throw fail('E_CHAT_DELIVERY_PROOF','原对话新增消息身份或内容 SHA-256 不匹配，禁止确认交付');
        observedMessageProof={messageId,contentSha256};
      }
    }catch(error){
      if(isChatGPT)await ledger.recordWebTaskObservation(message.requestId,{delivery:'unknown',
        error:{code:error.code||'E_WEB_TASK_UNKNOWN',message:error.message}});
      throw error;
    }
    await ledger.markWebTaskDelivery(message.requestId,'delivered');
    if(isChatGPT)await ledger.recordWebTaskObservation(message.requestId,{delivery:'confirmed',
      aiReplyObserved:reply.data.aiReplyObserved===true,...(observedMessageProof??{})});
    return {requestId:message.requestId,state:'completed',runId:durable.runId,resultId:durable.resultId};
  }
  function receiptFor(row,run){
    // Absence of a Run is only proof of no execution before any durable
    // ownership/submission/observation evidence. A lost claim or ACK stays unknown.
    const notStarted=!run&&['prepared','approved','revoked'].includes(row.status)&&
      !Object.hasOwn(row,'consumedAt')&&!row.controllerSubmitted&&!row.webHostDocumentId&&
      !row.webDelivery&&!row.webObservation;
    return {...row.webObservation,execution:row.webBPrepared&&isReviewedBPrepare(row)?'prepared-account-unverified':
      run?.state==='completed'?'completed':
      ['preparing','running','stopping','paused_unknown','failed','stopped','interrupted'].includes(run?.state)?run.state:notStarted?'not-started':'unknown',
    persistence:row.webObservation?.persistence??'not-confirmed',release:run?.retirementState??(notStarted?'not-started':'unknown'),
    delivery:row.webDelivery==='delivered'?'confirmed':row.webDelivery==='dispatching'?'unknown':
      row.webObservation?.delivery??'not-sent',runId:run?run.runId??null:row.webObservation?.runId??null,
    resultId:run?run.resultId??null:row.webObservation?.resultId??null};
  }
  // Failure diagnostics are a read projection only. The Host validator remains
  // the sole success/value validator and failed/stopped never enter delivery.
  function terminalError(snapshot,run,pin){
    const saved=snapshot?.run;
    if(!saved||!['failed','stopped'].includes(run.state)||saved.state!==run.state||
      saved.runId!==run.runId||saved.resultId!==run.resultId||
      saved.retirementState!=='released'||saved.sourceKind!=='saved'||
      saved.scriptId!==pin.scriptId||saved.contentHash!==pin.contentHash||
      saved.revision?.scriptId!==pin.scriptId||saved.revision?.revision!==pin.revision||
      saved.revision?.sourceHash!==pin.contentHash||snapshot.resultDeliveryDenied?.includes(run.runId)||
      !Array.isArray(snapshot.results))throw fail('E_BRIDGE_DURABLE','失败运行身份或结果读取权限不匹配');
    const matches=snapshot.results.filter(result=>result?.runId===run.runId),result=matches[0];
    if(matches.length!==1||result.tag!=='controller-result'||result.resultId!==saved.resultId||
      typeof result.resultId!=='string'||!result.resultId||result.resultId.length>128||
      result.state!==saved.state||result.sourceKind!=='saved'||
      result.revision?.scriptId!==pin.scriptId||result.revision?.revision!==pin.revision||
      result.revision?.sourceHash!==pin.contentHash||result.outcome?.ok!==false)
      throw fail('E_BRIDGE_RESULT','失败持久结果缺失、版本不符或存在歧义');
    const error=result.outcome.error;
    return {code:typeof error?.code==='string'?error.code.slice(0,128):'E_WEB_TASK_UNKNOWN',
      message:typeof error?.message==='string'?error.message.slice(0,2048):'任务未成功完成'};
  }
  async function historyReadFence(row,broker,approval){
    const final=broker.authority.captureInstalledTaskFence(row.scope.taskId);
    const requestFinal=ledger.captureWebTaskReadFence(row.requestId,row.source);
    const assertPolicy=()=>{
      if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','历史读取期间持续批准改变');
      final();requestFinal();
    };
    await assertTaskApproval(row,row.requestId);
    await ledger.assertConsumed({requestId:row.requestId,source:row.source,mode:row.mode,
      turnKey:row.turnKey,answerKey:row.answerKey,candidate:row.candidate,...row.scope});
    const current=await ledger.inspectWebTask(row.requestId);
    if(row.status!=='consumed'||!row.controllerSubmitted||current?.status!==row.status||
      current.webHostDocumentId!==row.webHostDocumentId||current.autoGrantId!==row.autoGrantId||
      current.autoEpoch!==row.autoEpoch||!sameSource(current.source,row.source)||
      JSON.stringify(current.scope)!==JSON.stringify(row.scope))
      throw fail('E_BRIDGE_REVOKED','原网页请求已撤销或身份改变');
    assertPolicy();return assertPolicy;
  }
  async function history(message,sender){
    const actual=await settingsSender(sender);
    if(message.source&&!validWebTaskSource(message.source))throw fail('E_WEB_TASK_SOURCE','历史来源身份无效');
    const rows=await ledger.listWebTasks({source:message.source,includeLegacy:true});
    const disclosures=[];
    const history=await Promise.all(rows.map(async row=>{
      if(!row.site){
        // Old Side Panel/manual requests did not record the original execution
        // host document. Request ID alone cannot correlate a Run or its bytes.
        const neverConsumed=!Object.hasOwn(row,'consumedAt')&&row.status!=='consumed'&&
          ['prepared','approved','revoked'].includes(row.status);
        return {requestId:row.requestId,source:row.source,scope:row.scope,candidate:row.candidate,status:row.status,
          createdAt:row.createdAt,receipt:{execution:neverConsumed?'not-started':'unknown',
            release:neverConsumed?'not-started':'unknown',delivery:neverConsumed?'not-sent':'unknown',
            persistence:'not-confirmed',runId:null,resultId:null}};
      }
      const {run,broker}=await observation(row.requestId),receipt=receiptFor(row,run);
      // Cached observations carry no authority to disclose Result bytes/errors.
      delete receipt.value;delete receipt.error;receipt.persistence='not-confirmed';
      if(['completed','failed','stopped'].includes(run?.state)&&run.retirementState==='released'){
        try{
          const approval=ledger.captureAutoPolicyEpoch();
          const final=await historyReadFence(row,broker,approval);
          const snapshot=await broker.authority.snapshotControllerRun({runId:run.runId},actual);
          const projection=run.state==='completed'?
            {value:verifyChatGPTTaskDurableResult(snapshot,run.runId,row.scope.installation,
              {...row.scope,requestId:row.requestId}).value}:
            {error:terminalError(snapshot,run,row.scope.installation)};
          await historyReadFence(row,broker,approval);
          final();Object.assign(receipt,{persistence:'verified',...projection});
          disclosures.push({receipt,final});
        }catch(error){
          receipt.persistence='not-available';delete receipt.value;
          receipt.error={code:error.code||'E_WEB_TASK_UNKNOWN',message:String(error.message).slice(0,2048)};
        }
      }
      return {requestId:row.requestId,source:row.source,scope:row.scope,candidate:row.candidate,status:row.status,
        createdAt:row.createdAt,pendingAuto:row.pendingAuto===true,receipt};
    }));
    // One row can finish before another awaits. Recheck every disclosure at
    // the batch return boundary so a later revocation removes earlier bytes.
    for(const {receipt,final} of disclosures){
      try{final();}catch(error){
        delete receipt.value;receipt.persistence='not-available';
        receipt.error={code:error.code||'E_WEB_TASK_UNKNOWN',message:String(error.message).slice(0,2048)};
      }
    }
    return history;
  }
  async function reconcile(sender){
    const actual=await runner(sender),rows=await ledger.listWebTasks();
    for(const row of rows){
      if(row.site.adapter!=='chatgpt'||row.status!=='consumed'||row.webHostDocumentId!==actual.documentId||row.webDelivery)continue;
      try{await settle({requestId:row.requestId},sender);}
      catch(error){await ledger.recordWebTaskObservation(row.requestId,{error:{code:error.code||'E_WEB_TASK_UNKNOWN',message:error.message}});}
    }
    return {reconciled:true};
  }
  async function handleChatGPT(message,sender){
    if(message.kind==='background-stop'){
      const source=await captureSource({...sender,url:(await api.webNavigation.getFrame({tabId:sender?.tab?.id,frameId:0}))?.url});
      const {row,run}=await observation(message.requestId);
      if(row.site.adapter!=='chatgpt'||!sameSource(row.source,source))throw fail('E_WEB_TASK_OWNER','不是此聊天的原请求');
      await ledger.revokeRequest({source,requestId:message.requestId});
      // Denial is durable before signalling the same original RunHost. Missing
      // execution/stop ACK remains unknown and never targets the shared slot.
      if(!row.webHostDocumentId)return {cancelled:true,executionState:'not-started',deliveryState:'cancelled'};
      const stopped=await api.runtime.sendMessage({protocol:WEB_TASK_PROTOCOL,kind:'stop-owned',
        requestId:message.requestId,runId:run?.runId??null});
      if(stopped?.ok!==true)throw fail('E_WEB_TASK_UNKNOWN','已禁止后续执行与交付，原执行停止状态未知');
      return {cancelled:true,runId:run?.runId??null,executionState:'stop-requested',
        deliveryState:row.webDelivery?'unknown':'cancelled'};
    }
    if(message.kind!=='check-delivery')return chatgpt.handle(message,sender);
    const source=await captureSource({...sender,url:(await api.webNavigation.getFrame({tabId:sender?.tab?.id,frameId:0}))?.url});
    const {row,broker,run}=await observation(message.requestId);
    if(row.site.adapter!=='chatgpt'||!sameSource(row.source,source)||row.webDelivery!=='dispatching'||
      message.mode!=='auto'||run?.runId!==message.runId||run?.resultId!==message.resultId)
      throw fail('E_WEB_TASK_OWNER','没有此原聊天的后台交付记录');
    const ownerUrl=api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH);
    // Resolve the original owner from Chrome, never from the page's payload.
    const contexts=await api.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],
      documentUrls:[ownerUrl],documentIds:[row.webHostDocumentId]});
    if(contexts?.length!==1||contexts[0].documentId!==row.webHostDocumentId)
      throw fail('E_WEB_TASK_OWNER','原后台宿主已失联，只能查询原记录');
    const actual=await runner({id:api.runtime.id,url:ownerUrl,documentId:contexts[0].documentId,frameId:0});
    const snapshot=await broker.authority.snapshotControllerRun({runId:run.runId},actual);
    verifyChatGPTTaskDurableResult(snapshot,run.runId,row.scope.installation,
      {...row.scope,requestId:message.requestId});
    const approval=ledger.captureAutoPolicyEpoch(),final=await verifySite(row);
    await assertTaskApproval(row,message.requestId,source);
    if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','交付核验期间持续批准改变');
    const deliveryFinal=await ledger.assertWebTaskDelivery(message.requestId,source);
    if(approval!==ledger.captureAutoPolicyEpoch())throw fail('E_WEBFLOW_AUTO_DENIED','交付核验期间持续批准改变');
    final();deliveryFinal();return {allowed:true};
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
    if(message.kind==='reconcile')return reconcile(sender);
    if(message.kind==='history')return history(message,sender);
    if(message.kind==='activate-run')return activateRun(message,sender);
    if(message.kind==='profiles-read'){await settingsSender(sender);return {profiles:await loadSiteProfiles(api)};}
    if(message.kind==='profiles-save'){
      const result=profileWrites.then(()=>saveProfiles(message,sender));profileWrites=result.catch(()=>{});return result;
    }
    throw fail('E_WEB_TASK_PROTOCOL','未知网页任务操作');
  }
  return Object.freeze({handle,handleChatGPT,verifySubmission});
}

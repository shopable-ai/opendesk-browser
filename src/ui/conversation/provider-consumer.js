// One trusted Consumer Adapter per official installed tool/My workspace.
// Keeps private drafts, model authorization, cancel and Native thread scoped;
// does not grant a business write or change the existing Host/SDK/ETag gate.
import {permissionPattern} from '../../environment.js';
import {createConversationSession} from './session.js';
import {describeLocalCodex} from '../workflow/local-codex.js';
import {promptInstructions,promptEditInstructions} from './prompt-actions.js';
import {bookmarkInstructions} from './bookmark-instructions.js';
import {taskInstructions} from './my-task-instructions.js';
import {KNOWLEDGE_ANSWER_INSTRUCTIONS} from '../../../projects/ai-knowledge-answers/trusted/ai-request.js';

const err=(code,message)=>Object.assign(new Error(message),{code});

export function createBusinessConversation({api,providerRuntime:providers,hostInstanceId,
  consumerId='bookmark',instanceId=crypto.randomUUID(),installEpoch=null}={}) {
    if(!['bookmark','prompt','tasks','knowledge'].includes(consumerId))
      throw err('E_AI_SCOPE','未知 AI 消费者');
    const mainLease=providers.acquire({consumerId,instanceId,hostInstanceId,installEpoch});
    const editLease=consumerId==='prompt'?providers.acquire({consumerId:'prompt-edit',
      instanceId:instanceId+':edit',hostInstanceId,installEpoch}):null;
    const authorizationListeners=new Set();
    let approvedKnowledgeTest=null,knowledgeApprovalEpoch=0;
    const clearKnowledgeTest=()=>{knowledgeApprovalEpoch++;approvedKnowledgeTest=null;};
    let consumerDisposed=false,bookmarkConversationBusy=false,
      bookmarkConversationActive=null,bookmarkConversationGrantEpoch=0;
    function forScope(scope){return scope==='prompt-edit'?editLease:mainLease;}
    function invalidateBookmarkConversation(reason){
      clearKnowledgeTest();
      if(reason?.code==='E_MODEL_GRANT_REVOKED')bookmarkConversationGrantEpoch++;
      bookmarkConversationActive?.abortController.abort(reason);
      bookmarkConversationActive?.release();
      // Revocation retires private Native history even between turns, and
      // includes prompt edit's separate lease. Regrant starts fresh context.
      mainLease.invalidate();editLease?.invalidate();
      if(reason?.code==='E_MODEL_GRANT_REVOKED')
        for(const listener of [...authorizationListeners])listener(reason);
    }
    // Revoke this consumer's authorization and retained context only when the
    // removed grant covers its Provider; unrelated websites are unaffected.
    function consumerPermissionRemoved(grant){
      const active=bookmarkConversationActive;
      const selected=active?.source||providers.configuration().source;
      let grantPattern=active?.grantPattern||null;
      if(!grantPattern&&selected!=='local_codex'){
        // Settings may contain an incomplete endpoint before the next Send.
        try{grantPattern=permissionPattern(providers.configuration().settings.endpoint);}catch{}
      }
      const affectsProvider=pattern=>{
        if(pattern==='<all_urls>')return true;
        const match=typeof pattern==='string'&&pattern.match(/^(\*|https?):\/\/([^/]+)\//i);
        if(!match||!grantPattern)return false;
        const url=new URL(grantPattern),host=match[2].toLowerCase();
        return (match[1]==='*'||match[1].toLowerCase()+':'===url.protocol)&&
          (host==='*'||host===url.hostname||host.startsWith('*.')&&
            (url.hostname===host.slice(2)||url.hostname.endsWith('.'+host.slice(2))));
      };
      if((selected==='local_codex'&&grant.permissions?.includes('nativeMessaging'))||
        (selected!=='local_codex'&&grant.origins?.some(affectsProvider)))
        invalidateBookmarkConversation(err('E_MODEL_GRANT_REVOKED','模型网站或 Native 权限已撤销'));
    }
    api.permissions.onRemoved?.addListener(consumerPermissionRemoved);
    // Provider reconfiguration must also interrupt an unresolved transport or
    // permission wait. An aborted round releases its UI busy state promptly;
    // unlike permission revocation, a settings change is not a revoked grant.
    const unsubscribeProviderSettings=providers.subscribeSettings?.(()=>{
      if(approvedKnowledgeTest?.providerGeneration!==providers.configuration().generation)
        clearKnowledgeTest();
      const active=bookmarkConversationActive;
      if(!active||active.providerGeneration===providers.configuration().generation)return;
      active.abortController.abort(err('E_TOOL_CHANGED',
        'AI Provider 已改变，本轮推理停止；迟到结果无效'));
      const lease=forScope(active.scope);
      if(lease)void Promise.resolve(lease.cancelInference()).catch(()=>{});
      active.release();
    });
    // Shared sessions keep only references belonging to their original business.
    // Prompt needs its verified library ETag for safe ordinal follow-up actions.
    const emptyRefs=()=>consumerId==='bookmark'
      ?{folderId:null,bookmarkId:null,matches:[]}
      :consumerId==='prompt'?{matches:[],etag:null}:{};
    const sessionRefs=refs=>{
      const matches=Array.isArray(refs?.matches)?refs.matches.slice(0,12)
        .filter(id=>typeof id==='string'&&id.length<=160):[];
      if(consumerId==='bookmark')return {
        folderId:typeof refs?.folderId==='string'?refs.folderId.slice(0,160):null,
        bookmarkId:typeof refs?.bookmarkId==='string'?refs.bookmarkId.slice(0,160):null,
        matches
      };
      if(consumerId==='prompt')return {matches,
        etag:typeof refs?.etag==='string'&&/^[a-f0-9]{64}$/.test(refs.etag)?refs.etag:null};
      return {};
    };
    const conversationSession=createConversationSession({identity:{
      consumerId,instanceId,hostInstanceId,installEpoch},rowsLimit:24});
    // References are strictly owned by this adapter, not the neutral Session.
    // Preserve Prompt's verified ETag, rather than treating it as a bookmark ID.
    let businessRefs=emptyRefs();
    const conversation=Object.freeze({
    identity:()=>conversationSession.identity(),
    subscribeSession:listener=>conversationSession.subscribe(listener),
    // Trusted consumers can retire pending business reviews when a different
    // model/endpoint/key replaces the context that generated their proposal.
    providerGeneration:()=>providers.configuration().generation,
    // Disclosure-only metadata: never expose Provider API Key or Native Lease.
    recipient(){
      const {source,generation,settings}=providers.configuration();
      return Object.freeze({provider:source,generation,
        endpoint:source==='local_codex'?'本机 OpenDesk Native Host':settings.endpoint,
        model:source==='local_codex'?'本机 Codex':settings.model});
    },
    subscribeProviderChanges:listener=>providers.subscribeSettings?.(listener)??(()=>{}),
    subscribeAuthorizationChanges(listener){
      authorizationListeners.add(listener);return ()=>authorizationListeners.delete(listener);
    },
    source(){const selected=providers.configuration().source;return {
      provider:selected,label:selected==='local_codex'?'Codex':
        selected==='cloud_responses'?'Responses':'HTTPS'};},
    readSession(){
      if(consumerDisposed)return {open:false,draft:'',rows:[],needsReview:false,
        refs:emptyRefs()};
      const {open,draft,rows,needsReview}=conversationSession.getSnapshot();
      return {open,draft,rows:structuredClone(rows),needsReview,
        refs:structuredClone(businessRefs)};
    },
    saveSession(snapshot){
      if(consumerDisposed||!snapshot||typeof snapshot!=='object')return;
      conversationSession.update({open:snapshot.open,draft:snapshot.draft,
        rows:snapshot.rows,needsReview:snapshot.needsReview});
      businessRefs=sessionRefs(snapshot.refs||{});
    },
    async request({request,context={},event,signal,scope=consumerId,continuation=false,
      approvedKnowledgeTest:sessionGrant=null,knowledgeEtag=null}={}){
      const isApproved=consumerId==='knowledge'&&scope==='knowledge'&&
        sessionGrant!==null&&sessionGrant===approvedKnowledgeTest&&
        Date.now()<=sessionGrant.expiresAt&&sessionGrant.etag===knowledgeEtag&&
        sessionGrant.providerGeneration===providers.configuration().generation;
      if(consumerDisposed||(!event?.isTrusted&&!isApproved))
        throw err('E_USER_GESTURE','请从可信 AI 对话输入框发送，或批准本地知识测试会话');
      if(scope!==consumerId&&!(consumerId==='prompt'&&scope==='prompt-edit'))
        throw err('E_AI_SCOPE','当前消费者没有此业务作用域');
      if(bookmarkConversationBusy)throw err('E_AI_BUSY','此消费者已有 AI 请求');
      const frozenConfig=providers.configuration(),selected=frozenConfig.source;
      const providerGeneration=frozenConfig.generation;
      if(!['local_codex','cloud_responses','custom_https'].includes(selected))
        throw err('E_AI_CONFIG','请先在共享 AI 设置中选择 AI 来源');
      let permission=null,grantPattern=null,settings=frozenConfig.settings;
      if(selected!=='local_codex'){
        let url;try{url=new URL(settings.endpoint)}catch{}
        if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||
           !settings.apiKey||!settings.model)
          throw err('E_AI_CONFIG','请在共享 AI 设置中配置 HTTPS 接口、模型及本次 API Key');
        grantPattern=permissionPattern(settings.endpoint);
        // Start inside the trusted Send gesture; no deferred permission prompt.
        permission=continuation||isApproved?api.permissions.contains({origins:[grantPattern]}):
          api.permissions.request({origins:[grantPattern]});
      }
      const abortController=new AbortController(),generation=bookmarkConversationGrantEpoch;
      // The task budget starts at Send, including permission and first inference.
      const deadlineTimer=scope==='bookmark'?setTimeout(()=>abortController.abort(
        err('E_AGENT_LIMIT','运行时间已达上限。已完成的操作保留，请核对书签后继续。')),480000):null;
      const clearDeadline=()=>clearTimeout(deadlineTimer);
      abortController.signal.addEventListener('abort',clearDeadline,{once:true});
      const abortFromParent=()=>abortController.abort(typeof signal?.reason?.code==='string'?
        signal.reason:err('E_CANCELLED','本轮已停止，未发出新的书签操作'));
      signal?.addEventListener('abort',abortFromParent,{once:true});
      if(signal?.aborted)abortFromParent();
      let round;
      try{
        round=conversationSession.begin({signal:abortController.signal,providerGeneration});
      }catch(error){
        // A pre-cancelled parent or stale busy round must not leak the deadline
        // timer and signal listeners before the request's normal finally exists.
        clearDeadline();
        abortController.signal.removeEventListener('abort',clearDeadline);
        signal?.removeEventListener('abort',abortFromParent);
        throw error;
      }
      const active={abortController,source:selected,generation,providerGeneration,
        grantPattern,signal,scope,round,sessionGrant:isApproved?sessionGrant:null};
      bookmarkConversationBusy=true;bookmarkConversationActive=active;
      let released=false,deciding=false;
      const release=()=>{
        if(released)return;released=true;
        clearDeadline();
        round.finish();
        abortController.signal.removeEventListener('abort',clearDeadline);
        signal?.removeEventListener('abort',abortFromParent);
        if(bookmarkConversationActive===active){
          bookmarkConversationActive=null;bookmarkConversationBusy=false;
        }
      };
      active.release=release;
      const assertLive=()=>{
        if(isApproved&&(approvedKnowledgeTest!==sessionGrant||
           Date.now()>sessionGrant.expiresAt||sessionGrant.providerGeneration!==providers.configuration().generation))
          throw err('E_MODEL_GRANT_REVOKED','本地知识自动推理会话已失效');
        if(consumerDisposed)
          throw err('E_TOOL_CHANGED','AI 消费者实例已关闭');
        if(generation!==bookmarkConversationGrantEpoch)
          throw err('E_MODEL_GRANT_REVOKED','模型网站或 Native 权限已撤销，未继续写入');
        if(abortController.signal.aborted)
          throw abortController.signal.reason||err('E_CANCELLED','本轮已停止，未继续写入');
        if(bookmarkConversationActive!==active)
          throw err('E_TOOL_CHANGED','当前 AI 消费者实例已切换，本轮操作失效');
        if(signal?.aborted)
          throw err('E_CANCELLED','本轮已停止，未继续写入');
        if(providers.configuration().generation!==providerGeneration)
          throw err('E_TOOL_CHANGED','Provider 配置或会话已变化，请重新发送');
        round.assertCurrent(providers.configuration().generation);
      };
      // Permission prompts and transport responses can outlive the UI. Stop
      // releases this wait immediately; late settlements stay attached only to
      // their original round and cannot release or cancel a newer one.
      const awaitActive=pending=>new Promise((resolve,reject)=>{
        const stopped=()=>{
          abortController.signal.removeEventListener('abort',stopped);
          reject(abortController.signal.reason||err('E_CANCELLED','本轮已停止'));
        };
        abortController.signal.addEventListener('abort',stopped,{once:true});
        Promise.resolve(pending).then(value=>{
          abortController.signal.removeEventListener('abort',stopped);resolve(value);
        },error=>{
          abortController.signal.removeEventListener('abort',stopped);reject(error);
        });
        if(abortController.signal.aborted)stopped();
      });
      const assertWrite=async()=>{
        assertLive();
        if(grantPattern||selected==='local_codex'){
          let permitted=false;
          try{
            permitted=await awaitActive(api.permissions.contains(grantPattern?
              {origins:[grantPattern]}:{permissions:['nativeMessaging']}));
          }catch{/* An unknown authorization state is not a grant. */}
          assertLive();
          if(!permitted){
            invalidateBookmarkConversation(err('E_MODEL_GRANT_REVOKED','模型网站或 Native 权限已失效'));
            throw err('E_MODEL_GRANT_REVOKED','模型网站或 Native 权限已失效，拒绝继续业务写入');
          }
        }
        assertLive();
      };
      try{
        if(permission&&!await awaitActive(permission))throw err('E_AI_PERMISSION','没有模型网站权限，未请求 AI');
        await assertWrite();
        if(selected==='local_codex'){
          const capability=await awaitActive(forScope(scope).probe());
          await assertWrite();
          const readiness=describeLocalCodex(capability);
          if(!readiness.ready)throw err(readiness.state,readiness.message);
        }
        const result=await awaitActive(forScope(scope).requestStructured({
          source:selected,request,context,instructions:scope==='knowledge'?KNOWLEDGE_ANSWER_INSTRUCTIONS:scope==='tasks'?taskInstructions:
            scope==='prompt'?promptInstructions:scope==='prompt-edit'?promptEditInstructions:bookmarkInstructions,
          scope,settings,
          signal:abortController.signal
        }));
        await assertWrite();
        // Keep this capability scoped to the whole readback-verified business
        // turn, not merely to the duration of model inference.
        // Continue only the originally authorized bookmark task; no synthetic
        // user gesture, new permission grant, scheduler or execution Host.
        const continueWith=async(nextContext,{signal:taskSignal}={})=>{
          if(scope!=='bookmark')throw err('E_AI_SCOPE','非书签任务无法使用书签连续决策');
          if(released)throw err('E_TOOL_CHANGED','书签任务已结束，不能重放后续模型调用');
          assertLive();
          if(deciding)throw err('E_AI_BUSY','当前任务已经在生成后续决策');
          const stopTask=()=>abortController.abort(typeof taskSignal.reason?.code==='string'?
            taskSignal.reason:err('E_CANCELLED','本轮已停止，未继续模型决策'));
          taskSignal?.addEventListener('abort',stopTask,{once:true});
          if(taskSignal?.aborted)stopTask();
          deciding=true;
          try{
            await assertWrite();
            const next=await awaitActive(forScope('bookmark').requestStructured({
              source:selected,request,context:nextContext,scope:'bookmark',
              instructions:bookmarkInstructions,settings,signal:abortController.signal
            }));
            await assertWrite();
            return next.proposal;
          }finally{
            taskSignal?.removeEventListener('abort',stopTask);
            deciding=false;
          }
        };
        return {proposal:result.proposal,provider:selected,metadata:result.metadata,
          ...(scope==='bookmark'?{continueWith}:{}),
          authorization:Object.freeze({signal:abortController.signal,assertWrite,release})};
      }catch(error){
        // Stop releases pending waits immediately. Allow already queued grant
        // removal listeners to run before classifying that cancellation, so a
        // same-turn revocation retains its stronger public error semantics.
        if(error?.code==='E_CANCELLED')await Promise.resolve();
        const revoked=generation!==bookmarkConversationGrantEpoch;
        release();
        if(consumerDisposed)throw err('E_TOOL_CHANGED','AI 消费者实例已关闭');
        if(revoked)throw err('E_MODEL_GRANT_REVOKED','本轮模型权限已撤销；迟到提议已丢弃');
        // The transport may report E_CANCELLED when a Provider switch aborts
        // inference. Preserve the stronger, actionable identity-change reason.
        // A user's own Stop remains E_CANCELLED if the Provider is unchanged.
        if(providers.configuration().generation!==providerGeneration)
          throw err('E_TOOL_CHANGED','AI Provider 已切换，旧推理结果不能继续写入');
        if(signal?.aborted)throw err('E_CANCELLED','本轮已停止；迟到提议已丢弃');
        throw error;
      }
    },
    // Approval is a first-party, memory-only capability, never exposed through the
    // sandbox SDK. It grants ONLY knowledge inference on this exact local document.
    beginKnowledgeTestApproval({event,origin,documentId,etag}={}){
      if(consumerId!=='knowledge'||consumerDisposed||!event?.isTrusted||
         origin!=='http://127.0.0.1:43111'||
         typeof documentId!=='string'||documentId.length<8||documentId.length>160||
         typeof etag!=='string'||!/^[a-f0-9]{64}$/u.test(etag))
        throw err('E_KB_TEST_CONSENT','本地测试来源、知识版本或可信用户授权无效');
      const config=providers.configuration(),selected=config.source;
      let permission;
      if(selected==='local_codex'){
        // Must start synchronously from this real UI click if Native is optional.
        permission=api.permissions.request({permissions:['nativeMessaging']});
      }else if(['cloud_responses','custom_https'].includes(selected)){
        let url;try{url=new URL(config.settings.endpoint)}catch{}
        if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||
           !config.settings.apiKey||!config.settings.model)
          throw err('E_AI_CONFIG','先完成共享 AI HTTPS 模型设置');
        permission=api.permissions.request({origins:[permissionPattern(config.settings.endpoint)]});
      }else throw err('E_AI_CONFIG','当前没有可使用的 AI Provider');
      clearKnowledgeTest();const epoch=knowledgeApprovalEpoch;
      return Promise.resolve(permission).then(permitted=>{
        if(permitted!==true||consumerDisposed||epoch!==knowledgeApprovalEpoch||
           providers.configuration().generation!==config.generation)
          throw err('E_MODEL_GRANT_REVOKED','模型授权未批准或已变化');
        const grant=Object.freeze({origin,documentId,etag,providerGeneration:config.generation,
          expiresAt:Date.now()+600000});
        approvedKnowledgeTest=grant;
        return grant;
      });
    },
    revokeKnowledgeTest(){
      if(consumerId!=='knowledge')return;
      const active=bookmarkConversationActive;
      clearKnowledgeTest();
      if(active?.sessionGrant)active.abortController.abort(
        err('E_MODEL_GRANT_REVOKED','本地知识测试已停止'));
    },
    cancel({signal}={}){
      const active=bookmarkConversationActive;
      if(!active||signal&&active.signal!==signal)return Promise.resolve();
      active.abortController.abort(
        err('E_CANCELLED','已停止当前 AI 对话'));
      conversationSession.cancel();
      return forScope(active.scope).cancelInference();
    },
    dispose(){
      if(consumerDisposed)return;consumerDisposed=true;
      invalidateBookmarkConversation(err('E_TOOL_CHANGED','AI 消费者实例已关闭'));
      api.permissions.onRemoved?.removeListener(consumerPermissionRemoved);
      unsubscribeProviderSettings?.();
      authorizationListeners.clear();
      // No install-scoped references or in-flight responses survive disposal.
      businessRefs=emptyRefs();conversationSession.dispose();
      editLease?.dispose();mainLease.dispose();
    }
  });
  return conversation;
  }

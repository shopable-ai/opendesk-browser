// Static first-party business controls. No API Key, Native client or grant is
// exposed to the installed iframe. Storage still goes through its original Host.
import '../src/model.js';
import {createKnowledgeAnswerConsumer} from './ai-request.js';
import {createLocalKnowledgeTestRuntime} from './local-test-runtime.js';
const error=(code,message)=>Object.assign(new Error(message),{code});

export function createTrustedKnowledgeHost({conversation,readLibrary,assertIdentity,
  api,currentPageTarget,guardBlocked=()=>false,subscribeConnection=()=>()=>{}}){
  const model=globalThis.OpenDeskKnowledgeAnswersModel,listeners=new Set();
  let disposed=false,revision=0,read=null,prepared=null,round=null,selectedInbound=null;
  let state=Object.freeze({busy:false,prepared:null,result:null,error:'',test:null});
  const publish=patch=>{if(disposed)return;state=Object.freeze({...state,...patch});
    for(const listener of [...listeners])listener();};
  const live=()=>{if(disposed)throw error('E_TOOL_CHANGED','知识问答已关闭');
    assertIdentity();if(guardBlocked())throw error('E_KB_UNSAVED','请先保存或放弃当前知识编辑');};
  const consumer=createKnowledgeAnswerConsumer({model,conversation,assertIdentity:args=>{
    live();
    if(args?.etag&&(!prepared||prepared.etag!==args.etag||prepared.revision!==revision))
      throw error('E_KB_STALE','知识或授权已变化，请重新准备');
  },readLibrary:async()=>{const value=await readLibrary();read=value;return value;}});
  const autoConsumer=createKnowledgeAnswerConsumer({model,conversation,
    assertIdentity:args=>{
      live();
      if(args?.etag&&test?.approvalContext()?.etag!==args.etag)
        throw error('E_KB_STALE','自动 AI 会话已失效或知识版本变化');
    },
    readLibrary:async()=>readLibrary()
  });
  const test=api&&currentPageTarget?createLocalKnowledgeTestRuntime({
    api,currentPageTarget,model,readLibrary,
    assertLive:live,getProviderGeneration:()=>conversation.providerGeneration(),
    callAI:async({question,scope,approvedKnowledgeTest,expectedEtag,sourceIdAllowlist=null})=>{
      const preparedAI=await autoConsumer.refresh();
      if(preparedAI.etag!==expectedEtag)
        throw error('E_KB_STALE','批准时的知识版本已经变化');
      return autoConsumer.request({request:question,scope,approvedKnowledgeTest,sourceIdAllowlist});
    },
    onStopAI:()=>{autoConsumer.invalidate();conversation.revokeKnowledgeTest();},
    onChange:next=>publish({test:next})
  }):null;
  if(test)publish({test:test.snapshot()});
  function invalidate(message='知识或 AI 授权已变化，请重新准备'){
    revision++;prepared=null;selectedInbound=null;round?.abort();consumer.invalidate();
    test?.stop('知识或 AI 授权已变化，请重新批准本地测试');
    publish({prepared:null,result:null,error:message});
  }
  const subscriptions=[conversation.subscribeProviderChanges(()=>invalidate('AI Provider 已切换，旧回答已失效')),
    subscribeConnection(value=>{if(value.nativeConnected===false&&conversation.source().provider==='local_codex')
      invalidate('Native 连接已断开，旧回答已失效');}),
    conversation.subscribeAuthorizationChanges(()=>invalidate('模型权限发生变化，旧回答已失效'))];
  async function prepare({question,scope='',inboundId=null,testIdentity=null,sourceIdAllowlist=null}={}){
      live();if(state.busy)throw error('E_KB_BUSY','当前问答尚未结束');
      const expected=revision;prepared=null;selectedInbound=null;
      publish({busy:true,prepared:null,result:null,error:''});
      try{
        const receipt=await consumer.refresh();live();
        if(expected!==revision)throw error('E_KB_STALE','准备期间知识或授权已变化');
        const library=model.library(read.value??model.empty());
        const lookup=model.lookup(library,{question,scope});
        if(sourceIdAllowlist!==null&&
          (lookup.status!=='RETRIEVED_ONLY'||!Array.isArray(sourceIdAllowlist)||
           !sourceIdAllowlist.length||sourceIdAllowlist.length>3||
           new Set(sourceIdAllowlist).size!==sourceIdAllowlist.length||
           sourceIdAllowlist.some(id=>!lookup.sourceIds.includes(id))))
          throw error('E_KB_REFERENCES','本轮逐题来源与现有模型检索不一致');
        const permitted=sourceIdAllowlist===null?lookup.sourceIds:sourceIdAllowlist;
        const references=library.items.filter(item=>permitted.includes(item.id));
        const recipient=conversation.recipient();
        prepared=Object.freeze({question:question.trim(),scope,etag:receipt.etag,revision,
          recipient,references,lookup,inboundId,testIdentity,sourceIdAllowlist});
        selectedInbound=inboundId;
        publish({prepared});return prepared;
      }catch(cause){publish({error:cause.message});throw cause;}
      finally{publish({busy:false});}
  }
  return Object.freeze({snapshot:()=>state,
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    recipient:()=>conversation.recipient(),
    prepare,
    async prepareInbound(messageId){
      if(!test)throw error('E_KB_DEMO_HOST','当前没有本地测试文档适配');
      const item=test.select(messageId);
      return prepare({question:item.question,scope:item.scope,
         inboundId:messageId,testIdentity:item.testIdentity,
         sourceIdAllowlist:item.sourceIdAllowlist});
    },
    startLocalTest({event,autoSendFixed=false}={}){
      if(!test)throw error('E_KB_DEMO_HOST','当前没有本地测试文档适配');
      return test.start({event,autoSendFixed});
    },
    approveLocalAI({event}={}){
      if(!test)throw error('E_KB_DEMO_HOST','当前没有本地测试文档适配');
      live();
      const context=test.approvalContext();
      // The Provider permission prompt starts synchronously in the real click.
      const pending=conversation.beginKnowledgeTestApproval({event,...context});
      return Promise.resolve(pending).then(grant=>{
        live();test.approveAI(grant);
        return {approved:true,recipient:conversation.recipient()};
      });
    },
    pauseLocalTest:()=>test?.pause(),resumeLocalTest:()=>test?.resume(),
    stopLocalTest:()=>test?.stop('用户停止本地测试'),
    sendToLocalPage:input=>{
      if(!test)throw error('E_KB_DEMO_HOST','当前没有本地测试文档适配');
      return test.confirm(input);
    },
    reconcileLocalPage:input=>{
      if(!test)throw error('E_KB_DEMO_HOST','当前没有本地测试文档适配');
      return test.reconcile(input);
    },
    // Must be entered directly from the original trusted Send handler.
    send({event,approved=false}){
      live();if(state.busy)throw error('E_KB_BUSY','当前问答尚未结束');
      const current=prepared;
      if(!current||current.revision!==revision||
        current.recipient.generation!==conversation.providerGeneration())
        throw error('E_KB_STALE','请重新准备知识与接收方');
      if(current.lookup.status==='RETRIEVED_ONLY'&&!approved)
        throw error('E_KB_CONSENT','请审阅并同意向此 AI 发送列出的知识');
      const inboundId=selectedInbound;
      if(inboundId){
        // Before the actual Provider request, verify the same customer,
        // session generation, document, pause epoch and knowledge ETag.
        const now=test?.select(inboundId),prior=current.testIdentity,identity=now?.testIdentity;
        if(!prior||!identity||!Object.keys(prior).every(key=>prior[key]===identity[key])||
           current.question!==now.question||current.scope!==now.scope||
           JSON.stringify(current.sourceIdAllowlist)!==JSON.stringify(now.sourceIdAllowlist)||
           current.etag!==test.approvalContext().etag)
          throw error('E_KB_STALE','客户会话或知识已变化，请重新准备 AI 草稿');
      }
      round=new AbortController();const owned=round,expected=revision;
      let pending;
      try{pending=consumer.request({request:current.question,scope:current.scope,event,
        signal:owned.signal,sourceIdAllowlist:current.sourceIdAllowlist});}
      catch(cause){round=null;throw cause;}
      publish({busy:true,result:null,error:''});
      return Promise.resolve(pending).then(result=>{
        live();if(expected!==revision||owned.signal.aborted)
          throw error('E_KB_STALE','旧回答已失效');
        if(inboundId&&result.status==='REVIEW_REQUIRED'&&test)
          test.attach(inboundId,result,current.etag,current.testIdentity);
        publish({result});return result;
      }).catch(cause=>{publish({result:null,error:cause.message});throw cause;})
        .finally(()=>{if(round===owned)round=null;publish({busy:false});});
    },
    invalidate,
    clearPrepared(){revision++;prepared=null;selectedInbound=null;round?.abort();consumer.invalidate();
      publish({prepared:null,result:null,error:''});},
    cancel(){revision++;prepared=null;selectedInbound=null;round?.abort();
      publish({prepared:null,result:null,error:'本轮已取消，迟到回答不会显示'});
      return consumer.cancel();},
    dispose(){if(disposed)return;disposed=true;revision++;round?.abort();
      test?.dispose();autoConsumer.dispose();consumer.dispose();conversation.dispose();
      for(const unsubscribe of subscriptions)unsubscribe?.();listeners.clear();}
  });
}

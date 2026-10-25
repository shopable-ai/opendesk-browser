// Static first-party business controls. No API Key, Native client or grant is
// exposed to the installed iframe. Storage still goes through its original Host.
import '../src/model.js';
import {createKnowledgeAnswerConsumer} from './ai-request.js';
const error=(code,message)=>Object.assign(new Error(message),{code});

export function createTrustedKnowledgeHost({conversation,readLibrary,assertIdentity,
  guardBlocked=()=>false,subscribeConnection=()=>()=>{}}){
  const model=globalThis.OpenDeskKnowledgeAnswersModel,listeners=new Set();
  let disposed=false,revision=0,read=null,prepared=null,round=null;
  let state=Object.freeze({busy:false,prepared:null,result:null,error:''});
  const publish=patch=>{if(disposed)return;state=Object.freeze({...state,...patch});
    for(const listener of [...listeners])listener();};
  const live=()=>{if(disposed)throw error('E_TOOL_CHANGED','知识问答已关闭');
    assertIdentity();if(guardBlocked())throw error('E_KB_UNSAVED','请先保存或放弃当前知识编辑');};
  const consumer=createKnowledgeAnswerConsumer({model,conversation,assertIdentity:args=>{
    live();
    if(args?.etag&&(!prepared||prepared.etag!==args.etag||prepared.revision!==revision))
      throw error('E_KB_STALE','知识或授权已变化，请重新准备');
  },readLibrary:async()=>{const value=await readLibrary();read=value;return value;}});
  function invalidate(message='知识或 AI 授权已变化，请重新准备'){
    revision++;prepared=null;round?.abort();consumer.invalidate();
    publish({prepared:null,result:null,error:message});
  }
  const subscriptions=[conversation.subscribeProviderChanges(()=>invalidate('AI Provider 已切换，旧回答已失效')),
    subscribeConnection(value=>{if(value.nativeConnected===false&&conversation.source().provider==='local_codex')
      invalidate('Native 连接已断开，旧回答已失效');}),
    conversation.subscribeAuthorizationChanges(()=>invalidate('模型权限发生变化，旧回答已失效'))];
  return Object.freeze({snapshot:()=>state,
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async prepare({question,scope=''}){
      live();if(state.busy)throw error('E_KB_BUSY','当前问答尚未结束');
      const expected=revision;prepared=null;publish({busy:true,prepared:null,result:null,error:''});
      try{
        const receipt=await consumer.refresh();live();
        if(expected!==revision)throw error('E_KB_STALE','准备期间知识或授权已变化');
        const library=model.library(read.value??model.empty());
        const lookup=model.lookup(library,{question,scope});
        const references=library.items.filter(item=>lookup.sourceIds.includes(item.id));
        const recipient=conversation.recipient();
        prepared=Object.freeze({question:question.trim(),scope,etag:receipt.etag,revision,
          recipient,references,lookup});
        publish({prepared});return prepared;
      }catch(cause){publish({error:cause.message});throw cause;}
      finally{publish({busy:false});}
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
      round=new AbortController();const owned=round,expected=revision;
      let pending;
      try{pending=consumer.request({request:current.question,scope:current.scope,event,signal:owned.signal});}
      catch(cause){round=null;throw cause;}
      publish({busy:true,result:null,error:''});
      return Promise.resolve(pending).then(result=>{
        live();if(expected!==revision||owned.signal.aborted)
          throw error('E_KB_STALE','旧回答已失效');
        publish({result});return result;
      }).catch(cause=>{publish({result:null,error:cause.message});throw cause;})
        .finally(()=>{if(round===owned)round=null;publish({busy:false});});
    },
    invalidate,
    cancel(){revision++;prepared=null;round?.abort();
      publish({prepared:null,result:null,error:'本轮已取消，迟到回答不会显示'});
      return consumer.cancel();},
    dispose(){if(disposed)return;disposed=true;revision++;round?.abort();
      consumer.dispose();conversation.dispose();for(const unsubscribe of subscriptions)unsubscribe?.();listeners.clear();}
  });
}

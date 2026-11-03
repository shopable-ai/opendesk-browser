import * as React from 'react';
import {Button,SharedConversationFrame,SharedConversationDock,createConversationSession} from '@opendesk/ui';
import {instructions,changes,sameConfig} from './ai-config.js';
import {resolveAiReply,resolveConfigurationEditScope,assertConfigurationEditScope} from './ai-actions.js';
import {createAiRequest,requireGeneration} from './ai-request.js';
import {createAiPending} from './ai-pending.js';
import {createAiPageObservation,retireAiPageObservation} from './ai-page.js';

const operationGuidance={
  'capture.start':'请在采集界面点击「开始采集」。',
  'capture.stop':'请在采集界面点击「停止采集」。',
  'results.show':'请在「采集结果」查看记录。',
  'results.export':'请在「采集结果」选择下载格式。'
};

export default function AiPanel({open=true,state,business,onConfigurationApplied,locked,pending,valid,onApply,onClose,onBusy,onDirty,retiredRequest,onRequestRetired=()=>{}}){
  const tool=globalThis.OpenDeskTool;
  const requestTool=React.useCallback((op,args)=>tool.request(op,args),[tool]);
  const [chat]=React.useState(()=>createConversationSession({identity:{consumerId:'scrapyjs-config',
    instanceId:crypto.randomUUID(),hostInstanceId:'sandbox-presentation'}}));
  const conversation=React.useSyncExternalStore(chat.subscribe,chat.getSnapshot);
  const requirement=conversation.draft;
  const setRequirement=value=>chat.update({draft:value});
  const append=(speaker,message)=>chat.append(speaker,message);
  const [recipient,setRecipient]=React.useState(null);
  const [working,setWorking]=React.useState(false);
  const [unknown,setUnknown]=React.useState(false);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [pendingId,setPendingId]=React.useState(null);
  const [pendingReady,setPendingReady]=React.useState(false);
  const pendingIdentity=React.useMemo(()=>createAiPending((op,args)=>tool.request(op,args)),[tool]);
  const active=React.useRef(null),alive=React.useRef(true),log=React.useRef(null);
  const followMessages=React.useRef(true),lastRows=React.useRef(conversation.rows);
  const latest=React.useRef(null);
  latest.current={state,blocked:locked||pending||!valid,unknown,pendingId,pendingReady};
  React.useLayoutEffect(()=>{
    const node=log.current;if(!open||!node)return;
    if(lastRows.current!==conversation.rows&&followMessages.current)node.scrollTop=node.scrollHeight;
    lastRows.current=conversation.rows;
  },[open,conversation.rows]);
  React.useEffect(()=>()=>chat.dispose(),[chat]);
  React.useEffect(()=>{
    alive.current=true;
    tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});
    return()=>{alive.current=false;active.current?.cancel({release:false}).catch(()=>{});};
  },[tool]);
  React.useEffect(()=>{
    let current=true;
    pendingIdentity.read().then(({value})=>{
      if(!current)return;setPendingReady(true);
      if(value){setPendingId(value.requestId);setUnknown(true);busy(true);setNotice('原请求结果待确认，请查询或停止原请求。');}
    }).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity]);
  React.useEffect(()=>{
    if(!pendingId||pendingId!==retiredRequest?.requestId||active.current||!['cancelled','completed','failed'].includes(retiredRequest?.state))return;
    let current=true;
    pendingIdentity.read().then(({value})=>{
      if(!current||!alive.current||active.current)return;
      if(value){setPendingId(value.requestId);return;}
      setPendingId(null);setUnknown(false);busy(false);setNotice('原 AI 请求已确认结束；停止后内容未应用。');
    }).catch(e=>{if(current&&alive.current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity,pendingId,retiredRequest]);
  React.useEffect(()=>{onDirty(Boolean(requirement));},[requirement,onDirty]);
  React.useEffect(()=>{onBusy(working,{unknown});},[working,unknown,onBusy]);
  function busy(value){setWorking(value);}
  function stillCurrent(snapshot,id){
    const current=latest.current;
    return alive.current&&!current.blocked&&!current.unknown&&current.pendingReady&&
      (!current.pendingId||current.pendingId===id)&&snapshot.epoch===current.state.profileEpoch&&
      sameConfig(snapshot.base,current.state.config)&&snapshot.page?.url===current.state.target?.url;
  }
  async function generate(){
    if(working||active.current||unknown||!pendingReady||pendingId||!recipient||!requirement.trim())return;
    if(typeof tool.prepareAI!=='function'){
      setError('当前 Browser 缺少 OpenDeskTool.prepareAI 安全发送能力，请更新 Browser 后重试；输入已保留。');return;
    }
    let before;
    try{before=business?.state.read();}catch(e){setError(e.message);return;}
    const request=requirement.trim(),id=crypto.randomUUID(),base=structuredClone(state.config),epoch=state.profileEpoch;
    const page=state.target?{title:state.target.title,url:state.target.url}:null;
    const scope=resolveConfigurationEditScope(request,base,{page});
    const observation=scope.type==='create'?createAiPageObservation(requestTool,{requestId:id,url:page.url}):null;
    const requestPending=observation?{claim:requestId=>pendingIdentity.claim(requestId,{pageObservation:true}),
      beforeDispatch:pendingIdentity.markDispatched,clear:pendingIdentity.clear}:pendingIdentity;
    const operation=createAiRequest((op,args)=>tool.request(op,args),{requestId:id,request,instructions,context:buildContext()},setRecipient,requestPending,
      factory=>tool.prepareAI(factory),observation?{
        prepare:async context=>{
          const next={...context,...await observation.prepare()};
          while(next.conversation?.length&&JSON.stringify({request,context:next}).length>20000)next.conversation.shift();
          return next;
        },retire:()=>observation.retire()
      }:null);
    append('你',request);setPendingId(id);active.current=operation;busy(true);setUnknown(false);setError('');setNotice('');
    const finishReply=()=>{setRequirement('');setNotice('');};
    try{
      const result=await operation.run();
      if(!alive.current||active.current!==operation)return;
      if(!result){setNotice('原 AI 请求已结束；停止后返回的内容未应用。');return;}
      const reply=resolveAiReply(result.proposal,{base,expectedUrl:base.url||page?.url,
        validate:globalThis.ScrapyAppModel.validateConfig,changes,hasSample:Boolean(observation),allowFullConfig:true});
      if(reply.type==='operation'){
        append('助手',operationGuidance[reply.operation.kind]);return;
      }
      if(reply.type!=='proposal'){
        append('助手',reply.message+(reply.missing.length?'\n需要补充：'+reply.missing.join('、'):''));
        if(reply.type==='explain'&&scope.type==='readonly')finishReply();return;
      }
      if(!['edit','create'].includes(scope.type)){
        append('助手',scope.message);return;
      }
      assertConfigurationEditScope(scope,base,reply.config,globalThis.ScrapyAppModel.validateConfig);
      if(!reply.actions.length){append('助手','配置没有变化。');finishReply();return;}
      const info=await tool.request('ai.info',{});
      if(requireGeneration(info.generation)!==requireGeneration(result.providerGeneration))throw Error('AI Provider 已变化，未修改配置。');
      const {value}=await pendingIdentity.read();
      if(observation)await observation.assertCurrent();
      if(value||active.current!==operation||!stillCurrent({base,epoch,page},id))throw Error('配置、网页或原请求已变化，未修改配置。');
      if(business){
        const proposed=business.config.propose({identity:before.identity,config:reply.config});
        const receipt=business.config.apply({proposalId:proposed.proposalId});
        if(receipt.status!=='applied')throw Error('未取得配置应用回执。');
        onConfigurationApplied?.({requestId:id,config:proposed.config});
      }else onApply(reply.config,base,epoch,page,id);
      append('助手','已更新配置草稿。');finishReply();
    }catch(e){
      if(alive.current&&active.current===operation){
        setError(e.message);
        if(operation.unknown){
          setUnknown(true);setNotice('原请求结果未知，请查询或停止原请求。');
          if(!operation.dispatched){try{const {value}=await pendingIdentity.read();if(alive.current&&active.current===operation&&value&&value.requestId!==operation.id){active.current=null;setPendingId(value.requestId);}}catch{}}
          return;
        }
        setNotice(e.code==='E_CANCELLED'?'本次发送已取消；输入与原配置已保留。':'');
      }
    }finally{if(alive.current&&active.current===operation&&!operation.unknown){active.current=null;setPendingId(null);busy(false);}}
  }
  async function cancel(){
    if(!active.current&&!pendingId)return;
    const operation=active.current;setNotice('正在停止原 AI 请求…');
    try{
      let reply,recovered=null;
      if(operation)reply=await operation.cancel();
      else{
        recovered=(await pendingIdentity.read()).value;
        if(recovered?.requestId!==pendingId)throw Error('未决 AI 身份已变化；未清除。');
        if(recovered.pageObservation&&recovered.dispatchState==='preparing'){
          // Retire the original observation before CAS-clearing its unsent row.
          // A concurrent late factory must claim the same CAS to dispatch.
          await retireAiPageObservation(requestTool,pendingId);
          await pendingIdentity.clearUnsent(pendingId);
          reply={requestId:pendingId,state:'cancelled'};
        }else reply=await tool.request('ai.cancel',{requestId:pendingId});
      }
      if(!operation&&(reply?.requestId!==pendingId||!['cancelled','completed','failed','unknown'].includes(reply.state)))throw Error('停止回执身份或状态无效，原请求仍在等待确认。');
      if(alive.current&&active.current===operation){
        if(operation&&!operation.dispatched&&!operation.settled){setNotice('已请求取消准备；等待原运行结束，未解除围栏。');return;}
        if(['cancelled','completed','failed'].includes(reply.state)){
          if(!operation&&recovered.dispatchState!=='preparing'){
            if(recovered.pageObservation)await retireAiPageObservation(requestTool,pendingId);
            await pendingIdentity.clear(pendingId);
          }
          if(!alive.current||active.current!==operation)return;
          onRequestRetired(reply);
          active.current=null;setPendingId(null);busy(false);setUnknown(false);append('系统','原 AI 请求已确认结束；停止后内容未应用。');setNotice(reply.state==='cancelled'?'已确认停止原 AI 请求；未应用配置。':'原 AI 请求已结束；停止后内容未应用。');
        }else{setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求；返回内容不会应用。');}
      }
    }
    catch(e){if(alive.current&&active.current===operation){setError(e.message);setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求。');}}
  }
  function buildContext(){
    const context={page:state.target?{title:state.target.title,url:state.target.url}:null,
      currentConfig:state.config,sample:'',previousError:error||state.error||'',
      business:{runId:state.runId??null,clientRequestId:state.clientRequestId??null,phase:state.phase??null,hostStatus:state.snapshot?.status??null,
        engineStatus:state.result?.engine?.status||state.engine||null,retired:state.retired===true,hasResult:state.result!=null,configurationLocked:Boolean(locked)}};
    // History is bounded display context, never an execution authorization.
    const history=conversation.rows.filter(row=>['你','助手'].includes(row.speaker)).slice(-8)
      .map(row=>({role:row.speaker==='你'?'user':'assistant',content:row.message.slice(0,1500)}));
    while(history.length&&(JSON.stringify(history).length>6000||
      JSON.stringify({request:requirement.trim(),context:{...context,conversation:history}}).length>20000))history.shift();
    if(history.length)context.conversation=history;
    return context;
  }

  const hint=!pendingReady?'正在读取原请求状态…':!recipient?'AI 尚未就绪。':'';
  return <SharedConversationDock id="chat-ai-panel" className="ai-workspace" open={open} onClose={onClose} expandedFeedback={Boolean(error||unknown)}
    onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();onClose();}}}>
    <SharedConversationFrame open={open} rows={conversation.rows} draft={requirement}
      logRef={log} autoScroll={false} onLogScroll={event=>{const node=event.currentTarget;followMessages.current=node.scrollHeight-node.clientHeight-node.scrollTop<32;}}
      busy={working&&!unknown} blocked={unknown||pendingId!==null||!pendingReady}
      inputDisabled={working&&!unknown} canSend={Boolean(recipient)}
      inputId="ai-requirement" inputLabel="对话输入" sendId="ai-generate" stopId="chat-ai-cancel"
      placeholder="发送消息，或描述想修改的采集配置…" emptyPrompt="可以讨论采集需求，或让我帮你修改配置。"
      onDraftChange={setRequirement} onSend={generate} onStop={cancel}
      feedback={<div className="ai-feedback" hidden={!notice&&!error&&!unknown&&!hint}>
        <p id="chat-ai-feedback" role="status" hidden={!notice}>{notice}</p>
        <p role="alert" className="error" hidden={!error}>{error}</p>
        {hint&&<p role="status">{hint}</p>}
        {unknown&&<><p id="chat-ai-request-status" className="sr-only">原请求 {pendingId} · unknown</p><Button base="aria" id="chat-ai-query-original" onClick={cancel}>查询 / 停止原请求</Button></>}
      </div>}/>
  </SharedConversationDock>;
}

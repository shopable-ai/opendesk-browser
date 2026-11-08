import * as React from 'react';
import {SharedConversationDock,SharedConversationFrame} from '../../../src/ui/react/components/conversation.tsx';
import {createConversationSession} from '../../../src/ui/conversation/session.js';
import {buildScrollAIContext,validateScrollAIProposal} from './ai-configuration.js';
import {scrollNavigationText} from './host-localization.js';

const fault=code=>Object.assign(new Error(code),{code});
const localCapabilityMessages=new Map([
  ['CODEX_UNSUPPORTED','aiCodexUnsupported'],['CODEX_MISSING','aiCodexMissing'],
  ['CODEX_LOGIN_REQUIRED','aiCodexLoginRequired'],['CODEX_INITIALIZING','aiCodexInitializing']
]);
const unknownCodes=new Set(['E_AI_UNKNOWN','E_AI_OUTCOME_UNKNOWN','E_AI_TIMEOUT','E_AI_EVENTS_GAP','E_AI_DISCONNECTED']);
// Fixed trusted consumer: the common Frame only displays; the original manager
// and Host remain the sole writers. Only bounded, authorized structure is sent.
export function ScrollConfigurationChat({open,onClose,model,getBusinessState,onApply}){
  const locale=model.locale||'zh-CN',t=(key,params)=>scrollNavigationText(locale,key,params);
  const latest=React.useRef({model,getBusinessState,onApply,t});latest.current={model,getBusinessState,onApply,t};
  const [session]=React.useState(()=>createConversationSession({identity:{consumerId:'scroll-navigation',
    instanceId:crypto.randomUUID(),hostInstanceId:'scroll-settings-view'},rowsLimit:24}));
  const state=React.useSyncExternalStore(session.subscribe,session.getSnapshot);
  const [ready,setReady]=React.useState(false),[phase,setPhase]=React.useState('idle');
  const [blocked,setBlocked]=React.useState(Boolean(model.aiUnknown?.()));
  const [status,setStatus]=React.useState('');
  const conversation=React.useRef(null),active=React.useRef(null),mounted=React.useRef(false);
  const markUnknown=()=>{latest.current.model.markAIUnknown?.();if(mounted.current){setBlocked(true);setStatus('aiUnknown');}};
  React.useEffect(()=>{
    mounted.current=true;
    let owned;
    try{owned=latest.current.model.createConversation?.();conversation.current=owned;setReady(Boolean(owned));}
    catch{setStatus('aiUnavailable');}
    const invalidate=()=>{
      const round=active.current;
      if(round){round.stopped=true;round.controller.abort();}
    };
    const provider=owned?.subscribeProviderChanges?.(invalidate);
    const grants=owned?.subscribeAuthorizationChanges?.(invalidate);
    return ()=>{
      if(active.current)latest.current.model.markAIUnknown?.();
      mounted.current=false;invalidate();provider?.();grants?.();
      owned?.dispose();conversation.current=null;session.dispose();
    };
  },[model.identityKey,session]);
  const send=async event=>{
    const native=event.nativeEvent||event,c=conversation.current;
    const request=session.getSnapshot().draft.trim();
    if(native?.isTrusted!==true||!request||!c||active.current||blocked||latest.current.model.aiUnknown?.())return;
    const business=structuredClone(latest.current.getBusinessState());
    if(!business.snapshot)return;
    const round={controller:new AbortController(),stopped:false,cancellation:null,authorization:null};
    active.current=round;setPhase('thinking');setStatus('');session.append('你',request);
    const assertCurrent=()=>{
      if(!mounted.current||active.current!==round||round.stopped||round.controller.signal.aborted)throw fault('E_CANCELLED');
    };
    try{
      // Original Send event reaches the shared consumer before the first await.
      const pending=c.request({request,context:buildScrollAIContext({request,...business}),
        event:native,signal:round.controller.signal});
      const result=await pending;round.authorization=result.authorization;
      assertCurrent();
      let action=validateScrollAIProposal({request,proposal:result.proposal,...business});
      let page;
      if(action.type==='observe'){
        if(typeof result.continueWith!=='function'||typeof latest.current.model.onObserveCurrentPage!=='function')
          throw fault('E_SCROLL_AI_PROPOSAL');
        await result.authorization.assertWrite();assertCurrent();
        page=await latest.current.model.onObserveCurrentPage(result.authorization);
        assertCurrent();
        await page.assertCurrent();assertCurrent();
        await result.authorization.assertWrite();assertCurrent();
        const next=await result.continueWith(buildScrollAIContext({request,...business,
          observation:page.observation}),{signal:round.controller.signal});
        assertCurrent();
        action=validateScrollAIProposal({request,proposal:next,...business,observation:page.observation});
        if(action.type==='observe')throw fault('E_SCROLL_AI_PROPOSAL');
      }
      if(action.type==='message'){
        session.append('AI',action.message);
      }else{
        setPhase('writing');
        if(page){await page.assertCurrent();assertCurrent();}
        await result.authorization.assertWrite();assertCurrent();
        const receipt=await latest.current.onApply(action,{...business,event:native,
          authorization:result.authorization,assertCurrent,pageObservation:page});
        if(!mounted.current)return;
        // Once dispatched, a save is reconciled even if Stop arrives while its
        // receipt is in flight. Never describe that known commit as cancelled.
        session.append('执行结果',receipt?.review?latest.current.t('aiReview'):
          latest.current.t('aiSaved',{fields:Object.keys(action.patch).map(key=>latest.current.t(key)).join('、'),etag:receipt.etag}));
      }
      if(session.getSnapshot().draft.trim()===request)session.update({draft:''});
    }catch(error){
      if(!mounted.current)return;
      if(unknownCodes.has(error?.code))markUnknown();
      else if(error?.code==='E_CONFIG_UNKNOWN')setStatus('aiWriteUnknown');
      else if(round.stopped||error?.code==='E_CANCELLED')setStatus('aiStopped');
      else{
        // Errors stay bounded and use a fixed UI description; no raw transport,
        // credential, model or native stderr enters this trusted transcript.
        const candidate=typeof error?.code==='string'?error.code:'';
        const capabilityMessage=localCapabilityMessages.get(candidate);
        const code=(capabilityMessage||/^E_[A-Z0-9_]{1,60}$/.test(candidate))?candidate:'E_AI_RESPONSE';
        session.append('系统',latest.current.t(capabilityMessage||'aiFailed',{code}));
      }
    }finally{
      round.authorization?.release();
      if(round.cancellation)await round.cancellation;
      if(active.current===round){active.current=null;if(mounted.current)setPhase('idle');}
    }
  };
  const stop=event=>{
    if((event.nativeEvent||event)?.isTrusted!==true)return;
    const round=active.current;
    if(!round||round.cancellation)return;
    round.stopped=true;setPhase('stopping');
    // Begin original-lease cancellation before aborting the local wait.
    let cancellation;
    try{cancellation=conversation.current?.cancel({signal:round.controller.signal});}
    catch{cancellation=Promise.reject(fault('E_AI_UNKNOWN'));}
    round.cancellation=Promise.resolve(cancellation).then(receipt=>{
      if(!['completed','failed','interrupted','cancelled'].includes(receipt?.terminalStatus))markUnknown();
      else if(mounted.current)setStatus('aiStopped');
    },()=>markUnknown());
    round.controller.abort();
  };
  const business=getBusinessState();
  const canSend=ready&&Boolean(business.snapshot)&&!business.busy&&!business.needsReconcile&&!model.disabledReason;
  return <SharedConversationDock id="scroll-ai-panel" open={open} title={t('aiTitle')} onClose={onClose}
    settingsLabel={t('aiSettings')} closeLabel={t('aiClose')} resizeLabel={t('aiResize')}
    onOpenSettings={event=>model.openAIProviderSettings?.(event)}>
    <SharedConversationFrame open={open} rows={state.rows} draft={state.draft}
      inputId="scroll-ai-input" inputLabel={t('aiInput')} placeholder={t('aiPlaceholder')}
      sendLabel={t('aiSend')} sendTitle={t('aiSend')} logLabel={t('aiLog')}
      emptyPrompt={t('aiWelcome')} busy={phase!=='idle'} blocked={blocked} canSend={canSend}
      stopLabel={t('aiStop')} onDraftChange={draft=>session.update({draft})} onSend={send} onStop={stop}
      feedback={<p role="status" className="ec-scroll-ai-feedback">{status?t(status):
        !ready?t('aiUnavailable'):phase!=='idle'?t('ai'+phase[0].toUpperCase()+phase.slice(1)):''}</p>}/>
  </SharedConversationDock>;
}

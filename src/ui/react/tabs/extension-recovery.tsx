import * as React from 'react';
import {Confirmation} from '../components/confirmation.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';
import {Switch} from '../components/ui/switch.tsx';
import {recoveryText} from '../../extension-recovery-localization.js';

export function ExtensionRecoveryPage({controller,locale,onBack,titleRef}){
  const t=key=>recoveryText(locale,key);
  const state=React.useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  const [confirm,setConfirm]=React.useState(null);
  const [reviewError,setReviewError]=React.useState(false);
  React.useEffect(()=>{void controller.run();},[controller]);
  React.useEffect(()=>{setConfirm(null);setReviewError(false);},[state.accountId,state.revision]);
  const run=(action,input?)=>{setConfirm(null);setReviewError(false);void controller.run(action,input);};
  const ask=(key,action,input?,source?)=>setConfirm({key,action,input,source,
    account:state.accountId,revision:state.revision});
  const decision=confirm?.account===state.accountId&&confirm?.revision===state.revision?confirm:null;
  const review=async row=>{
    try{if(await controller.review(row,state.accountId)){onBack();return;}}catch{/* The original installer did not open. */}
    setReviewError(true);
  };
  return <section id="extension-center-recovery-view" className="ec-web-features" aria-labelledby="extension-center-recovery-title">
    <header className="ec-web-features-header">
      <IconButton id="extension-center-recovery-back" className="ec-detail-back" label={t('back')} onClick={onBack}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
      </IconButton>
      <h2 className="od-page-title" id="extension-center-recovery-title" tabIndex={-1} ref={titleRef}>{t('title')}</h2>
    </header>
    {state.loading&&<p role="status">{t('loading')}</p>}
    {state.unavailable&&<p role="status">{t('unavailable')}</p>}
    {state.accountId&&<p className="ec-web-features-note" id="extension-recovery-account">{t(state.test?'testAccount':'account')} · {state.accountLabel||state.accountId}</p>}
    <section className="ec-web-features-setup od-surface od-surface--padded" aria-labelledby="extension-recovery-installs">
      <h3 id="extension-recovery-installs">{t('installs')}</h3>
      <p className="ec-web-features-note">{t('installsDetail')}</p>
      <div className="ec-web-features-setting">
        <span id="extension-recovery-auto-label">{t('auto')}</span>
        <Switch id="extension-recovery-auto" aria-labelledby="extension-recovery-auto-label"
          isSelected={state.auto===true} isDisabled={!state.accountId||state.busy}
          onChange={enabled=>run('auto',{enabled})}/>
      </div>
      <p className="ec-web-features-note">{t('permissions')}</p>
      {state.accountId&&<>
        <Button id="extension-recovery-save-list" disabled={state.busy} onClick={()=>run('saveList')}>{t('saveList')}</Button>
        {state.pagesKnown===false&&<p className="ec-web-features-note">{t('pagesUnknown')}</p>}
        <ul aria-label={t('savedList')} className="ec-web-features-steps">
          {state.rows.map(row=><li key={row.key} data-recovery-entry={row.key} data-state={row.status}>
            <strong>{row.title}</strong>{' '}{row.version&&<span>{row.version}</span>}
            <p className="ec-web-features-note">{t(row.status)}{row.localVersion&&row.localVersion!==row.version?' · '+t('localVersion')+' '+row.localVersion:''}</p>
            {(row.status.startsWith('review')||row.status==='localRemoval')&&
              <Button disabled={state.busy} onClick={()=>void review(row)}>{t(row.review?'review':'import')}</Button>}{' '}
            <Button disabled={state.busy} onClick={()=>{
              const {kind,id,title,version,hash,source,enabled}=row;
              ask('confirmRemove','remove',{key:row.key,entry:{kind,id,title,version,hash,source,enabled}},title);
            }}>{t('remove')}</Button>
          </li>)}
        </ul>
        {!state.rows.length&&<p>{t('listEmpty')}</p>}
      </>}
    </section>
    <section className="ec-web-features-setup od-surface od-surface--padded" aria-labelledby="extension-recovery-data">
      <h3 id="extension-recovery-data">{t('data')}</h3>
      <p className="ec-web-features-note" id="extension-recovery-data-description">{t('dataDetail')}</p>
      <div className="ec-web-features-setting">
        <span id="extension-recovery-data-label">{t('dataToggle')}</span>
        <Switch id="extension-recovery-data-toggle" aria-labelledby="extension-recovery-data-label"
          isSelected={state.data===true} isDisabled={!state.accountId||state.busy}
          onChange={enabled=>run('data',{enabled})}/>
      </div>
      {state.accountId&&<>
        <p role="status" data-state={state.dataState} id="extension-recovery-data-status">{t(state.dataState)}</p>
        <Button id="extension-recovery-save-data" disabled={!state.data||state.busy} onClick={()=>ask('confirmData','saveData',undefined,state.accountLabel)}>{t('saveData')}</Button>{' '}
        {state.hasData&&<Button disabled={state.busy} onClick={()=>ask('confirmRemoveData','removeData',undefined,state.accountLabel)}>{t('removeData')}</Button>}
      </>}
    </section>
    {decision&&<Confirmation open identity={decision} title={t(decision.action==='removeData'?'removeData':decision.action)}
      message={t(decision.key)} source={decision.source}
      tone={decision.action==='saveData'?'neutral':'danger'} confirmLabel={t('confirm')} cancelLabel={t('cancel')}
      onConfirm={()=>run(decision.action,decision.input)} onCancel={()=>setConfirm(null)}/>}
    {state.busy&&<p role="status">{t('loading')}</p>}
    {state.feedback&&<p role="status">{t(state.feedback)}</p>}
    {state.error&&<p role="alert">{t(state.error)}</p>}
    {reviewError&&<p role="alert">{t('reviewError')}</p>}
    {!state.loading&&!state.unavailable&&<Button id="extension-recovery-refresh" disabled={state.busy}
      onClick={()=>run('refresh')}>{t('refresh')}</Button>}
  </section>;
}

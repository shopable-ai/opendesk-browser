import {Button} from '@opendesk/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import { requestOfficial } from '../official/messages';
import type { OfficialFailure, OfficialPlan, OfficialRequest, OfficialSnapshot,
  EntitlementState } from '../official/contracts';
import { OptionsPageHeader } from './OptionsShell';

function money(plan:OfficialPlan,language:string):string {
  const rule=new Intl.NumberFormat(language,{style:'currency',currency:plan.currency});
  const factor=10 ** (rule.resolvedOptions().maximumFractionDigits ?? 2);
  return rule.format(plan.priceMinor / factor);
}
export function OfficialServicePage({onBack,chromeApplied,embedded = false}:{
  onBack:()=>void; chromeApplied:boolean; embedded?:boolean;
}) {
  const {t,locale}=useI18n();
  const [snapshot,setSnapshot]=useState<OfficialSnapshot|null>(null);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState<OfficialFailure|null>(null);
  const operation=useRef(0);
  const load=useCallback(async()=>{
    const id=++operation.current;
    const result=await requestOfficial({type:'OFFICIAL_STATUS'});
    if (operation.current!==id) return;
    if(result.ok) {setSnapshot(result.snapshot);setFailure(null);}
    else setFailure(result.failure);
  },[]);
  useEffect(()=>{
    void load();
    const onFocus=()=>{if(document.visibilityState==='visible') void load();};
    document.addEventListener('visibilitychange',onFocus);
    window.addEventListener('focus',onFocus);
    return ()=>{
      operation.current++;
      document.removeEventListener('visibilitychange',onFocus);
      window.removeEventListener('focus',onFocus);
    };
  },[load]);
  async function perform(action:OfficialRequest) {
    if(busy) return;
    setBusy(true);setFailure(null);
    const id=++operation.current;
    const response=await requestOfficial(action);
    if(id===operation.current) {
      if(response.ok) setSnapshot(response.snapshot);
      else {
        setFailure(response.failure);
        if(response.failure==='unauthorized') void load();
      }
    }
    setBusy(false);
  }
  const failures:Record<OfficialFailure,string>={
    'not-configured':t('officialErrNotConfigured'),
    offline:t('officialErrOffline'),
    'invalid-response':t('officialErrInvalidResponse'),
    unauthorized:t('officialErrUnauthorized'),
    forbidden:t('officialErrForbidden'),
    'rate-limited':t('officialErrRateLimited'),
    cancelled:t('officialErrCancelled'),
    'invalid-callback':t('officialErrInvalidCallback'),
    busy:t('officialErrBusy'),
    'invalid-plan':t('officialErrInvalidPlan'),
    unsupported:t('officialErrUnsupported'),
    'operation-failed':t('officialErrOperationFailed')
  };
  const entitlementLabels:Record<EntitlementState,string>={
    none:t('officialEntitlementNone'),active:t('officialEntitlementActive'),
    expiring:t('officialEntitlementExpiring'),expired:t('officialEntitlementExpired'),
    revoked:t('officialEntitlementRevoked'),unknown:t('officialEntitlementUnknown')
  };
  const state=snapshot;
  const account=state?.account;
  const entitlement=state?.entitlement;
  const usable=entitlement?.state==='active'||entitlement?.state==='expiring';
  const enabled=!!state?.configured&&state.availability==='online'&&!busy;
  return <section className="officialPage" aria-labelledby="official-title">
    <OptionsPageHeader className="officialHero" titleId="official-title"
      eyebrow={t('officialOptional')} title={t('officialNetwork')}
      description={t('officialIntro')}
      badge={state?.configured ? t('officialProviderConfigured') : undefined}/>
    {state?.configured && <div className="officialStateGrid" aria-label={t('officialStatusOverview')}>
      <div><small>{t('officialAccount')}</small>
        <strong>{state?.auth==='signed-in'&&account?t('officialSignedIn'):
          state?.auth==='expired'?t('officialExpiredSession'):
          state?.auth==='unknown'?t('officialUnknown'):t('officialGuest')}</strong></div>
      <div><small>{t('officialSubscription')}</small>
        <strong>{entitlement?entitlementLabels[entitlement.state]:t('officialEntitlementUnknown')}</strong></div>
      <div><small>{t('officialBrowserControl')}</small>
        <strong>{chromeApplied?t('officialChromeHasRoute'):t('officialNoChromeRoute')}</strong></div>
    </div>}
    {state?.configured && <p className="officialCaution">{t('officialStateSeparation')}</p>}
    {!state && !failure && <p role="status">{t('officialLoading')}</p>}
    {state && !state.configured && <div className="officialEmpty">
      <h3>{t('officialNotLaunched')}</h3>
      <p>{t('officialNoProviderDesc')}</p>
      {!embedded && <Button variant="primary" className="primary" onClick={onBack}>{t('officialReturnFree')}</Button>}
    </div>}
    {state?.configured && <>
      {state.availability==='error' && <p className="notice" role="status">
        {failures[state.failure??'offline']}</p>}
      {state.auth!=='signed-in' && <div className="officialSection">
        <div className="officialSectionHead"><div>
          <h3>{t('officialLoginTitle')}</h3>
          <p className="hint">{t('officialLoginDesc')}</p>
        </div></div>
        <div className="officialActions">
          <Button variant="primary" className="primary" disabled={!enabled} onClick={()=>void perform({type:'OFFICIAL_LOGIN'})}>
            {t('officialLogin')}</Button>
          <Button disabled={busy} onClick={()=>void perform({type:'OFFICIAL_REGISTER'})}>
            {t('officialRegister')}</Button>
          <Button disabled={busy} onClick={()=>void load()}>{t('officialRefresh')}</Button>
        </div>
      </div>}
      {state.auth==='signed-in' && account && <div className="officialSection">
        <div className="officialSectionHead">
          <div><h3>{t('officialAccount')}</h3>
            <p className="hint">{account.displayName} · {account.email}</p></div>
          <div className="officialActions">
            <Button disabled={busy} onClick={()=>void perform({type:'OFFICIAL_MANAGE'})}>
              {t('officialManage')}</Button>
            <Button disabled={busy} onClick={()=>void perform({type:'OFFICIAL_LOGOUT'})}>
              {t('officialLogout')}</Button>
          </div>
        </div>
        <div className="officialEntitlement">
          <div><small>{t('officialCurrentPlan')}</small>
            <strong>{entitlement?.planName??entitlementLabels[entitlement?.state??'unknown']}</strong>
            <span className="hint">{entitlementLabels[entitlement?.state??'unknown']}</span></div>
          <div><small>{t('officialExpires')}</small>
            <strong>{entitlement?.expiresAt?
              new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(entitlement.expiresAt):'—'}</strong>
            <span className="hint">{entitlement?.autoRenew===undefined?'—':
              entitlement.autoRenew?t('officialAutoRenewOn'):t('officialAutoRenewOff')}</span></div>
          {entitlement?.remainingBytes!==undefined&&<div>
            <small>{t('officialRemaining')}</small>
            <strong>{new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(
              entitlement.remainingBytes/1_000_000_000)} GB</strong>
          </div>}
        </div>
      </div>}
      {state.checkout!=='none' && <p className="notice" role="status">
        {state.checkout==='pending'?t('officialCheckoutPending'):
          state.checkout==='failed'?t('officialCheckoutFailed'):
          state.checkout==='cancelled'?t('officialCheckoutCancelled'):
          t('officialCheckoutUnverified')}
      </p>}
      <div className="officialSection">
        <div className="officialSectionHead">
          <div><h3>{t('officialPlans')}</h3>
            <p className="hint">{t('officialPlansDesc')}</p></div>
          <Button disabled={busy} onClick={()=>void load()}>{t('officialRefresh')}</Button>
        </div>
        {!state.plans.length ? <p className="officialMuted">{t('officialNoPlans')}</p> :
          <div className="officialPlanGrid">
            {state.plans.map(plan=><article key={plan.id} className="officialPlan">
              <small>{plan.period==='month'?t('officialMonth'):t('officialYear')}</small>
              <h3>{plan.name}</h3>
              <strong>{money(plan,locale)}</strong>
              <Button disabled={!enabled||state.auth!=='signed-in'}
                onClick={()=>void perform({type:'OFFICIAL_CHECKOUT',planId:plan.id})}>
                {t('officialCheckout')}</Button>
            </article>)}
          </div>}
        <p className="hint">{t('officialPaymentSafety')}</p>
      </div>
      {state.auth==='signed-in' && <div className="officialSection">
        <div className="officialSectionHead"><div>
          <h3>{t('officialLines')}</h3><p className="hint">{t('officialLinesDesc')}</p>
        </div></div>
        {!usable ? <p className="officialMuted">{t('officialNoEntitlementLines')}</p>:
          !state.lines.length?<p className="officialMuted">{t('officialNoLines')}</p>:
          <div className="officialLines">
            {state.lines.map(line=><div className="officialLine" key={line.id}>
              <div><strong>{line.name}</strong>
                <small>{line.region} · {line.protocol.toUpperCase()}</small></div>
              <span className="hint">{line.browserCompatible?
                t('officialNeedsGateway'):t('officialUnsupportedProtocol')}</span>
              <Button disabled title={t('officialConnectDisabled')}>{t('officialConnect')}</Button>
            </div>)}
          </div>}
        <p className="hint">{t('officialConnectDisabled')}</p>
      </div>}
    </>}
    {failure && <p className="notice error" role="alert">{failures[failure]}</p>}
    <div className="officialFooter">
      <p>{t('officialFreeUnaffected')}</p>
      {state?.configured && !embedded && <Button onClick={onBack}>{t('officialReturnFree')}</Button>}
    </div>
  </section>;
}

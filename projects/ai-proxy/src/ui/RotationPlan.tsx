import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import { PUBLIC_CONFIG_STORAGE_KEY, safePublicUrl } from '../config/public-config';
import demoLinks from '../config/product-links.demo.json';
import { loadPublicConfig } from '../config/remote-config';
import { ClearableInput } from './ProxyEntry';
import type { ProxyEndpoint } from '../domain/types';
import { clearRotationPlan, readRotationPlan, saveRotationPlan,
  type RotationPlan } from '../collector/rotation-plan';

export function RotationEntry() {
  const { t } = useI18n();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const config = await loadPublicConfig();
        const official = safePublicUrl(config.links.collector);
        // The local demo is opt-in for dev/demo builds and never trusts remote JSON.
        let verified = official;
        if (import.meta.env.DEV || (import.meta.env.MODE === 'demo' && import.meta.env.WXT_PUBLIC_COLLECTOR_DEMO === '1')) {
          verified ??= safePublicUrl(demoLinks.links.collector, ['example.com']);
        }
        if (active) setHref(verified);
      } catch { if (active) setHref(null); }
    };
    void read();
    const changed = (changes: Record<string, any>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes,PUBLIC_CONFIG_STORAGE_KEY)) void read();
    };
    getEnvironment().storage.onChanged.addListener(changed);
    return () => { active = false; getEnvironment().storage.onChanged.removeListener(changed); };
  }, []);
  if (!href) return null;
  return <a className="r93CollectorLink" href={href} target="_blank" rel="noopener noreferrer"
    aria-label={t('r93CollectorNewTabAria')}>
    <span>{t('r83RotationTitle')}</span><span aria-hidden="true">↗</span>
  </a>;
}

const initialDraft = {targetHost:'',threshold:'3',maxAttempts:'12',intervalMs:'1000',
  endpointIds:[] as string[]};

export function RotationSettings({endpoints}:{endpoints: ProxyEndpoint[]}) {
  const {t} = useI18n();
  const details = useRef<HTMLDetailsElement>(null);
  const [plan, setPlan] = useState<RotationPlan | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let mounted = true;
    void readRotationPlan().then(saved => {
      if (!mounted) return;
      setPlan(saved);
      if (saved && !getEnvironment().isDraftDirty('rotation')) setDraft({targetHost:saved.targetHost,threshold:String(saved.threshold),
        maxAttempts:String(saved.maxAttempts),intervalMs:String(saved.intervalMs),
        endpointIds:[...saved.endpointIds]});
    }).catch(() => { if (mounted) setError(t('r83RotationLoadFailed')); });
    return () => { mounted = false; };
  }, [t]);
  useEffect(() => {
    const navigation = getEnvironment().navigation;
    const show = () => {
      if (!navigation.getRoute().startsWith('#/profiles/rotation')) return;
      if (details.current) details.current.open = true;
      requestAnimationFrame(() => details.current?.scrollIntoView({block:'start',behavior:'auto'}));
    };
    show();
    return navigation.subscribe(show);
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revision=getEnvironment().getDraftRevision('rotation');
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveRotationPlan({
        targetHost:draft.targetHost, threshold:Number(draft.threshold),
        maxAttempts:Number(draft.maxAttempts), intervalMs:Number(draft.intervalMs),
        endpointIds:draft.endpointIds
      }, endpoints, approved);
      if(!getEnvironment().setDraftDirty(false,'rotation',revision))return;
      setPlan(saved); setApproved(false); setNotice(t('r83RotationSaved'));
      setDraft(prev => ({...prev,targetHost:saved.targetHost}));
    } catch { setError(t('r83RotationInvalid')); }
    finally { setBusy(false); }
  }
  async function clear() {
    const revision=getEnvironment().getDraftRevision('rotation');
    setBusy(true); setError(''); setNotice('');
    try {
      await clearRotationPlan();
      if(!getEnvironment().setDraftDirty(false,'rotation',revision))return;
      setPlan(null); setDraft(initialDraft); setApproved(false);
      setNotice(t('r83RotationCleared'));
    } catch { setError(t('r83RotationSaveFailed')); }
    finally { setBusy(false); }
  }
  const selected = new Set(draft.endpointIds);
  const missing = draft.endpointIds.some(id => !endpoints.some(ep => ep.id === id));
  return <details className="r83RotationSettings" id="r83-rotation-settings" ref={details}
      data-testid="r83-rotation-settings">
    <summary><strong>{t('r83RotationTitle')}</strong> <span>{t('r83RotationConfigure')}</span></summary>
    <div className="r83RotationBody">
      <p className="hint">{t('r83RotationIntro')}</p>
      <p className="notice">{t('r83RotationScopeWarning')}</p>
      <p className="notice">{t('r83RotationUnavailable')}</p>
      <form data-draft-scope="rotation" onSubmit={e => void save(e)} className="r83RotationForm">
        <div className="r83RotationFields">
          <div className="r83RotationFull"><label htmlFor="r83-target-host">{t('r83RotationTarget')}</label>
            <ClearableInput id="r83-target-host" required spellCheck={false} fieldLabel={t('r83RotationTarget')}
              value={draft.targetHost} placeholder="example.com"
              onValueChange={targetHost=>setDraft({...draft,targetHost})}/></div>
          <div><label htmlFor="r83-threshold">{t('r83RotationThreshold')}</label>
            <input id="r83-threshold" type="number" min={1} max={1000} required
              value={draft.threshold} onChange={e => setDraft({...draft,threshold:e.target.value})}/></div>
          <div><label htmlFor="r83-max-attempts">{t('r83RotationLimit')}</label>
            <input id="r83-max-attempts" type="number" min={1} max={10000} required
              value={draft.maxAttempts} onChange={e => setDraft({...draft,maxAttempts:e.target.value})}/></div>
          <div className="r83RotationFull"><label htmlFor="r83-interval">{t('r83RotationInterval')}</label>
            <input id="r83-interval" type="number" min={100} max={60000} required
              value={draft.intervalMs} onChange={e => setDraft({...draft,intervalMs:e.target.value})}/></div>
        </div>
        <fieldset className="r83RotationPool">
          <legend>{t('r83RotationPool')}</legend>
          {endpoints.length === 0 && <p className="hint">{t('r83RotationNeedProxies')}</p>}
          {endpoints.map(ep => <label key={ep.id}>
            <input type="checkbox" checked={selected.has(ep.id)}
              onChange={e => setDraft(prev => ({...prev, endpointIds:e.target.checked
                ? [...prev.endpointIds,ep.id] : prev.endpointIds.filter(id => id!==ep.id)}))}/>
            <span>{ep.name} <small>{ep.scheme.toUpperCase()} · {ep.host}:{ep.port}</small></span>
          </label>)}
          {missing && <p role="alert" className="notice error">{t('r83RotationMissingProxy')}</p>}
        </fieldset>
        <label className="r83RotationConsent">
          <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>
          <span>{t('r83RotationConsent')}</span></label>
        <div className="actions">
          <Button variant="primary" className="primary" type="submit"
            disabled={busy || !approved || draft.endpointIds.length < 2 || missing}>{t('r83RotationSave')}</Button>
          <Button type="button" disabled={busy || !plan} onClick={() => void clear()}>
            {t('r83RotationClear')}</Button>
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p role="status" className="popupSavedHint">{notice}</p>}
        {plan && <p className="hint">{t('r83RotationSummary',{
          domain:plan.targetHost,threshold:plan.threshold,limit:plan.maxAttempts})}</p>}
      </form>
      <p className="hint">{t('r83RotationNoExecution')}</p>
    </div>
  </details>;
}

import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {getEnvironment} from '../environment';
import {useI18n} from '../i18n/LocaleProvider';
import {ProxyIcon} from './ProxyIcon';
import type {UiLocalePreference} from '../i18n/locale';

export const STATUS_DISPLAY_KEY='ai-proxy.show-status-on-open.v1';
// A UI preference only. All proxy commands and runtime warnings remain separate.
export function useStatusDisplay() {
  const env=getEnvironment();
  const [show,setShow]=useState(true),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(false),[saved,setSaved]=useState(false);
  const session=useRef({alive:false,ready:false,writing:false,failed:false,revision:0,show:true});
  const renderedSession=session.current;
  useEffect(()=>{
    const current={alive:true,ready:false,writing:false,failed:false,revision:0,show:true};
    session.current=current;
    setShow(true);setReady(false);setBusy(false);setError(false);setSaved(false);
    void env.storage.local.get(STATUS_DISPLAY_KEY).then(items=>{
      if(current.alive){
        // A cross-surface change is newer than the initial storage snapshot.
        if(current.revision===0){current.show=items[STATUS_DISPLAY_KEY]!==false;setShow(current.show);}
        current.ready=true;setReady(true);
      }
    }).catch(()=>{if(current.alive){current.failed=true;setError(true);}});
    const changed=(changes:any,area:string)=>{
      if(area==='local'&&changes[STATUS_DISPLAY_KEY]&&current.alive){
        const next=changes[STATUS_DISPLAY_KEY].newValue!==false;
        if(current.show!==next)setSaved(false);
        current.revision++;current.show=next;setShow(next);
      }
    };
    env.storage.onChanged.addListener(changed);
    return()=>{current.alive=false;env.storage.onChanged.removeListener(changed);};
  },[env]);
  async function save(next:boolean){
    const current=renderedSession;
    if(current!==session.current||!current.alive||!current.ready||current.failed||current.writing)return;
    const revision=current.revision;current.writing=true;setBusy(true);setError(false);setSaved(false);
    try{
      await env.storage.local.set({[STATUS_DISPLAY_KEY]:next});
      if(current.alive){
        // The adapter may emit our own event or a newer cross-surface change
        // before acknowledging this write. Only an unchanged revision can set UI.
        if(current.revision===revision){current.show=next;setShow(next);}
        setSaved(current.show===next);
      }
    }
    catch{if(current.alive){current.failed=true;current.ready=false;setError(true);setReady(false);}}
    finally{current.writing=false;if(current.alive)setBusy(false);}
  }
  return {show,ready,busy,error,saved,save};
}
export function PcPreferences(){
  const {t,preference,setPreference}=useI18n();
  const display=useStatusDisplay();
  const [languageError,setLanguageError]=useState(false);
  return <>
    <article className="record languageRecord"><ProxyIcon name="globe"/><div><strong>{t('interfaceLanguage')}</strong><small>{t('languageHelp')}</small></div>
      <select aria-label={t('interfaceLanguage')} value={preference} onChange={event=>{setLanguageError(false);void setPreference(event.target.value as UiLocalePreference).catch(()=>setLanguageError(true));}}>
        <option value="auto">{t('pcAutoLanguage')}</option><option value="zh-CN">{t('simplifiedChinese')}</option><option value="zh-TW">{t('traditionalChinese')}</option><option value="en">{t('englishLanguage')}</option>
      </select></article>
    {languageError&&<p role="alert">{t('languageSettingFailure')}</p>}
    <article className="record"><ProxyIcon name="refresh"/><div><strong><label htmlFor="show-status-on-open">{t('pcShowStatus')}</label></strong><small>{t('pcShowStatusHelp')}</small></div>
      <input id="show-status-on-open" className="pcPreferenceSwitch" type="checkbox" checked={display.show} disabled={!display.ready||display.busy} onChange={event=>void display.save(event.target.checked)}/></article>
    {display.error&&<p role="alert">{t('pcPreferenceFailed')}</p>}
    {display.saved&&<p className="settingsCopyFeedback" role="status">{t('pcPreferenceSaved')}</p>}
  </>;
}

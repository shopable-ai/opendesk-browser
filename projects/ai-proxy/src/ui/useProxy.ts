import {useCallback,useEffect,useRef,useState} from 'react';
import {getEnvironment} from '../environment';
import {useI18n} from '../i18n/LocaleProvider';
import {translate,type TranslationKey,type TranslationParameters} from '../i18n/locale';
import {localizedBackendError} from '../i18n/errors';
import {errorCodeOf,type ErrorCode} from '../domain/error-codes';
import {confirmedRouteMode} from './Status';
import type {RouteSelection} from '../domain/types';

type UiError = {source:'backend';message:string;code?:ErrorCode;operation?:true}
 | {source:'local';message:string}
 | {source:'key';key:TranslationKey;params?:TranslationParameters};

const SYNC_NOTICE_DELAY_MS=400;

export function useProxy(){
 const {locale}=useI18n();
 const env=getEnvironment(),[state,setState]=useState<any>(null),[errorState,setErrorState]=useState<UiError|null>(null),[busy,setBusy]=useState(false),lock=useRef(false),alive=useRef(true);
 const [routeFeedback,setRouteFeedback]=useState<TranslationKey|null>(null);
 const [routeTarget,setRouteTarget]=useState<RouteSelection|null>(null);
 const [syncing,setSyncing]=useState(false),syncRevision=useRef(0),syncingRef=useRef(false);
 const [slowSync,setSlowSync]=useState(false);
 const error=errorState?.source==='backend'?localizedBackendError(locale,errorState.message,errorState.code)
  :errorState?.source==='key'?translate(locale,errorState.key,errorState.params):errorState?.message??'';
 const setError=useCallback((message:string)=>setErrorState(message?{source:'local',message}:null),[]);
 const setErrorKey=useCallback((key:TranslationKey,params?:TranslationParameters)=>setErrorState({source:'key',key,params}),[]);
 const clearErrorKey=useCallback((key:TranslationKey)=>setErrorState(previous=>
  previous?.source==='key'&&previous.key===key
   ? null
   : previous
 ),[]);
 const refresh=useCallback(async()=>{
  try{
   const r=await env.request({type:'GET_STATE'});
   if(!alive.current)return;
   if(r.ok){
    setState(r.state);
    setErrorState(previous=>previous?.source==='backend'&&!previous.operation?null:previous);
    return r.state;
   }else setErrorState(previous=>previous?.source==='backend'&&previous.operation?previous:{source:'backend',message:r.error,code:r.errorCode});
  }catch(e){
   const message=e instanceof Error?e.message:'发生未知错误';
   if(alive.current)setErrorState(previous=>previous?.source==='backend'&&previous.operation?previous:{source:'backend',message,code:errorCodeOf(message)});
  }
 },[env]);
 // Both installed surfaces read the same CAS-protected configuration. Resume a
 // backgrounded surface with a fresh GET_STATE, without rebasing unsaved drafts
 // or replaying APPLY/STOP (those require an explicit trusted user gesture).
 useEffect(()=>{
  alive.current=true;
  void refresh();
  const off=env.service.subscribe(()=>void refresh());
  let syncNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  const syncSavedConfig=()=>{
   if(lock.current||env.hasDrafts?.())return;
   const revision=++syncRevision.current;
   if(!syncingRef.current){
    syncingRef.current=true;setSyncing(true);
    syncNoticeTimer=setTimeout(()=>setSlowSync(true),SYNC_NOTICE_DELAY_MS);
   }
   void refresh().finally(()=>{
    if(revision!==syncRevision.current||!alive.current)return;
    clearTimeout(syncNoticeTimer);
    syncingRef.current=false;setSyncing(false);setSlowSync(false);
   });
  };
  const resume=()=>{
   if(typeof document!=='undefined'&&document.visibilityState==='hidden')return;
   if(!lock.current&&!env.hasDrafts?.()) void refresh();
  };
  env.events?.addEventListener('ai-proxy-storage-changed',syncSavedConfig);
  if(typeof window!=='undefined')window.addEventListener('focus',resume);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',resume);
  return()=>{
   clearTimeout(syncNoticeTimer);++syncRevision.current;syncingRef.current=false;
   alive.current=false;off?.();
   env.events?.removeEventListener('ai-proxy-storage-changed',syncSavedConfig);
   if(typeof window!=='undefined')window.removeEventListener('focus',resume);
   if(typeof document!=='undefined')document.removeEventListener('visibilitychange',resume);
  };
 },[env,refresh]);
 const act=useCallback(async(message:any)=>{
  if(lock.current||syncingRef.current)return null;
  lock.current=true;setBusy(true);
  const switching=message.type==='SWITCH_ROUTE'||message.type==='APPLY';
  setRouteTarget(message.type==='SWITCH_ROUTE'?message.selection:null);
  setRouteFeedback(switching?'connectionSwitching':null);
  const cancelled=async()=>{
   const current=await refresh();
   if(alive.current&&switching)setRouteFeedback(current?.runtime?.applied?'connectionCancelledActive':
    current?.runtime&&confirmedRouteMode(current.runtime)==='system'?'connectionCancelledSystem':'connectionCancelled');
  };
  try{
   const r=await env.request(message);
   if(!alive.current)return null;
   if(r.ok){setState(r.state);setErrorState(null);return r;}
   if(r.errorCode==='E_CANCELLED'){await cancelled();return null;}
   setErrorState({source:'backend',message:r.error,code:r.errorCode,operation:true});
   const current=await refresh();
   if(alive.current&&current&&switching&&r.errorCode==='E_CONFLICT')
     setErrorState({source:'key',key:'connectionConfigChanged'});
   return null;
  }catch(e){
   if(alive.current){
    if(e&&typeof e==='object'&&'code' in e&&e.code==='E_CANCELLED'){
     await cancelled();return null;
    }
    const message=e instanceof Error?e.message:'发生未知错误';
    setErrorState({source:'backend',message,code:errorCodeOf(message),operation:true});
    await refresh();
   }
   return null;
  }finally{lock.current=false;if(alive.current){
   setBusy(false);
   setRouteTarget(null);
   setRouteFeedback(previous=>previous==='connectionSwitching'?null:previous);
  }}
 },[env,refresh]);
 return {state,error,busy:busy||syncing,operationBusy:busy,syncing,slowSync:syncing&&slowSync,routeFeedback,routeTarget,act,refresh,setError,setErrorKey,clearErrorKey};
}

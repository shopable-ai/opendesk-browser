import {useCallback,useEffect,useRef,useState} from 'react';
import {getEnvironment} from '../environment';
import {useI18n} from '../i18n/LocaleProvider';
import {translate,type TranslationKey,type TranslationParameters} from '../i18n/locale';
import {localizedBackendError} from '../i18n/errors';
import {errorCodeOf,type ErrorCode} from '../domain/error-codes';

type UiError = {source:'backend';message:string;code?:ErrorCode;operation?:true}
 | {source:'local';message:string}
 | {source:'key';key:TranslationKey;params?:TranslationParameters};

export function useProxy(){
 const {locale}=useI18n();
 const env=getEnvironment(),[state,setState]=useState<any>(null),[errorState,setErrorState]=useState<UiError|null>(null),[busy,setBusy]=useState(false),lock=useRef(false),alive=useRef(true);
 const error=errorState?.source==='backend'?localizedBackendError(locale,errorState.message,errorState.code)
  :errorState?.source==='key'?translate(locale,errorState.key,errorState.params):errorState?.message??'';
 const setError=useCallback((message:string)=>setErrorState(message?{source:'local',message}:null),[]);
 const setErrorKey=useCallback((key:TranslationKey,params?:TranslationParameters)=>setErrorState({source:'key',key,params}),[]);
 const refresh=useCallback(async()=>{
  try{
   const r=await env.request({type:'GET_STATE'});
   if(!alive.current)return;
   if(r.ok){
    setState(r.state);
    setErrorState(previous=>previous?.source==='backend'&&!previous.operation?null:previous);
   }else setErrorState(previous=>previous?.source==='backend'&&previous.operation?previous:{source:'backend',message:r.error,code:r.errorCode});
  }catch(e){
   const message=e instanceof Error?e.message:'发生未知错误';
   if(alive.current)setErrorState(previous=>previous?.source==='backend'&&previous.operation?previous:{source:'backend',message,code:errorCodeOf(message)});
  }
 },[env]);
 useEffect(()=>{alive.current=true;void refresh();const off=env.service.subscribe(()=>void refresh());return()=>{alive.current=false;off?.();};},[refresh]);
 const act=useCallback(async(message:any)=>{
  if(lock.current)return null;
  lock.current=true;setBusy(true);
  try{
   const r=await env.request(message);
   if(!alive.current)return null;
   if(r.ok){setState(r.state);setErrorState(null);return r;}
   setErrorState({source:'backend',message:r.error,code:r.errorCode,operation:true});
   await refresh();return null;
  }catch(e){
   if(alive.current){
    const message=e instanceof Error?e.message:'发生未知错误';
    setErrorState({source:'backend',message,code:errorCodeOf(message),operation:true});
    await refresh();
   }
   return null;
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 },[env,refresh]);
 return {state,error,busy,act,refresh,setError,setErrorKey};
}

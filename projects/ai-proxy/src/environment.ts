// Project service boundary. No chrome global or privileged implementation is imported here.
import {createProxyService} from './service';
import {freshConfig,validateConfig} from './domain/config';
import {toManagedRoute,configForManagedRoute} from './domain/managed-config';
import {createNavigation} from './ui/navigation';
import {OPTIONS_SECTIONS} from './ui/optionsRoute';
let environment:any;
const fail=(code:string,message:string):never=>{throw Object.assign(Error(message),{code});};
// JSON object member order is not storage identity; array order remains significant.
const comparableJson=(value:any)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
 ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
export function getEnvironment(){if(!environment)throw Error('AI Proxy environment missing');return environment;}
export type ConfirmOptions={title:string;message:string;confirmLabel:string;cancelLabel?:string;tone?:'neutral'|'danger'};
export type ConfirmResult={action:'confirm'}|{action:'cancel';reason:'user'|'escape'|'aborted'|'invalidated'|'expired'};
export type ConfirmationUI={confirm:(options:ConfirmOptions,client?:{signal?:AbortSignal})=>Promise<ConfirmResult>};
export function configureEnvironment(bridge:any,sdk:any,{trusted=false,preview:previewBoundary=null,ui=bridge?.ui}: {trusted?:boolean,preview?:any,ui?:ConfirmationUI}={}){
 if(environment)throw Error('E_AI_PROXY_ALREADY_MOUNTED');
 // Only the separate preview entry may supply a mock. main.jsx never does.
 const preview=previewBoundary;
 let uiDirty=false,pending=0,disposed=false,outcomeUnknown=false;
 const assertLive=()=>{if(disposed)fail('E_TOOL_CHANGED','AI Proxy 会话已关闭；不要重放未确认操作。');};
 const uiState=()=>{if(!disposed){const state={dirty:uiDirty,busy:pending>0||outcomeUnknown};bridge?.setState?.(state);events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:state}));}};
 const events=new EventTarget();
 const drafts=new Map<string,number>();
 const draftBases=new Map<string,{etag:string}>();
 let configEtag:string|undefined;
 const beginDraft=(source:string,pairedEtag=configEtag)=>{
  if(pairedEtag!==undefined&&!draftBases.has(source))draftBases.set(source,{etag:pairedEtag});
 };
 let draftRevision=0;
 const publishDrafts=()=>{uiDirty=drafts.size>0;uiState();events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:uiDirty}));};
 const setDraftDirty=(value:boolean,source='legacy',revision?:number)=>{
  if(disposed)return;
  if(value){beginDraft(source);drafts.set(source,++draftRevision);}
  else if(revision===undefined||(drafts.get(source)??0)===revision){drafts.delete(source);draftBases.delete(source);}
  else return false;
  publishDrafts();return true;
 };
 const pageHint=bridge?.initialPage;
 const knownSection=pageHint?.view==='settings'&&OPTIONS_SECTIONS.some(section=>section===pageHint.section);
 const navigation=createNavigation({initialRoute:knownSection?'#/'+pageHint.section:trusted?'':location.hash});
 // One adapter for the trusted pilot and the public sandbox bridge.
 const navigationBridge=bridge?.toolNavigation??bridge;
 const navigationSubscriptions=new Set<()=>void>();
 const toolNavigation={
  setNavigation(base:any,headerActions:any[]){
   if(disposed||typeof navigationBridge?.setNavigation!=='function')return false;
   if(navigationBridge.navigationFeatures?.headerActions===true){
    if(navigationBridge.setNavigation({...base,headerActions})!==false)return true;
   }
   navigationBridge.setNavigation(base);return false;
  },
  subscribe(handler:(detail:any)=>unknown){
   if(disposed)return ()=>{};
   let active=true;
   const deliver=(detail:any)=>{if(active&&!disposed)return handler(detail);};
   let release:()=>void;
   if(typeof navigationBridge?.subscribe==='function')release=navigationBridge.subscribe(deliver);
   else {
    const listener=(event:any)=>deliver(event.detail);
    bridge?.root?.addEventListener('opendesk-tool-navigation',listener);
    release=()=>bridge?.root?.removeEventListener('opendesk-tool-navigation',listener);
   }
   const unsubscribe=()=>{if(!active)return;active=false;release?.();navigationSubscriptions.delete(unsubscribe);};
   navigationSubscriptions.add(unsubscribe);return unsubscribe;
  },
  isLocked:()=>disposed||uiDirty||pending>0||outcomeUnknown
 };
 const configKey='ai-proxy.full-config.v2';
 const entries=new Map<string,any>(),listeners=new Set<Function>();
 const changed={addListener(fn:Function){listeners.add(fn);},removeListener(fn:Function){listeners.delete(fn);}};
 const emit=(changes:any)=>{for(const fn of listeners)fn(changes,'local');};
 const read=async(key:string)=>{
  assertLive();
  if(preview)return preview.read(key);
  const r=await bridge.request('storage.get',{key,withEtag:true});
  assertLive();
  if(!r||!Object.hasOwn(r,'value')||typeof r.etag!=='string'||!r.etag)fail('E_OUTCOME_UNKNOWN','Storage read not confirmed');
  entries.set(key,r.etag);return r.value;
 };
 const write=async(key:string,value:any)=>{
  assertLive();
  if(preview)return preview.write(key,value);
  if(!entries.has(key))await read(key);
  assertLive();
  const serialized=JSON.stringify(value);
  if(new TextEncoder().encode(serialized).length>8192)fail('E_QUOTA','配置超过当前受管存储的 8 KiB 单项额度；未保存。');
  const r=await bridge.request('storage.set',{key,value:JSON.parse(serialized),ifMatch:entries.get(key)});
  assertLive();
  if(r?.saved!==true)fail('E_OUTCOME_UNKNOWN','Storage write outcome unknown; do not replay');
  const committed=await read(key);
  if(comparableJson(committed)!==comparableJson(JSON.parse(serialized)))fail('E_CONFLICT','配置在保存后已改变，请重新读取；未重放写入。');
  emit({[key]:{newValue:committed}});
 };
 const managed=()=>{assertLive();return sdk?.browser?.proxy?.managed??fail('E_NOT_CONNECTED','OpenDesk 受管代理服务未接入');};
 let loadedConfig:any=null;
 const observedStatus=(value:any,config=loadedConfig)=>{
  assertLive();
  if(!value||!Object.hasOwn(value,'activeConfig'))return value;
  return {...value,activeConfig:value.state==='enabled'&&value.control==='controlled_by_this_extension'&&
   value.permission!==false&&config?configForManagedRoute(config,value.activeConfig):null};
 };
 const service=createProxyService(preview?{...preview.service,validateApply:toManagedRoute}:{
  async load(){const raw=await read(configKey);loadedConfig=raw==null?freshConfig():validateConfig(raw);return {config:loadedConfig,etag:entries.get(configKey)};},
  async save(config:any,etag:string){if(etag!==entries.get(configKey))fail('E_CONFLICT','配置已改变，请重新读取');await write(configKey,config);return entries.get(configKey);},
  status:async()=>observedStatus(await managed().getStatus()),
  validateApply:toManagedRoute,
  async apply(config:any){
   return observedStatus(await managed().requestEnable({config:toManagedRoute(config)}),config);
  },stop:async()=>observedStatus(await managed().requestDisable())
 });
 const storage={onChanged:changed,local:{
  async get(key:string){return {[key]:await read(key)};},
  async set(items:any){for(const [key,value]of Object.entries(items)){await write(key,value);emit({[key]:{newValue:value}});}},
  async remove(key:string){await write(key,null);emit({[key]:{newValue:null}});}
 }};
 const proxyListeners=new Map<Function,Function>();
 let confirmHandler:any=null;
 let confirmation:AbortController|null=null;
 const route=(hash:string)=>navigation.navigate(hash);
 let quickView:any=null;
 const pageChanged=()=>events.dispatchEvent(new Event('ai-proxy-page-changed'));
 bridge?.root?.addEventListener('opendesk-page-changed',pageChanged);
 const current={service,storage,navigation,toolNavigation,events,trusted,preview:!!preview,request:async(m:any)=>{
   assertLive();
   const mutation=!['GET_STATE','GET_DIAGNOSTICS','GET_USAGE','EXPORT'].includes(m.type);
   if(mutation){pending++;uiState();}
   try{
    const draftWrites=['SAVE_ENDPOINT','SAVE_LOCAL_CLIENT','SAVE_SUBSCRIPTION','DELETE_SUBSCRIPTION','DELETE_ENDPOINT',
     'SAVE_PROFILE','DELETE_PROFILE','SAVE_RULE','DELETE_RULE','SET_DEFAULT','SELECT','SELECT_AND_APPLY','IMPORT'];
    const scopes=draftWrites.includes(m.type)?(m.draftScope?[m.draftScope]:[...drafts.keys()]):[];
    const captured=scopes.map(source=>[source,draftBases.get(source)] as const);
    const bases=captured.map(([,base])=>base?.etag).filter((base):base is string=>base!==undefined);
    // A refresh must not silently rebase an editor's old inputs onto new storage.
    const expected=bases[0];
    if(bases.some(base=>base!==expected))fail('E_CONFLICT','草稿基线不同，请重新打开编辑器。');
    const r=await service.request(expected===undefined?m:{...m,ifMatch:m.ifMatch??expected});assertLive();
    if(r?.ok===true&&typeof r.state?.configEtag==='string'){
     configEtag=r.state.configEtag;
     for(const [source,base]of captured)
      if(base&&draftBases.get(source)===base)base.etag=configEtag;
    }
    const previous=outcomeUnknown;
    if(r?.ok===false&&(r.errorCode==='E_OUTCOME_UNKNOWN'||r.runtime?.outcomeUnknown===true))outcomeUnknown=true;
    if(r?.ok===true){
     if(r.state?.runtime?.outcomeUnknown===true)outcomeUnknown=true;
     // Only the service's status/release reconciliation can confirm recovery.
     // A successful edit/export is not evidence that an earlier effect is known.
     else if(['GET_STATE','STOP'].includes(m.type)&&r.state?.runtime?.outcomeUnknown===false)outcomeUnknown=false;
    }
    if(previous!==outcomeUnknown)uiState();
    return r;
   }
   finally{if(mutation){pending--;uiState();}}
  },
  locale:bridge?.locale||navigator.language,
  proxy:{settings:{onChange:{addListener(fn:Function){if(!proxyListeners.has(fn))proxyListeners.set(fn,service.subscribe(fn));},removeListener(fn:Function){proxyListeners.get(fn)?.();proxyListeners.delete(fn);}}}},
  setConfirmHandler:(fn:any)=>{
   if(disposed)return ()=>{};
   if(confirmHandler!==fn)confirmation?.abort();
   confirmHandler=fn;
   return ()=>{if(confirmHandler===fn){confirmation?.abort();confirmHandler=null;}};
  },
  // Boolean business adapter: only an explicit confirm result permits continuation.
  // Every rejection is consumed here, including late service/local-handler failures.
  confirm(text:string,client?:{signal?:AbortSignal}){
   if(disposed||confirmation||client?.signal?.aborted)return Promise.resolve(false);
   if(typeof ui?.confirm!=='function'&&!confirmHandler)return Promise.resolve(false);
   const controller=new AbortController();confirmation=controller;
   pending++;uiState();
   return new Promise<boolean>(resolve=>{
    let settled=false;
    const finish=(accepted:boolean)=>{
     if(settled)return;settled=true;
     clearTimeout(timer);client?.signal?.removeEventListener('abort',abort);
     controller.signal.removeEventListener('abort',cancel);
     if(confirmation===controller)confirmation=null;
     pending--;uiState();resolve(accepted&&!disposed);
     // Release the original local/host UI after recording the first terminal result.
     controller.abort();
    };
    const cancel=()=>finish(false),abort=()=>controller.abort();
    const timer=setTimeout(cancel,120000);
    controller.signal.addEventListener('abort',cancel,{once:true});
    client?.signal?.addEventListener('abort',abort,{once:true});
    const local=()=>{
     if(settled||!confirmHandler){finish(false);return;}
     try{Promise.resolve(confirmHandler(text,{signal:controller.signal})).then(value=>finish(value===true),()=>finish(false));}
     catch{finish(false);}
    };
    if(typeof ui?.confirm!=='function'){local();return;}
    const english=(bridge?.locale||navigator.language||'').startsWith('en');
    const options:ConfirmOptions={title:english?'Confirm':'确认',message:text,
     confirmLabel:english?'Confirm':'确认',cancelLabel:english?'Cancel':'取消'};
    try{
     Promise.resolve(ui.confirm(options,{signal:controller.signal})).then(
      value=>finish(value?.action==='confirm'),
      error=>{if(error?.code==='E_UI_CONFIRM_UNAVAILABLE')local();else finish(false);}
     );
    }catch(error:any){if(error?.code==='E_UI_CONFIRM_UNAVAILABLE')local();else finish(false);}
   });
  },
  setNavigationGuard:navigation.setGuard,navigate:route,openSettings:()=>route('#/profiles'),
  surface:bridge?.surface==='page'?'page':'sidebar',
  openOwnPage:(target:any)=>typeof bridge?.openOwnPage==='function'?bridge.openOwnPage(target):null,
  rememberQuickView:(value:any)=>{quickView=value;},takeQuickView:()=>{const value=quickView;quickView=null;return value;},
  async currentSite(){
   assertLive();
   if(preview)return {status:'available',host:'docs.example.com',source:'preview'};
   let result:any;
   try{result=await bridge?.request('currentPage.info',{});}catch{assertLive();}
   assertLive();
   if(result?.status==='available')try{
    const url=new URL(result.url);
    if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname)
     return {status:'available',host:url.hostname.toLowerCase().replace(/\.$/,''),source:'currentPage'};
   }catch{/* Invalid or privileged URLs are never a detected website. */}
   return {status:'unavailable',host:'',source:'currentPage'};
  },
  async official(message:any){if(message.type==='OFFICIAL_STATUS')return {ok:true,snapshot:{configured:false,auth:'guest',availability:'unconfigured',plans:[],lines:[],checkout:'none'}};return {ok:false,failure:'not-configured'};},
  async download(){fail('E_NOT_CONNECTED','订阅在线下载尚未接入；请使用文本或文件解析。');},
  beginDraft,setDraftDirty,getDraftVersion:()=>draftRevision,getDraftRevision:(source:string)=>drafts.get(source)??0,
  isDraftDirty:(source:string)=>drafts.has(source),
  hasDrafts:()=>drafts.size>0,
  clearDrafts:()=>{drafts.clear();draftBases.clear();publishDrafts();},
  captureDraftFrom:(target:any)=>{const source=target?.closest?.('[data-draft-scope]')?.getAttribute('data-draft-scope');if(source)beginDraft(source);},
  markDraftFrom:(target:any)=>{const source=target?.closest?.('[data-draft-scope]')?.getAttribute('data-draft-scope');if(source)setDraftDirty(true,source);},
  setState:(_state:any)=>{uiState();},
  dispose(){if(disposed)return;disposed=true;confirmation?.abort();bridge?.root?.removeEventListener('opendesk-page-changed',pageChanged);navigation.destroy();service.dispose();listeners.clear();
   for(const unsubscribe of navigationSubscriptions)unsubscribe();
   for(const unsubscribe of proxyListeners.values())unsubscribe();proxyListeners.clear();confirmHandler=null;
   if(environment===current)environment=null;
  }
 };
 environment=current;
 return environment;
}

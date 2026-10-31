// Project service boundary. No chrome global or privileged implementation is imported here.
import {createProxyService} from './service';
import {freshConfig,validateConfig} from './domain/config';
import {toManagedConfig} from './model.js';
import {createNavigation} from './ui/navigation';
let environment:any;
const fail=(code:string,message:string):never=>{throw Object.assign(Error(message),{code});};
// JSON object member order is not storage identity; array order remains significant.
const comparableJson=(value:any)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
 ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
export function getEnvironment(){if(!environment)throw Error('AI Proxy environment missing');return environment;}
export function configureEnvironment(bridge:any,sdk:any,{trusted=false,preview:previewBoundary=null}: {trusted?:boolean,preview?:any}={}){
 if(environment)throw Error('E_AI_PROXY_ALREADY_MOUNTED');
 // Only the separate preview entry may supply a mock. main.jsx never does.
 const preview=previewBoundary;
 let uiDirty=false,pending=0,disposed=false;
 const assertLive=()=>{if(disposed)fail('E_TOOL_CHANGED','AI Proxy 会话已关闭；不要重放未确认操作。');};
 const uiState=()=>{if(!disposed){const state={dirty:uiDirty,busy:pending>0};bridge?.setState?.(state);events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:state}));}};
 const events=new EventTarget();
 const drafts=new Map<string,number>();
 let draftRevision=0;
 const publishDrafts=()=>{uiDirty=drafts.size>0;uiState();events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:uiDirty}));};
 const setDraftDirty=(value:boolean,source='legacy',revision?:number)=>{
  if(disposed)return;
  if(value)drafts.set(source,++draftRevision);
  else if(revision===undefined||(drafts.get(source)??0)===revision)drafts.delete(source);
  else return false;
  publishDrafts();return true;
 };
 const navigation=createNavigation({initialRoute:trusted?'':location.hash});
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
 const service=createProxyService(preview?preview.service:{
  async load(){const raw=await read(configKey);return {config:raw==null?freshConfig():validateConfig(raw),etag:entries.get(configKey)};},
  async save(config:any,etag:string){if(etag!==entries.get(configKey))fail('E_CONFLICT','配置已改变，请重新读取');await write(configKey,config);return entries.get(configKey);},
  status:()=>managed().getStatus(),
  async apply(config:any){
   // The public SDK only represents one public HTTPS/SOCKS5 endpoint and 1–16 inclusive domains.
   // Never turn an all-site profile, PAC, exact-host rule or alternate target into this subset.
   if(config.selection.mode!=='rules'||config.defaultTarget.action!=='direct')fail('E_UNSUPPORTED','此模式不在公开代理服务范围；配置已保留，未更改浏览器路由。');
   const rules=config.rules.filter((r:any)=>r.enabled);
   const endpointIds=new Set(rules.map((r:any)=>r.endpointId));
   if(!rules.length||rules.length>16||endpointIds.size!==1||rules.some((r:any)=>r.action!=='endpoint'||!r.includeSubdomains))fail('E_UNSUPPORTED','当前公开服务仅支持同一代理的 1–16 个含子域规则；没有降级或应用。');
   const endpoint=config.endpoints.find((e:any)=>e.id===rules[0].endpointId);
   if(!endpoint||endpoint.credentialRef)fail('E_UNSUPPORTED','代理认证尚未接入。');
   const {id,name,scheme,host,port}=endpoint;
   const canonical=toManagedConfig({id,name,scheme,host,port,domains:rules.map((r:any)=>r.domain)});
   return managed().requestEnable({config:canonical});
  },stop:()=>managed().requestDisable()
 });
 const storage={onChanged:changed,local:{
  async get(key:string){return {[key]:await read(key)};},
  async set(items:any){for(const [key,value]of Object.entries(items)){await write(key,value);emit({[key]:{newValue:value}});}},
  async remove(key:string){await write(key,null);emit({[key]:{newValue:null}});}
 }};
 const proxyListeners=new Map<Function,Function>();
 let confirmHandler:any=null;
 const route=(hash:string)=>navigation.navigate(hash);
 let quickView:any=null;
 const pageChanged=()=>events.dispatchEvent(new Event('ai-proxy-page-changed'));
 bridge?.root?.addEventListener('opendesk-page-changed',pageChanged);
 const current={service,storage,navigation,events,trusted,preview:!!preview,request:async(m:any)=>{
   assertLive();
   const mutation=!['GET_STATE','GET_DIAGNOSTICS','GET_USAGE','EXPORT'].includes(m.type);
   if(mutation){pending++;uiState();}
   try{const r=await service.request(m);assertLive();return r;}
   finally{if(mutation){pending--;uiState();}}
  },
  locale:bridge?.locale||navigator.language,
  proxy:{settings:{onChange:{addListener(fn:Function){if(!proxyListeners.has(fn))proxyListeners.set(fn,service.subscribe(fn));},removeListener(fn:Function){proxyListeners.get(fn)?.();proxyListeners.delete(fn);}}}},
  setConfirmHandler:(fn:any)=>{if(!disposed)confirmHandler=fn;},
  async confirm(text:string){
   assertLive();
   if(!confirmHandler)return false;
   pending++;uiState();
   try{const confirmed=await confirmHandler(text);assertLive();return confirmed;}
   finally{pending--;uiState();}
  },
  setNavigationGuard:navigation.setGuard,navigate:route,openSettings:()=>route('#/profiles'),
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
  setDraftDirty,getDraftRevision:(source:string)=>drafts.get(source)??0,
  isDraftDirty:(source:string)=>drafts.has(source),
  hasDrafts:()=>drafts.size>0,
  clearDrafts:()=>{drafts.clear();publishDrafts();},
  markDraftFrom:(target:any)=>{const source=target?.closest?.('[data-draft-scope]')?.getAttribute('data-draft-scope');if(source)setDraftDirty(true,source);},
  setState:(_state:any)=>{uiState();},
  dispose(){if(disposed)return;disposed=true;bridge?.root?.removeEventListener('opendesk-page-changed',pageChanged);navigation.destroy();service.dispose();listeners.clear();
   for(const unsubscribe of proxyListeners.values())unsubscribe();proxyListeners.clear();confirmHandler=null;
   if(environment===current)environment=null;
  }
 };
 environment=current;
 return environment;
}

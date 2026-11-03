import {startSiteRuntime} from './content-runtime.js';
import {createGenericTaskAdapter} from './generic-task-adapter.js';
import {WEB_TASK_PROTOCOL,WEB_TASK_INTENT_PROTOCOL} from './web-task-contract.js';

const sessions=new WeakMap();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maxJSON=65536;

// Chrome messages and page events carry data only, never executable objects.
function dataText(value){
  let nodes=0,size=0;
  function visit(item,depth){
    if(++nodes>4096||depth>32)throw new TypeError('Data limit');
    if(item===null||typeof item==='boolean')return;
    if(typeof item==='string'){size+=item.length;if(size>maxJSON)throw new TypeError('Data limit');return;}
    if(typeof item==='number'&&Number.isFinite(item))return;
    if(typeof item!=='object'||(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype))
      throw new TypeError('Non-JSON data');
    for(const key of Object.keys(item)){
      size+=key.length;
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(!Object.hasOwn(descriptor,'value'))throw new TypeError('Non-JSON data');
      visit(descriptor.value,depth+1);
    }
  }
  visit(value,0);
  const text=JSON.stringify(value);
  if(typeof text!=='string'||text.length>maxJSON)throw new TypeError('Data limit');
  return text;
}

export function startWebTaskContent({api=chrome,win=window}={}){
  if(!win||win!==win.top)return null;
  if(sessions.has(win))return sessions.get(win);
  let disposed=false,visible=true,epoch=0,observer=null,sourceUrl=null;
  const current=(generation,url)=>!disposed&&visible&&epoch===generation&&win.location.href===url;
  const enabled=()=>observer!==null&&current(epoch,sourceUrl);
  function emit(name,value){
    const detail=dataText(value);
    win.dispatchEvent(new win.CustomEvent(name,{detail}));
  }
  async function forward(message){
    const generation=epoch,url=sourceUrl;
    let reply;
    try{reply=await api.runtime.sendMessage(message);}
    catch{reply={ok:false,error:{code:'E_WEB_TASK_TRANSPORT'}};}
    if(!current(generation,url)||!observer)return;
    try{emit('opendesk:task-receipt',reply);}catch{/* Invalid replies never reach the page. */}
  }
  function stop(){
    ++epoch;
    observer?.dispose();observer=null;sourceUrl=null;
  }
  async function start(){
    stop();
    const generation=epoch,url=win.location.href;
    try{
      const reply=await api.runtime.sendMessage({protocol:WEB_TASK_PROTOCOL,kind:'site-profile'});
      if(!current(generation,url)||reply?.ok!==true)return;
      const profile=reply.data?.profile;
      // No fallback to generic for a profile selecting uncompiled site code.
      if(!profile||profile.origin!==new URL(url).origin||profile.adapter!=='generic'||
        profile.adapterVersion!=='1.0.0')return;
      const adapter=createGenericTaskAdapter({win,onCandidate(candidate){
        if(enabled())void forward({protocol:WEB_TASK_PROTOCOL,kind:'candidate',candidateText:JSON.stringify(candidate)});
      }});
      observer=startSiteRuntime({win,profiles:[profile],adapters:{generic:adapter},protocolIds:[WEB_TASK_INTENT_PROTOCOL]});
      if(observer)sourceUrl=url;
    }catch{/* Missing, malformed or unavailable profiles fail closed. */}
  }
  function query(event){
    if(!enabled()||event.target!==win||typeof event.detail!=='string'||event.detail.length>256)return;
    try{
      const value=JSON.parse(event.detail);
      if(!value||Array.isArray(value)||Object.keys(value).length!==1||
        typeof value.requestId!=='string'||!uuid.test(value.requestId))return;
      // Count JSON key tokens too: JSON.parse alone loses duplicate keys.
      if([...event.detail.matchAll(/"(?:[^"\\]|\\.)*"\s*:/gu)].length!==1)return;
      void forward({protocol:WEB_TASK_PROTOCOL,kind:'query',requestId:value.requestId});
    }catch{/* Only complete JSON queries are accepted. */}
  }
  function deliver(message,sender,sendResponse){
    if(!enabled()||!api.runtime.id||sender?.id!==api.runtime.id||Object.hasOwn(sender,'tab'))return;
    try{
      // Validate the complete envelope before accessing or exposing its payload.
      const detail=dataText(message);
      if(message?.protocol!==WEB_TASK_PROTOCOL||message.kind!=='deliver'||
        message.sourceUrl!==win.location.href||typeof message.requestId!=='string'||!uuid.test(message.requestId))return;
      win.dispatchEvent(new win.CustomEvent('opendesk:task-result',{detail}));
      sendResponse({ok:true});
    }catch{/* Ignore untrusted or oversized deliveries without ACK. */}
  }
  function hide(){visible=false;stop();}
  function show(event){if(!disposed&&event.persisted){visible=true;void start();}}
  const session=Object.freeze({dispose(){
    if(disposed)return;
    disposed=true;stop();
    win.removeEventListener('pagehide',hide);
    win.removeEventListener('pageshow',show);
    win.removeEventListener('opendesk:task-query',query);
    api.runtime.onMessage.removeListener(deliver);
    sessions.delete(win);
  }});
  sessions.set(win,session);
  win.addEventListener('pagehide',hide);
  win.addEventListener('pageshow',show);
  win.addEventListener('opendesk:task-query',query);
  api.runtime.onMessage.addListener(deliver);
  void start();
  return session;
}

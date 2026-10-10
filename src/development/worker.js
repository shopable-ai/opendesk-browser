import {resolveToolSender,isToolSender} from '../environment.js';
const protocol='opendesk.development.v1';
const baselineKey='opendesk.development.applied.v1';
const unavailable='开发输出暂不可用；保留当前宿主与任务。';
// Packaged injected code belongs to Chrome's loaded extension version.
// Merely overwriting dist bytes does not re-register existing content scripts.
// Reload the extension only after the RunHost/host-idle fence; never reload the
// business document or replay an in-flight page effect to apply new injection.

export function developmentChanges(previous,next) {
  const changed=Object.keys(next.files).filter(file=>previous.files[file]!==next.files[file]);
  return {changed,css:changed.includes('ui/tool-shell.css'),page:changed.some(file=>['ui/tool.html','ui/tool-shell.js'].includes(file)),
    extension:changed.some(file=>!['ui/tool-shell.css','ui/tool.html','ui/tool-shell.js'].includes(file))};
}
export function createDevelopmentWorker(api=globalThis.chrome,{fetch:read=globalThis.fetch,intervalMs=1000}={}) {
  const ports=new Map();let held=false,applied,restored=false,timer,checking=false,checkIdle,lastReason,nativePending=0,reloading=false;
  async function remember(value){await api.storage.session.set({[baselineKey]:value});applied=value;}
  async function connect(port){
    if(port.name!==protocol)return;
    let disconnected=false;port.onDisconnect.addListener(()=>{disconnected=true;});
    let sender;try{sender=await resolveToolSender(api,port.sender);}catch{return port.disconnect();}
    if(disconnected)return;
    if(!isToolSender(api,sender))return port.disconnect();
    const previous=ports.get(sender.documentId);if(previous)previous.ready=false;
    const row={port,documentId:sender.documentId,ready:false,token:null};ports.set(row.documentId,row);
    port.onMessage.addListener(message=>{if(message.type==='ready'&&message.token===row.token)row.ready=message.ready===true;});
    port.onDisconnect.addListener(()=>{row.ready=false;if(ports.get(row.documentId)===row)ports.delete(row.documentId);});
    port.postMessage({type:'connected',documentId:row.documentId,revision:applied?.revision ?? null});
  }
  api.runtime.onConnect.addListener(connect);
  const send=(type,details={})=>{for(const {port} of ports.values())try{port.postMessage({type,...details});}catch{}};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function waiting(reason){if(lastReason!==reason){console.info('[OpenDesk dev] '+reason);lastReason=reason;send('waiting',{reason});}}
  async function readUpdate(){
    const response=await read(api.runtime.getURL('development-update.json')+'?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('Development output unavailable');
    const value=await response.json();
    if(value.protocol!==protocol||!/^[a-f0-9]{64}$/.test(value.revision)||!value.files||typeof value.files!=='object')throw Error('Invalid development update');
    return value;
  }
  async function tick(){
    if(checking||reloading)return;checking=true;let token;
    try {
      if(!restored){applied=(await api.storage.session.get(baselineKey))[baselineKey];restored=true;}
      const next=await readUpdate();if(lastReason===unavailable){lastReason=null;send('connected',{revision:applied?.revision ?? null});}
      if(!applied){await remember(next);send('revision',{revision:next.revision});return;}
      if(next.revision===applied.revision)return;
      const changes=developmentChanges(applied,next);
      if(changes.css){send('css',{hash:next.files['ui/tool-shell.css']});await remember({...applied,files:{...applied.files,'ui/tool-shell.css':next.files['ui/tool-shell.css']}});}
      if(!changes.page&&!changes.extension){await remember(next);send('revision',{revision:next.revision});return;}
      if(!await checkIdle()){waiting('源码已编译；任务、原生请求或未知结果仍未释放，自动刷新已延后。');return;}
      held=true;
      // Freeze new admissions, then re-read authority. Every live tool document
      // must acknowledge its own draft; one host cannot vote for another.
      if(!await checkIdle())return;
      const contexts=await api.runtime.getContexts({});
      const tools=contexts.filter(context=>{try{return new URL(context.documentUrl).pathname==='/ui/tool.html';}catch{return false;}});
      if(tools.some(context=>!ports.has(context.documentId))){waiting('等待全部工具页连接开发服务；没有响应的宿主不会被自动关闭。');return;}
      const rows=[...ports.values()];token=crypto.randomUUID();
      for(const row of rows){row.ready=false;row.token=token;row.port.postMessage({type:'prepare',token});}
      for(let i=0;i<30&&rows.some(row=>!row.ready);i++)await wait(50);
      if(rows.some(row=>!row.ready)||!await checkIdle()){waiting('等待任务结束和草稿成功保存；源码更新已保留。');return;}
      // A new host opened during acknowledgement must also participate.
      const current=await api.runtime.getContexts({});
      if(current.some(context=>{try{return new URL(context.documentUrl).pathname==='/ui/tool.html'&&!rows.some(row=>row.documentId===context.documentId);}catch{return false;}}))return;
      if(rows.some(row=>ports.get(row.documentId)!==row||!row.ready||row.token!==token))return;
      if(changes.extension){
        console.info('[OpenDesk dev] Safe extension reload',changes.changed,next.revision);
        // This changes Chrome's loaded classic script bytes for FUTURE pages.
        // Existing business pages require a user-initiated normal refresh.
        send('waiting',{reason:'扩展固定脚本已更新；安全重载扩展后，请自行刷新需要新 SDK 的原网页（不自动重复业务操作）。'});
        // Persist the compiled revision before Chrome replaces this worker;
        // a surviving session baseline must not reload the same bytes again.
        await remember(next);
        api.runtime.reload();reloading=true;return;
      }
      console.info('[OpenDesk dev] Safe tool page reload',changes.changed,next.revision);
      for(const row of rows)row.port.postMessage({type:'reload-page',token});
      // A reconnect is not retirement. Keep admissions frozen until Chrome
      // confirms that the old document identities disappeared.
      let retired=false;
      for(let i=0;i<40;i++){
        const live=await api.runtime.getContexts({});
        retired=!rows.some(row=>live.some(context=>context.documentId===row.documentId));
        if(retired)break;await wait(50);
      }
      if(!retired)return;
      await remember(next);lastReason=null;
    }catch(error){waiting(unavailable);console.debug('[OpenDesk dev]',error);}
    finally{if(!reloading){held=false;if(token)send('abort',{token});}checking=false;}
  }
  return {get held(){return held;},get nativePending(){return nativePending;},nativeStarted(){nativePending++;return ()=>nativePending--;},
    start(canReload){checkIdle=canReload;tick();timer=setInterval(tick,intervalMs);},
    dispose(){clearInterval(timer);api.runtime.onConnect.removeListener(connect);for(const {port} of ports.values())port.disconnect();ports.clear();}};
}

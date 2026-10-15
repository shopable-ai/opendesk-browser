/* OPAQUE OFFLINE PREVIEW: only the real adblock.status/site.restore UI protocol.
 * Never talks to Chrome, permissions, storage, network, DNR or the real tool host. */
(() => {
  'use strict';
  const root=document.getElementById('tool-root');
  const scenario=globalThis.__opendeskPreviewScenario;
  const scenarios=new Set(['success','empty','error','loading','permission-denied','untrusted']);
  if(!root||!scenarios.has(scenario))throw Error('E_ADBLOCK_PREVIEW: bad scenario');
  const ordinary=['news.example.com','video.example.com','shop.example.com'];
  const hostile='<img src=x onerror=alert(1)>';
  const state={
    toolEnabled:true,
    enabled:scenario==='success'||scenario==='untrusted',
    exceptions:scenario==='success'?['news.example.com']:
      scenario==='untrusted'?[hostile]:[],
    currentHost:'news.example.com',
    permissions:{dnr:scenario!=='empty'&&scenario!=='permission-denied'},
    rules:{verified:scenario!=='empty'&&scenario!=='permission-denied'}
  };
  const clone=value=>JSON.parse(JSON.stringify(value));
  const pending=new Map();
  let seq=0;
  const fault=message=>{throw Error('[离线模拟] '+message);};
  const announce=requestId=>window.parent.postMessage({
    type:'opendesk.preview.adblock.exceptions',requestId,exceptions:[...state.exceptions]},'*');
  async function request(operation,payload={}){
    if(operation!=='adblock.status'&&operation!=='adblock.site.restore')
      return fault('未批准的 API 操作');
    if(scenario==='loading')return new Promise(()=>{});
    if(scenario==='error')return fault('无法读取模拟 DNR 状态');
    if(scenario==='permission-denied')return fault('尚未授权 Chrome DNR（模拟）');
    if(operation==='adblock.status')return clone(state);
    const host=payload?.host;
    if(!payload||Object.keys(payload).join(',')!=='host'||
       typeof host!=='string'||!state.exceptions.includes(host))
      return fault('例外已变化，请重新读取');
    if(!ordinary.includes(host))return fault('无法恢复不可信演示域名');
    const requestId=++seq;
    return new Promise((resolve,reject)=>{
      pending.set(requestId,{host,resolve,reject});
      window.parent.postMessage({type:'opendesk.preview.adblock.restore-request',
        requestId,host},'*');
    });
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    const data=event.data;
    if(data.type==='opendesk.preview.adblock.restore-decision'){
      const pendingRequest=pending.get(data.requestId);
      if(!pendingRequest)return;
      pending.delete(data.requestId);
      if(data.accepted!==true){
        pendingRequest.reject(Error('[离线模拟] 已取消恢复'));
        return;
      }
      state.exceptions=state.exceptions.filter(host=>host!==pendingRequest.host);
      pendingRequest.resolve(clone({...state,rules:{verified:true},refreshRequired:true}));
      announce(data.requestId);
    }else if(data.type==='opendesk.preview.adblock.state'){
      if(scenario!=='success'&&scenario!=='empty'&&scenario!=='untrusted')return;
      if(typeof data.enabled!=='boolean'||typeof data.granted!=='boolean'||typeof data.restartRequired!=='boolean'||!Array.isArray(data.exceptions)||
         data.exceptions.length>3||
         data.exceptions.some(host=>!ordinary.includes(host)))return;
      state.enabled=data.enabled&&!data.restartRequired;
      state.restartRequired=data.restartRequired;
      state.permissions.dnr=data.granted;
      state.rules.verified=data.granted&&!data.restartRequired;
      state.exceptions=[...new Set(data.exceptions)];
      window.dispatchEvent(new Event('focus'));
    }
  });
  // Production dynamically sizes the sandbox. Report only its own document height.
  if(typeof ResizeObserver==='function'){
    const report=()=>window.parent.postMessage({type:'opendesk.preview.adblock.height',
      height:Math.ceil(document.documentElement.scrollHeight)},'*');
    new ResizeObserver(report).observe(document.body);
    window.addEventListener('load',report,{once:true});
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{configurable:false,
    writable:false,enumerable:false,value:Object.freeze({root,request})});
})();

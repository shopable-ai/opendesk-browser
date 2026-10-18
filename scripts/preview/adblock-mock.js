/* OFFLINE ONLY: no DNR, Chrome, network, storage, or privileged permission APIs.
 * Executes the REAL compiled React package against an inert five-operation Host. */
(()=>{
  'use strict';
  const root=document.getElementById('tool-root'),scenario=globalThis.__opendeskPreviewScenario;
  if(!root||!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))
    throw Error('E_ADBLOCK_PREVIEW_SCENARIO');
  const allowed=new Set(['news.example.com','video.example.com','shop.example.com']);
  const writes=new Set(['adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore']);
  const state={installed:true,toolEnabled:true,enabled:scenario==='success'||scenario==='untrusted',
    restartRequired:false,exceptions:scenario==='success'?['news.example.com']:
      scenario==='untrusted'?['<img src=x onerror=alert(1)>']:[],
    currentHost:'news.example.com',currentSite:{status:'ready'},domainCount:67,
    permissions:{dnr:!['empty','permission-denied'].includes(scenario)},
    rules:{verified:!['empty','permission-denied'].includes(scenario),ruleIds:[]}};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const pending=new Map();let sequence=0;
  const error=(code,message)=>Object.assign(Error('[离线模拟] '+message),{code});
  function validate(op,payload){
    const keys=Object.keys(payload).sort().join(',');
    if(op==='adblock.enable'&&keys===''&&!state.enabled)return;
    if(op==='adblock.disable'&&keys===''&&state.enabled)return;
    if(op==='adblock.site.set'&&keys==='filtering,host'&&state.enabled&&
       payload.host===state.currentHost&&allowed.has(payload.host)&&
       typeof payload.filtering==='boolean'&&
       state.exceptions.includes(payload.host)===payload.filtering)return;
    if(op==='adblock.site.restore'&&keys==='host'&&allowed.has(payload.host)&&
       state.exceptions.includes(payload.host))return;
    throw error('E_ADBLOCK_STATE_CHANGED','所请求的操作或当前网站状态已变化');
  }
  function apply(op,payload){
    if(op==='adblock.enable')state.enabled=true;
    else if(op==='adblock.disable')state.enabled=false;
    else if(op==='adblock.site.set'){
      if(payload.filtering)state.exceptions=state.exceptions.filter(x=>x!==payload.host);
      else state.exceptions.push(payload.host);
    }else state.exceptions=state.exceptions.filter(x=>x!==payload.host);
  }
  function request(operation,payload={}){
    if(operation!=='adblock.status'&&!writes.has(operation))
      return Promise.reject(error('E_ADBLOCK_OPERATION','未批准的操作'));
    if(scenario==='loading')return new Promise(()=>{});
    if(scenario==='error')return Promise.reject(error('E_ADBLOCK_READ','离线状态读取错误'));
    if(operation==='adblock.status')return Promise.resolve(clone(state));
    if(!state.permissions.dnr||!state.rules.verified||!state.toolEnabled)
      return Promise.reject(error('E_ADBLOCK_PERMISSION','过滤权限不可用'));
    try{validate(operation,payload);}catch(cause){return Promise.reject(cause);}
    const requestId=++sequence;
    return new Promise((resolve,reject)=>{
      pending.set(requestId,{operation,payload:clone(payload),resolve,reject});
      window.parent.postMessage({type:'opendesk.preview.adblock.review-request',
        requestId,operation,payload:clone(payload)},'*');
    });
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    const msg=event.data;
    if(msg.type==='opendesk.preview.adblock.review-decision'){
      const item=pending.get(msg.requestId);if(!item)return;
      pending.delete(msg.requestId);
      if(msg.accepted!==true){item.reject(error('E_CANCELLED','用户取消了本次模拟操作'));return;}
      try{
        validate(item.operation,item.payload);apply(item.operation,item.payload);
        item.resolve(clone(state));
        window.parent.postMessage({type:'opendesk.preview.adblock.review-receipt',
          requestId:msg.requestId,enabled:state.enabled,exceptions:[...state.exceptions]},'*');
      }catch(cause){item.reject(cause);}
    }else if(msg.type==='opendesk.preview.adblock.state'){
      if(!['success','empty','untrusted'].includes(scenario))return;
      if(typeof msg.enabled!=='boolean'||typeof msg.granted!=='boolean'||
         !Array.isArray(msg.exceptions)||msg.exceptions.some(x=>!allowed.has(x)))return;
      state.enabled=msg.enabled;state.permissions.dnr=msg.granted;
      state.rules.verified=msg.granted;state.exceptions=[...new Set(msg.exceptions)];
      root.dispatchEvent(new Event('opendesk-tool-state-changed'));
    }
  });
  if(typeof ResizeObserver==='function'){
    const report=()=>window.parent.postMessage({type:'opendesk.preview.adblock.height',
      height:Math.ceil(document.documentElement.scrollHeight)},'*');
    new ResizeObserver(report).observe(document.body);
    window.addEventListener('load',report,{once:true});
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{configurable:false,writable:false,
    value:Object.freeze({root,request})});
})();
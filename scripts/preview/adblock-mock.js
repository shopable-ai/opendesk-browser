/* OFFLINE ONLY: no DNR, Chrome, network, storage, or privileged permission APIs.
 * Executes the REAL compiled React package against an inert five-operation Host. */
(()=>{
  'use strict';
  const root=document.getElementById('tool-root'),scenario=globalThis.__opendeskPreviewScenario;
  if(!root||!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))
    throw Error('E_ADBLOCK_PREVIEW_SCENARIO');
  const allowed=new Set(['news.example.com','video.example.com','shop.example.com']);
  const writes=new Set(['adblock.enable','adblock.disable','adblock.site.set',
    'adblock.site.restore','adblock.cosmetic.pick','adblock.cosmetic.cancel',
    'adblock.cosmetic.restore','adblock.cosmetic.add','adblock.cosmetic.replace']);
  const state={installed:true,toolEnabled:true,enabled:scenario==='success'||scenario==='untrusted',
    restartRequired:false,exceptions:scenario==='success'?['news.example.com']:
      scenario==='untrusted'?['<img src=x onerror=alert(1)>']:[],
    currentHost:'news.example.com',currentSite:{status:'ready'},domainCount:67,
    permissions:{dnr:!['empty','permission-denied'].includes(scenario)},
    rules:{verified:!['empty','permission-denied'].includes(scenario),ruleIds:[]},
    cosmeticRules:scenario==='success'?[{selector:'#native-promo'}]:[],
    pickerActive:false,pickOutcome:null};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const savedByHost=new Map([['news.example.com',state.cosmeticRules.map(row=>({...row}))]]);
  const pending=new Map();let sequence=0,pickNonce=0;
  const temporaryVisible=new Set(),locating=new Set();
  const supportedCount=selector=>['#native-promo','#promo-sidebar','#sponsor-card','.ad-banner'].includes(selector)?1:0;
  const inspect=selector=>({selector,matches:supportedCount(selector),visible:temporaryVisible.has(selector)});
  const paintTarget=()=>window.parent.postMessage({type:'opendesk.preview.adblock.target-state',
    host:state.currentHost,picking:state.pickerActive,
    effective:state.enabled&&state.permissions.dnr&&state.rules.verified&&
      !state.exceptions.includes(state.currentHost),
    selectors:state.cosmeticRules.map(row=>row.selector),
      visible:[...new Set([...temporaryVisible,...locating])]},'*');
  const error=(code,message)=>Object.assign(Error('[离线模拟] '+message),{code});
  function validate(op,payload){
    if(['adblock.cosmetic.add','adblock.cosmetic.replace'].includes(op)){
      const {host,selector,oldSelector,allowUnmatched}=payload;
      const names=state.cosmeticRules.map(rule=>rule.selector);
      if(!state.enabled||state.exceptions.includes(host)||host!==state.currentHost||
         typeof selector!=='string'||!/^#[a-z][a-z0-9_-]{0,63}$|^\.ad-banner$/.test(selector)||
         typeof allowUnmatched!=='boolean'||supportedCount(selector)===0&&!allowUnmatched||
         (op==='adblock.cosmetic.add'&&names.includes(selector))||
         (op==='adblock.cosmetic.replace'&&(!names.includes(oldSelector)||
           oldSelector!==selector&&names.includes(selector))))
        throw error('E_ADBLOCK_COSMETIC_CHANGED','模拟页面或选择器不允许保存');
      return;
    }
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
    if(['adblock.cosmetic.add','adblock.cosmetic.replace'].includes(op)){
      if(op==='adblock.cosmetic.replace')state.cosmeticRules=state.cosmeticRules.filter(x=>x.selector!==payload.oldSelector);
      state.cosmeticRules.push({selector:payload.selector});
      savedByHost.set(state.currentHost,clone(state.cosmeticRules));return;
    }
    if(op==='adblock.enable')state.enabled=true;
    else if(op==='adblock.disable')state.enabled=false;
    else if(op==='adblock.site.set'){
      if(payload.filtering)state.exceptions=state.exceptions.filter(x=>x!==payload.host);
      else state.exceptions.push(payload.host);
    }else state.exceptions=state.exceptions.filter(x=>x!==payload.host);
  }
  function request(operation,payload={}){
    if(operation!=='adblock.status'&&!writes.has(operation)&&
       !['adblock.cosmetic.inspect','adblock.cosmetic.check','adblock.cosmetic.locate',
         'adblock.cosmetic.display'].includes(operation))
      return Promise.reject(error('E_ADBLOCK_OPERATION','未批准的操作'));
    if(scenario==='loading')return new Promise(()=>{});
    if(scenario==='error')return Promise.reject(error('E_ADBLOCK_READ','离线状态读取错误'));
    if(operation==='adblock.status')return Promise.resolve(clone(state));
    if(operation==='adblock.cosmetic.inspect'){
      if(payload.host!==state.currentHost)return Promise.reject(error('E_ADBLOCK_COSMETIC_SITE','网页已切换'));
      return Promise.resolve({...clone(state),inspection:state.cosmeticRules.map(row=>inspect(row.selector))});
    }
    if(['adblock.cosmetic.check','adblock.cosmetic.locate','adblock.cosmetic.display'].includes(operation)){
      if(payload.host!==state.currentHost||typeof payload.selector!=='string')
        return Promise.reject(error('E_ADBLOCK_COSMETIC_SITE','网页或选择器已变化'));
      if(operation!=='adblock.cosmetic.check'&&
         !state.cosmeticRules.some(row=>row.selector===payload.selector))
        return Promise.reject(error('E_ADBLOCK_COSMETIC_CHANGED','此规则已删除'));
      if(operation==='adblock.cosmetic.display'){
        if(typeof payload.visible!=='boolean')return Promise.reject(error('E_ADBLOCK_REQUEST','临时显示参数无效'));
        if(payload.visible)temporaryVisible.add(payload.selector);
        else temporaryVisible.delete(payload.selector);
        paintTarget();
      }
      if(operation==='adblock.cosmetic.locate'&&supportedCount(payload.selector)){
        locating.add(payload.selector);paintTarget();
        window.parent.postMessage({type:'opendesk.preview.adblock.target-locate',selector:payload.selector},'*');
        setTimeout(()=>{locating.delete(payload.selector);paintTarget();},2500);
      }
      if(operation==='adblock.cosmetic.check'&&supportedCount(payload.selector))
        window.parent.postMessage({type:'opendesk.preview.adblock.target-locate',selector:payload.selector},'*');
      return Promise.resolve({...clone(state),inspection:[inspect(payload.selector)]});
    }
    if(operation==='adblock.cosmetic.pick'){
      if(state.enabled&&state.permissions.dnr&&state.rules.verified&&
         !state.exceptions.includes(state.currentHost)){
        state.pickerActive=true;state.pickOutcome=null;pickNonce++;paintTarget();
        return Promise.resolve(clone(state));
      }
      return Promise.reject(error('E_ADBLOCK_UNAVAILABLE','当前网页无法选择元素'));
    }
    if(operation==='adblock.cosmetic.cancel'){
      if(state.pickerActive){
        state.pickerActive=false;
        state.pickOutcome={nonce:pickNonce,status:'cancelled',selector:null};
      }
      paintTarget();return Promise.resolve(clone(state));
    }
    if(operation==='adblock.cosmetic.restore'){
      if(payload.host!==state.currentHost||
         !state.cosmeticRules.some(row=>row.selector===payload.selector))
        return Promise.reject(error('E_ADBLOCK_COSMETIC_CHANGED','规则不存在或网站已切换'));
      state.cosmeticRules=state.cosmeticRules.filter(row=>row.selector!==payload.selector);
      temporaryVisible.delete(payload.selector);locating.delete(payload.selector);
      if(state.pickOutcome?.selector===payload.selector)
        state.pickOutcome={...state.pickOutcome,status:'undone'};
      savedByHost.set(state.currentHost,clone(state.cosmeticRules));
      paintTarget();return Promise.resolve(clone(state));
    }
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
        // A real Host rechecks authority after approval, not only at request time.
        // Preview must reject a permission revocation while the dialog is open.
        if(!state.permissions.dnr||!state.rules.verified||!state.toolEnabled)
          throw error('E_ADBLOCK_PERMISSION','确认期间过滤权限已撤销');
        validate(item.operation,item.payload);apply(item.operation,item.payload);
        paintTarget();item.resolve(clone(state));
        window.parent.postMessage({type:'opendesk.preview.adblock.review-receipt',
          requestId:msg.requestId,enabled:state.enabled,exceptions:[...state.exceptions]},'*');
      }catch(cause){item.reject(cause);}
    }else if(msg.type==='opendesk.preview.adblock.target-click'){
      if(typeof msg.selector!=='string'||!/^#[a-z][a-z0-9_-]{0,63}$/.test(msg.selector)||
         !state.pickerActive||!state.enabled||state.exceptions.includes(state.currentHost))return;
      if(!state.cosmeticRules.some(row=>row.selector===msg.selector))
        state.cosmeticRules.push({selector:msg.selector});
      temporaryVisible.delete(msg.selector);locating.delete(msg.selector);
      state.pickerActive=false;
      state.pickOutcome={nonce:pickNonce,status:'saved',selector:msg.selector};
      savedByHost.set(state.currentHost,clone(state.cosmeticRules));
      paintTarget();
    }else if(msg.type==='opendesk.preview.adblock.target-escape'){
      if(!state.pickerActive)return;
      state.pickerActive=false;
      state.pickOutcome={nonce:pickNonce,status:'cancelled',selector:null};
      paintTarget();
    }else if(msg.type==='opendesk.preview.adblock.state'){
      if(!['success','empty','untrusted'].includes(scenario))return;
      if(typeof msg.enabled!=='boolean'||typeof msg.granted!=='boolean'||
         !Array.isArray(msg.exceptions)||msg.exceptions.some(x=>!allowed.has(x)))return;
      const nextHost=msg.currentHost??state.currentHost;
      if(typeof nextHost!=='string'||!allowed.has(nextHost))return;
      const pageChanged=nextHost!==state.currentHost;
      if(pageChanged)savedByHost.set(state.currentHost,clone(state.cosmeticRules));
      state.currentHost=nextHost;
      if(pageChanged)state.cosmeticRules=clone(savedByHost.get(nextHost)||[]);
      state.pickerActive=false;state.pickOutcome=null;
      temporaryVisible.clear();locating.clear();
      state.enabled=msg.enabled;state.permissions.dnr=msg.granted;
      state.rules.verified=msg.granted;state.exceptions=[...new Set(msg.exceptions)];
      root.dispatchEvent(new Event(pageChanged?'opendesk-page-changed':'opendesk-tool-state-changed'));
      paintTarget();
    }
  });
  paintTarget();
  if(typeof ResizeObserver==='function'){
    const report=()=>window.parent.postMessage({type:'opendesk.preview.adblock.height',
      height:Math.ceil(document.documentElement.scrollHeight)},'*');
    new ResizeObserver(report).observe(document.body);
    window.addEventListener('load',report,{once:true});
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{configurable:false,writable:false,
    value:Object.freeze({root,request})});
})();
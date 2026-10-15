/* OPAQUE, OFFLINE PREVIEW MOCK: Never grants Chrome/SDK permissions or persists data. */
(() => {
  'use strict';
  const root=document.getElementById('tool-root');
  const scenario=globalThis.__opendeskPreviewScenario;
  const scenarios=new Set(['success','empty','error','loading','permission-denied','untrusted']);
  if(!root||!scenarios.has(scenario))throw Error('E_PREVIEW_MOCK: invalid scenario');
  const initial={id:'preview-note',text:scenario==='untrusted'
    ?'<img src=x onerror=alert(1)> \u003c/script\u003e 中文 & emoji 🧪'
    :'这是一条仅存在于预览内存中的笔记。',updatedAt:1};
  const store=Object.create(null);
  store.notes=(scenario==='success'||scenario==='untrusted')?[initial]:null;
  store.note=null;
  const revisions=Object.create(null);
  const etag=key=>String(revisions[key]||0).padStart(64,'0');
  const clone=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
  const error=message=>{throw Error('[离线模拟] '+message);};
  async function request(operation,payload={}){
    if(!['storage.get','storage.set','currentPage.info','tasks.open'].includes(operation))
      return error('未配置的 SDK 操作：'+String(operation).slice(0,70));
    if(scenario==='loading')return new Promise(()=>{});
    if(scenario==='permission-denied')return error('未授予 '+operation+' 权限');
    if(scenario==='error'&&operation.startsWith('storage.'))return error('存储故障');
    if(operation==='currentPage.info')
      return scenario==='empty'?{status:'unavailable'}:
        {status:'available',title:'模拟网页（未连接网站）',url:'https://example.invalid/offline-preview'};
    if(operation==='tasks.open')return error('预览不支持打开或执行真实任务');
    if(!payload||typeof payload!=='object'||!['notes','note'].includes(payload.key))
      return error('存储请求参数无效');
    if(operation==='storage.get'){
      if(Object.keys(payload).some(key=>!['key','withEtag'].includes(key)))
        return error('未知读取参数');
      return payload.withEtag?{value:clone(store[payload.key]),etag:etag(payload.key)}:
        {value:clone(store[payload.key])};
    }
    if(Object.keys(payload).some(key=>!['key','value','ifMatch'].includes(key)))
      return error('未知写入参数');
    if(payload.ifMatch!==undefined&&payload.ifMatch!==etag(payload.key))
      return error('工具数据已在其他窗口修改');
    const next=clone(payload.value);
    if(JSON.stringify(next).length>8192)return error('模拟数据大小超限');
    store[payload.key]=next;
    revisions[payload.key]=(revisions[payload.key]||0)+1;
    return {saved:true,etag:etag(payload.key),simulated:true};
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{
    configurable:false,writable:false,enumerable:false,
    value:Object.freeze({root,request,setState:()=>{}})
  });
  // Absolutely no chrome API, real storage, network or parent-frame request.
})();
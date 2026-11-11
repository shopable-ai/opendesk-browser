/* Offline SDK boundary only. No Chrome, network, real storage or clipboard. */
(() => {
  'use strict';
  const root=document.getElementById('tool-root');
  const scenario=globalThis.__opendeskPreviewScenario;
  let value=scenario==='paused'?{enabled:false,disabledOrigins:[]}:null;
  let revision=1,origin='https://example.invalid',unavailable=scenario==='permission-denied';
  let failSave=scenario==='save-error',readFailure=scenario==='error',loading=scenario==='loading';
  let busy=false;
  const clone=data=>data===undefined?null:JSON.parse(JSON.stringify(data));
  const etag=()=>String(revision).padStart(64,'0');
  const fail=code=>{throw Object.assign(Error('[离线模拟] '+code),{code});};
  async function request(operation,args={}) {
    if(!['storage.get','storage.set','currentPage.info','page.request'].includes(operation))
      fail('E_PREVIEW_OPERATION');
    if(loading)return new Promise(()=>{});
    if(operation==='currentPage.info')return unavailable?{status:'unavailable'}:
      {status:'available',url:origin+'/article',title:'模拟网页'};
    if(operation==='page.request') {
      if(args.operation!=='copy.refresh')fail('E_PREVIEW_OPERATION');
      // A sidebar preview has no Page runtime. Never claim real enforcement.
      fail('E_PAGE_PREVIEW_NOT_INSTALLED');
    }
    if(args.key!=='preferences')fail('E_PREVIEW_KEY');
    if(readFailure)fail('E_PREVIEW_READ');
    if(operation==='storage.get')return args.withEtag?{value:clone(value),etag:etag()}:{value:clone(value)};
    if(args.ifMatch!==etag())fail('E_STORAGE_CONFLICT');
    await new Promise(resolve=>setTimeout(resolve,650));
    if(failSave){failSave=false;fail('E_PREVIEW_SAVE');}
    value=clone(args.value);revision++;
    return {saved:true,etag:etag()};
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{value:Object.freeze({root,request,
    setState(state){busy=state?.busy===true;}
  }),writable:false,configurable:false});
  const commands=new Set(['site-a','site-b','unavailable','refresh','fail-save','recover']);
  window.addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==parent||!data||data.type!=='opendesk.preview.free-copy.command.v1'||
      !commands.has(data.command)||typeof data.requestId!=='string'||data.requestId.length>32)return;
    let message;
    if(busy)message='正在保存，请等待回执后再切换模拟网站。';
    else {
      if(data.command==='site-a'||data.command==='site-b'){
        origin=data.command==='site-a'?'https://example.invalid':'https://other.invalid';unavailable=false;
      }else if(data.command==='unavailable')unavailable=true;
      else if(data.command==='fail-save')failSave=true;
      else if(data.command==='recover'){readFailure=false;loading=false;unavailable=false;}
      root.dispatchEvent(new Event('opendesk-page-changed'));
      message=data.command==='fail-save'?'下一次保存将失败；请操作工具内滑块。':
        '已更新模拟环境并触发正式 UI 重新读取；偏好保留在本页内存。';
    }
    parent.postMessage({type:'opendesk.preview.free-copy.ack.v1',command:data.command,
      requestId:data.requestId,message},'*');
  });
})();

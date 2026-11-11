(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool,root=tool?.root,request=tool?.request;
  const globalSwitch=root?.querySelector('#fc-enabled');
  const siteSwitch=root?.querySelector('#fc-site-enabled');
  const originView=root?.querySelector('#fc-origin');
  const status=root?.querySelector('#fc-status');
  const errorView=root?.querySelector('#fc-error');
  if(!globalSwitch||!siteSwitch||!originView||!status||!errorView||typeof request!=='function')
    throw Error('E_FREE_COPY_TOOL_CONTEXT');
  const KEY='preferences';
  let closed=false,busy=false,reading=false,epoch=0,loaded=false,origin=null;
  let settings={enabled:true,disabledOrigins:[]};
  const message=text=>{errorView.textContent=text;errorView.hidden=!text;};
  function checkedSettings(value) {
    if(value===null||value===undefined)return {enabled:true,disabledOrigins:[]};
    if(typeof value!=='object'||Array.isArray(value)||
      (value.enabled!==undefined&&typeof value.enabled!=='boolean')||
      (value.disabledOrigins!==undefined&&(!Array.isArray(value.disabledOrigins)||
        value.disabledOrigins.length>64||value.disabledOrigins.some(item=>{
          if(typeof item!=='string')return true;
          try{const u=new URL(item);return !['http:','https:'].includes(u.protocol)||
            u.username||u.password||u.origin!==item;}catch{return true;}
        }))))throw Error('E_FREE_COPY_SETTINGS');
    return {...value,enabled:value.enabled!==false,disabledOrigins:value.disabledOrigins||[]};
  }
  function httpOrigin(href) {
    try{const url=new URL(href);return ['http:','https:'].includes(url.protocol)&&
      !url.username&&!url.password?url.origin:null;}catch{return null;}
  }
  async function currentOrigin() {
    const info=await request('currentPage.info',{});
    return info?.status==='available'?httpOrigin(info.url):null;
  }
  async function readSettings() {
    const record=await request('storage.get',{key:KEY,withEtag:true});
    if(typeof record?.etag!=='string'||!record.etag)throw Error('E_FREE_COPY_ETAG');
    return {value:checkedSettings(record.value),etag:record.etag};
  }
  function render() {
    globalSwitch.checked=settings.enabled;
    siteSwitch.checked=origin!==null&&!settings.disabledOrigins.includes(origin);
    globalSwitch.setAttribute('aria-checked',String(globalSwitch.checked));
    siteSwitch.setAttribute('aria-checked',String(siteSwitch.checked));
    globalSwitch.disabled=!loaded||busy||reading;
    siteSwitch.disabled=!loaded||busy||reading||!origin;
    originView.textContent=origin||'当前页面不支持或未授权';
    status.textContent=busy?'正在保存设置…':reading?'正在读取设置…':
      !loaded?'设置不可用':!settings.enabled?'已全局暂停 · 网站设置将在恢复后生效':
      !origin?'全局已开启 · 当前页面不可用':
      siteSwitch.checked?'设置已开启 · 在已授权网页上生效':'当前网站已暂停';
  }
  async function refresh() {
    if(closed||busy)return;
    const turn=++epoch;
    reading=true;render();
    const [saved,site]=await Promise.allSettled([readSettings(),currentOrigin()]);
    if(closed||turn!==epoch)return;
    reading=false;
    if(saved.status==='fulfilled') {
      settings=saved.value.value;loaded=true;
      message('');
    }else{
      loaded=false;message('无法读取或验证设置，请检查安装状态与权限');
    }
    origin=site.status==='fulfilled'?site.value:null;
    render();
  }
  async function update(which,desired) {
    if(closed||busy||!loaded)return;
    const expectedOrigin=origin;
    if(which==='site'&&!expectedOrigin)return;
    busy=true;epoch++;tool.setState?.({busy:true,dirty:true});
    message('');render();
    let writeConfirmed=false;
    try {
      for(let attempt=0;attempt<3;attempt++) {
        const before=await readSettings();
        if(closed)return;
        if(which==='site'&&await currentOrigin()!==expectedOrigin)
          throw Error('E_FREE_COPY_SITE_CHANGED');
        let next;
        if(which==='global')next={...before.value,enabled:desired};
        else{
          const list=before.value.disabledOrigins.filter(item=>item!==expectedOrigin);
          if(!desired)list.push(expectedOrigin);
          if(list.length>64)throw Error('E_FREE_COPY_SITE_LIMIT');
          next={...before.value,disabledOrigins:list};
        }
        try {
          const result=await request('storage.set',{key:KEY,value:next,ifMatch:before.etag});
          if(result?.saved!==true)throw Error('E_FREE_COPY_OUTCOME_UNKNOWN');
          writeConfirmed=true;break;
        } catch(error) {
          if(error?.code!=='E_STORAGE_CONFLICT'||attempt===2)throw error;
        }
      }
      if(!closed)void request('page.request',{operation:'copy.refresh',payload:{}}).catch(()=>{});
    }catch(e) {
      if(!closed)message(e?.message==='E_FREE_COPY_SITE_CHANGED'?
        '当前网站已变化，请刷新设置后重试':'设置保存未确认，请检查状态后重试');
    }finally {
      if(!closed){
        busy=false;tool.setState?.({busy:false,dirty:false});
        const verified=await Promise.allSettled([readSettings(),currentOrigin()]);
        if(closed)return;
        if(verified[0].status==='fulfilled') {
          settings=verified[0].value.value;loaded=true;
        }else{
          loaded=false;message('无法确认设置状态，请重新打开工具');
        }
        origin=verified[1].status==='fulfilled'?verified[1].value:null;
        const persisted=which==='global'?settings.enabled===desired:
          expectedOrigin!==null&&settings.disabledOrigins.includes(expectedOrigin)===!desired;
        if(writeConfirmed&&persisted&&loaded)message('');
        else if(loaded&&!errorView.textContent)message('设置未按预期生效，请重新操作');
        render();
      }
    }
  }
  globalSwitch.addEventListener('change',()=>{
    if(!closed)void update('global',globalSwitch.checked);
  });
  siteSwitch.addEventListener('change',()=>{
    if(!closed)void update('site',siteSwitch.checked);
  });
  root.addEventListener('opendesk-page-changed',()=>void refresh());
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('pagehide',()=>{closed=true;epoch++;},{once:true});
  void refresh();
})();

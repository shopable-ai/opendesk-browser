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
  let pageStatus='',pageGeneration=0,unknownPageResult=false,checkingPage=false,checkAgain=false;
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
    const notice=busy?'正在保存设置…':reading?'正在读取设置…':loaded?pageStatus:'';
    status.textContent=notice;
    status.hidden=!notice;
  }
  async function checkPage() {
    if(closed||busy||reading||!loaded||!origin||unknownPageResult)return;
    if(checkingPage){checkAgain=true;return;}
    checkingPage=true;
    const turn=epoch,generation=pageGeneration;
    let result;
    try {
      const receipt=await request('page.request',{operation:'copy.refresh',payload:{}});
      const expected=settings.enabled&&!settings.disabledOrigins.includes(origin);
      result=receipt?.enabled===expected?'':
        '未确认当前网页采用了此设置';
    }catch(error){
      switch(error?.code){
        case 'E_APP_PAGE_ACTIVATION_REQUIRED':
        case 'E_USER_SCRIPTS_UNAVAILABLE': result='网页功能待开启。请前往「扩展 → 更多 → 网页功能帮助」，按说明开启 Chrome 的「允许用户脚本」，再返回检查自由复制。';break;
        case 'E_PERMISSION': result='当前网站访问受限，请在扩展中核对网站权限。';break;
        case 'E_APP_PAGE_RELOAD_REQUIRED': result='当前网页仍在使用旧文档。请先保存网页内容，再刷新网页。';break;
        case 'E_EFFECT_UNKNOWN':
        case 'E_OUTCOME_UNKNOWN':
        case 'E_TOOL_TIMEOUT': result='网页请求结果未知。请先检查网页，再决定是否重新打开工具。';break;
        default: result='未确认当前网页已应用设置。若网页先于功能打开，请先保存内容，再刷新网页。';
      }
      if(!closed&&['E_EFFECT_UNKNOWN','E_OUTCOME_UNKNOWN','E_TOOL_TIMEOUT'].includes(error?.code)){
        unknownPageResult=true;pageStatus=result;render();
      }
    }
    checkingPage=false;
    if(!closed&&turn===epoch&&generation===pageGeneration&&!unknownPageResult){pageStatus=result;render();}
    if(checkAgain){checkAgain=false;void checkPage();}
  }
  async function refresh() {
    if(closed||busy)return;
    const turn=++epoch;
    if(!unknownPageResult)pageStatus='';
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
    void checkPage();
  }
  async function update(which,desired) {
    if(closed||busy||!loaded)return;
    const expectedOrigin=origin;
    if(which==='site'&&!expectedOrigin)return;
    busy=true;epoch++;tool.setState?.({busy:true,dirty:true});
    checkAgain=false;
    if(!unknownPageResult)pageStatus='';
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
    }catch(e) {
      if(!closed)message(e?.message==='E_FREE_COPY_SITE_CHANGED'?
        '当前网站已变化，请刷新设置后重试':'设置保存未确认，请检查状态后重试');
    }finally {
      if(!closed){
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
        busy=false;tool.setState?.({busy:false,dirty:false});
        render();
        if(writeConfirmed&&persisted)void checkPage();
      }
    }
  }
  globalSwitch.addEventListener('change',()=>{
    if(!closed)void update('global',globalSwitch.checked);
  });
  siteSwitch.addEventListener('change',()=>{
    if(!closed)void update('site',siteSwitch.checked);
  });
  root.addEventListener('opendesk-page-changed',()=>{
    pageGeneration++;if(!unknownPageResult)pageStatus='';void refresh();
  });
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('pagehide',()=>{closed=true;epoch++;},{once:true});
  void refresh();
})();

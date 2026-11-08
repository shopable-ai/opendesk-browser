// Single App · Multiple Surfaces: real SDK usage, never privileged Chrome APIs.
(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root;
  if(!root)throw Error('E_TOOL_CONTEXT: 请通过 OpenDesk 工具宿主打开本示例');
  const field=id=>root.querySelector('#demo-'+id);
  const isPage=tool.surface==='page';
  const initialSection=tool.initialPage?.view==='settings'?tool.initialPage.section:'preferences';
  const supportedSections=new Set(['preferences','about']);
  const DATA_KEY='header-actions-demo.preferences.v1';
  const DEFAULT={alias:'我的工作台',compact:true};
  const supportedData=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
    typeof value.alias==='string'&&value.alias.length<=40&&typeof value.compact==='boolean';
  const errorText=error=>String(error?.code||'E_DEMO')+'：'+String(error?.message||error).slice(0,140);
  const instance=crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0');
  let data={...DEFAULT},etag=null,dirty=false,busy=false,disposed=false,revision=0;
  let page='home',headerCount=0,backCount=0,section=supportedSections.has(initialSection)?initialSection:'preferences';
  field('sidebar').hidden=isPage;
  field('management').hidden=!isPage;
  field('instance').textContent=instance;

  const setState=()=>{tool.setState({dirty,busy});};
  const show=(value)=>{field(isPage?'result':'open-result').textContent=value;};
  const update=()=>{
    field('summary').textContent=data.alias+(data.compact?' · 紧凑':' · 常规');
    field('draft').textContent=busy?'正在操作，请勿离开':dirty?'有未保存草稿':'没有未保存草稿';
    field('save').disabled=!dirty||busy;
    field('reset').disabled=busy;
    field('reload').disabled=busy;
    for(const id of ['open-page','open-about'])field(id).disabled=busy;
    field('preferences').hidden=section!=='preferences';
    field('about-panel').hidden=section!=='about';
    field('preferences-tab').setAttribute('aria-current',section==='preferences'?'page':'false');
    field('about-tab').setAttribute('aria-current',section==='about'?'page':'false');
    setState();
  };
  const syncInputs=()=>{field('alias').value=data.alias;field('compact').checked=data.compact;};
  async function readConfig({discard=false}={}){
    if(disposed||busy)return;
    if(dirty&&!discard){show('当前有未保存草稿，请先保存或明确选择丢弃。');return;}
    const generation=revision;busy=true;update();
    try{
      const result=await tool.request('storage.get',{key:DATA_KEY,withEtag:true});
      if(disposed||generation!==revision)return;
      if(!result||typeof result.etag!=='string'||!result.etag)throw Error('读取回执不完整');
      if(result.value!==null&&!supportedData(result.value))throw Error('数据格式不符合示例配置，未覆盖表单');
      data=result.value?{alias:result.value.alias,compact:result.value.compact}:{...DEFAULT};
      etag=result.etag;dirty=false;syncInputs();
      show('已确认读取共享配置；未执行保存或应用操作。');
    }catch(error){if(!disposed)show('读取失败：'+errorText(error));}
    finally{busy=false;if(!disposed)update();}
  }
  async function save(){
    if(disposed||busy||!dirty)return;
    const snapshot={...data},generation=revision;
    if(etag===null){show('缺少原始 ETag，先重新读取再保存。');return;}
    busy=true;update();
    try{
      const ack=await tool.request('storage.set',{key:DATA_KEY,value:snapshot,ifMatch:etag});
      if(ack?.saved!==true)throw Error('写入结果未知，请只读核对，不重复提交');
      const proof=await tool.request('storage.get',{key:DATA_KEY,withEtag:true});
      if(!proof||typeof proof.etag!=='string'||!proof.etag||
         JSON.stringify(proof.value)!==JSON.stringify(snapshot))throw Error('已收到写入回执但读回不匹配，请核对其他实例');
      etag=proof.etag;
      if(revision===generation){dirty=false;show('保存回执及读回均匹配。没有自动应用其他业务操作。');}
      else show('保存已确认，但操作期间还有新草稿，请继续检查。');
    }catch(error){if(!disposed)show('保存未确认或冲突：'+errorText(error)+'；不会自动重放。');}
    finally{busy=false;if(!disposed)update();}
  }
  async function openPage(section){
    if(disposed||busy||dirty)return;
    if(typeof tool.openOwnPage!=='function'){
      show('旧版 Host 不提供 openOwnPage；请使用宿主原有的「在标签页打开」入口。');return;
    }
    // Invoke synchronously inside the native user click before the first await.
    const promise=tool.openOwnPage({view:'settings',section});
    try{
      const ack=await promise;
      if(!disposed)show(ack?.opened===true?'浏览器已确认创建工具标签页；页面加载与保存仍须单独核验。':'打开结果未知，请检查标签页，不自动重复打开。');
    }catch(error){if(!disposed)show('打开失败：'+errorText(error));}
  }
  function record(text){
    const item=document.createElement('li');
    item.textContent=text;
    field('events').prepend(item);
    while(field('events').children.length>6)field('events').lastElementChild.remove();
  }
  function renderLegacy(){
    if(isPage)return;
    const base={page,title:page==='home'?'首页':'资料库',canBack:page!=='home',primary:null};
    let accepted=false,enhanced=false;
    if(typeof tool.setNavigation==='function'){
      if(field('enabled').checked&&tool.navigationFeatures?.headerActions===true){
        accepted=tool.setNavigation({...base,headerActions:page==='home'
          ?[{id:'library',label:'打开资料库',icon:'library'}]:[]});
        enhanced=accepted===true;
      }
      if(!enhanced)accepted=tool.setNavigation(base);
    }
    field('support').textContent=!field('enabled').checked?'已关闭插槽；原导航和内容入口继续可用。':
      enhanced?'已提交插槽快照；请观察宿主右上角及下方回传。':
      '当前宿主未接收插槽增强；内容入口仍可用。';
    field('page').textContent=page==='home'?'首页':'资料库';
    field('content').textContent=page==='home'?'这是首页。':'这是同一个工具实例的资料库。';
    field('header-count').textContent=String(headerCount);
    field('back-count').textContent=String(backCount);
    field('library').hidden=page!=='home';
    field('back').hidden=page==='home'||accepted===true;
  }
  const go=(next,source)=>{if(disposed)return;record(source+'：'+page+' → '+next+'；实例 '+instance);page=next;renderLegacy();};
  const onNavigation=({detail})=>{
    if(disposed||!detail||isPage)return;
    if(detail.action==='header'&&field('enabled').checked&&detail.page===page&&
       page==='home'&&detail.actionId==='library'){headerCount++;go('library','右上角回传 library');}
    else if(detail.action==='back'&&page==='library'){backCount++;go('home','宿主返回回传');}
  };
  const bindings=[];
  const listen=(target,event,fn)=>{target.addEventListener(event,fn);bindings.push(()=>target.removeEventListener(event,fn));};
  listen(root,'opendesk-tool-navigation',onNavigation);
  listen(field('library'),'click',()=>go('library','原内容入口'));
  listen(field('back'),'click',()=>go('home','内容返回'));
  listen(field('enabled'),'change',()=>{record(field('enabled').checked?'请求显示插槽':'提交 base 清除插槽');renderLegacy();});
  listen(field('open-page'),'click',()=>{void openPage('preferences');});
  listen(field('open-about'),'click',()=>{void openPage('about');});
  listen(field('reload'),'click',()=>{void readConfig();});
  listen(field('save'),'click',()=>{void save();});
  listen(field('reset'),'click',()=>{void readConfig({discard:true});});
  listen(field('preferences-tab'),'click',()=>{if(!dirty&&!busy){section='preferences';update();}else show('有未保存草稿或正在保存，请完成后切换栏目。');});
  listen(field('about-tab'),'click',()=>{if(!dirty&&!busy){section='about';update();}else show('有未保存草稿或正在保存，请完成后切换栏目。');});
  listen(field('alias'),'input',()=>{if(busy)return;data.alias=field('alias').value;revision++;dirty=true;update();});
  listen(field('compact'),'change',()=>{if(busy)return;data.compact=field('compact').checked;revision++;dirty=true;update();});
  listen(document,'visibilitychange',()=>{if(!document.hidden&&!dirty&&!busy)void readConfig();});
  const cleanup=()=>{disposed=true;for(const release of bindings)release();window.removeEventListener('pagehide',cleanup);};
  window.addEventListener('pagehide',cleanup,{once:true});
  update();renderLegacy();
  if(isPage&&!supportedSections.has(initialSection))
    show('不支持的栏目 '+String(initialSection).slice(0,40)+'，已显示首选项；此导航提示不构成授权。');
  void readConfig();
})();

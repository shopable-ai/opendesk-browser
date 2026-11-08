// Only the public sandbox API; no Host DOM, privileged request or business action.
(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root;
  if(!root)throw Error('E_TOOL_CONTEXT: 请通过 OpenDesk 工具宿主打开本示例');
  const field=id=>root.querySelector('#demo-'+id);
  const enabled=field('enabled'),library=field('library'),back=field('back');
  // A visible diagnostic marker, not an installation identity or security token.
  const instance=crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0');
  let page='home',headerCount=0,backCount=0,disposed=false;
  field('instance').textContent=instance;
  function record(text){
    const item=document.createElement('li');
    item.textContent=text;
    field('events').prepend(item);
    while(field('events').children.length>6)field('events').lastElementChild.remove();
  }
  function render(){
    const base={page,title:page==='home'?'首页':'资料库',canBack:page!=='home',primary:null};
    let accepted=false,enhanced=false;
    if(typeof tool.setNavigation==='function'){
      if(enabled.checked&&tool.navigationFeatures?.headerActions===true){
        accepted=tool.setNavigation({...base,headerActions:page==='home'
          ?[{id:'library',label:'打开资料库',icon:'library'}]:[]});
        enhanced=accepted===true;
      }
      if(!enhanced)accepted=tool.setNavigation(base);
    }
    field('support').textContent=!enabled.checked?'已关闭插槽；原导航和内容入口继续可用。':
      enhanced?'已提交插槽快照；请观察宿主右上角及下方回传。':
      '当前宿主未接收插槽增强；内容入口仍可用。';
    field('page').textContent=page==='home'?'首页':'资料库';
    field('content').textContent=page==='home'?'这是首页。':'这是同一个工具实例的资料库；此示例不读取或保存数据。';
    field('header-count').textContent=String(headerCount);
    field('back-count').textContent=String(backCount);
    library.hidden=page!=='home';
    back.hidden=page==='home'||accepted===true;
  }
  function go(next,source){
    if(disposed)return;
    record(source+'：'+page+' → '+next+'；实例 '+instance);
    page=next;
    render();
  }
  function onNavigation({detail}){
    if(disposed||!detail)return;
    if(detail.action==='header'&&enabled.checked&&detail.page===page&&page==='home'&&detail.actionId==='library'){
      headerCount++;
      go('library','右上角回传 library');
    }else if(detail.action==='back'&&page==='library'){
      backCount++;
      go('home','宿主返回回传');
    }
  }
  const onLibrary=()=>go('library','原内容入口');
  const onBack=()=>go('home','内容返回');
  const onToggle=()=>{record(enabled.checked?'请求显示插槽':'提交 base 清除插槽');render();};
  function cleanup(){
    if(disposed)return;
    disposed=true;
    root.removeEventListener('opendesk-tool-navigation',onNavigation);
    library.removeEventListener('click',onLibrary);
    back.removeEventListener('click',onBack);
    enabled.removeEventListener('change',onToggle);
    window.removeEventListener('pagehide',cleanup);
  }
  tool.setState({dirty:false,busy:false});
  root.addEventListener('opendesk-tool-navigation',onNavigation);
  library.addEventListener('click',onLibrary);
  back.addEventListener('click',onBack);
  enabled.addEventListener('change',onToggle);
  window.addEventListener('pagehide',cleanup);
  render();
})();

(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  let state=null,busy=false,reading=false;
  const message=(text,error=false)=>{
    $('adblock-message').textContent=text;
    $('adblock-message').dataset.error=String(error);
    $('adblock-message').hidden=!text;
  };
  const el=(tag,klass,text)=>{
    const node=document.createElement(tag);
    if(klass)node.className=klass;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  function render(){
    const entries=Array.isArray(state?.exceptions)?state.exceptions:[];
    $('exception-count').textContent=String(entries.length);
    const list=$('exceptions');list.replaceChildren();
    if(!entries.length){list.append(el('p','od-note adblock-empty','暂无停用的网站'));return;}
    for(const host of entries){
      const row=el('div','adblock-row'),name=el('span','adblock-domain',host);
      const button=el('button','od-button od-button--secondary adblock-restore','恢复拦截');button.type='button';
      button.disabled=busy||!state?.toolEnabled;
      button.setAttribute('aria-label','恢复 '+host+' 的广告过滤');
      button.addEventListener('click',()=>restore(host));
      row.append(name,button);list.append(row);
    }
  }
  async function refresh(){
    if(busy||reading)return;
    reading=true;
    try{state=await request('adblock.status',{});render();message('');}
    catch(e){state=null;render();message('无法核对 Chrome DNR：'+String(e.message||e),true);}
    finally{reading=false;}
  }
  async function restore(host){
    if(busy||!state?.exceptions?.includes(host))return;
    busy=true;render();message('请在外层可信宿主确认恢复该网站…');
    try{
      const next=await request('adblock.site.restore',{host});
      if(next?.rules?.verified!==true)throw Error('Chrome 规则尚未核对');
      state=next;render();message('已恢复 '+host+' 的过滤，请刷新网页。');
    }catch(e){message(String(e.message||e),true);}
    finally{busy=false;render();}
  }
  void refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('focus',()=>void refresh());
  setInterval(()=>{if(!document.hidden)void refresh();},12000);
})();
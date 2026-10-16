(() => {
  'use strict';
  // The opaque sandbox can READ status or REQUEST a separately-confirmed restore.
  // It never owns product navigation, Chrome permissions or DNR switches.
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  let state=null,busy=false,reading=false,refreshPending=false;
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
    $('exception-count').textContent=entries.length+' 个例外网站';
    const list=$('exceptions');list.replaceChildren();
    if(!state){
      const waiting=el('div','adblock-empty');
      waiting.append(el('strong','','无法确认网站例外'),
        el('p','od-note','状态未核实，恢复操作已保护性禁用。'));
      list.append(waiting);return;
    }
    if(!entries.length){
      const empty=el('div','adblock-empty');
      empty.append(el('span','adblock-empty-mark','✓'),
        el('strong','','所有网站均未停用过滤'),
        el('p','od-note','关闭某个网站的广告过滤后，会在这里显示。'));
      list.append(empty);return;
    }
    for(const host of entries){
      const row=el('div','adblock-row');
      const summary=el('div','adblock-entry');
      summary.append(el('strong','adblock-domain',host),
        el('p','adblock-entry-hint','此网站的广告过滤已停用'));
      const restoreButton=el('button','od-button od-button--secondary adblock-restore','恢复拦截');
      restoreButton.type='button';
      restoreButton.disabled=busy||state.toolEnabled===false;
      restoreButton.setAttribute('aria-label','恢复 '+host+' 的广告过滤');
      restoreButton.addEventListener('click',()=>restore(host));
      row.append(summary,restoreButton);list.append(row);
    }
  }
  async function refresh(){
    if(busy||reading){refreshPending=true;return;}
    reading=true;
    try{
      state=null;render();
      const next=await request('adblock.status',{});
      if(!Array.isArray(next?.exceptions))throw Error('网站例外数据不可核实');
      state=next;render();message('');
    }catch(e){
      state=null;render();message('无法核对 Chrome DNR：'+String(e.message||e),true);
    }finally{
      reading=false;
      if(refreshPending){refreshPending=false;void refresh();}
    }
  }
  async function restore(host){
    if(busy||!state?.exceptions?.includes(host)||state.toolEnabled===false)return;
    busy=true;render();message('请在外层可信宿主确认恢复该网站…');
    try{
      const next=await request('adblock.site.restore',{host});
      if(next?.rules?.verified!==true||!Array.isArray(next.exceptions)||
        next.exceptions.includes(host))throw Error('Chrome 规则回读不一致');
      // Never report success on the sandbox's optimistic response alone.
      const checked=await request('adblock.status',{});
      if(checked?.rules?.verified!==true||!Array.isArray(checked.exceptions)||
        checked.exceptions.includes(host))throw Error('恢复后 Chrome 状态核对失败');
      state=checked;render();
      message('已恢复 '+host+' 的过滤，请刷新该网页。');
    }catch(e){
      const reason=String(e?.message||e);
      if(/取消|cancel/i.test(reason)){
        message('已取消恢复，网站过滤设置未改变。');
      }else{
        state=null;render();
        message('恢复结果未确认：'+reason+'。请重新读取状态。',true);
      }
    }finally{
      busy=false;render();
      if(refreshPending){refreshPending=false;void refresh();}
    }
  }
  void refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  // Chrome focuses the opaque iframe when the user first targets a restore
  // button. A synchronous refresh replaces the button before its click is
  // delivered, breaking pointer and keyboard access. Keep authority readback
  // on background focus, but never invalidate an actively focused action.
  window.addEventListener('focus',()=>{
    queueMicrotask(()=>{
      if(root.querySelector('.adblock-restore:focus'))return;
      void refresh();
    });
  });
  setInterval(()=>{if(!document.hidden)void refresh();},12000);
})();

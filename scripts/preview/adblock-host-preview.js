/* Browser-side UI simulator for a source-derived, inert trusted-host snapshot.
 * Operates exclusively on offline fixture domains and mock iframe messages. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const mount=byId('od-preview-adblock-host');
  if(!mount)return;
  const frame=byId('opendesk-preview-frame');
  const data=JSON.parse(byId('od-preview-adblock-snapshots').textContent);
  const scenario=data.scenario;
  const snapshots=data.snapshots;
  const live=['success','empty','untrusted'].includes(scenario);
  const initial=()=>({enabled:scenario==='success'||scenario==='untrusted',
    granted:scenario!=='empty'&&scenario!=='permission-denied',
    exceptions:scenario==='success'?['news.example.com']:[]});
  let state=initial();
  const site='news.example.com';
  const dialog=byId('od-preview-adblock-restore-dialog');
  const description=byId('od-preview-adblock-restore-description');
  const feedback=byId('od-preview-adblock-feedback');
  let pending=null;
  const note=text=>{feedback.textContent=text;};
  function key(){
    if(scenario==='error'||scenario==='loading'||scenario==='permission-denied')
      return scenario==='permission-denied'?'no-permission':scenario;
    if(!state.granted)return 'no-permission';
    if(!state.enabled)return 'off';
    return state.exceptions.includes(site)?'on-site-off':'on-site-on';
  }
  function render(){
    const name=key();
    if(!Object.hasOwn(snapshots,name))throw Error('E_ADBLOCK_PREVIEW_SNAPSHOT: '+name);
    mount.innerHTML=snapshots[name];
  }
  function notifySandbox(){
    frame.contentWindow?.postMessage({type:'opendesk.preview.adblock.state',
      enabled:state.enabled,exceptions:[...state.exceptions]},'*');
  }
  function reset(){
    state=initial();pending=null;if(dialog.open)dialog.close();note('');
    render();notifySandbox();
  }
  mount.addEventListener('click',event=>{
    const button=event.target.closest('button[role=switch]');
    if(!button||!mount.contains(button)||!event.isTrusted||button.disabled||!live)return;
    const buttons=[...mount.querySelectorAll('button[role=switch]')];
    const index=buttons.indexOf(button);
    if(index===0){
      if(!state.granted){
        state.granted=true;
        note('已模拟允许 DNR；正式 Chrome 仍需用户授权并可能需要完整重启。');
      }else note(state.enabled?'已在离线预览中停用':'已在离线预览中开启');
      state.enabled=!state.enabled;
    }else if(index===1&&state.enabled){
      if(state.exceptions.includes(site)){
        state.exceptions=state.exceptions.filter(host=>host!==site);
        note('已模拟恢复当前网站。正式操作需要核对 Chrome 规则。');
      }else{
        state.exceptions.push(site);
        note('已模拟停用当前网站的过滤。');
      }
    }else return;
    render();notifySandbox();
    mount.querySelectorAll('button[role=switch]')[index]?.focus();
  });
  frame.addEventListener('load',()=>notifySandbox());
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
    const message=event.data;
    if(message.type==='opendesk.preview.adblock.restore-request'){
      if(!live||!Number.isSafeInteger(message.requestId)||message.requestId<1||
         message.host!=='news.example.com'||pending)return;
      pending={requestId:message.requestId,host:message.host};
      description.textContent='仅在预览中恢复 '+message.host+' 的过滤；不会修改 Chrome 规则。';
      dialog.showModal();
      byId('od-preview-adblock-restore-cancel').focus();
    }else if(message.type==='opendesk.preview.adblock.exceptions'){
      if(!live||!Array.isArray(message.exceptions)||
         message.exceptions.some(host=>host!==site))return;
      state.exceptions=[...new Set(message.exceptions)];
      render();note('已在离线预览中恢复过滤，真实网页仍需刷新。');
    }
  });
  function decide(accepted){
    if(!pending)return;
    const requestId=pending.requestId;
    pending=null;dialog.close();
    frame.contentWindow?.postMessage({type:'opendesk.preview.adblock.restore-decision',
      requestId,accepted},'*');
    if(!accepted)note('已取消本次模拟操作');
  }
  byId('od-preview-adblock-restore-cancel').addEventListener('click',()=>decide(false));
  byId('od-preview-adblock-restore-accept').addEventListener('click',()=>decide(true));
  dialog.addEventListener('cancel',event=>{if(pending){event.preventDefault();decide(false);}});
  byId('od-preview-reset').addEventListener('click',reset);
  render();
})();

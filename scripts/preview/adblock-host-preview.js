/* Browser-side UI simulator for a source-derived, inert trusted-host snapshot.
 * Operates exclusively on offline fixture domains and mock iframe messages. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const mount=byId('od-preview-adblock-host');
  if(!mount)return;
  const frame=byId('opendesk-preview-frame');
  const data=JSON.parse(byId('opendesk-preview-adblock-snapshots').textContent);
  const scenario=data.scenario;
  const snapshots=data.snapshots;
  const live=['success','empty','untrusted'].includes(scenario);
  const initial=()=>({enabled:scenario==='success'||scenario==='untrusted',
    granted:scenario!=='empty'&&scenario!=='permission-denied',
    restartRequired:false,
    exceptions:scenario==='success'?['news.example.com']:[]});
  let state=initial();
  const site='news.example.com';
  const dialog=byId('od-preview-adblock-restore-dialog');
  const description=byId('od-preview-adblock-restore-description');
  const feedback=byId('od-preview-adblock-feedback');
  let pending=null,pendingAck=null;
  const note=text=>{feedback.textContent=text;};
  function key(){
    if(scenario==='error'||scenario==='loading'||scenario==='permission-denied')
      return scenario==='permission-denied'?'no-permission':scenario;
    if(state.restartRequired)return 'restart';
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
    if(scenario==='untrusted')return; // preserve malicious-string fixture without changing production state
    frame.contentWindow?.postMessage({type:'opendesk.preview.adblock.state',
      enabled:state.enabled,granted:state.granted,
      restartRequired:state.restartRequired,exceptions:[...state.exceptions]},'*');
  }
  function reset(){
    state=initial();pending=null;pendingAck=null;if(dialog.open)dialog.close();note('');
    render();notifySandbox();
  }
  mount.addEventListener('click',event=>{
    const button=event.target.closest('button[role=switch]');
    if(!button||!mount.contains(button)||!event.isTrusted||button.disabled||!live)return;
    const buttons=[...mount.querySelectorAll('button[role=switch]')];
    const index=buttons.indexOf(button);
    if(index===0){
      if(!state.granted){
        // First optional grant must not enable filtering until a full Chrome restart.
        state.granted=true;state.restartRequired=true;state.enabled=false;
        note('仅模拟批准 DNR；请完整重启 Chrome 后手动开启，当前过滤尚未开启。');
      }else if(!state.restartRequired){
        state.enabled=!state.enabled;
        note(state.enabled?'已在离线预览中开启':'已在离线预览中停用');
      }else return;
    }else if(index===1&&state.enabled&&!state.restartRequired){
      if(state.exceptions.includes(site)){
        state.exceptions=state.exceptions.filter(host=>host!==site);
        note('已模拟恢复当前网站。正式操作需要核对 Chrome 规则。');
      }else{
        state.exceptions.push(site);
        note('已模拟停用当前网站的过滤。');
      }
    }else return;
    pendingAck=null;render();notifySandbox();
    mount.querySelectorAll('button[role=switch]')[index]?.focus();
  });
  frame.addEventListener('load',()=>notifySandbox());
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!=='null'||
       !event.data||typeof event.data!=='object')return;
    const message=event.data;
    if(message.type==='opendesk.preview.adblock.height'){
      if(Number.isInteger(message.height)&&message.height>=80&&message.height<=4000)
        frame.style.height=Math.max(140,Math.min(1600,message.height))+'px';
    }else if(message.type==='opendesk.preview.adblock.restore-request'){
      if(!live||!Number.isSafeInteger(message.requestId)||message.requestId<1||
         message.host!==site||!state.exceptions.includes(site)||pending||pendingAck)return;
      pending={requestId:message.requestId,host:message.host};
      description.textContent='仅在预览中恢复 '+message.host+' 的过滤；不会修改 Chrome 规则。';
      dialog.showModal();
      byId('od-preview-adblock-restore-cancel').focus();
    }else if(message.type==='opendesk.preview.adblock.exceptions'){
      if(!live||!pendingAck||message.requestId!==pendingAck.requestId||
         !Array.isArray(message.exceptions)||message.exceptions.length!==0)return;
      // Inert preview is updated only after an accepted matching iframe receipt.
      pendingAck=null;state.exceptions=[];
      render();note('模拟恢复已确认；真实网页仍需刷新。');
    }
  });
  function decide(accepted){
    if(!pending)return;
    const requestId=pending.requestId;
    const host=pending.host;
    pending=null;dialog.close();
    if(accepted){pendingAck={requestId,host};note('等待离线恢复确认…');}
    else note('已取消本次模拟操作');
    frame.contentWindow?.postMessage({type:'opendesk.preview.adblock.restore-decision',
      requestId,accepted},'*');
  }
  byId('od-preview-adblock-restore-cancel').addEventListener('click',()=>decide(false));
  byId('od-preview-adblock-restore-accept').addEventListener('click',()=>decide(true));
  dialog.addEventListener('cancel',event=>{if(pending){event.preventDefault();decide(false);}});
  byId('od-preview-reset').addEventListener('click',reset);
  render();
})();

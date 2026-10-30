(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk;
const byId=id=>root.querySelector('#'+id);
const current=byId('speed-current'),unit=byId('speed-unit');
const verification=byId('speed-verification'),message=byId('speed-message');
const meterLabel=root.querySelector('.speed-meter-top > span');
const refresh=byId('speed-refresh'),minus=byId('speed-minus'),plus=byId('speed-plus');
const toggle=byId('speed-shortcut-toggle'),keys=byId('speed-key-list'),shortcutNote=byId('speed-shortcut-note');
const globalToggle=byId('speed-global-toggle'),globalStop=byId('speed-global-stop');
const globalTarget=byId('speed-global-target'),globalNote=byId('speed-global-note');
let globalState={enabled:false,speed:1,revision:''},globalLoading=true,globalSaving=false,globalEpoch=0;
let globalHint='',globalReadPending=false;
const validSpeed=n=>typeof n==='number'&&Number.isFinite(n)&&n>=.25&&n<=4;
const presets=[...root.querySelectorAll('[data-speed]')];
let actual=null,available=false,phase='detecting',busy=false,requested=null;
let notice='',noticeKind='',lastSource='',closed=false,seq=0,readTicket=0;
let shortcutsEnabled=true,shortcutLoading=true,shortcutSaving=false,shortcutHint='',shortcutEpoch=0,preferenceEpoch=0,pageShortcutPending=false;
const fmt=n=>Number.isFinite(n)?n.toFixed(2)+'×':'—';
const short=n=>Number.isFinite(n)?Number(n.toFixed(2)):null;
function render(){
  current.textContent=Number.isFinite(actual)?actual.toFixed(2):'—';
  unit.hidden=!Number.isFinite(actual);
  meterLabel.textContent=phase==='submitting'?'上次读回倍速':'当前实际倍速';
  let state='已读回',kind='',text=notice,level=noticeKind;
  if(phase==='detecting'){state='检测中';kind='neutral';text='正在读取当前网页播放速度…';}
  if(phase==='submitting'){state='待验证';kind='warn';text='目标 '+fmt(requested)+' · 等待独立读回';level='warn';}
  if(phase==='no-video'){state='无视频';kind='neutral';text=notice||'开始播放后重新检测视频';}
  if(phase==='permission'){state='无权限';kind='error';text=notice||'请检查 Chrome 网站访问权限';level='error';}
  if(phase==='partial'){state='部分可用';kind='warn';text=notice||'部分 iframe 无法访问，已控制可访问视频';level='warn';}
  if(phase==='override'){state='未生效';kind='error';text='目标 '+fmt(requested)+' 未生效；实际 '+fmt(actual);level='error';}
  if(phase==='stale'){state='需重新检测';kind='warn';text=notice||'网页已切换，请重新检测';level='warn';}
  if(phase==='disabled'){state='已停用';kind='neutral';text='请在扩展中心启用工具后重试';}
  if(phase==='error'){state='未核对';kind='error';text=notice||'实际倍速尚未确认，请重新检测';level='error';}
  verification.textContent=state;verification.dataset.kind=kind;
  message.textContent=text||'✓ 已读取网页当前播放速度';
  message.dataset.kind=level||'';
  globalToggle.setAttribute('aria-checked',String(globalState.enabled));
  globalToggle.disabled=globalLoading||globalSaving||busy||closed||phase==='disabled';
  globalStop.disabled=!globalState.enabled||globalToggle.disabled;
  globalTarget.textContent='共享目标 · '+fmt(globalState.speed)+(globalState.enabled?'（非实际）':'（已关闭）');
  globalNote.textContent=globalHint||(globalLoading?'正在读取全局设置…':globalState.enabled?'自动应用已开启；上方数字仅为当前视频实际读回。':'未开启；仅调整当前视频。');
  const canChange=(available||globalState.enabled)&&!globalLoading&&!globalSaving&&!busy&&!closed&&phase!=='disabled';
  for(const button of presets){
    const speed=Number(button.dataset.speed);
    button.disabled=!canChange;
    button.setAttribute('aria-pressed',String(available&&speed===actual));
    button.dataset.pending=String(phase==='submitting'&&speed===requested);
  }
  minus.disabled=!canChange||adjustBase()<=.25;
  plus.disabled=!canChange||adjustBase()>=4;
  refresh.disabled=busy||closed||phase==='disabled';
  toggle.disabled=shortcutLoading||shortcutSaving||closed||phase==='disabled';
  toggle.setAttribute('aria-checked',String(shortcutsEnabled));
  keys.dataset.disabled=String(!shortcutsEnabled);
  shortcutNote.hidden=!shortcutHint;
  shortcutNote.textContent=shortcutHint;
}
function receive(result,source=''){
  if(result?.status==='no-video'){
    actual=null;available=false;phase='no-video';
    notice=result.partial?'部分 iframe 无法访问；未检测到可控制的视频':'开始播放视频后点击刷新';
    noticeKind=result.partial?'warn':'';
    return;
  }
  if(result?.status!=='available'||typeof result.speed!=='number'||
     !Number.isFinite(result.speed)||result.speed<0||result.speed>16)
    throw Error('实际倍速读取结果无效，请重新检测');
  actual=result.speed;available=true;lastSource=source;
  requested=Number.isFinite(result.requested)?result.requested:null;
  if(result.verified===false){
    phase='override';noticeKind='error';return;
  }
  if(result.partial){
    phase='partial';notice='部分 iframe 无法访问，已控制检测到的视频';noticeKind='warn';return;
  }
  phase='ready';
  notice=source?source+' · 已读回 '+fmt(actual):result.playing?'视频播放中 · 已读回':'视频已检测 · 已读回';
  noticeKind='';
}
function classify(error){
  const code=String(error?.code||''),text=String(error?.message||'视频状态无法验证').slice(0,160);
  actual=null;available=false;requested=null;
  if(code==='E_VIDEO_SITE_ACCESS'||code==='E_VIDEO_TRUST'||/权限|授权|permission/i.test(text)){
    phase='permission';notice='请检查 Chrome 网站访问权限或官方安装状态';noticeKind='error';
  }else if(code==='E_DOCUMENT_STALE'||code==='E_VIDEO_TARGET'||code==='E_VIDEO_CHANGED'){
    phase='stale';notice='网页或视频已切换，请重新检测';noticeKind='warn';
  }else if(code==='E_TOOL_DISABLED'){
    phase='disabled';notice=text;noticeKind='error';
  }else if(code==='E_VIDEO_NOT_FOUND'){
    phase='no-video';notice='当前网页没有可控制的 HTML5 视频';noticeKind='';
  }else{
    phase='error';notice=text;noticeKind='error';
  }
}
function adjustBase(){return available?actual:globalState.enabled?globalState.speed:actual;}
function acceptGlobal(state){
  if(typeof state?.enabled!=='boolean'||!validSpeed(state.speed)||typeof state.revision!=='string')
    throw Error('全局设置读取结果无效');
  globalState={enabled:state.enabled,speed:state.speed,revision:state.revision};
}
function drainGlobalRead(){
  if(globalReadPending&&!busy&&!globalSaving&&!closed){globalReadPending=false;void read();}
}
async function loadGlobal(){
  const epoch=globalEpoch;
  try{
    const state=await request('videoSpeed.global.status',{});
    if(closed||epoch!==globalEpoch)return;
    acceptGlobal(state);globalHint='';
  }catch(error){
    if(closed||epoch!==globalEpoch)return;
    globalHint='全局设置未确认：'+String(error?.message||'请重新打开应用').slice(0,90);
  }finally{if(!closed&&epoch===globalEpoch){globalLoading=false;render();}}
}
async function configureGlobal(enabled,speed){
  const epoch=globalEpoch;
  const state=await request('videoSpeed.global.configure',{enabled,speed,expectedRevision:globalState.revision});
  if(closed)return false;
  if(epoch===globalEpoch){acceptGlobal(state);globalLoading=false;}
  // A newer cross-window preference wins; never replay a superseded write.
  if(state.superseded===true||globalState.enabled!==enabled||globalState.speed!==speed||globalState.revision!==state.revision){
    globalHint='全局设置已变化，本次调整未应用。';
    globalReadPending=true;render();return false;
  }
  globalHint=enabled?'':state.restore?.status==='requested'
    ?'已停止自动应用；已请求将仍可访问且由本工具控制的视频恢复 1×，尚未确认所有页面恢复。'
    :'已停止自动应用；部分或全部视频恢复结果未知，请检查仍可访问的视频。';
  render();return state;
}
async function toggleGlobal(enabled){
  if(globalLoading||globalSaving||busy||closed||phase==='disabled')return;
  const speed=enabled?(validSpeed(actual)?actual:validSpeed(globalState.speed)?globalState.speed:1):globalState.speed;
  const ticket=++seq;globalSaving=true;busy=true;globalHint='正在保存全局设置…';render();
  try{await configureGlobal(enabled,speed);globalReadPending=true;}
  catch(error){globalHint='全局设置或恢复结果未知：'+String(error?.message||'请重新打开核对').slice(0,90);}
  finally{globalSaving=false;if(ticket===seq)busy=false;if(!closed){render();drainGlobalRead();}}
}
async function read(background=false){
  if(busy||closed||(background&&readTicket===seq))return;
  pageShortcutPending=false;
  const ticket=++seq;readTicket=ticket;
  // Focus reads preserve verified controls; a set supersedes them through seq.
  if(!background||!available){
    busy=true;phase='detecting';available=false;actual=null;requested=null;
    notice='';noticeKind='';render();
  }
  try{
    const result=await request('videoSpeed.status',{});
    if(ticket!==seq||closed)return;
    receive(result);
  }catch(error){if(ticket===seq&&!closed)classify(error);}
  finally{
    if(readTicket===ticket)readTicket=0;
    if(ticket===seq&&!closed){busy=false;render();drainGlobalRead();}
  }
}
async function set(speed,source){
  if(busy||globalLoading||globalSaving||closed||phase==='disabled'||(!available&&!globalState.enabled)||!Number.isFinite(speed))return;
  const next=short(Math.max(.25,Math.min(4,speed)));
  if(next===null)return;
  // A cached read cannot prove the page still has this speed, even at 1×.
  pageShortcutPending=false;
  const previousPhase=phase;
  const ticket=++seq;requested=next;busy=true;phase='submitting';notice='';noticeKind='';render();
  try{
    const payload={speed:next};
    if(globalState.enabled){
      const configured=await configureGlobal(true,next);
      if(!configured||ticket!==seq||closed)return;
      payload.expectedRevision=configured.revision;
      if(!available){globalHint='共享目标已保存；当前无可控制视频，未验证实际倍速。';phase=previousPhase;return;}
    }
    const result=await request('videoSpeed.set',payload);
    if(ticket!==seq||closed)return;
    receive(result,source);
  }catch(error){if(ticket===seq&&!closed)classify(error);}
  finally{if(ticket===seq&&!closed){busy=false;render();drainGlobalRead();}}
}
async function activatePageShortcuts(){
  const ticket=++shortcutEpoch;
  if(!shortcutsEnabled||shortcutLoading||shortcutSaving||closed)return;
  try{
    const response=await request('videoSpeed.shortcuts.enable',{});
    if(ticket!==shortcutEpoch||closed||!shortcutsEnabled)return;
    shortcutHint=response?.enabled===true?'': '当前网页快捷键未就绪；侧边栏内可继续使用';
  }catch(error){
    if(ticket!==shortcutEpoch||closed||!shortcutsEnabled)return;
    shortcutHint='当前网页快捷键不可用；侧边栏内仍可操作';
  }
  render();
}
async function loadShortcuts(){
  const ticket=++preferenceEpoch;
  shortcutLoading=true;render();
  try{
    const saved=await request('storage.get',{key:'shortcutsEnabled'});
    if(closed||ticket!==preferenceEpoch)return;
    if(saved?.value!==null&&saved?.value!==true&&saved?.value!==false)
      throw Error('快捷键偏好无法读取');
    shortcutsEnabled=saved.value!==false;
    shortcutHint='';
  }catch{
    if(closed||ticket!==preferenceEpoch)return;
    shortcutsEnabled=false;
    shortcutHint='设置读取失败，快捷键已安全关闭；请重新打开应用';
  }finally{
    if(!closed&&ticket===preferenceEpoch){shortcutLoading=false;render();}
  }
  if(!closed&&ticket===preferenceEpoch&&shortcutsEnabled)void activatePageShortcuts();
}
function cancelPageShortcutReadback(){
  if(!pageShortcutPending)return;
  pageShortcutPending=false;++seq;busy=false;actual=null;available=false;requested=null;
  phase='stale';notice='快捷键已关闭，请刷新核对实际倍速';noticeKind='warn';
}
async function saveShortcuts(){
  if(shortcutSaving||shortcutLoading||closed)return;
  const ticket=++preferenceEpoch,next=!shortcutsEnabled;
  shortcutSaving=true;shortcutHint='';render();
  try{
    if(!next){shortcutsEnabled=false;++shortcutEpoch;cancelPageShortcutReadback();render();await request('videoSpeed.shortcuts.disable',{});}
    if(closed||ticket!==preferenceEpoch)return;
    await request('storage.set',{key:'shortcutsEnabled',value:next});
    if(closed||ticket!==preferenceEpoch)return;
    shortcutsEnabled=next;
    shortcutHint=next?'': '已关闭网页与侧边栏快捷键';
  }catch(error){
    if(closed||ticket!==preferenceEpoch)return;
    shortcutsEnabled=!next;
    shortcutHint='设置保存失败：'+String(error?.message||'请重试').slice(0,90);
  }finally{
    shortcutSaving=false;
    if(!closed){render();if(shortcutsEnabled)void activatePageShortcuts();}
  }
}
function onShortcutKey(key){
  if(!shortcutsEnabled||shortcutLoading||shortcutSaving||(!available&&!globalState.enabled)||busy||globalSaving||closed)return;
  if(key==='s')void set(Math.max(.25,adjustBase()-.25),'快捷键 S');
  if(key==='d')void set(Math.min(4,adjustBase()+.25),'快捷键 D');
  if(key==='r')void set(1,'快捷键 R');
}
for(const button of presets)button.addEventListener('click',()=>void set(Number(button.dataset.speed),'预设 '+button.textContent));
minus.addEventListener('click',()=>void set(adjustBase()-.25,'微调减速'));
plus.addEventListener('click',()=>void set(adjustBase()+.25,'微调加速'));
refresh.addEventListener('click',()=>{void read().then(()=>{if(shortcutsEnabled)void activatePageShortcuts();});});
toggle.addEventListener('click',()=>void saveShortcuts());
globalToggle.addEventListener('click',()=>void toggleGlobal(!globalState.enabled));
globalStop.addEventListener('click',()=>void toggleGlobal(false));
document.addEventListener('keydown',event=>{
  if(event.repeat||event.isComposing||event.defaultPrevented||
     event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||
     event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[role="textbox"],[contenteditable]'))
    return;
  const key=String(event.key||'').toLowerCase();
  if(['s','d','r'].includes(key)&&shortcutsEnabled){event.preventDefault();onShortcutKey(key);}
});
window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source===window.parent&&data?.protocol==='opendesk.video-speed.global.v1'&&data.kind==='preference'&&!closed){
    try{acceptGlobal(data.state);}catch{return;}
    ++globalEpoch;globalLoading=false;globalHint=globalState.enabled?'':'已停止自动应用；跨窗口恢复结果未确认。';
    globalReadPending=true;render();drainGlobalRead();return;
  }
  if(event.source!==window.parent||!data||
     data.protocol!=='opendesk.video-speed.shortcut.v1'||closed)return;
  if(data.kind==='preference'){
    ++preferenceEpoch;++shortcutEpoch;shortcutLoading=false;
    shortcutsEnabled=data.enabled===true;
    if(!shortcutsEnabled)cancelPageShortcutReadback();
    shortcutHint=shortcutsEnabled?'':'已关闭网页与侧边栏快捷键';
    render();drainGlobalRead();
    if(shortcutsEnabled)void activatePageShortcuts();
    return;
  }
  if(!shortcutsEnabled||shortcutLoading||shortcutSaving)return;
  if(data.kind==='pending'&&Number.isFinite(data.requested)){
    pageShortcutPending=true;++seq;requested=data.requested;busy=true;phase='submitting';
    // The last independently read number remains visible, never the target.
    notice='';render();
  }else if(data.kind==='verified'){
    pageShortcutPending=false;++seq;busy=false;
    try{receive(data.result,'快捷键 '+String(data.key||'').toUpperCase());}
    catch(error){classify(error);}
    render();drainGlobalRead();
  }else if(data.kind==='error'){
    pageShortcutPending=false;++seq;busy=false;classify({code:data.code,message:data.message});render();drainGlobalRead();
  }
});
root.addEventListener('opendesk-page-changed',()=>{
  ++seq;busy=false;available=false;actual=null;phase='stale';notice='网页已切换，请重新检测';render();
  void read().then(()=>{if(shortcutsEnabled)void activatePageShortcuts();});
});
window.addEventListener('focus',()=>{if(!busy)void read(true);});
window.addEventListener('pagehide',()=>{closed=true;++seq;++shortcutEpoch;},{once:true});
render();void read();void loadShortcuts();void loadGlobal();
})();

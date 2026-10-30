(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const current=root.querySelector('#speed-current');
const state=root.querySelector('#speed-state');
const message=root.querySelector('#speed-message');
const refresh=root.querySelector('#speed-refresh');
const presets=[...root.querySelectorAll('[data-speed]')];
const buttons=[...root.querySelectorAll('button')];
let rate=null,busy=false,available=false,closed=false;
const label=value=>Number.isFinite(value)
  ?String(Number(value.toFixed(2)))+'×':'—';
function status(text,kind=''){
  message.textContent=text;
  message.hidden=!text;
  message.dataset.kind=kind;
}
function paint(){
  current.textContent=label(rate);
  for(const button of presets)
    button.setAttribute('aria-pressed',String(available&&Number(button.dataset.speed)===rate));
  for(const button of buttons)button.disabled=busy||(button!==refresh&&!available);
  root.setAttribute('aria-busy',String(busy));
}
function accept(result){
  if(result?.status==='no-video'){
    rate=null;available=false;
    state.textContent=result.partial?'未检测到可访问的视频':'当前网页没有 HTML5 视频';
    status('开始播放视频后点击刷新。');
    return;
  }
  if(result?.status!=='available'||typeof result.speed!=='number'||!Number.isFinite(result.speed))
    throw Error('视频状态无法验证，请刷新');
  rate=result.speed;available=true;
  state.textContent=result.playing?'正在播放':'已检测到视频';
  if(result.verified===false)status('网页播放器覆盖了所选倍速，实际为 '+label(rate),'error');
  else if(result.partial)status('部分嵌入视频无法访问；已控制检测到的视频。');
  else status('');
}
async function read(){
  if(busy||closed)return;
  busy=true;paint();state.textContent='正在检测…';
  try{accept(await request('videoSpeed.status',{}));}
  catch(error){rate=null;available=false;state.textContent='暂不可用';status(String(error?.message||'无法检测视频').slice(0,180),'error');}
  finally{busy=false;if(!closed)paint();}
}
async function set(speed){
  if(busy||closed||!available||!Number.isFinite(speed)||speed<0.25||speed>4)return;
  busy=true;paint();status('正在设置倍速…');
  try{accept(await request('videoSpeed.set',{speed:Number(speed.toFixed(2))}));}
  catch(error){status(String(error?.message||'设置失败，请刷新检测').slice(0,180),'error');}
  finally{busy=false;if(!closed)paint();}
}
for(const button of presets)button.addEventListener('click',()=>void set(Number(button.dataset.speed)));
root.querySelector('#speed-minus').addEventListener('click',()=>void set(Math.max(0.25,Number((rate-0.25).toFixed(2)))));
root.querySelector('#speed-reset').addEventListener('click',()=>void set(1));
root.querySelector('#speed-plus').addEventListener('click',()=>void set(Math.min(4,Number((rate+0.25).toFixed(2)))));
refresh.addEventListener('click',()=>void read());
root.addEventListener('opendesk-page-changed',()=>void read());
window.addEventListener('focus',()=>void read());
window.addEventListener('pagehide',()=>{closed=true;},{once:true});
paint();void read();
})();

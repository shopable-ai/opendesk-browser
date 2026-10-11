(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const get=id=>root.querySelector('#'+id);
  let state=null,scope='today',busy=false,settingsLoaded=false;
  const duration=ms=>{const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);return hours?hours+'小时 '+minutes%60+'分':minutes?minutes+'分 '+seconds%60+'秒':seconds+'秒';};
  const message=(text,error=false)=>{get('status').textContent=text;get('status').dataset.error=String(error);};
  function rows(container,values){
    container.replaceChildren();
    if(!values.length){const empty=document.createElement('li');empty.textContent='暂无记录，开始后浏览普通网页即可。';container.append(empty);return;}
    for(const [label,ms] of values){const row=document.createElement('li'),name=document.createElement('span'),value=document.createElement('span');name.textContent=label;value.textContent=duration(ms);row.append(name,value);container.append(row);}
  }
  function render(){
    for(const button of root.querySelectorAll('button'))button.disabled=busy;
    if(!state)return;
    get('start').disabled=busy||!state.paused;get('start').textContent=state.authorized?'恢复记录':'开始记录';get('pause').disabled=busy||state.paused;
    get('today-total').textContent=duration(state.todayMs);get('week-total').textContent=duration(state.weekMs);
    get('today').setAttribute('aria-pressed',String(scope==='today'));get('week').setAttribute('aria-pressed',String(scope==='week'));
    get('daily-section').hidden=scope!=='week';rows(get('daily'),state.days.map(row=>[row.date,row.ms]));
    rows(get('sites'),(scope==='today'?state.todaySites:state.sites).slice(0,50).map(row=>[row.host,row.ms]));
    get('gap').hidden=!state.discardedMs;get('gap').textContent='有 '+duration(state.discardedMs)+' 无法确认活动的间隔（例如休眠或重启），已保守排除。';
    if(!settingsLoaded){get('idle').value=String(state.settings.idleSeconds);get('retention').value=String(state.settings.retentionDays);get('excluded').value=state.settings.excludedHosts.join('\n');settingsLoaded=true;}
  }
  async function act(operation,payload={}){
    if(busy)return;busy=true;render();
    try{
      const result=await request(operation,payload);
      if(operation==='time.export')message('已请求下载 '+result.name+'；请在浏览器下载记录中确认完成。');
      else{state=result;message(!state.idlePermission?'请在工具详情设置中授权空闲检测；当前未记录。':state.paused?'已暂停，历史记录保留。':state.trackingHost?'正在记录 '+state.trackingHost:'后台已开启，等待聚焦的普通网页。');}
    }catch(error){message((error.code||'E_TIME_REVIEW')+'：'+error.message,true);}
    finally{busy=false;render();}
  }
  get('start').addEventListener('click',()=>act('time.start'));
  get('pause').addEventListener('click',()=>act('time.pause'));
  get('refresh').addEventListener('click',()=>act('time.status'));
  for(const id of ['today','week'])get(id).addEventListener('click',()=>{scope=id;render();});
  get('save-settings').addEventListener('click',()=>act('time.settings',{idleSeconds:Number(get('idle').value),retentionDays:Number(get('retention').value),excludedHosts:get('excluded').value.split(/\s+/).filter(Boolean).map(value=>value.toLowerCase())}));
  get('export-json').addEventListener('click',()=>act('time.export',{format:'json'}));
  get('export-csv').addEventListener('click',()=>act('time.export',{format:'csv'}));
  get('revoke').addEventListener('click',()=>act('time.revoke'));
  get('clear').addEventListener('click',()=>{get('clear-confirm').hidden=false;get('clear-yes').focus();});
  get('clear-no').addEventListener('click',()=>{get('clear-confirm').hidden=true;get('clear').focus();});
  get('clear-yes').addEventListener('click',()=>{get('clear-confirm').hidden=true;void act('time.clear',{confirm:true});});
  // This timer refreshes presentation only; alarms and SW own all tracking.
  const timer=setInterval(()=>{if(!busy&&!document.hidden&&!get('settings').open)void act('time.status');},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  void act('time.status');
})();

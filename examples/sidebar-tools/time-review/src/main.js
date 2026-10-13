(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  const C=[
    {name:'未分类',short:'未分类',color:'#788494'},
    {name:'重要且紧急',short:'重要且紧急',color:'#1976d2'},
    {name:'重要不紧急',short:'重要不紧急',color:'#3b8ad9'},
    {name:'紧急不重要',short:'紧急不重要',color:'#b64f4f'},
    {name:'不重要不紧急',short:'不重要不紧急',color:'#ec5d5d'},
    {name:'生活',short:'生活',color:'#c8992d'}
  ];
  let state=null,day=null,selectedDate=null,scope='today',busy=false,settingsLoaded=false,selectedMinute=null,filter=null,editing=false,daySerial=0;
  let canvasGeometry=null;
  const formatMs=ms=>{
    if(!Number.isFinite(ms)||ms<0)return '—';
    const sec=Math.floor(ms/1000),min=Math.floor(sec/60),hr=Math.floor(min/60);
    return hr?hr+'小时'+(min%60?min%60+'分':''):min?min+'分':sec+'秒';
  };
  const percent=(n,total)=>total?Math.round(n/total*100)+'%':'—';
  const minuteLabel=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const newNode=(tag,cls,text)=>{
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=text;
    return element;
  };
  const showMessage=(message,error=false)=>{$('status').textContent=message;$('status').dataset.error=String(error);};
  function activityStatus(view){
    if(view.paused)return '已暂停';
    if(!view.idlePermission)return '空闲检测未授权';
    if(view.trackingHost)return '正在记录';
    return ({
      idle:'系统空闲 · 暂不计时',
      'window-inactive':'Chrome 未在前台',
      excluded:'当前网站已排除',
      'site-not-authorized':'当前网站未授权',
      'chrome-site-permission':'Chrome 网站权限不足',
      'unsupported-page':'当前页面不计时',
      'observation-error':'无法确认活动状态'
    })[view.waitingReason]||'已启用 · 等待可记录网站';
  }
  const safeDate=date=>new Date(date+'T12:00:00');
  const shiftDate=(date,offset)=>{
    const d=safeDate(date);d.setDate(d.getDate()+offset);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  };
  const earliest=()=>{
    if(!state)return null;
    return shiftDate(state.today,-state.settings.retentionDays+1);
  };
  function dayData(){
    if(day?.date===selectedDate)return day;
    if(state?.today===selectedDate){
      return {date:state.today,totalMs:state.todayMs,importantMs:state.todayImportantMs,
        categoryMs:state.todayCategoryMs||[0,0,0,0,0,0],classifiedMs:state.todayClassifiedMs||0,
        productivityPct:state.todayProductivityPct??null,sites:state.todaySites||[],
        minuteSlots:[],timelineStatus:'unavailable',minuteCoveredMs:0,minuteConsent:state.minuteConsent};
    }
    return null;
  }
  function renderCategories(data){
    const counts=data?.categoryMs||[0,0,0,0,0,0],total=data?.totalMs||0;
    $('category-total').textContent=total?'合计 '+formatMs(total):'暂无记录';
    const dist=$('distribution');dist.replaceChildren();
    for(const cat of [1,2,0,3,4,5]){
      const track=newNode('i');
      track.style.background=C[cat].color;
      track.style.width=(total?100*counts[cat]/total:0)+'%';
      track.title=C[cat].name+' · '+formatMs(counts[cat]);
      dist.append(track);
    }
    const quad=$('quadrants');
    const focusedCategory=quad.contains(document.activeElement)?document.activeElement?.dataset?.cat:null;
    quad.replaceChildren();
    for(const cat of [1,2,3,4]){
      const card=newNode('button','qcard');card.type='button';card.dataset.cat=String(cat);
      card.style.setProperty('--cat',C[cat].color);
      const name=newNode('span','q-name',C[cat].short);
      card.setAttribute('aria-pressed',String(scope==='today'&&filter===cat));
      card.setAttribute('aria-label','按'+C[cat].name+'筛选网站');
      const bottom=newNode('span','q-bottom');
      bottom.append(newNode('b','',total?formatMs(counts[cat]):'—'),newNode('small','',percent(counts[cat],total)));
      const meter=newNode('span','q-meter'),fill=newNode('i');
      fill.style.width=(total?counts[cat]/total*100:0)+'%';meter.append(fill);
      card.append(name,bottom,meter);
      card.addEventListener('click',()=>{filter=scope==='today'&&filter===cat?null:cat;scope='today';render();$('sites').scrollIntoView({block:'nearest'});});
      quad.append(card);
    }
    if(focusedCategory!==null)quad.querySelector('[data-cat="'+focusedCategory+'"]')?.focus({preventScroll:true});
    const extras=$('extra-categories');
    const focusedExtra=extras.contains(document.activeElement)?document.activeElement?.dataset?.cat:null;
    extras.replaceChildren();
    for(const cat of [5,0]){
      const card=newNode('button','extra-card');card.type='button';card.dataset.cat=String(cat);
      card.style.setProperty('--cat',C[cat].color);
      const name=newNode('span','extra-name'),dot=newNode('i','dot');
      name.append(dot,document.createTextNode(C[cat].name));
      card.append(name,newNode('span','extra-min',total?formatMs(counts[cat]):'—'));
      card.setAttribute('aria-pressed',String(scope==='today'&&filter===cat));
      card.setAttribute('aria-label','按'+C[cat].name+'筛选网站');
      card.addEventListener('click',()=>{filter=scope==='today'&&filter===cat?null:cat;scope='today';render();$('sites').scrollIntoView({block:'nearest'});});
      extras.append(card);
    }
    if(focusedExtra!==null)extras.querySelector('[data-cat="'+focusedExtra+'"]')?.focus({preventScroll:true});
  }
  function renderCanvas(data){
    const canvas=$('minute-canvas'),rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width||canvas.clientWidth||250);
    const h=54,dpr=Math.min(window.devicePixelRatio||1,3);
    const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const barY=7,barH=18,bins=Array(1440).fill(null);
    for(const entry of data?.minuteSlots||[]){
      if(Array.isArray(entry)&&Number.isInteger(entry[0])&&entry[0]>=0&&entry[0]<1440&&Number.isInteger(entry[1])&&entry[1]>=0&&entry[1]<=5)
        bins[entry[0]]=entry;
    }
    canvasGeometry={w,bins,barY,barH,complete:data?.timelineStatus==='complete'};
    ctx.save();ctx.beginPath();
    if(typeof ctx.roundRect==='function')ctx.roundRect(0,barY,w,barH,5);else ctx.rect(0,barY,w,barH);
    ctx.clip();ctx.fillStyle='#eef2f8';ctx.fillRect(0,barY,w,barH);
    for(let minute=0;minute<1440;){
      const current=bins[minute],cat=current?.[1],begin=minute;
      while(minute<1440&&bins[minute]?.[1]===cat)minute++;
      if(current){ctx.fillStyle=C[cat].color;ctx.fillRect(begin/1440*w,barY,(minute-begin)/1440*w,barH);}
    }
    ctx.restore();
    ctx.font='10px -apple-system,system-ui,sans-serif';ctx.fillStyle='#798ba3';ctx.textBaseline='middle';
    const step=w<110?4:w<230?2:1;
    for(let q=0;q<=4;q+=step){
      const x=q*w/4;ctx.textAlign=q===0?'left':q===4?'right':'center';
      ctx.fillText(minuteLabel(q*360),x,barY+barH+14);
    }
    if(selectedMinute!==null){
      const x=Math.max(0,Math.min(w-1,selectedMinute/1440*w));
      ctx.fillStyle='#203047';ctx.fillRect(x,barY-3,1.5,barH+6);
    }
    renderReadout();
  }
  function renderReadout(){
    const minute=selectedMinute;
    if(minute===null){$('timeline-text').textContent='选择时间查看对应分钟';$('timeline-swatch').style.background='#b3c0d0';return;}
    const data=dayData(),item=canvasGeometry?.bins[minute];
    let info='暂无可验证的分钟数据',color='#b3c0d0';
    if(item){info=C[item[1]].name+' · '+item[3]+' · '+formatMs(item[2]);color=C[item[1]].color;}
    else if(data?.timelineStatus==='complete')info='未记录';
    else if(data?.timelineStatus==='partial')info='未保存分钟明细';
    $('timeline-text').textContent=minuteLabel(minute)+' · '+info;
    $('timeline-swatch').style.background=color;
    $('minute-canvas').setAttribute('aria-valuenow',String(minute));
    $('minute-canvas').setAttribute('aria-valuetext',minuteLabel(minute)+' · '+info);
  }
  function renderTimeline(data){
    const status=data?.timelineStatus||'unavailable';
    const labels={complete:'分钟明细完整',partial:'部分分钟明细',unavailable:'尚无分钟明细',dst:'夏令时日期',timezone:'时区数据不确定'};
    $('timeline-state').textContent=labels[status];
    $('timeline-note').hidden=status==='complete';
    $('timeline-note').textContent=status==='partial'?'仅显示已保存的真实分钟；空白位置不代表未访问。':
      status==='dst'||status==='timezone'?'该日期的本地 24 小时刻度无法可靠定位，保留真实日汇总。':
      data?.totalMs?'此日期有汇总记录，但没有可验证的分钟位置。旧历史不会自动补造。':
      state?.minuteConsent?'还没有产生分钟记录。':'可在设置中自愿开启未来的分钟明细。';
    renderCanvas(data);
  }
  function renderCurrent(data){
    const host=state?.paused?null:state?.trackingHost||null;
    $('site-host').textContent=host||'当前没有正在记录的网站';
    const reasons={paused:'记录已暂停', 'site-not-authorized':'当前网站未单独授权记录',
      'chrome-site-permission':'OpenDesk 缺少该站点的 Chrome 权限',
      'idle-permission':'请授权空闲检测后开始记录',idle:'Chrome 检测到用户空闲',
      'window-inactive':'Chrome 当前不在前台',excluded:'该网站已排除',
      'unsupported-page':'仅支持普通非隐身网页', 'observation-error':'暂时无法核实网页活动'};
    $('site-hint').textContent=host?'仅记录域名，不读取网页正文':
      reasons[state?.waitingReason]||'等待已授权网站成为前台活动页面';
    // The live-site card always reflects today, even while reviewing an earlier date.
    const site=(state?.todaySites||[]).find(row=>row.host===host);
    $('site-time').textContent=site?formatMs(site.ms):'—';
    const cat=host?(state?.siteCategories?.[host]??0):undefined;
    $('site-category').textContent=host&&cat!==undefined?C[cat].name:'—';
    $('tracking-state').textContent=host?'正在记录':state?.paused?'已暂停':'未记录';
    $('edit-category').disabled=busy||!host||!site;
    $('inline-edit').hidden=!editing||!host||!site;
    if(site&&!editing)$('type-select').value=String(site.category??0);
  }
  function renderRecords(){
    if(!state)return;
    $('today').setAttribute('aria-pressed',String(scope==='today'));
    $('week').setAttribute('aria-pressed',String(scope==='week'));
    $('daily-section').hidden=scope!=='week';
    $('week-total').textContent='七天 '+formatMs(state.weekMs);
    const daily=$('daily');daily.replaceChildren();
    for(const item of state.days||[]){
      const row=newNode('li','detail-item');
      row.append(newNode('b','',item.date),newNode('strong','',formatMs(item.ms)));
      daily.append(row);
    }
    const selected=dayData();
    const items=scope==='week'?state.sites||[]:selected?.sites||[];
    const shown=items.filter(item=>scope==='week'||filter===null||(item.category??0)===filter).slice(0,50);
    const list=$('sites');list.replaceChildren();
    if(!shown.length){
      const item=newNode('li','detail-item',filter!==null?'该分类暂无网站记录':'暂无记录');
      list.append(item);return;
    }
    for(const item of shown){
      const row=newNode('li','detail-item'),entry=newNode('div','entry');
      const currentCat=scope==='today'?item.category??0:state.siteCategories?.[item.host]??0;
      entry.append(newNode('b','',item.host),newNode('small','',C[currentCat].name+(scope==='week'?' · 近七天':'')));

      const value=newNode('strong','',formatMs(item.ms));
      row.append(entry,value);
      {
        const edit=newNode('button','','分类');edit.type='button';edit.disabled=busy;
        edit.setAttribute('aria-label','修改 '+item.host+' 的分类');
        edit.addEventListener('click',()=>{
          if(row.querySelector('select')){row.querySelector('.row-edit').remove();return;}
          const area=newNode('div','row-edit'),sel=newNode('select'),save=newNode('button','primary','保存');
          for(let id=0;id<C.length;id++){const option=document.createElement('option');option.value=String(id);option.textContent=C[id].name;sel.append(option);}
          sel.value=String(currentCat);sel.setAttribute('aria-label',item.host+' 的分类');save.type='button';
          save.addEventListener('click',()=>void act('time.classify',{host:item.host,category:Number(sel.value)}));
          area.append(sel,save);entry.append(area);sel.focus();
        });
        row.append(edit);
      }
      list.append(row);
    }
  }
  function render(){
    for(const button of root.querySelectorAll('button'))button.disabled=busy||!state;
    if(!state)return;
    const data=dayData();
    const compatible=state.hostApiVersion==='time.review/1.5.0';
    $('start').disabled=busy||!state.paused||!compatible;
    $('start').hidden=!state.paused;
    $('pause').hidden=state.paused;
    const startLabel=state.authorized?'恢复记录':'开始记录';
    $('start').title=startLabel;
    $('start').setAttribute('aria-label',startLabel);
    $('pause').title='暂停记录';
    $('pause').setAttribute('aria-label','暂停记录');
    const grants=state.siteGrants||{allSites:false,origins:[]};
    $('site-grant-summary').textContent=!compatible?'后台版本不支持独立网站授权，请先升级 OpenDesk 主扩展。':
      grants.allSites?'已同意记录全部普通网站（可在工具详情撤销）':
      grants.origins?.length?'已单独授权 '+grants.origins.length+' 个网站（在工具详情管理）':
      '尚未授权网站；请在「工具详情 → 设置」先授权当前网站或全部普通网站。';
    $('site-grant-summary').hidden=compatible&&state.idlePermission&&
      (grants.allSites||Boolean(grants.origins?.length))&&
      !['site-not-authorized','chrome-site-permission'].includes(state.waitingReason);
    $('pause').disabled=busy||state.paused;
    $('next-date').disabled=busy||selectedDate>=state.today;
    $('prev-date').disabled=busy||selectedDate<=earliest();
    $('date-label').textContent=safeDate(selectedDate).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
    $('date-subtitle').textContent=selectedDate===state.today?'今天 · 本机统计':selectedDate;
    $('today-total').textContent=data?formatMs(data.totalMs):'—';
    $('important-time').textContent=data?formatMs(data.importantMs):'—';
    $('productivity').textContent=data?.productivityPct===null||!data?'—':data.productivityPct+'%';
    $('coverage').textContent=data?.totalMs?'已分类 '+percent(data.classifiedMs,data.totalMs):'暂无分类统计';
    $('eff-fill').style.width=(data?.productivityPct??0)+'%';
    const yesterday=selectedDate===state.today?state.yesterdayMs:null;
    $('yesterday-compare').textContent=yesterday===null?'暂无昨日比较':
      '较昨日 '+(state.todayMs-yesterday>=0?'+':'−')+formatMs(Math.abs(state.todayMs-yesterday));
    $('minute-consent').textContent=state.minuteConsent?'关闭并删除':'开启';
    if(!settingsLoaded){
      $('idle').value=String(state.settings.idleSeconds);
      $('retention').value=String(state.settings.retentionDays);
      $('excluded').value=state.settings.excludedHosts.join('\n');settingsLoaded=true;
    }
    $('gap').hidden=!state.discardedMs;
    $('gap').textContent=state.discardedMs?'无法确认的活动间隔 '+formatMs(state.discardedMs)+'，已排除。':'';
    renderCategories(data);renderTimeline(data);renderCurrent(data);renderRecords();
  }
  async function readDay(){
    if(!state)return;
    const serial=++daySerial,requested=selectedDate;
    try{
      const result=await request('time.day',{date:requested});
      if(serial!==daySerial||selectedDate!==requested)return;
      day=result;render();
    }catch(err){if(serial!==daySerial)return;day=null;showMessage((err.code||'E_TIME_DAY')+'：'+err.message,true);render();}
  }
  async function act(operation,payload={}){
    if(busy)return;
    busy=true;render();
    try{
      const result=await request(operation,payload);
      if(operation==='time.export'){
        showMessage('已请求下载 '+result.name+'；请在 Chrome 下载记录中核对文件。');
      }else{
        state=result;
        if(!selectedDate||selectedDate>state.today||selectedDate<earliest())selectedDate=state.today;
        if(operation==='time.clear'){day=null;filter=null;editing=false;}
        showMessage(activityStatus(state));
        await readDay();
      }
    }catch(err){
      if(err?.code==='E_TIME_PERMISSION_SETUP')
        showMessage('请在上方授权卡确认网站范围和空闲检测权限，然后开始记录。');
      else if(err?.code==='E_TIME_TRUSTED_CLICK')
        showMessage('请在上方工具设置中确认所选操作。');
      else showMessage((err.code||'E_TIME_REVIEW')+'：'+err.message,true);
    }
    finally{busy=false;render();}
  }
  function chooseMinute(minute){
    selectedMinute=Math.max(0,Math.min(1439,minute));
    renderCanvas(dayData());
  }
  const canvas=$('minute-canvas');
  function onPointer(event){
    const rect=canvas.getBoundingClientRect(),w=rect.width;
    if(!w)return;
    chooseMinute(Math.min(1439,Math.floor(Math.max(0,Math.min(w,event.clientX-rect.left))/w*1440)));
  }
  canvas.addEventListener('pointerdown',onPointer);
  canvas.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')onPointer(event);});
  canvas.addEventListener('keydown',event=>{
    const key=event.key;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(key))return;
    event.preventDefault();
    if(key==='Home')chooseMinute(0);else if(key==='End')chooseMinute(1439);
    else chooseMinute((selectedMinute??0)+({ArrowLeft:-1,ArrowRight:1,ArrowUp:60,ArrowDown:-60}[key]||0)*(event.shiftKey?10:1));
  });
  $('prev-date').addEventListener('click',()=>{if(selectedDate>earliest()){selectedDate=shiftDate(selectedDate,-1);day=null;selectedMinute=null;editing=false;filter=null;render();void readDay();}});
  $('next-date').addEventListener('click',()=>{if(selectedDate<state.today){selectedDate=shiftDate(selectedDate,1);day=null;selectedMinute=null;editing=false;filter=null;render();void readDay();}});
  $('today').addEventListener('click',()=>{scope='today';filter=null;renderRecords();});
  $('week').addEventListener('click',()=>{scope='week';filter=null;renderRecords();});
  $('start').addEventListener('click',()=>void act('time.start'));
  $('pause').addEventListener('click',()=>void act('time.pause'));
  $('refresh').addEventListener('click',()=>void act('time.status'));
  $('settings-shortcut').addEventListener('click',()=>{$('settings').open=true;$('settings').scrollIntoView({block:'nearest'});});
  $('edit-category').addEventListener('click',()=>{editing=!editing;renderCurrent(dayData());if(editing)$('type-select').focus();});
  $('cancel-category').addEventListener('click',()=>{editing=false;renderCurrent(dayData());});
  $('save-category').addEventListener('click',()=>{
    const host=state.trackingHost;
    if(host){editing=false;void act('time.classify',{host,category:Number($('type-select').value)});}
  });
  $('minute-consent').addEventListener('click',()=>void act('time.minuteConsent',{enabled:!state.minuteConsent}));
  $('save-settings').addEventListener('click',()=>void act('time.settings',{
    idleSeconds:Number($('idle').value),retentionDays:Number($('retention').value),
    excludedHosts:$('excluded').value.split(/\s+/).filter(Boolean).map(x=>x.toLowerCase())
  }));
  $('export-json').addEventListener('click',()=>void act('time.export',{format:'json'}));
  $('export-csv').addEventListener('click',()=>void act('time.export',{format:'csv'}));
  $('revoke').addEventListener('click',()=>void act('time.revoke'));
  // The trusted extension host owns the irreversible-operation confirmation.
  $('clear').addEventListener('click',()=>void act('time.clear',{confirm:true}));
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>renderCanvas(dayData())):null;
  resize?.observe(canvas);
  const onResize=()=>renderCanvas(dayData());
  if(!resize)window.addEventListener('resize',onResize);
  // Trusted Host changes are reflected without waiting for the 15s poll.
  // The event itself carries no state: we re-read via the existing authority.
  const onTrustedStateChanged=()=>{
    if(!busy&&!document.hidden&&!editing&&!root.querySelector('.row-edit'))
      void act('time.status');
  };
  root.addEventListener('opendesk-tool-state-changed',onTrustedStateChanged);
  const timer=window.setInterval(()=>{
    // A background refresh must not destroy a user's unsaved classification
    // editor (record rows are re-rendered from the current summary).
    if(!busy&&!document.hidden&&!$('settings').open&&!editing&&!root.querySelector('.row-edit'))void act('time.status');
  },15000);
  window.addEventListener('pagehide',()=>{
    window.clearInterval(timer);resize?.disconnect();
    root.removeEventListener('opendesk-tool-state-changed',onTrustedStateChanged);
    if(!resize)window.removeEventListener('resize',onResize);
  },{once:true});
  void act('time.status');
})();
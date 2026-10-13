(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  const create=(tag,klass,text)=>{
    const el=document.createElement(tag);if(klass)el.className=klass;
    if(text!==undefined)el.textContent=text;return el;
  };
  let state=null,busy=false,lastHost='',firstSettings=true;
  const message=(text,error=false)=>{$('message').textContent=text;$('message').dataset.error=String(error);};
  const minutes=ms=>ms>=3600000?Math.floor(ms/3600000)+' 小时 '+Math.floor(ms%3600000/60000)+' 分钟':Math.max(0,Math.ceil(ms/60000))+' 分钟';
  const escapeHost=value=>{
    try{
      const text=String(value||'').trim();
      const parsed=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);
      if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return '';
      return parsed.hostname.toLowerCase().replace(/\.$/,'');
    }catch{return '';}
  };
  const siteLabel=reason=>({session:'专注中',schedule:'工作时段',always:'始终限制',quota:'额度已用完'})[reason]||'允许访问';
  const checkTime=(input)=>{
    const match=/^(\d{2}):(\d{2})$/.exec(input);
    if(!match)return NaN;
    const hours=+match[1],min=+match[2];return hours<24&&min<60?hours*60+min:NaN;
  };
  const formatTime=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
  const call=async(op,payload={})=>{
    if(busy)return;
    busy=true;
    const buttons=[...root.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
    try{
      message(op==='focus.status'?'正在读取本机状态…':'请在外层可信工具宿主确认本次修改…');
      const result=await request(op,payload);
      state=result;render();
      message(op==='focus.status'?'':'操作已提交并核对 Chrome 规则状态。');
    }catch(error){
      message(String(error?.message||error),true);
    }finally{
      busy=false;buttons.forEach(x=>x.disabled=false);
    }
  };
  const badgeSite=(site)=>{
    const row=create('article','sf-site');row.dataset.blocked=String(Boolean(site.reason));
    const left=create('div','sf-site-main');
    left.append(create('strong','',site.host),create('small','',
      (site.reason?siteLabel(site.reason)+' · ':'')+
      (site.mode==='always'?'不计额度':minutes(site.remainingMs)+' 剩余 / '+minutes(site.budgetMs))+
      (site.group?' · '+site.group:'')+(site.subdomains?' · 含子域名':'')));
    const actions=create('div','sf-site-actions');
    const edit=create('button','','编辑');edit.type='button';edit.setAttribute('aria-label','编辑 '+site.host);
    edit.addEventListener('click',()=>{
      $('site-host').value=site.host;$('site-minutes').value=site.minutes;
      $('site-mode').value=site.mode;$('site-subdomains').checked=site.subdomains;
      $('site-group').value=site.group;$('site-host').focus();
    });
    const toggle=create('button','',site.enabled?'暂停':'启用');toggle.type='button';
    toggle.setAttribute('aria-label',(site.enabled?'暂停':'启用')+' '+site.host);
    toggle.addEventListener('click',()=>call('focus.site.put',{site:{
      host:site.host,subdomains:site.subdomains,enabled:!site.enabled,
      mode:site.mode,minutes:site.minutes,group:site.group}}));
    const remove=create('button','','移除');remove.type='button';remove.setAttribute('aria-label','移除 '+site.host);
    remove.addEventListener('click',()=>call('focus.site.remove',{host:site.host}));
    actions.append(edit,toggle,remove);row.append(left,actions);return row;
  };
  function render(){
    if(!state)return;
    $('native-state').textContent=state.enabled?'已开启':'未开启';
    $('native-state').dataset.active=String(state.enabled);
    $('date-label').textContent=state.day;
    const pools=new Map();
    for(const site of state.sites.filter(s=>s.enabled&&s.mode==='limit'))
      pools.set(site.group?'group:'+site.group:site.host,
        {left:site.remainingMs,total:site.budgetMs});
    const remaining=[...pools.values()].reduce((sum,v)=>sum+v.left,0);
    const budget=[...pools.values()].reduce((sum,v)=>sum+v.total,0);
    $('total-remaining').textContent=pools.size?minutes(remaining):'—';
    $('total-caption').textContent=!state.enabled?'需要在工具详情中点击「授权并开启网站限制」。':
      !pools.size?'添加首个每日限额网站，开始保护专注时间。':
      '今天共 '+pools.size+' 份独立娱乐额度 · '+minutes(Math.max(0,budget-remaining))+' 已使用';
    $('total-progress').style.width=(budget?Math.max(0,Math.min(100,100*(budget-remaining)/budget)):0)+'%';
    const focused=state.focusUntil&&state.focusUntil>Date.now();
    $('focus-start').hidden=Boolean(focused);
    $('focus-stop').hidden=!focused;
    if(focused)$('total-caption').textContent='专注模式进行中，预计 '+new Date(state.focusUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' 结束。';
    $('site-count').textContent=state.sites.length+' 个网站';
    const list=$('sites');list.replaceChildren();
    for(const site of state.sites)list.append(badgeSite(site));
    if(!state.sites.length)list.append(create('p','sf-empty','还没有限制的网站，可以从下方添加。'));
    const groupSelect=$('site-group'),selected=groupSelect.value;
    groupSelect.replaceChildren(new Option('不共享',''));
    for(const id of Object.keys(state.groups).sort())groupSelect.append(new Option(id+' · '+state.groups[id]+' 分钟',id));
    groupSelect.value=Object.hasOwn(state.groups,selected)?selected:'';
    const groups=$('groups');groups.replaceChildren();
    for(const [id,min] of Object.entries(state.groups).sort((a,b)=>a[0].localeCompare(b[0]))){
      const row=create('div','sf-group'),label=create('span','',id+' · '+min+' 分钟/天');
      const remove=create('button','','删除组');remove.type='button';
      remove.addEventListener('click',()=>call('focus.group.remove',{id}));
      row.append(label,remove);groups.append(row);
    }
    if(firstSettings){
      firstSettings=false;
      const s=state.schedule;$('schedule-enabled').checked=s.enabled;
      for(const checkbox of $('weekdays').querySelectorAll('input'))
        checkbox.checked=s.days.includes(+checkbox.value);
      $('schedule-from').value=formatTime(s.startMinute);$('schedule-to').value=formatTime(s.endMinute%1440);
      $('whitelist').value=state.whitelist.join('\n');
    }
  }
  $('site-form').addEventListener('submit',event=>{
    event.preventDefault();
    const host=escapeHost($('site-host').value),minutesValue=Number($('site-minutes').value);
    if(!host||!Number.isInteger(minutesValue)||minutesValue<1||minutesValue>1440){
      message('请输入有效的 HTTP(S) 网站域名和 1–1440 分钟的限额。',true);return;
    }
    call('focus.site.put',{site:{host,minutes:minutesValue,
      subdomains:$('site-subdomains').checked,enabled:true,
      mode:$('site-mode').value,group:$('site-group').value}});
  });
  $('add-current').addEventListener('click',async()=>{
    if(busy)return;
    try{
      const current=await request('currentPage.info',{});
      const host=escapeHost(current?.url);
      if(!host)throw new Error('当前选中的标签页不支持添加，先切换到正常网站。');
      $('site-host').value=host;$('site-host').focus();message('已填写当前网站，请选择额度并保存。');
    }catch(error){message(String(error?.message||error),true);}
  });
  $('focus-start').addEventListener('click',()=>call('focus.session.start',{minutes:25}));
  $('focus-stop').addEventListener('click',()=>call('focus.session.stop',{}));
  $('group-form').addEventListener('submit',event=>{
    event.preventDefault();
    const id=$('group-name').value.trim().toLowerCase(),mins=Number($('group-minutes').value);
    if(!/^[a-z][a-z0-9-]{0,23}$/.test(id)||!Number.isInteger(mins)||mins<1||mins>1440){
      message('组名只支持小写字母、数字和连字符，限额 1–1440 分钟。',true);return;
    }
    call('focus.group.put',{id,minutes:mins});
  });
  $('schedule-form').addEventListener('submit',event=>{
    event.preventDefault();
    const startMinute=checkTime($('schedule-from').value),endMinute=checkTime($('schedule-to').value);
    if(!Number.isInteger(startMinute)||!Number.isInteger(endMinute)||startMinute===endMinute){
      message('请设置不同的开始和结束时间。',true);return;
    }
    const days=[...$('weekdays').querySelectorAll('input:checked')].map(input=>Number(input.value));
    call('focus.schedule.set',{schedule:{enabled:$('schedule-enabled').checked,days,startMinute,endMinute}});
  });
  $('whitelist-form').addEventListener('submit',event=>{
    event.preventDefault();
    const hosts=$('whitelist').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(escapeHost);
    if(hosts.some(host=>!host)||new Set(hosts).size!==hosts.length||hosts.length>50){
      message('白名单最多 50 个不重复有效域名。',true);return;
    }
    call('focus.whitelist.set',{hosts});
  });
  // The iframe refresh is for display only: the MV3 SW/alarms own all counting.
  void call('focus.status',{});
  setInterval(()=>{if(!busy&&document.visibilityState==='visible')void call('focus.status',{});},30000);
})();
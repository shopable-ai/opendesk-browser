(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  const create=(tag,klass,text)=>{
    const el=document.createElement(tag);if(klass)el.className=klass;
    if(text!==undefined)el.textContent=text;return el;
  };
  let state=null,busy=false,firstSettings=true,currentSuggestion=null;
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
  // Local, transparent recommendations. Exact registered domains (including
  // subdomains) take precedence over untrusted website titles. No URL history,
  // page body, third-party lookup or permission changes are used here.
  const knownSites=[
    {host:'youtube.com',name:'YouTube',category:'视频娱乐',minutes:15,preset:true},
    {host:'bilibili.com',name:'哔哩哔哩',category:'视频娱乐',minutes:15,preset:true},
    {host:'tiktok.com',name:'TikTok',category:'短视频',minutes:15,preset:true},
    {host:'douyin.com',name:'抖音',category:'短视频',minutes:15},
    {host:'instagram.com',name:'Instagram',category:'社交',minutes:20,preset:true},
    {host:'reddit.com',name:'Reddit',category:'社交',minutes:20},
    {host:'x.com',name:'X',category:'社交',minutes:20},
    {host:'weibo.com',name:'微博',category:'社交',minutes:20},
    {host:'netflix.com',name:'Netflix',category:'影视娱乐',minutes:30},
    {host:'twitch.tv',name:'Twitch',category:'直播娱乐',minutes:30},
    {host:'roblox.com',name:'Roblox',category:'游戏',minutes:30},
    {host:'github.com',name:'GitHub',category:'工作/开发',minutes:0},
    {host:'stackoverflow.com',name:'Stack Overflow',category:'工作/开发',minutes:0},
    {host:'docs.google.com',name:'Google Docs',category:'工作',minutes:0},
    {host:'wikipedia.org',name:'Wikipedia',category:'学习',minutes:0},
    {host:'coursera.org',name:'Coursera',category:'学习',minutes:0}
  ];
  const sameOrChild=(host,parent)=>host===parent||host.endsWith('.'+parent);
  const siteRule=site=>({host:site.host,subdomains:true,enabled:true,
    mode:'limit',minutes:site.minutes,group:''});
  function classifyCurrent(info){
    if(info?.status!=='available')return null;
    const host=escapeHost(info.url);
    if(!host)return null;
    const known=knownSites.find(site=>sameOrChild(host,site.host));
    if(known)return {...known,source:'domain'};
    const title=String(info.title||'').slice(0,256);
    // Title is only a weak hint: it never grants access or creates any rule.
    if(/学习|课程|教程|文档|education|tutorial|course|documentation/i.test(title))
      return {host,name:host,category:'可能是学习/工作',minutes:0,source:'title'};
    if(/娱乐|短视频|直播|影视|电影|游戏|video|streaming|gaming|movies/i.test(title))
      return {host,name:host,category:'可能是娱乐',minutes:15,source:'title'};
    return {host,name:host,category:'未分类',minutes:15,source:'unknown'};
  }
  const configured=site=>Boolean(state?.sites?.some(saved=>
    sameOrChild(site.host,saved.host)&&saved.subdomains||site.host===saved.host));
  function renderSuggestions(){
    const card=$('quick-current'),empty=$('quick-empty'),apply=$('quick-add');
    if(!currentSuggestion){card.hidden=true;empty.hidden=false;}
    else{
      const site=currentSuggestion,exists=configured(site);
      card.hidden=false;empty.hidden=true;
      $('quick-site').textContent=site.name===site.host?site.host:site.name+' · '+site.host;
      $('quick-explanation').textContent=(site.source==='domain'?'已识别：':
        site.source==='title'?'按页面标题推测：':'暂未识别类型：')+site.category+
        (site.minutes>0?' · 推荐每天 '+site.minutes+' 分钟':' · 默认不限制')+
        (exists?' · 已设置':'');
      apply.hidden=site.minutes===0||exists;
      apply.textContent=site.source==='unknown'?'添加此网站 · 每天 15 分钟':
        '使用推荐额度 · '+site.minutes+' 分钟/天';
    }
    const presets=$('quick-presets');
    presets.replaceChildren();
    // Show only unconfigured popular sites; adding one recommendation must
    // not hide the other one-click shortcuts.
    for(const site of knownSites.filter(row=>row.preset&&!configured(row))){
      const button=create('button','sf-secondary',site.name+' · '+site.minutes+' 分钟');
      button.type='button';
      button.addEventListener('click',()=>call('focus.site.put',{site:siteRule(site)}));
      presets.append(button);
    }
  }
  async function recognizeCurrent(){
    try{currentSuggestion=classifyCurrent(await request('currentPage.info',{}));}
    catch{currentSuggestion=null;}
    renderSuggestions();
  }

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
      if(op==='focus.status')message('');
      else if(!result?.enabled)message('规则已保存，但 Stay Focus 尚未开启；需在工具外层详情中授权并启动。');
      else if(result?.ruleReceipt?.verified!==true)message('设置已存入本机，但尚未验证 Chrome DNR 生效。请检查原生拦截权限。',true);
      else if(result?.tabs?.failed>0)message('Chrome 拦截规则已核对，但有 '+result.tabs.failed+' 个已打开页面无法自动切换，请手动重新导航。',true);
      else message('规则已保存，并完成 Chrome DNR 规则读回核对。');
    }catch(error){
      message(String(error?.message||error),true);
      if(op==='focus.status'&&state){
        $('native-state').textContent='状态核对失败';
        $('native-state').dataset.warning='true';
      }
    }finally{
      busy=false;buttons.forEach(x=>x.disabled=false);
      if(state)$('focus-start').disabled=!state.enabled;
    }
  };
  const badgeSite=(site)=>{
    const row=create('article','sf-site');row.dataset.blocked=String(Boolean(site.reason));
    const left=create('div','sf-site-main');
    left.append(create('strong','',site.host),create('small','',
      (!site.enabled?'已暂停 · ':site.reason?siteLabel(site.reason)+' · ':'')+
      (site.mode==='always'?'不计额度':minutes(site.remainingMs)+' 剩余 / '+minutes(site.budgetMs))+
      (site.group?' · '+site.group:'')+(site.subdomains?' · 含子域名':'')));
    const actions=create('div','sf-site-actions');
    const edit=create('button','','编辑');edit.type='button';edit.setAttribute('aria-label','编辑 '+site.host);
    edit.addEventListener('click',()=>{
      $('manual-site').open=true;
      $('site-host').value=site.host;$('site-minutes').value=site.minutes;
      $('site-mode').value=site.mode;$('site-subdomains').checked=site.subdomains;
      $('site-group').value=site.group;$('site-host').focus();
    });
    const toggle=create('button','',site.enabled?'暂停':'恢复');toggle.type='button';
    toggle.setAttribute('aria-label',(site.enabled?'暂停':'恢复')+' '+site.host);
    toggle.addEventListener('click',()=>call('focus.site.put',{site:{
      host:site.host,subdomains:site.subdomains,enabled:!site.enabled,
      mode:site.mode,minutes:site.minutes,group:site.group}}));
    const remove=create('button','','移除');remove.type='button';remove.setAttribute('aria-label','移除 '+site.host);
    remove.addEventListener('click',()=>call('focus.site.remove',{host:site.host}));
    actions.append(edit,toggle,remove);row.append(left,actions);return row;
  };
  function render(){
    if(!state)return;
    renderSuggestions();
    const permissionReady=state.permissions?.ready===true;
    const blocked=state.enabled&&state.sites.some(site=>site.enabled&&Boolean(site.reason));
    const ruleUnverified=state.enabled&&permissionReady&&state.ruleReceipt?.verified!==true;
    $('native-state').textContent=!permissionReady?'浏览器权限未授权':
      !state.enabled?'已停用':ruleUnverified?'规则未核对':
      blocked?'限制中':'运行中';
    $('native-state').dataset.active=String(state.enabled&&permissionReady&&!ruleUnverified);
    $('native-state').dataset.blocked=String(blocked);
    $('native-state').dataset.warning=String(!permissionReady||ruleUnverified);
    $('date-label').textContent=state.day;
    const pools=new Map();
    for(const site of state.sites.filter(s=>s.enabled&&s.mode==='limit'))
      pools.set(site.group?'group:'+site.group:site.host,
        {left:site.remainingMs,total:site.budgetMs});
    const remaining=[...pools.values()].reduce((sum,v)=>sum+v.left,0);
    const budget=[...pools.values()].reduce((sum,v)=>sum+v.total,0);
    $('total-remaining').textContent=pools.size?minutes(remaining):'—';
    $('total-caption').textContent=!permissionReady?'浏览器权限尚未批准，网站限制不会生效。请在工具详情中授权。':
      !state.enabled?'限制已停止。请在工具详情中主动开启。':
      ruleUnverified?'无法确认 Chrome 拦截规则，请在工具详情中检查权限并重试。':
      !pools.size?'添加首个每日限额网站，开始保护专注时间。':
      '今天共 '+pools.size+' 份独立娱乐额度 · '+minutes(Math.max(0,budget-remaining))+' 已使用';
    $('total-progress').style.width=(budget?Math.max(0,Math.min(100,100*(budget-remaining)/budget)):0)+'%';
    const focused=state.enabled&&state.focusUntil&&state.focusUntil>Date.now();
    $('focus-start').disabled=!state.enabled;
    $('focus-start').hidden=Boolean(focused);
    $('focus-stop').hidden=!focused;
    if(focused&&!ruleUnverified)$('total-caption').textContent='专注模式进行中，预计 '+new Date(state.focusUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' 结束。';
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
  $('quick-add').addEventListener('click',()=>{
    if(currentSuggestion?.minutes>0&&!configured(currentSuggestion))
      void call('focus.site.put',{site:siteRule(currentSuggestion)});
  });
  $('quick-refresh').addEventListener('click',()=>{void recognizeCurrent();});
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
      const suggestion=classifyCurrent(current);
      $('site-host').value=suggestion?.host||host;
      if(suggestion?.minutes>0)$('site-minutes').value=suggestion.minutes;
      $('site-mode').value='limit';
      $('site-subdomains').checked=true;
      $('manual-site').open=true;
      $('site-host').focus();
      message('已填写当前网站'+(suggestion?.minutes>0?'及推荐额度':'')+'，确认后保存。');
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
  void call('focus.status',{}).then(()=>recognizeCurrent());
  setInterval(()=>{if(!busy&&document.visibilityState==='visible')void call('focus.status',{});},30000);
})();
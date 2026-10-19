(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  const create=(tag,klass,text)=>{
    const el=document.createElement(tag);if(klass)el.className=klass;
    if(text!==undefined)el.textContent=text;return el;
  };
  let state=null,busy=false,firstSettings=true,currentSuggestion=null,editingSite=null,expandedSites=false;
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
  const siteLabel=reason=>({session:'专注中',schedule:'工作时段',always:'始终限制',quota:'额度已用完'})[reason]||'正常';
  // Use icons only with real accessible labels. No external icon library or
  // privileged Host dependency is added to the independently installed UI.
  const siteAction=(name,label,icon)=>{
    const button=create('button','sf-site-icon');
    button.type='button';button.title=label;button.setAttribute('aria-label',label);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const paths={edit:['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z'],
      pause:['M9 5v14','M15 5v14'],play:['m8 5 11 7-11 7V5'],remove:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 10v6','M14 10v6']};
    for(const d of paths[icon]||[]){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d);svg.append(path);
    }
    button.append(svg);return button;
  };
  // Local, transparent recommendations. Exact registered domains (including
  // subdomains) take precedence over untrusted website titles. No URL history,
  // page body, third-party lookup or permission changes are used here.
  // Trusted Host supplies the one authoritative site catalog.
  const knownSites=()=>Array.isArray(state?.catalog)?state.catalog:[];
  const sameOrChild=(host,parent)=>host===parent||host.endsWith('.'+parent);
  const siteRule=site=>({host:site.host,subdomains:true,enabled:true,
    mode:'limit',minutes:state?.dailyBudget?.minutes??30,group:'entertainment'});
  function classifyCurrent(info){
    if(info?.status!=='available')return null;
    const host=escapeHost(info.url);
    if(!host)return null;
    const known=knownSites().find(site=>sameOrChild(host,site.host));
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
        (site.minutes>0?' · 纳入每日共享 '+(state?.dailyBudget?.minutes??30)+' 分钟':' · 默认不限制')+
        (exists?' · 已设置':'');
      apply.hidden=site.minutes===0||exists;
      apply.textContent=site.source==='unknown'?'将此网站加入娱乐总额度':'加入每日娱乐总额度';
    }
    const review=$('policy-review'),reviewSites=$('policy-review-sites');
    // Suggestions from the installed signed package are never executed as
    // rules. Keep previously paused sites out of this invitation, and require
    // the ordinary trusted Host approval separately for every newly chosen site.
    const recommendations=knownSites().filter(row=>row.auto&&
      !state?.sites?.some(site=>site.host===row.host));
    review.hidden=!state?.sites?.length||!recommendations.length;
    reviewSites.replaceChildren();
    if(!review.hidden)for(const suggestion of recommendations){
      const add=create('button','sf-secondary',suggestion.name+' · 审阅并添加');
      add.type='button';add.setAttribute('aria-label','审阅并添加 '+suggestion.host);
      add.addEventListener('click',()=>call('focus.site.put',{site:siteRule(suggestion)}));
      reviewSites.append(add);
    }
    const presets=$('quick-presets');
    presets.replaceChildren();
    // Show only unconfigured popular sites; adding one recommendation must
    // not hide the other one-click shortcuts.
    for(const site of knownSites().filter(row=>row.quick&&!configured(row))){
      const button=create('button','sf-secondary',site.name+' · 加入总额度');
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
    if(busy)return false;
    busy=true;
    const buttons=[...root.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
    try{
      message(op==='focus.status'?'正在读取本机状态…':'正在等待可信宿主确认…');
      const result=await request(op,payload);
      state=result;render();
      if(op==='focus.status')message('');
      else if(!result?.enabled)message('已保存。限制尚未开启，请在扩展详情中授权启动。');
      else if(result?.ruleReceipt?.verified!==true)message('设置已存入本机，但尚未验证 Chrome DNR 生效。请检查原生拦截权限。',true);
      else if(result?.tabs?.failed>0)message('Chrome 拦截规则已核对，但有 '+result.tabs.failed+' 个已打开页面无法自动切换，请手动重新导航。',true);
      else message('已保存 · Chrome 规则已核对');
      return true;
    }catch(error){
      if(op==='focus.disable'&&error?.code==='E_FOCUS_TRUSTED_CLICK')
        message('已打开外层可信设置；请点击「停止所有 Stay Focus 限制」完成停用。');
      else message(String(error?.message||error),true);
      if(op==='focus.status'&&state){
        $('native-state').textContent='状态核对失败';
        $('native-state').dataset.warning='true';
      }
      return false;
    }finally{
      busy=false;buttons.forEach(x=>x.disabled=false);
      if(state){
        $('focus-start').disabled=!state.enabled;
        $('daily-budget-save').disabled=!state.enabled;
      }
    }
  };
  function resetSiteEditor(){
    editingSite=null;
    $('site-host').readOnly=false;
    $('site-host').value='';
    $('site-save').textContent='保存网站';
    $('site-new').hidden=true;
  }
  const badgeSite=(site)=>{
    const row=create('article','sf-site');row.dataset.blocked=String(Boolean(site.reason));
    row.dataset.paused=String(!site.enabled);
    const left=create('div','sf-site-main');
    left.append(create('strong','',site.host),create('small','',
      (!site.enabled?'已暂停 · ':site.reason?siteLabel(site.reason)+' · ':'')+
      (site.mode==='always'?'始终限制':minutes(site.remainingMs)+' 剩余')+
      (site.group&&site.group!=='entertainment'?' · '+site.group:'')+
      (site.subdomains?' · 含子域名':'')));
    const actions=create('div','sf-site-actions');
    const edit=siteAction('edit','编辑 '+site.host,'edit');
    edit.addEventListener('click',()=>{
      $('manual-site').open=true;
      editingSite=site.host;
      $('site-host').value=site.host;$('site-host').readOnly=true;
      $('site-save').textContent='保存修改';$('site-new').hidden=false;
      $('site-minutes').value=site.minutes;
      $('site-mode').value=site.mode;$('site-subdomains').checked=site.subdomains;
      $('site-group').value=site.group;$('manual-site').scrollIntoView?.({block:'nearest'});
      $('site-host').focus();
    });
    const toggle=siteAction('toggle',(site.enabled?'暂停':'恢复')+' '+site.host,
      site.enabled?'pause':'play');
    toggle.addEventListener('click',()=>call('focus.site.put',{site:{
      host:site.host,subdomains:site.subdomains,enabled:!site.enabled,
      mode:site.mode,minutes:site.minutes,group:site.group}}));
    const remove=siteAction('remove','移除 '+site.host,'remove');remove.classList.add('sf-site-remove');
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
    const pool=state.dailyBudget||{minutes:30,budgetMs:1800000,usedMs:0,remainingMs:1800000,managedCount:0};
    $('budget-total').textContent=pool.minutes+' 分钟';
    $('total-used').textContent=minutes(pool.usedMs);
    $('total-remaining').textContent=minutes(pool.remainingMs);
    const input=$('daily-budget-minutes');
    if(document.activeElement!==input)input.value=String(pool.minutes);
    input.disabled=!state.enabled;
    $('daily-budget-save').disabled=!state.enabled;
    $('budget-lock-hint').hidden=state.enabled;
    $('focus-pause').hidden=!state.enabled;
    const unmanaged=state.sites.filter(site=>site.mode==='limit'&&site.group!=='entertainment').length;
    $('total-caption').textContent=!permissionReady?
      '首次使用请在工具详情中主动授权并开启；安装不会自动限制网页。':
      !state.enabled?'限制尚未开启；在工具详情中点击「授权并开启」。':
      ruleUnverified?'Chrome 原生拦截规则尚未通过读回验证，请检查浏览器权限。':
      !pool.managedCount?'尚无网站进入娱乐共享额度；已有自定义规则保持不变。':
      '今日所有受管娱乐网站共享同一份额度 · '+pool.managedCount+' 个网站'+
        (unmanaged?' · 另有 '+unmanaged+' 个旧独立规则':'');
    $('total-progress').style.width=(pool.budgetMs?
      Math.max(0,Math.min(100,100*pool.usedMs/pool.budgetMs)):0)+'%';
    const focused=state.enabled&&state.focusUntil&&state.focusUntil>Date.now();
    $('focus-start').disabled=!state.enabled;
    $('focus-start').hidden=Boolean(focused);
    $('focus-stop').hidden=!focused;
    if(focused&&!ruleUnverified)$('total-caption').textContent='专注模式进行中，预计 '+new Date(state.focusUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' 结束。';
    $('site-count').textContent=state.sites.length+' 个网站';
    const enabledSites=state.sites.filter(site=>site.enabled).length;
    $('managed-preview').textContent=state.sites.length?
      enabledSites+' 个启用 · '+(state.sites.length-enabledSites)+' 个暂停 · 点击图标即可管理':
      '开启后自动纳入默认娱乐网站；也可以手动添加。';
    const list=$('sites');list.replaceChildren();
    for(const site of (expandedSites?state.sites:state.sites.slice(0,4)))
      list.append(badgeSite(site));
    if(state.sites.length>4){
      const more=create('button','sf-more-sites',
        expandedSites?'收起列表':'查看全部 '+state.sites.length+' 个网站');
      more.type='button';more.addEventListener('click',()=>{
        expandedSites=!expandedSites;render();
      });list.append(more);
    }
    if(!state.sites.length)list.append(create('p','sf-empty',
      '还没有管理的网站。授权开启后会按已审阅的默认清单添加，也可以手动新增。'));
    const groupSelect=$('site-group'),selected=groupSelect.value;
    groupSelect.replaceChildren(new Option('不共享',''),new Option('娱乐总额度（共享）','entertainment'));
    for(const id of Object.keys(state.groups).sort())if(id!=='entertainment')
      groupSelect.append(new Option(id+' · '+state.groups[id]+' 分钟',id));
    groupSelect.value=selected===''||selected==='entertainment'||Object.hasOwn(state.groups,selected)?
      selected:'entertainment';
    if(!selected&&!state.sites.length)groupSelect.value='entertainment';
    const groups=$('groups');groups.replaceChildren();
    for(const [id,min] of Object.entries(state.groups).sort((a,b)=>a[0].localeCompare(b[0]))){
      if(id==='entertainment')continue; // Edited by the main daily budget control
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
  $('open-add-site').addEventListener('click',()=>{
    resetSiteEditor();$('manual-site').open=true;
    $('manual-site').scrollIntoView?.({block:'nearest'});
    $('site-host').focus();
  });
  $('daily-budget-save').addEventListener('click',event=>{
    event.preventDefault();
    if(!state?.enabled){message('请先在工具详情中授权并开启，再修改每日额度。',true);return;}
    const value=Number($('daily-budget-minutes').value);
    if(!Number.isInteger(value)||value<1||value>1440){
      message('每日娱乐总额度必须是 1–1440 分钟。',true);return;
    }
    void call('focus.group.put',{id:'entertainment',minutes:value});
  });
  $('focus-pause').addEventListener('click',()=>{void call('focus.disable',{});});
  $('quick-add').addEventListener('click',()=>{
    if(currentSuggestion?.minutes>0&&!configured(currentSuggestion))
      void call('focus.site.put',{site:siteRule(currentSuggestion)});
  });
  $('quick-refresh').addEventListener('click',()=>{void recognizeCurrent();});
  $('site-new').addEventListener('click',()=>{resetSiteEditor();$('site-host').focus();});
  $('site-save').addEventListener('click',event=>{
    event.preventDefault();
    const host=escapeHost($('site-host').value),minutesValue=Number($('site-minutes').value);
    if(!host||!Number.isInteger(minutesValue)||minutesValue<1||minutesValue>1440){
      message('请输入有效的 HTTP(S) 网站域名和 1–1440 分钟的限额。',true);return;
    }
    if(editingSite&&host!==editingSite){
      message('不能直接更改已管理网站的域名；请移除旧网站，再添加新网站。',true);return;
    }
    const existing=state?.sites?.find(site=>site.host===host);
    void call('focus.site.put',{site:{host,minutes:minutesValue,
      subdomains:$('site-subdomains').checked,enabled:existing?.enabled??true,
      mode:$('site-mode').value,group:$('site-group').value}})
      .then(saved=>{if(saved)resetSiteEditor();});
  });
  $('add-current').addEventListener('click',async()=>{
    if(busy)return;
    try{
      const current=await request('currentPage.info',{});
      const host=escapeHost(current?.url);
      if(!host)throw new Error('当前选中的标签页不支持添加，先切换到正常网站。');
      const suggestion=classifyCurrent(current);
      resetSiteEditor();
      $('site-host').value=suggestion?.host||host;
      if(suggestion?.minutes>0)$('site-minutes').value=state?.dailyBudget?.minutes??30;
      $('site-group').value='entertainment';
      $('site-mode').value='limit';
      $('site-subdomains').checked=true;
      $('manual-site').open=true;
      $('site-host').focus();
      message('已填写当前网站'+(suggestion?.minutes>0?'及推荐额度':'')+'，确认后保存。');
    }catch(error){message(String(error?.message||error),true);}
  });
  $('focus-start').addEventListener('click',()=>call('focus.session.start',{minutes:25}));
  $('focus-stop').addEventListener('click',()=>call('focus.session.stop',{}));
  $('group-save').addEventListener('click',event=>{
    event.preventDefault();
    const id=$('group-name').value.trim().toLowerCase(),mins=Number($('group-minutes').value);
    if(!/^[a-z][a-z0-9-]{0,23}$/.test(id)||!Number.isInteger(mins)||mins<1||mins>1440){
      message('组名只支持小写字母、数字和连字符，限额 1–1440 分钟。',true);return;
    }
    call('focus.group.put',{id,minutes:mins});
  });
  $('schedule-save').addEventListener('click',event=>{
    event.preventDefault();
    const startMinute=checkTime($('schedule-from').value),endMinute=checkTime($('schedule-to').value);
    if(!Number.isInteger(startMinute)||!Number.isInteger(endMinute)||startMinute===endMinute){
      message('请设置不同的开始和结束时间。',true);return;
    }
    const days=[...$('weekdays').querySelectorAll('input:checked')].map(input=>Number(input.value));
    call('focus.schedule.set',{schedule:{enabled:$('schedule-enabled').checked,days,startMinute,endMinute}});
  });
  $('whitelist-save').addEventListener('click',event=>{
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
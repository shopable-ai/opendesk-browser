(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const $=id=>root.querySelector('#'+id);
  const create=(tag,klass,text)=>{
    const el=document.createElement(tag);if(klass)el.className=klass;
    if(text!==undefined)el.textContent=text;return el;
  };
  let state=null,busy=false,firstSettings=true,currentSuggestion=null,editingSite=null,expandedSites=false;
  let polling=false,writeVersion=0,budgetDraft=null,renderedSitesKey='',renderedRecommendationsKey='',renderedGroupsKey='';
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
      more:['M5 12h.01','M12 12h.01','M19 12h.01'],remove:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 10v6','M14 10v6']};
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
    const apply=$('quick-add');
    const exists=currentSuggestion&&configured(currentSuggestion);
    apply.disabled=!currentSuggestion||Boolean(exists);
    apply.textContent=currentSuggestion?'＋ 当前页 · '+currentSuggestion.host:'＋ 当前网页';
    apply.title=!currentSuggestion?'请打开一个普通网站后重试':
      exists?'此网站已在管理列表中':'将当前网站加入娱乐共享额度';
    // Host-provided catalog is the single source of popular suggestions.
    const candidates=knownSites().filter(row=>row.minutes>0&&!configured(row));
    const quick=candidates.filter(row=>row.quick);
    const more=candidates.filter(row=>!row.quick);
    const key=JSON.stringify({quick:quick.map(row=>[row.host,row.name]),
      more:more.map(row=>[row.host,row.name])});
    if(key===renderedRecommendationsKey)return;
    renderedRecommendationsKey=key;
    const renderButtons=(id,items)=>{
      const parent=$(id);
      const buttons=items.map(site=>{
        const button=create('button','sf-secondary','＋ '+site.name);
        button.type='button';button.title='添加 '+site.host+' 到娱乐共享额度';
        button.addEventListener('click',()=>void call('focus.site.put',{site:siteRule(site)}));
        return button;
      });
      parent.replaceChildren(...buttons);
    };
    renderButtons('quick-presets',quick);
    renderButtons('more-presets',more);
    $('site-discovery').hidden=!more.length;
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
  // A silent status read must not disable buttons or overwrite a later write.
  async function refreshStatus(){
    if(polling||busy)return false;
    polling=true;
    const capturedVersion=writeVersion;
    try{
      const result=await request('focus.status',{});
      if(busy||capturedVersion!==writeVersion)return false;
      if(!result||!Array.isArray(result.sites)||!result.dailyBudget)
        throw Error('后台返回了不完整的专注状态');
      state=result;render();
      return true;
    }catch(error){
      if(!state)message('无法读取 Chrome 专注状态：'+String(error?.message||error),true);
      else{
        $('native-state').textContent='状态读取失败';
        $('native-state').dataset.warning='true';
      }
      return false;
    }finally{polling=false;}
  }
  const call=async(op,payload={})=>{
    if(op==='focus.status')return refreshStatus();
    if(busy)return false;
    busy=true;writeVersion++;
    const buttons=[...root.querySelectorAll('button')];
    buttons.forEach(button=>button.disabled=true);
    try{
      const result=await request(op,payload);
      if(!result||!Array.isArray(result.sites)||!result.dailyBudget)
        throw Error('宿主未返回可确认的保存结果，请先核对状态');
      state=result;
      if(op==='focus.group.put'&&payload.id==='entertainment')budgetDraft=null;
      render();
      if(result.enabled&&result.ruleReceipt?.verified!==true)
        message('设置已保存，但 Chrome 拦截规则尚未核对。',true);
      else if(result.enabled&&result.tabs?.failed>0)
        message('规则已保存，部分已打开的网页需要手动刷新。',true);
      else if(!result.enabled)
        message('已保存，授权开启后生效。');
      else message('');
      return true;
    }catch(error){
      const unknown=error?.code==='E_OUTCOME_UNKNOWN';
      message(unknown?'操作结果尚未确认，请检查当前设置再决定是否重试。':
        String(error?.message||error),true);
      return false;
    }finally{
      busy=false;buttons.forEach(button=>button.disabled=false);
      if(state)render();
    }
  };
  function syncSiteFields(){
    const independent=$('site-group').value===''&&$('site-mode').value==='limit';
    $('site-minutes-row').hidden=!independent;
    $('site-minutes').required=independent;
  }
  function resetSiteEditor(){
    editingSite=null;
    $('manual-site-title').textContent='自定义添加网站';
    $('site-host').readOnly=false;
    $('site-host').value='';
    $('site-mode').value='limit';
    $('site-group').value='entertainment';
    $('site-minutes').value=String(state?.dailyBudget?.minutes??30);
    $('site-subdomains').checked=true;
    $('site-save').textContent='添加网站';
    $('site-new').hidden=true;
    syncSiteFields();
  }
  function editSite(site){
    $('manual-site').open=true;editingSite=site.host;
    $('manual-site-title').textContent='编辑 '+site.host;
    $('site-host').value=site.host;$('site-host').readOnly=true;
    $('site-save').textContent='保存修改';$('site-new').hidden=false;
    $('site-minutes').value=String(site.minutes);
    $('site-mode').value=site.mode;
    $('site-subdomains').checked=site.subdomains;
    $('site-group').value=site.group;
    syncSiteFields();
    $('manual-site').scrollIntoView?.({block:'nearest'});
    $('site-group').focus();
  }
  function badgeSite(site){
    const row=create('article','sf-site');
    row.dataset.blocked=String(Boolean(site.reason));
    row.dataset.paused=String(!site.enabled);
    const left=create('div','sf-site-main');
    const kind=site.mode==='always'?'始终限制':
      site.group==='entertainment'?'娱乐共享额度':
      site.group?'共享组 · '+site.group:
      '独立额度 · '+minutes(site.remainingMs)+'剩余';
    left.append(create('strong','',site.host),create('small','',
      (!site.enabled?'已暂停 · ':site.reason?siteLabel(site.reason)+' · ':'')+kind));
    const actions=create('div','sf-site-actions');
    const edit=siteAction('edit','编辑 '+site.host,'edit');
    edit.addEventListener('click',()=>editSite(site));
    const wrap=create('div','sf-site-menu-wrap');
    const more=siteAction('more','更多操作 '+site.host,'more');
    more.setAttribute('aria-expanded','false');
    const popup=create('div','sf-site-popup');popup.hidden=true;
    const toggle=create('button','',site.enabled?'暂停此网站':'恢复此网站');
    toggle.type='button';
    toggle.addEventListener('click',()=>void call('focus.site.put',{site:{
      host:site.host,subdomains:site.subdomains,enabled:!site.enabled,
      mode:site.mode,minutes:site.minutes,group:site.group}}));
    const remove=create('button','sf-danger','移除网站');remove.type='button';
    remove.addEventListener('click',()=>void call('focus.site.remove',{host:site.host}));
    popup.append(toggle,remove);wrap.append(more,popup);
    more.addEventListener('click',()=>{
      const wasOpen=more.getAttribute('aria-expanded')==='true';
      for(const other of root.querySelectorAll('.sf-site-menu-wrap')){
        other.querySelector('.sf-site-popup').hidden=true;
        other.querySelector('.sf-site-icon').setAttribute('aria-expanded','false');
      }
      popup.hidden=wasOpen;more.setAttribute('aria-expanded',String(!wasOpen));
    });
    actions.append(edit,wrap);row.append(left,actions);
    return row;
  }
  function render(){
    if(!state)return;
    const pool=state.dailyBudget;
    const ready=state.permissions?.ready===true;
    const ruleUnverified=state.enabled&&ready&&state.ruleReceipt?.verified!==true;
    const blocked=state.enabled&&state.sites.some(site=>site.enabled&&site.reason);
    $('native-state').textContent=!ready?'未授权':!state.enabled?'未开启':
      ruleUnverified?'规则待核对':blocked?'限制中':'运行中';
    $('native-state').dataset.active=String(state.enabled&&ready&&!ruleUnverified);
    $('native-state').dataset.blocked=String(Boolean(blocked));
    $('native-state').dataset.warning=String(!ready||ruleUnverified);
    $('date-label').textContent=state.day;
    $('budget-total').textContent=pool.minutes+' 分钟';
    $('total-used').textContent=minutes(pool.usedMs);
    $('total-remaining').textContent=minutes(pool.remainingMs);
    $('total-progress').style.width=(pool.budgetMs?
      Math.max(0,Math.min(100,100*pool.usedMs/pool.budgetMs)):0)+'%';
    if(budgetDraft===null)$('daily-budget-minutes').value=String(pool.minutes);
    const shown=budgetDraft===null?String(pool.minutes):budgetDraft;
    $('daily-budget-save').hidden=shown===String(pool.minutes);
    for(const preset of $('budget-presets').querySelectorAll('[data-budget]'))
      preset.setAttribute('aria-pressed',String(preset.dataset.budget===shown));
    $('focus-pause').hidden=!state.enabled;
    const focused=state.enabled&&state.focusUntil&&state.focusUntil>Date.now();
    $('focus-start').disabled=busy||!state.enabled;
    $('focus-start').hidden=Boolean(focused);
    $('focus-stop').hidden=!focused;
    $('total-caption').textContent=!ready?
      '先设置额度与网站，之后在扩展详情授权开启。':
      !state.enabled?'额度已准备好，在扩展详情开启限制后生效。':
      ruleUnverified?'Chrome 限制尚未核对，请检查扩展权限。':
      !pool.managedCount?'还没有网站使用这份共享额度。':
      focused?'临时专注进行中。':
      '所有受管娱乐网站共享这一份时间。';
    const paused=state.sites.filter(site=>!site.enabled).length;
    $('site-count').textContent=state.sites.length+' 个'+(paused?' · '+paused+' 暂停':'');
    // Skip DOM replacement unless the actual site rule or status changes.
    const visible=expandedSites?state.sites:state.sites.slice(0,4);
    const listKey=JSON.stringify({n:state.sites.length,expandedSites,rows:visible.map(site=>
      [site.host,site.group,site.mode,site.enabled,site.reason,site.subdomains,
        site.minutes,site.group==='entertainment'?null:site.remainingMs])});
    if(listKey!==renderedSitesKey){
      renderedSitesKey=listKey;
      const list=$('sites');
      list.replaceChildren(...visible.map(badgeSite));
      if(state.sites.length>4){
        const more=create('button','sf-more-sites',
          expandedSites?'收起列表':'查看全部 '+state.sites.length+' 个网站');
        more.type='button';more.addEventListener('click',()=>{
          expandedSites=!expandedSites;render();
        });
        list.append(more);
      }
      if(!state.sites.length)list.append(create('p','sf-empty','暂无受管网站，可从上方快速添加。'));
    }
    const groupSelect=$('site-group');
    const groupKey=JSON.stringify(state.groups);
    if(groupKey!==renderedGroupsKey){
      renderedGroupsKey=groupKey;
      const selected=groupSelect.value;
      groupSelect.replaceChildren(new Option('娱乐共享额度','entertainment'),
        new Option('独立额度',''));
      for(const id of Object.keys(state.groups).sort())if(id!=='entertainment')
        groupSelect.append(new Option('共享组 · '+id,id));
      groupSelect.value=selected===''||selected==='entertainment'||Object.hasOwn(state.groups,selected)?
        selected:'entertainment';
      syncSiteFields();
      const groups=$('groups');groups.replaceChildren();
      for(const [id,min] of Object.entries(state.groups).sort((a,b)=>a[0].localeCompare(b[0]))){
        if(id==='entertainment')continue;
        const row=create('div','sf-group'),label=create('span','',id+' · '+min+' 分钟/天');
        const remove=create('button','','删除组');remove.type='button';
        remove.addEventListener('click',()=>void call('focus.group.remove',{id}));
        row.append(label,remove);groups.append(row);
      }
    }
    renderSuggestions();
    if(firstSettings){
      firstSettings=false;
      const s=state.schedule;$('schedule-enabled').checked=s.enabled;
      for(const checkbox of $('weekdays').querySelectorAll('input'))
        checkbox.checked=s.days.includes(+checkbox.value);
      $('schedule-from').value=formatTime(s.startMinute);
      $('schedule-to').value=formatTime(s.endMinute%1440);
      $('whitelist').value=state.whitelist.join('\n');
      resetSiteEditor();
    }
  }
  $('open-add-site').addEventListener('click',()=>{
    resetSiteEditor();$('manual-site').open=true;
    $('manual-site').scrollIntoView?.({block:'nearest'});
    $('site-host').focus();
  });
  $('daily-budget-minutes').addEventListener('input',()=>{
    budgetDraft=$('daily-budget-minutes').value;render();
  });
  $('daily-budget-save').addEventListener('click',event=>{
    event.preventDefault();
    const value=Number($('daily-budget-minutes').value);
    if(!Number.isInteger(value)||value<1||value>1440){
      message('每日娱乐额度需在 1–1440 分钟之间。',true);return;
    }
    if(value===state?.dailyBudget?.minutes)return;
    void call('focus.group.put',{id:'entertainment',minutes:value});
  });
  for(const button of $('budget-presets').querySelectorAll('[data-budget]'))
    button.addEventListener('click',()=>{
      const val=button.dataset.budget;
      $('daily-budget-minutes').value=val;budgetDraft=val;render();
    });
  $('focus-pause').addEventListener('click',()=>void call('focus.disable',{}));
  $('quick-add').addEventListener('click',async()=>{
    if(busy)return;
    try{
      const info=await request('currentPage.info',{});
      const site=classifyCurrent(info);
      if(!site||!escapeHost(site.host))
        throw Error('请先切换到要管理的网站，再点击当前网页。');
      currentSuggestion=site;renderSuggestions();
      if(!configured(site))void call('focus.site.put',{site:siteRule(site)});
    }catch(error){message(String(error?.message||error),true);}
  });
  $('site-group').addEventListener('change',syncSiteFields);
  $('site-mode').addEventListener('change',syncSiteFields);
  $('site-new').addEventListener('click',()=>{
    resetSiteEditor();$('manual-site').open=false;
  });
  $('site-save').addEventListener('click',event=>{
    event.preventDefault();
    const host=escapeHost($('site-host').value),group=$('site-group').value;
    const existing=state?.sites?.find(site=>site.host===host);
    const minutesValue=group==='entertainment'?
      existing?.minutes??state?.dailyBudget?.minutes??30:
      Number($('site-minutes').value);
    if(!host||!Number.isInteger(minutesValue)||minutesValue<1||minutesValue>1440){
      message('请输入有效域名与 1–1440 分钟的额度。',true);return;
    }
    if(editingSite&&host!==editingSite){
      message('编辑时不能更改域名，请另行添加新网站。',true);return;
    }
    void call('focus.site.put',{site:{
      host,minutes:minutesValue,subdomains:$('site-subdomains').checked,
      enabled:existing?.enabled??true,mode:$('site-mode').value,group
    }}).then(saved=>{if(saved){resetSiteEditor();$('manual-site').open=false;}});
  });
  $('focus-start').addEventListener('click',()=>void call('focus.session.start',{minutes:25}));
  $('focus-stop').addEventListener('click',()=>void call('focus.session.stop',{}));
  $('group-save').addEventListener('click',event=>{
    event.preventDefault();
    const id=$('group-name').value.trim().toLowerCase(),mins=Number($('group-minutes').value);
    if(!/^[a-z][a-z0-9-]{0,23}$/.test(id)||!Number.isInteger(mins)||mins<1||mins>1440){
      message('组名仅能使用小写字母、数字和连字符，额度为 1–1440 分钟。',true);return;
    }
    void call('focus.group.put',{id,minutes:mins});
  });
  $('schedule-save').addEventListener('click',event=>{
    event.preventDefault();
    const startMinute=checkTime($('schedule-from').value),endMinute=checkTime($('schedule-to').value);
    if(!Number.isInteger(startMinute)||!Number.isInteger(endMinute)||startMinute===endMinute){
      message('请设置不同的开始和结束时间。',true);return;
    }
    const days=[...$('weekdays').querySelectorAll('input:checked')].map(input=>Number(input.value));
    void call('focus.schedule.set',{schedule:{
      enabled:$('schedule-enabled').checked,days,startMinute,endMinute}});
  });
  $('whitelist-save').addEventListener('click',event=>{
    event.preventDefault();
    const hosts=$('whitelist').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(escapeHost);
    if(hosts.some(host=>!host)||new Set(hosts).size!==hosts.length||hosts.length>50){
      message('白名单最多 50 个不重复有效域名。',true);return;
    }
    void call('focus.whitelist.set',{hosts});
  });
  root.addEventListener('click',event=>{
    if(event.target.closest('.sf-site-menu-wrap'))return;
    for(const wrap of root.querySelectorAll('.sf-site-menu-wrap')){
      wrap.querySelector('.sf-site-popup').hidden=true;
      wrap.querySelector('.sf-site-icon').setAttribute('aria-expanded','false');
    }
  });
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const open=root.querySelector('.sf-site-icon[aria-expanded="true"]');
    if(!open)return;
    open.setAttribute('aria-expanded','false');
    open.parentNode.querySelector('.sf-site-popup').hidden=true;
    open.focus();event.preventDefault();
  });
  void refreshStatus().then(()=>recognizeCurrent());
  // Visible UI reads only; MV3 owns elapsed-time accounting.
  setInterval(()=>{if(document.visibilityState==='visible')void refreshStatus();},10000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void refreshStatus();
  });
})();
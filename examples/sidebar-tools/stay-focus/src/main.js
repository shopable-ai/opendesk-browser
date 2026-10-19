(() => {
  'use strict';
  const api=globalThis.OpenDeskTool, R=globalThis.OpenDeskPageReact, U=globalThis.OpenDeskSidebarUI;
  if(!api?.root||!api?.request||!R?.createRoot||!U?.IconButton||!U?.Switch)
    throw Error('E_STAY_FOCUS_SHARED_UI');
  const h=R.createElement,{Button,IconButton,Card,CardContent,Switch}=U;
  const svgPaths={
    add:['M12 5v14','M5 12h14'],edit:['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z'],
    more:['M5 12h.01','M12 12h.01','M19 12h.01'],close:['M18 6 6 18','M6 6l12 12'],
    pause:['M9 5v14','M15 5v14'],play:['M7 4l13 8-13 8V4Z'],
    delete:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 10v6','M14 10v6'],
    check:['M20 6 9 17l-5-5']
  };
  const Icon=({name})=>h('svg',{viewBox:'0 0 24 24',width:17,height:17,fill:'none',
    stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round',
    'aria-hidden':true},...(svgPaths[name]||[]).map((d,i)=>h('path',{d,key:i})));
  const Action=({name,label,...props})=>h(IconButton,{label,title:label,...props},h(Icon,{name}));
  const errorText=e=>String(e?.message||e||'操作失败').slice(0,220);
  function host(value){
    try{
      const raw=String(value||'').trim();
      const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
        url.port||!url.hostname.includes('.'))return '';
      return url.hostname.toLowerCase().replace(/\.$/,'');
    }catch{return '';}
  }
  const activeHost=info=>info?.status==='available'?host(info.url):'';
  const managed=(hostname,sites=[])=>[...sites].filter(s=>hostname===s.host||
    s.subdomains&&hostname.endsWith('.'+s.host)).sort((a,b)=>b.host.length-a.host.length)[0]||null;
  const time=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  const parseTime=text=>{const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
    return m?Number(m[1])*60+Number(m[2]):null;};
  function SiteRow({site,busy,edit,change}){
    const [open,setOpen]=R.useState(false),wrap=R.useRef(null),trigger=R.useRef(null),first=R.useRef(null);
    const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
    R.useEffect(()=>{
      if(!open)return;
      first.current?.focus();
      const outside=e=>{if(!wrap.current?.contains(e.target))setOpen(false);};
      const esc=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
      document.addEventListener('pointerdown',outside);
      document.addEventListener('keydown',esc,true);
      return ()=>{document.removeEventListener('pointerdown',outside);
        document.removeEventListener('keydown',esc,true);};
    },[open]);
    const action=next=>{close(true);void change(next);};
    const type=site.group==='entertainment'?'娱乐共享额度':site.group?
      '共享组 · '+site.group:'独立额度 · '+site.minutes+' 分钟';
    const reason=!site.enabled?'已暂停':({session:'专注中',schedule:'工作时段',
      always:'始终限制',quota:'额度已耗尽'})[site.reason]||'正常';
    return h('article',{className:'sf-site','data-paused':!site.enabled},
      h('div',{className:'sf-site-info'},h('strong',null,site.host),
        h('span',null,type+' · '+reason)),
      h('div',{className:'sf-site-controls'},
        h(Action,{name:'edit',label:'编辑 '+site.host,disabled:busy,onClick:()=>edit(site)}),
        h('div',{className:'sf-menu',ref:wrap},
          h(Action,{name:'more',label:'管理 '+site.host,disabled:busy,ref:trigger,
            'aria-haspopup':'menu','aria-expanded':open,onClick:()=>setOpen(!open)}),
          open?h('div',{className:'sf-popup',role:'menu','aria-label':site.host+' 操作'},
            h('button',{type:'button',role:'menuitem',ref:first,
              onClick:()=>action({...site,enabled:!site.enabled})},
              h(Icon,{name:site.enabled?'pause':'play'}),site.enabled?'暂停网站':'恢复网站'),
            h('button',{type:'button',role:'menuitem',className:'sf-danger',
              onClick:()=>action(null)},h(Icon,{name:'delete'}),'移除网站')):null)));
  }
  function SiteEditor({initial,budget,groups,busy,save,close}){
    const [draft,setDraft]=R.useState(()=>({host:initial?.host||'',
      group:initial?.group??'entertainment',mode:initial?.mode||'limit',
      minutes:String(initial?.minutes??budget),subdomains:initial?.subdomains??true,
      enabled:initial?.enabled??true}));
    const patch=change=>setDraft(old=>({...old,...change}));
    const independent=draft.group===''&&draft.mode==='limit';
    const submit=()=>{
      const hostname=host(draft.host);
      const minutes=independent?Number(draft.minutes):initial?.minutes??budget;
      if(!hostname||!Number.isInteger(minutes)||minutes<1||minutes>1440)
        return save(null,'请输入有效域名和 1–1440 分钟的额度。');
      if(initial&&hostname!==initial.host)return save(null,'编辑时不能更改域名。');
      save({...draft,host:hostname,minutes});
    };
    return h(Card,{className:'sf-editor'},h(CardContent,null,
      h('div',{className:'sf-editor-title'},h('strong',null,initial?'编辑 '+initial.host:'添加网站'),
        h(Action,{name:'close',label:'关闭编辑',onClick:close})),
      h('label',{className:'sf-field'},'网站域名',
        h('input',{value:draft.host,readOnly:Boolean(initial),placeholder:'例如 youtube.com',
          maxLength:253,autoComplete:'off',spellCheck:false,
          onChange:e=>patch({host:e.target.value})})),
      h('div',{className:'sf-two'},
        h('label',{className:'sf-field'},'额度来源',
          h('select',{value:draft.group,onChange:e=>patch({group:e.target.value})},
            h('option',{value:'entertainment'},'娱乐共享额度'),
            h('option',{value:''},'独立额度'),
            ...Object.keys(groups||{}).filter(id=>id!=='entertainment')
              .map(id=>h('option',{key:id,value:id},'共享组 · '+id)))),
        h('label',{className:'sf-field'},'限制方式',
          h('select',{value:draft.mode,onChange:e=>patch({mode:e.target.value})},
            h('option',{value:'limit'},'每日限额'),
            h('option',{value:'always'},'始终限制')))),
      independent?h('label',{className:'sf-field'},'独立额度（分钟）',
        h('input',{type:'number',min:1,max:1440,value:draft.minutes,
          onChange:e=>patch({minutes:e.target.value})})):null,
      h('div',{className:'sf-toggle'},h('span',null,'包含子域名'),
        h(Switch,{isSelected:draft.subdomains,onChange:v=>patch({subdomains:v}),
          'aria-label':'包含子域名'})),
      h('div',{className:'sf-actions'},
        h(Button,{variant:'primary',disabled:busy,onClick:submit},initial?'保存修改':'添加网站'))));
  }
  function Advanced({state,busy,operate,error}){
    const [draft,setDraft]=R.useState(null),[allow,setAllow]=R.useState(null);
    const [newName,setNewName]=R.useState(''),[newMinutes,setNewMinutes]=R.useState('30');
    // Initialize only once; polling cannot replace an unsaved form.
    R.useEffect(()=>{if(state){
      setDraft(old=>old??{...state.schedule,days:[...state.schedule.days]});
      setAllow(old=>old??state.whitelist.join('\n'));
    }},[Boolean(state)]);
    if(!state)return null;
    const schedule=draft||state.schedule,patch=value=>setDraft({...schedule,...value});
    const dirty=JSON.stringify({...schedule,days:[...schedule.days].sort()})!==
      JSON.stringify({...state.schedule,days:[...state.schedule.days].sort()});
    const saveTime=()=>{
      if(schedule.startMinute===schedule.endMinute||schedule.enabled&&!schedule.days.length)
        return error('请选择工作日，并设置不同的开始与结束时间。');
      void operate('focus.schedule.set',{schedule});
    };
    const saveAllow=()=>{
      const values=(allow??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(host);
      if(values.includes('')||values.length>50||new Set(values).size!==values.length)
        return error('白名单最多包含 50 个不同的有效域名。');
      void operate('focus.whitelist.set',{hosts:values});
    };
    const saveGroup=()=>{
      const id=newName.trim().toLowerCase(),minutes=Number(newMinutes);
      if(!/^[a-z][a-z0-9-]{0,23}$/.test(id)||!Number.isInteger(minutes)||
         minutes<1||minutes>1440)return error('额度组名称或分钟数无效。');
      void operate('focus.group.put',{id,minutes}).then(ok=>{if(ok)setNewName('');});
    };
    return h('details',{className:'sf-advanced'},
      h('summary',null,'更多设置',h('small',null,'工作时段 · 白名单 · 共享组')),
      h('section',{className:'sf-setting'},
        h('div',{className:'sf-toggle'},h('strong',null,'工作时段'),
          h(Switch,{isSelected:schedule.enabled,onChange:v=>patch({enabled:v}),
            'aria-label':'启用工作时段限制'})),
        h('p',{className:'sf-hint'},'时段限制独立于每日共享额度，不清零累计时间。'),
        h('div',{className:'sf-days'},
          ...[['一',1],['二',2],['三',3],['四',4],['五',5],['六',6],['日',0]]
            .map(([label,day])=>h('label',{key:day},
              h('input',{type:'checkbox',checked:schedule.days.includes(day),
                onChange:e=>patch({days:e.target.checked?[...schedule.days,day]:
                  schedule.days.filter(x=>x!==day)})}),label))),
        h('div',{className:'sf-two'},
          h('label',{className:'sf-field'},'开始时间',
            h('input',{type:'time',value:time(schedule.startMinute),onChange:e=>{
              const value=parseTime(e.target.value);if(value!==null)patch({startMinute:value});}})),
          h('label',{className:'sf-field'},'结束时间',
            h('input',{type:'time',value:time(schedule.endMinute%1440),onChange:e=>{
              const value=parseTime(e.target.value);if(value!==null)patch({endMinute:value});}}))),
        dirty?h(Button,{disabled:busy,onClick:saveTime},'保存时段'):null),
      h('section',{className:'sf-setting'},
        h('strong',null,'始终允许访问'),
        h('p',{className:'sf-hint'},'每行一个域名。白名单优先于所有网站限制。'),
        h('textarea',{'aria-label':'白名单域名',rows:3,value:allow??'',
          onChange:e=>setAllow(e.target.value)}),
        (allow??'')!==state.whitelist.join('\n')?
          h(Button,{disabled:busy,onClick:saveAllow},'保存白名单'):null),
      h('section',{className:'sf-setting'},
        h('strong',null,'其他共享额度组'),
        h('div',{className:'sf-group-add'},
          h('input',{value:newName,placeholder:'例如 social','aria-label':'组名',
            onChange:e=>setNewName(e.target.value)}),
          h('input',{type:'number',min:1,max:1440,value:newMinutes,'aria-label':'每日分钟数',
            onChange:e=>setNewMinutes(e.target.value)}),
          h(Button,{disabled:busy,onClick:saveGroup},'保存')),
        ...Object.entries(state.groups||{}).filter(([id])=>id!=='entertainment')
          .map(([id,mins])=>h('div',{className:'sf-group-row',key:id},
            h('span',null,id+' · '+mins+' 分钟/天'),
            h(Action,{name:'delete',label:'删除额度组 '+id,disabled:busy,
              onClick:()=>void operate('focus.group.remove',{id})})))),
      h('p',{className:'sf-hint'},'浏览器权限与停止全部限制在外层可信扩展设置中管理。'));
  }
  function App(){
    const [state,setState]=R.useState(null),[page,setPage]=R.useState('');
    const [busy,setBusy]=R.useState(false),[loading,setLoading]=R.useState(true);
    const [note,setNote]=R.useState(''),[failed,setFailed]=R.useState(false);
    const [budgetDraft,setBudgetDraft]=R.useState(null),[editing,setEditing]=R.useState(undefined);
    const [expanded,setExpanded]=R.useState(false);
    const alive=R.useRef(false),readId=R.useRef(0),pageId=R.useRef(0),writing=R.useRef(false);
    const latest=R.useRef(null);
    const notice=R.useCallback((message,isError=false)=>{
      if(alive.current){setNote(message);setFailed(isError);}
    },[]);
    const refresh=R.useCallback(async()=>{
      if(writing.current)return;
      const id=++readId.current;
      try{
        const value=await api.request('focus.status',{});
        if(!value?.dailyBudget||!Array.isArray(value.sites))
          throw Error('后台状态数据不完整');
        if(!alive.current||writing.current||id!==readId.current)return;
        latest.current=value;setState(value);setLoading(false);
      }catch(e){if(alive.current&&id===readId.current){
        setLoading(false);if(!latest.current)notice('无法读取 Chrome 状态：'+errorText(e),true);}}
    },[notice]);
    const readPage=R.useCallback(async()=>{
      const id=++pageId.current;
      try{
        const result=await api.request('currentPage.info',{});
        if(alive.current&&id===pageId.current)setPage(activeHost(result));
      }catch{if(alive.current&&id===pageId.current)setPage('');}
    },[]);
    const operate=R.useCallback(async(operation,payload={})=>{
      if(writing.current||!latest.current)return false;
      writing.current=true;readId.current++;setBusy(true);
      notice('请在可信扩展界面完成此次操作。');
      try{
        const value=await api.request(operation,payload);
        if(!value?.dailyBudget||!Array.isArray(value.sites))
          throw Error('保存回执尚未确认，请检查当前设置');
        if(!alive.current)return false;
        latest.current=value;setState(value);
        if(value.enabled&&value.ruleReceipt?.verified!==true)
          notice('设置已保存，但 Chrome 规则尚未核对。',true);
        else if(value.enabled&&value.tabs?.failed>0)
          notice('规则已保存，部分网页需要手动刷新。',true);
        else if(!value.enabled)notice('设置已保存，授权开启后生效。');
        else notice('');
        return true;
      }catch(e){if(alive.current)notice(e?.code==='E_OUTCOME_UNKNOWN'?
        '结果尚未确认，请先检查状态，不要重复提交。':errorText(e),true);
        return false;
      }finally{writing.current=false;if(alive.current){setBusy(false);void refresh();}}
    },[notice,refresh]);
    R.useEffect(()=>{
      alive.current=true;
      const pageChanged=()=>{pageId.current++;setPage('');void readPage();};
      const visible=()=>{if(!document.hidden){void refresh();void readPage();}};
      api.root.addEventListener('opendesk-page-changed',pageChanged);
      api.root.addEventListener('opendesk-tool-state-changed',visible);
      document.addEventListener('visibilitychange',visible);
      globalThis.addEventListener('focus',visible);
      const interval=globalThis.setInterval(()=>{if(!document.hidden)void refresh();},10000);
      void refresh();void readPage();
      return ()=>{alive.current=false;readId.current++;pageId.current++;
        globalThis.clearInterval(interval);
        api.root.removeEventListener('opendesk-page-changed',pageChanged);
        api.root.removeEventListener('opendesk-tool-state-changed',visible);
        document.removeEventListener('visibilitychange',visible);
        globalThis.removeEventListener('focus',visible);};
    },[refresh,readPage]);
    const sites=state?.sites||[],budget=state?.dailyBudget?.minutes??30;
    const used=state?.dailyBudget?.usedMs??0,remaining=state?.dailyBudget?.remainingMs??budget*60000;
    const ratio=Math.min(100,Math.max(0,Math.round(used/(budget*60000)*100)));
    const text=budgetDraft??String(budget),draftChanged=budgetDraft!==null&&text!==String(budget);
    const current=page?managed(page,sites):null;
    const saveSite=(site,message)=>{
      if(message)return notice(message,true);
      void operate('focus.site.put',{site}).then(ok=>{if(ok)setEditing(undefined);});
    };
    const changeSite=(old,next)=>{
      void operate(next?'focus.site.put':'focus.site.remove',
        next?{site:{host:next.host,subdomains:next.subdomains,enabled:next.enabled,
          mode:next.mode,minutes:next.minutes,group:next.group}}:{host:old.host});
    };
    const addCurrent=async()=>{
      if(writing.current||!page)return;
      const revision=pageId.current,expected=page;
      try{
        const actual=activeHost(await api.request('currentPage.info',{}));
        if(!actual||actual!==expected||revision!==pageId.current)
          throw Error('当前网页已经切换，请重新核对后加入。');
        const currentStatus=await api.request('focus.status',{});
        if(!currentStatus?.dailyBudget||!Array.isArray(currentStatus.sites))
          throw Error('无法核对网站是否已受管理');
        if(revision!==pageId.current)throw Error('标签页已切换，未提交旧网站规则。');
        const old=managed(actual,currentStatus.sites);
        if(old?.enabled)return notice('当前网站已经受管理。');
        // Only the trusted Host catalog may canonicalize a known subdomain.
        // Page titles and string-substring matches never classify or authorize.
        const known=(currentStatus.catalog||[]).find(row=>
          actual===row.host||actual.endsWith('.'+row.host));
        const normalized=known?.host||actual;
        const doubleCheck=activeHost(await api.request('currentPage.info',{}));
        if(doubleCheck!==actual||revision!==pageId.current)
          throw Error('当前网页已切换，未提交旧网页的网站规则。');
        const site=old?{host:old.host,subdomains:old.subdomains,enabled:true,
          mode:old.mode,minutes:old.minutes,group:old.group}:
          {host:normalized,subdomains:true,enabled:true,mode:'limit',
            minutes:currentStatus.dailyBudget.minutes,group:'entertainment'};
        const ok=await operate('focus.site.put',{site});
        if(ok&&revision!==pageId.current)
          notice('规则已保存，但网页已切换，请核对网站列表。',true);
      }catch(e){notice(errorText(e),true);}
    };
    const saveBudget=()=>{
      const minutes=Number(text),entered=text;
      if(!Number.isInteger(minutes)||minutes<1||minutes>1440)
        return notice('每日额度必须在 1–1440 分钟之间。',true);
      void operate('focus.group.put',{id:'entertainment',minutes}).then(ok=>{
        if(ok)setBudgetDraft(old=>old===entered?null:old);
      });
    };
    const focusRunning=Boolean(state?.focusUntil&&state.focusUntil>Date.now());
    return h('main',{className:'sf','aria-label':'Stay Focus 保持专注'},
      h('header',{className:'sf-heading'},
        h('div',{className:'sf-brand'},h('span',{className:'sf-brand-symbol','aria-hidden':true},'◷'),
          h('div',null,h('h2',null,'Stay Focus'),h('p',null,'把时间留给重要的事'))),
        h('span',{className:'sf-state','data-active':Boolean(state?.enabled&&state?.ruleReceipt?.verified),
          'data-warning':Boolean(state?.enabled&&!state?.ruleReceipt?.verified)},
          loading?'正在读取':!state?'状态未知':!state.enabled?'未开启':
            state.ruleReceipt?.verified?'保护已开启':'待核对')),
      h(Card,{className:'sf-hero'},h(CardContent,null,
        h('div',{className:'sf-headrow'},h('span',null,'今日娱乐时间'),
          h('time',null,state?.day||'—')),
        h('div',{className:'sf-balance'},h('span',null,'今天还剩'),
          h('strong',null,Math.max(0,Math.ceil(remaining/60000))+' 分钟')),
        h('div',{className:'sf-progress',role:'progressbar','aria-label':'已使用娱乐额度比例',
          'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':ratio},
          h('i',{style:{width:ratio+'%'}})),
        h('div',{className:'sf-headrow'},h('span',null,'已使用 '+Math.ceil(used/60000)+' 分钟'),
          h('span',null,'总额度 '+budget+' 分钟')),
        h('div',{className:'sf-budget-form'},
          h('label',{htmlFor:'sf-daily-budget'},'每日额度'),
          h('input',{id:'sf-daily-budget',type:'number',min:1,max:1440,step:1,
            inputMode:'numeric',value:text,onChange:e=>setBudgetDraft(e.target.value)}),
          h('span',null,'分钟'),
          draftChanged?h(Button,{variant:'primary',disabled:busy||!state,onClick:saveBudget},'保存'):null),
        h('p',{className:'sf-hint'},'所有娱乐网站共用这一份每日额度。'))),
      h('section',{className:'sf-session'},
        h('div',null,h('strong',null,'临时专注'),h('p',null,'暂时限制受管网站 25 分钟')),
        h(Button,{disabled:busy||!state||!state.enabled,
          title:!state?.enabled?'请先从可信扩展设置中开启限制':undefined,
          onClick:()=>void operate(
          focusRunning?'focus.session.stop':'focus.session.start',
          focusRunning?{}:{minutes:25})},focusRunning?'结束':'开始')),
      note?h('p',{className:'sf-notice','data-error':failed,
        role:failed?'alert':'status','aria-live':'polite'},note):null,
      h('section',{className:'sf-sites','aria-label':'网站管理'},
        h('div',{className:'sf-sites-head'},h('h3',null,'管理的网站'),
          h('div',{className:'sf-sites-actions'},h('span',null,sites.length+' 个'),
            h(Action,{name:'add',label:'添加自定义网站',disabled:busy,
              onClick:()=>setEditing(null)}))),
        h('div',{className:'sf-current'},
          h('div',null,h('span',null,'当前网页'),h('strong',null,page||'请切换到普通网页')),
          current?.enabled?h('span',{className:'sf-managed'},h(Icon,{name:'check'}),'已管理'):
            h(Button,{variant:'primary',disabled:!page||busy||loading||!state,
              onClick:()=>void addCurrent()},h(Icon,{name:current?'play':'add'}),
              current?'恢复':'加入')),
        editing!==undefined?h(SiteEditor,{key:editing?.host||'new',initial:editing,
          budget,groups:state?.groups,busy,close:()=>setEditing(undefined),save:saveSite}):null,
        sites.length?h('div',{className:'sf-list'},
          ...(expanded?sites:sites.slice(0,4)).map(site=>
            h(SiteRow,{key:site.host,site,busy,edit:setEditing,
              change:next=>changeSite(site,next)})),
          sites.length>4?h(Button,{className:'sf-show-all',onClick:()=>setExpanded(v=>!v)},
            expanded?'收起列表':'查看全部 '+sites.length+' 个网站'):null):
          h('p',{className:'sf-empty'},'暂无受管网站。点击上方可加入当前网页。')),
      h(Advanced,{state,busy,operate,error:message=>notice(message,true)}));
  }
  const mount=api.root.querySelector('#tool-app');
  if(!mount)throw Error('E_STAY_FOCUS_MOUNT');
  const root=R.createRoot(mount);
  root.render(h(App));
  let released=false;
  globalThis.addEventListener('pagehide',()=>{if(!released){released=true;root.unmount();}},{once:true});
})();

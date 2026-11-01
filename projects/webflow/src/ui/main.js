// Web Flow V0.3.1. The tool runs in its own opaque-origin Sidebar iframe.
// Its only privileged interactions are reviewed OpenDeskTool.request calls.
(function(global){
  'use strict';
  const tool=global.OpenDeskTool, R=global.OpenDeskPageReact, M=global.OpenDeskWebFlowModel;
  const mount=tool&&tool.root&&tool.root.querySelector('#webflow-app');
  if(!mount||!R||!M||typeof R.createRoot!=='function'||typeof tool.request!=='function'){
    if(mount)mount.textContent='Web Flow 无法加载受支持的公开 SDK / React 运行时。';
    return;
  }
  const h=(name,props,...children)=>R.createElement(name,props,...children);
  const PINNED=Object.freeze([
    Object.freeze({taskId:'baidu.search.top3',version:'1.1.1',
      manifestHash:'adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b',
      contentHash:'28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8',
      title:'百度搜索 · 前三条自然结果',site:'https://www.baidu.com',icon:'百'}),
    Object.freeze({taskId:'google.search.top3',version:'1.0.0',
      manifestHash:'c66250e9e7002f0968a9f38935bcbe565fe37f9109cfa04e6005ff3058c04261',
      contentHash:'f3d3e21b8d9467366708745b6207a9d70d2b6fc7a401d71798bbb2ef823fd7ad',
      title:'Google 搜索 · 前三条自然结果',site:'https://www.google.com',icon:'G'})
  ]);
  const labels={checking:'正在核验',available:'可手动运行',unavailable:'安装或授权不可用',
    changed:'固定版本不匹配',error:'读取失败',unknown:'结果未知',running:'执行中'};
  const operation=tool.request.bind(tool);
  const Btn=(label,click,opts={})=>h('button',{
    type:'button',className:'wf-btn'+(opts.primary?' wf-primary':'')+(opts.quiet?' wf-quiet':'')+
      (opts.icon?' wf-icon':''),onClick:click,disabled:opts.disabled===true,
    title:opts.title,'aria-label':opts.ariaLabel||undefined,'aria-pressed':opts.pressed,
    'aria-expanded':opts.expanded
  },label);
  const Status=({state,text})=>h('span',{className:'wf-badge','data-state':state,role:'status'},
    text||labels[state]||state||'未核验');
  const Card=({children,extra=''})=>h('section',{className:'wf-panel '+extra},children);
  const Head=({title,note,action})=>h('div',{className:'wf-heading'},
    h('div',null,h('h2',null,title),note&&h('p',null,note)),action||null);
  const time=at=>at?new Date(at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit'}):'时间未确认';
  const safeError=error=>M.bounded(error&&error.code?error.code+'：'+(error.message||'操作失败'):
    error&&error.message||'操作失败',190);
  const defaultPrefs=()=>({theme:'system',favorites:[]});
  const terminalReceipt=s=>M.isTerminal(s.state)&&s.state!=='completed'||M.isTerminal(s.state)&&Boolean(s.result);

  function App(){
    const [page,setPage]=R.useState('overview');
    const [settings,setSettings]=R.useState(defaultPrefs);
    const [tasks,setTasks]=R.useState(PINN.map(pin=>({...pin,state:'checking',binding:null})));
    const [history,setHistory]=R.useState([]);
    const [loading,setLoading]=R.useState(true);
    const [pageInfo,setPageInfo]=R.useState({status:'unavailable'});
    const [error,setError]=R.useState('');
    const [notice,setNotice]=R.useState('');
    const [search,setSearch]=R.useState('');
    const [filter,setFilter]=R.useState('all');
    const [detail,setDetail]=R.useState(null);
    const [query,setQuery]=R.useState('');
    const [active,setActive]=R.useState(null);
    const [saving,setSaving]=R.useState(false);
    const [showFilters,setShowFilters]=R.useState(false);
    const alive=R.useRef(true), seq=R.useRef(0), timer=R.useRef(null);
    const busy=R.useRef(false), activeRef=R.useRef(null);
    const request=R.useCallback((name,args)=>operation(name,args),[]);

    const readTasks=R.useCallback(async()=>{
      const epoch=++seq.current;
      setLoading(true);
      const rows=await Promise.all(PINNED.map(async pin=>{
        try{
          const reply=await request('tasks.read',{taskId:pin.taskId});
          if(!reply||!M.pinsEqual(pin,reply.task))
            return {...pin,state:'changed',binding:null};
          return {...pin,state:'available',binding:reply.task};
        }catch(e){return {...pin,state:M.errorState(e),binding:null,error:safeError(e)};}
      }));
      if(alive.current&&epoch===seq.current){setTasks(rows);setLoading(false);}
    },[request]);

    R.useEffect(()=>{
      alive.current=true;
      let disposed=false;
      async function load(){
        try{
          const [prefs,records,site]=await Promise.allSettled([
            request('storage.get',{key:'webflow.settings.v1'}),
            request('storage.get',{key:'webflow.recent.v1'}),
            request('currentPage.info',{})
          ]);
          if(disposed)return;
          if(prefs.status==='fulfilled'&&prefs.value&&prefs.value.value){
            const value=prefs.value.value;
            setSettings({theme:['system','light','dark'].includes(value.theme)?value.theme:'system',
              favorites:Array.isArray(value.favorites)?value.favorites.filter(x=>typeof x==='string').slice(0,16):[]});
          }else if(prefs.status==='rejected')setError('偏好读取失败：'+safeError(prefs.reason));
          if(records.status==='fulfilled')setHistory(M.recentRecords(records.value&&records.value.value));
          else setError('记录读取失败：'+safeError(records.reason));
          if(site.status==='fulfilled')setPageInfo(site.value||{status:'unavailable'});
        }catch(e){if(!disposed)setError(safeError(e));}
      }
      void load();void readTasks();
      return ()=>{disposed=true;alive.current=false;seq.current++;if(timer.current)clearTimeout(timer.current);};
    },[readTasks,request]);

    const save=async(key,value)=>{
      // No optimistic success: conditional write followed by the real SDK readback.
      const before=await request('storage.get',{key,withEtag:true});
      const args={key,value};
      if(typeof(before&&before.etag)==='string')args.ifMatch=before.etag;
      await request('storage.set',args);
      const after=await request('storage.get',{key});
      if(JSON.stringify(after&&after.value)!==JSON.stringify(value))
        throw Error('保存后读回不一致；请在宿主检查真实状态');
    };
    const savePrefs=async value=>{
      if(saving)return;
      setSaving(true);setError('');
      try{await save('webflow.settings.v1',value);
        if(alive.current){setSettings(value);setNotice('偏好已保存并读回。');}}
      catch(e){if(alive.current)setError('偏好未确认保存：'+safeError(e));}
      finally{if(alive.current)setSaving(false);}
    };
    const toggleFavorite=pin=>{
      const key=M.taskKey(pin),set=new Set(settings.favorites);
      if(set.has(key))set.delete(key);else set.add(key);
      void savePrefs({...settings,favorites:[...set].slice(0,16)});
    };
    const writeRecord=async(snapshot,pin)=>{
      const item=M.projectRun(snapshot,pin);
      const rows=M.recentRecords([item,...history]).slice(0,12);
      try{
        await save('webflow.recent.v1',rows);
        if(alive.current){setHistory(rows);setNotice('已保存本应用执行摘要；权威结果仍在原 RunHost。');}
      }catch(e){
        if(alive.current){setHistory(rows);setError('执行摘要未确认持久化：'+safeError(e));}
      }
    };
    const observe=async(clientRequestId,pin,snapshot,attempt=0)=>{
      if(!alive.current)return;
      let next=snapshot;
      if(!next){
        try{next=await request('tasks.read',{clientRequestId});}
        catch(e){
          if(alive.current){setError('原请求对账失败：'+safeError(e));setActive({clientRequestId,taskId:pin.taskId,state:'unknown'});}
          return;
        }
      }
      if(!alive.current||activeRef.current!==clientRequestId)return;
      setActive(next);
      if(terminalReceipt(next)){
        await writeRecord(next,pin);
        activeRef.current=null;
        if(alive.current)setActive(null);
        return;
      }
      if(attempt>=45){setNotice('仍未取得确定的持久结果。可读取原请求状态，不能重新提交同一操作。');return;}
      timer.current=setTimeout(()=>{void observe(clientRequestId,pin,null,attempt+1);},1600);
    };
    const run=pin=>{
      // The SDK request must start synchronously within the real button click.
      if(busy.current||activeRef.current||pin.state!=='available'||!pin.binding||!query.trim())return;
      if(pageInfo.status!=='available'||!sameSite(pageInfo.url,pin.site)){
        setError('请先切换至该任务获准网站，再从 Web Flow 点击运行。');return;
      }
      const id='webflow:'+global.crypto.randomUUID();
      busy.current=true;activeRef.current=id;setError('');setNotice('');
      setActive({clientRequestId:id,taskId:pin.taskId,state:'preparing'});
      const pending=request('tasks.start',{clientRequestId:id,task:pin.binding,params:{query:query.trim(),limit:3}});
      Promise.resolve(pending).then(snapshot=>{
        if(alive.current)void observe(id,pin,snapshot);
      }).catch(e=>{
        if(alive.current){
          setError('提交结果未确认：'+safeError(e)+'。请先对账原请求，不得直接重试。');
          setActive({clientRequestId:id,taskId:pin.taskId,state:'unknown'});
        }
      }).finally(()=>{busy.current=false;});
    };
    const readActive=()=>{
      const current=activeRef.current, pin=PINNED.find(p=>p.taskId===active&&active.taskId);
      if(!current||!pin)return;
      if(timer.current)clearTimeout(timer.current);
      void observe(current,pin);
    };
    const stop=()=>{
      const id=activeRef.current;
      if(!id)return;
      setNotice('正在向原 Host 发出停止请求；Stop 不撤销已产生的网页副作用。');
      void request('tasks.stop',{clientRequestId:id}).then(s=>{
        if(alive.current)setActive(s);
      }).catch(e=>{if(alive.current)setError('停止结果未知：'+safeError(e));});
    };
    const openTask=pin=>{
      if(pin.state!=='available')return;
      setError('');void request('tasks.open',{taskId:pin.taskId}).catch(e=>{
        if(alive.current)setError('宿主任务管理入口不可用：'+safeError(e));
      });
    };
    const setTab=name=>{setPage(name);setDetail(null);setNotice('');setError('');};
    const sameTarget=pin=>pageInfo.status==='available'&&sameSite(pageInfo.url,pin.site);
    const rows=M.filterTasks(tasks,search,filter,settings.favorites);
    const summary=M.summary(tasks,history);
    const selected=tasks.find(p=>p.taskId===detail);
    const activePin=PINNED.find(p=>p.taskId===active&&active.taskId);
    const runDisabled=pin=>pin.state!=='available'||Boolean(activeRef.current)||!sameTarget(pin);
    const gotoScripts=()=>setTab('scripts');
    const banner=h('div',{className:'wf-banner'},
      '已核对的是本应用安装审阅的 '+PINNED.length+' 个固定任务，不是浏览器所有脚本；自动运行授权和全局历史的公开接口尚未提供。');
    const detailList=items=>h('dl',{className:'wf-detail'},...items.flatMap(([k,v])=>
      [h('dt',{key:k+'-key'},k),h('dd',{key:k+'-val'},v)]));
    const taskCard=pin=>{
      const star=settings.favorites.includes(M.taskKey(pin));
      return h('article',{key:pin.taskId,className:'wf-panel wf-task'},
        h('div',{className:'wf-line wf-between'},
          h('div',{className:'wf-task-title wf-grow'},
            h('span',{className:'wf-task-icon','aria-hidden':'true'},pin.icon),
            h('div',{className:'wf-grow'},h('strong',null,pin.title),
              h('span',{className:'wf-sub'},pin.site.replace('https://','')))),
          Btn(star?'★':'☆',()=>toggleFavorite(pin),{icon:true,disabled:saving,
            ariaLabel:star?'取消收藏 '+pin.title:'收藏 '+pin.title,pressed:star})),
        h('div',{className:'wf-line wf-between'},
          h(Status,{state:pin.state}),
          h('span',{className:'wf-sub'},'v'+pin.version)),
        pin.error&&h('p',{className:'wf-sub'},pin.error),
        h('div',{className:'wf-actions'},
          Btn('运行',()=>{setDetail(pin.taskId);setQuery('');},{
            primary:true,disabled:runDisabled(pin)||!pin.binding,title:!sameTarget(pin)?'先切换到任务网站':'填写参数'}),
          Btn('详情',()=>{setDetail(detail===pin.taskId?null:pin.taskId);setQuery('');},
            {expanded:detail===pin.taskId}),
          Btn('宿主管理',()=>openTask(pin),{disabled:pin.state!=='available'})),
        detail===pin.taskId&&h('div',{className:'wf-stack'},
          h('hr',{style:{border:0,borderTop:'1px solid var(--line)',width:'100%'}}),
          detailList([['网站',pin.site],['任务 ID',h('code',{className:'wf-mono'},pin.taskId)],
            ['精确版本',pin.version],['manifestHash',h('code',{className:'wf-mono'},pin.manifestHash)],
            ['contentHash',h('code',{className:'wf-mono'},pin.contentHash)],
            ['安装身份',pin.binding&&h('code',{className:'wf-mono'},pin.binding.installationId||'待核对')||'不可读取'],
            ['授权代次',pin.binding?String(pin.binding.generation):'不可读取']]),
          h('label',{className:'wf-label',htmlFor:'wf-query'},'搜索关键词',
            h('input',{id:'wf-query',className:'wf-input',value:query,maxLength:120,
              placeholder:'输入本次搜索关键词',onChange:e=>setQuery(e.target.value),autoComplete:'off'})),
          h('p',{className:'wf-sub'},sameTarget(pin)?
            '目标网站匹配；运行仍须经过原宿主的实时权限、站点及任务校验。':
            '当前标签页不是该任务的获准网站。请切换页面后重新打开 Web Flow。'),
          h('div',{className:'wf-actions'},
            Btn('确认手动运行',()=>run(pin),{primary:true,
              disabled:runDisabled(pin)||!query.trim()||query.trim().length>120}),
            Btn('关闭详情',()=>setDetail(null),{quiet:true}))
        )
      );
    };
    const historyCard=(entry,index)=>h('li',{key:entry.clientRequestId+'-'+index},
      h('article',{className:'wf-panel wf-stack'},
        h('div',{className:'wf-line wf-between'},
          h('strong',null,PINNED.find(p=>p.taskId===entry.taskId)?.title||entry.taskId),
          h('span',{className:'wf-meta'},time(entry.at))),
        h('div',{className:'wf-line wf-between'},
          h(Status,{state:entry.state,text:'运行：'+entry.state}),
          h('span',{className:'wf-sub'},entry.resultPersisted?'持久结果已观察到':'持久结果未确认')),
        h('p',{className:'wf-sub'},'业务结果：'+businessLabel(entry.business)+
          (entry.count!==null?' · '+entry.count+' 条':'')+
          '；原聊天交付 / AI 续答：未观察'),
        h('details',{className:'wf-help'},h('summary',null,'技术与证据'),
          detailList([['clientRequestId',h('code',{className:'wf-mono'},entry.clientRequestId)],
            ['runId',h('code',{className:'wf-mono'},entry.runId||'未取得')],
            ['resultId',h('code',{className:'wf-mono'},entry.resultId||'未取得')],
            ['原运行结果',entry.runtimeOk?'Controller 结果 outcome.ok=true':'未核验或执行失败'],
            ['资源释放',entry.retirementState],
            ['持久结果',entry.resultPersisted?'原快照匹配':'未确认']]))
      ));
    function overview(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'概览',note:'固定任务 · 真实安装核验与最近运行'}),
        banner,
        h('div',{className:'wf-grid'},
          ...[['已审阅任务',summary.reviewed],['可手动运行',loading?'…':summary.available],
            ['需处理',loading?'…':summary.attention],['本应用记录',history.length]]
            .map(([label,n])=>h('div',{key:label,className:'wf-stat'},
              h('strong',null,n),h('span',null,label)))),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('div',{className:'wf-line wf-between'},h('h3',null,'自动触发'),
            h(Status,{state:'unavailable',text:'未接入'})),
          h('p',{className:'wf-sub'},'没有公开的逐任务自动授权与总开关状态读写合同。本界面不会授予任何自动执行权限。'),
          h('div',{className:'wf-actions'},Btn('查看可用脚本',gotoScripts,{primary:true}),
            Btn('刷新安装状态',()=>{void readTasks();},{disabled:loading})))}),
        summary.attention>0&&h('div',{className:'wf-banner wf-warning'},
          summary.attention+' 项固定任务不可用或版本变化。请在宿主任务目录核对，不要通过改名绕过固定身份。'),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('div',{className:'wf-line wf-between'},h('h3',null,'最近一次应用运行'),
            Btn('查看记录',()=>setTab('history'),{quiet:true})),
          summary.latest?historyCard(summary.latest,0):h('p',{className:'wf-sub'},'尚无 Web Flow 发起且读回的运行摘要。已有的 ChatGPT Bridge 记录不会自动导入此处。')
        )}));
    }
    function scripts(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'脚本',note:'仅显示安装时审阅的固定 Controller Task',
          action:Btn('刷新',()=>{void readTasks();},{disabled:loading})}),
        h('label',{className:'wf-label',htmlFor:'wf-search'},'搜索任务',
          h('input',{id:'wf-search',type:'search',className:'wf-input',placeholder:'名称、网站、任务 ID',
            value:search,onChange:e=>setSearch(e.target.value)})),
        h('div',{className:'wf-line wf-between'},
          h('span',{className:'wf-sub'},rows.length+' / '+tasks.length+' 条'),
          Btn(showFilters?'收起筛选':'筛选',()=>setShowFilters(!showFilters),
            {quiet:true,expanded:showFilters})),
        showFilters&&h('div',{className:'wf-filter',role:'group','aria-label':'状态筛选'},
          ...[['all','全部'],['available','可运行'],['attention','需处理'],['favorite','收藏']]
            .map(([value,label])=>h('button',{key:value,type:'button',className:'wf-chip',
              'aria-pressed':filter===value,onClick:()=>setFilter(value)},label))),
        !rows.length?h(Card,{extra:'wf-empty',children:[
          h('strong',{key:'empty'},'没有匹配的固定任务'),
          h('p',{key:'hint',className:'wf-sub'},'清除搜索或在宿主任务目录审阅安装。'),
          Btn('清除筛选',()=>{setSearch('');setFilter('all');})
        ]}):rows.map(taskCard),
        h('div',{className:'wf-banner'},'安装、更新、停用和卸载仍由宿主可信任务目录处理；Web Flow 不修改原安装权限。'));
    }
    function records(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'记录',note:'仅包含本应用持久保存的最近 12 条摘要'}),
        h('div',{className:'wf-banner'},'运行完成、业务成功、结果持久化、原聊天交付与 AI 续答是五个独立阶段。此处不证明原聊天已收到结果；刷新后无法跨 iframe 查询旧委托。'),
        active&&h(Card,{children:h('div',{className:'wf-stack'},
          h('div',{className:'wf-line wf-between'},h('h3',null,'当前原请求'),
            h(Status,{state:active.state,text:active.state||'待确认'})),
          h('code',{className:'wf-mono'},active.clientRequestId),
          h('div',{className:'wf-actions'},
            Btn('查询原请求',readActive),Btn('停止原请求',stop,{disabled:!activeRef.current})),
          h('p',{className:'wf-sub'},'结果 UNKNOWN 时只能查询同一 clientRequestId；不自动再次执行。')
        )}),
        history.length?h('ul',{className:'wf-history'},...history.map(historyCard)):
          h(Card,{extra:'wf-empty',children:[
            h('strong',{key:'empty'},'还没有可展示的执行摘要'),
            h('p',{key:'note',className:'wf-sub'},'在已审阅网站手动运行后，等待原 Controller 持久结果，再保存摘要。'),
            Btn('前往脚本',gotoScripts)
          ]}));
    }
    function settingsPage(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'设置',note:'Web Flow 专属偏好与运行边界',
          action:Btn('返回',()=>setTab('overview'),{quiet:true})}),
        h(Card,{children:h('label',{className:'wf-label'},'外观主题',
          h('select',{className:'wf-select',value:settings.theme,disabled:saving,
            onChange:e=>{void savePrefs({...settings,theme:e.target.value});}},
            h('option',{value:'system'},'跟随系统'),h('option',{value:'light'},'浅色'),
            h('option',{value:'dark'},'深色')))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'自动运行权限'),
          h('p',{className:'wf-sub'},'全局自动开关、逐任务授权、Chrome 网站访问和原 Bridge 预批准互相独立。此处没有可合法读写的自动授权 SDK，因此不展示虚假 Switch。'),
          h(Status,{state:'unavailable',text:'公开能力未接入'})}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'开发与安装'),
          h('p',{className:'wf-sub'},'创建、导入、升级和卸载请使用宿主的「开发」或「我的 → 任务目录」；不会从沙箱打开私有宿主页面。'),
          h('p',{className:'wf-sub'},'当前绑定：'+PINNED.length+' 个固定版本 Task；版本变化需重新审阅并更新应用包。')}),
        h(Card,{children:h('details',{className:'wf-help'},
          h('summary',null,'未来的多步骤流程'),
          h('p',null,'流程需要逐站授权、步骤依赖、原持久 Run/Result、恢复和 UNKNOWN 对账。项目现有队列只是离线状态模块；尚未接入真实派发，不显示流程启动按钮。'))}));
    }
    function helpPage(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'帮助',note:'首次使用或需要排障时查看',
          action:Btn('返回',()=>setTab('overview'),{quiet:true})}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'手动运行一个真实任务'),
          h('p',null,'1. 在宿主任务目录安装并核验与本应用相同版本、哈希的 Controller Task。'),
          h('p',null,'2. 打开对应的 Google / 百度获准网站，再在 Web Flow → 脚本选择任务、输入关键词并点击运行。'),
          h('p',null,'3. 读取执行状态和持久结果；网页业务状态必须单独核对。'),
          h('h3',null,'出现版本不匹配或 UNKNOWN'),
          h('p',null,'回到可信宿主核对安装身份、权限、站点和结果。不通过自动重试绕开未知副作用。'),
          h('p',null,'ChatGPT Bridge 的 opendesk.task.intent.v1 是独立触发路径；本应用不修改其协议、防重放或交付回执。'))}));
    }
    const sections={overview,scripts,history:records,settings:settingsPage,help:helpPage};
    return h('div',{className:'wf-app', 'data-theme':settings.theme},
      h('div',{className:'wf-head'},
        h('div',{className:'wf-head-main'},h('span',{className:'wf-logo'},'W'),
          h('div',null,h('h1',null,'Web Flow'),h('p',{className:'wf-sub'},'自动化任务中心'))),
        h('div',{className:'wf-head-actions'},
          Btn('?',()=>setTab('help'),{icon:true,ariaLabel:'帮助'}),
          Btn('⚙',()=>setTab('settings'),{icon:true,ariaLabel:'设置'}))),
      h('div',{className:'wf-tabs',role:'tablist','aria-label':'Web Flow 主导航'},
        ...[['overview','概览'],['scripts','脚本'],['history','记录']].map(([key,label],i)=>
          h('button',{key,type:'button',role:'tab',className:'wf-tab',
            'aria-selected':page===key,'data-page':key,tabIndex:page===key?0:-1,
            onClick:()=>setTab(key),
            onKeyDown:event=>{
              const steps=['overview','scripts','history'];
              let index=steps.indexOf(key);
              if(event.key==='ArrowRight')index=(index+1)%3;
              else if(event.key==='ArrowLeft')index=(index+2)%3;
              else if(event.key==='Home')index=0;
              else if(event.key==='End')index=2;
              else return;
              event.preventDefault();setTab(steps[index]);
              global.queueMicrotask(()=>tool.root.querySelector('[data-page="'+steps[index]+'"]')?.focus());
            }},label))),
      h('main',{className:'wf-body',role:'tabpanel',id:'wf-panel'},
        error&&h('div',{className:'wf-banner wf-warning',role:'alert'},
          h('p',null,error),Btn('关闭提示',()=>setError(''),{quiet:true})),
        notice&&h('div',{className:'wf-banner',role:'status'},
          h('p',null,notice),Btn('知道了',()=>setNotice(''),{quiet:true})),
        active&&page!=='history'&&h('div',{className:'wf-banner'},
          h('div',{className:'wf-line wf-between'},
            h('span',null,'有待核对的原请求：'+(active.state||'运行中')),
            Btn('查看',()=>setTab('history'),{quiet:true}))),
        sections[page]()),
      h('footer',{className:'wf-footer'},'仅复用原 Task Authority / RunHost · 无自动授权或后台执行'));
  }
  function sameSite(url,origin){
    try{return new URL(url).origin===origin;}catch{return false;}
  }
  function businessLabel(value){
    const names={'reported-success':'任务返回 success（仍须核查网页事实）',
      blocked:'网站验证阻断',no_results:'无结果',dom_changed:'网页结构变化',
      dom_unavailable:'DOM 不可用',stopped:'任务主动停止',unverified:'未核验'};
    return names[value]||'未核验';
  }
  const root=R.createRoot(mount);
  root.render(h(App));
  global.addEventListener('pagehide',()=>root.unmount(),{once:true});
})(globalThis);

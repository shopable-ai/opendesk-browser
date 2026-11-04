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
    Object.freeze({taskId:'baidu.search.top3',version:'1.1.4',
      manifestHash:'3d86dfa83de51535fef2f7a5d7ac81ec0d6905273191d1785e68881a28212bac',
      contentHash:'14b8dd8d53484dfc527cbb710b0df27c9bc11db2c3d78f8225eedd9a46264269',
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
    key:opts.key||label,type:'button',className:'wf-btn'+(opts.primary?' wf-primary':'')+(opts.quiet?' wf-quiet':'')+
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
  const pendingKey='webflow.pending.v1';

  function App(){
    const [page,setPage]=R.useState('overview');
    const [settings,setSettings]=R.useState(defaultPrefs);
    const [tasks,setTasks]=R.useState(PINNED.map(pin=>({...pin,state:'checking',binding:null})));
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
    const [recoveryReady,setRecoveryReady]=R.useState(false);
    const [staged,setStaged]=R.useState(null);
    const [snapshots,setSnapshots]=R.useState({});
    const alive=R.useRef(true), seq=R.useRef(0), timer=R.useRef(null);
    const busy=R.useRef(false), activeRef=R.useRef(null), historyRef=R.useRef([]);
    const observation=R.useRef(0), pendingRef=R.useRef(null), stagedRef=R.useRef(null),cancelledRef=R.useRef(null);
    const recordWrites=R.useRef(Promise.resolve());
    const localCancellation=R.useRef(null);
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
          const [prefs,records,site,pending]=await Promise.allSettled([
            request('storage.get',{key:'webflow.settings.v1'}),
            request('storage.get',{key:'webflow.recent.v1'}),
            request('currentPage.info',{}),request('storage.get',{key:pendingKey})
          ]);
          if(disposed)return;
          if(prefs.status==='fulfilled'&&prefs.value&&prefs.value.value){
            const value=prefs.value.value;
            setSettings({theme:['system','light','dark'].includes(value.theme)?value.theme:'system',
              favorites:Array.isArray(value.favorites)?value.favorites.filter(x=>typeof x==='string').slice(0,16):[]});
          }else if(prefs.status==='rejected')setError('偏好读取失败：'+safeError(prefs.reason));
          if(records.status==='fulfilled'){
            historyRef.current=M.recentRecords(records.value&&records.value.value);
            setHistory(historyRef.current);
          }
          else setError('记录读取失败：'+safeError(records.reason));
          if(site.status==='fulfilled')setPageInfo(site.value||{status:'unavailable'});
          if(pending.status==='rejected'){
            setError('原步骤恢复入口读取失败：'+safeError(pending.reason));return;
          }
          const saved=pending.value?.value;
          if(saved==null&&records.status==='rejected'){
            setError('历史原步骤读取失败，不能确认没有未完成请求：'+safeError(records.reason));return;
          }
          if(saved!=null){
            const item=M.pendingRecord(saved);
            if(!item||!PINNED.some(pin=>pin.taskId===item.taskId)){
              setError('原步骤恢复记录损坏；保留记录并在宿主核对，不能新建请求补跑。');return;
            }
            pendingRef.current=item;activeRef.current=item.clientRequestId;setActive(item);
          }else{
            // Earlier versions saved held/UNKNOWN summaries without a pending
            // key. They are recovery locators, never authoritative results.
            const legacy=historyRef.current.find(item=>item.retirementState!=='released'&&!item.notSubmittedFenced);
            if(legacy){
              const item=M.pendingRecord(legacy);
              if(!item||!PINNED.some(pin=>pin.taskId===item.taskId)){
                setError('历史原步骤无法恢复；保留记录并在宿主核对。');return;
              }
              activeRef.current=item.clientRequestId;setActive(item);
            }
          }
          setRecoveryReady(true);
        }catch(e){if(!disposed)setError(safeError(e));}
      }
      void load();void readTasks();
      return ()=>{disposed=true;alive.current=false;seq.current++;observation.current++;
        if(timer.current)clearTimeout(timer.current);};
    },[readTasks,request]);

    const save=async(key,value,expected,guard=()=>alive.current)=>{
      // No optimistic success: conditional write followed by the real SDK readback.
      if(!guard())return false;
      const before=await request('storage.get',{key,withEtag:true});
      if(!guard())return false;
      // Merge summaries against the value actually read by this CAS, including
      // records temporarily unreadable during initial recovery or another UI.
      if(typeof value==='function')value=value(before?.value);
      // A proved released step may already have been cleared even when its
      // ACK was lost. Reconcile empty; never remove a different step's locator.
      if(key===pendingKey&&value===null&&typeof expected==='string'&&before?.value==null)return true;
      // Reconstructing the same locator is also idempotent: a Stop may have
      // superseded its UI epoch after storage committed but before the ACK.
      if(key===pendingKey&&expected===null&&value&&before?.value?.clientRequestId===value.clientRequestId&&
        before.value.taskId===value.taskId&&before.value.version===value.version)return true;
      if(key===pendingKey&&(
        typeof before?.etag!=='string'||
        (expected===null?before?.value!=null:before?.value?.clientRequestId!==expected)))
        throw Object.assign(Error('原步骤发生变化；请重开记录查询原请求'),{code:'E_CONFLICT'});
      const args={key,value};
      if(typeof(before&&before.etag)==='string')args.ifMatch=before.etag;
      await request('storage.set',args);
      if(!guard())return false;
      const after=await request('storage.get',{key});
      if(JSON.stringify(after&&after.value)!==JSON.stringify(value))
        throw Error('保存后读回不一致；请在宿主检查真实状态');
      return true;
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
    const writeRecord=(snapshot,pin,id,epoch)=>{
      const write=async()=>{
        if(!current(id,epoch))return;
        const item=M.projectRun(snapshot,pin);
        let rows;
        const saved=await save('webflow.recent.v1',previous=>{
          rows=M.recentRecords([item,...M.recentRecords(previous).filter(x=>x.clientRequestId!==item.clientRequestId)]);
          return rows;
        },undefined,()=>current(id,epoch));
        if(saved&&current(id,epoch)){historyRef.current=rows;setHistory(rows);}
      };
      // Only this UI's summaries are serialized; execution stays in Authority.
      const pending=recordWrites.current.then(write,write);
      recordWrites.current=pending.catch(()=>{});
      return pending;
    };
    const current=(id,epoch)=>alive.current&&observation.current===epoch&&activeRef.current===id;
    const forgetResult=id=>setSnapshots(old=>{const next={...old};delete next[id];return next;});
    const accept=async(id,pin,next,epoch,attempt=0)=>{
      if(!current(id,epoch))return;
      if(!next||next.clientRequestId!==id)throw Error('原请求回包身份不匹配');
      const previous=historyRef.current.find(x=>x.clientRequestId===id);
      if(previous?.runId&&next.runId!==previous.runId||previous?.resultId&&next.resultId!==previous.resultId)
        throw Error('原运行 / 结果身份不匹配');
      setActive({...next,taskId:pin.taskId});
      setSnapshots(old=>({...old,[id]:next}));
      // Store only a navigation summary. Result/value never enter AppStorage.
      await writeRecord(next,pin,id,epoch);
      if(!current(id,epoch))return;
      if(M.released(next)){
        if(pendingRef.current?.clientRequestId===id){
          await save(pendingKey,null,id,()=>current(id,epoch));
          if(!current(id,epoch))return;
          pendingRef.current=null;
        }
        activeRef.current=null;
        setNotice('原请求已查询，资源已释放；后续任务仍须手动运行。');
        return;
      }
      if(next.state==='unknown'||next.semantic==='UNKNOWN'||attempt>=45){
        setNotice('原请求仍未确定。保留同一步骤，只能查询或停止，不能重新运行。');return;
      }
      timer.current=setTimeout(()=>{void observe(id,pin,epoch,attempt+1);},1600);
    };
    const failObservation=(id,pin,epoch,e)=>{
      if(!current(id,epoch))return;
      forgetResult(id);setActive({clientRequestId:id,taskId:pin.taskId,state:'unknown'});
      setNotice('');
      setError('原请求未确认：'+safeError(e)+'。请查询或停止原步骤，不能新建请求补跑。');
    };
    const observe=async(id,pin,epoch,attempt=0)=>{
      if(!current(id,epoch))return;
      try{await accept(id,pin,await request('tasks.read',{clientRequestId:id}),epoch,attempt);}
      catch(e){failObservation(id,pin,epoch,e);}
    };
    const prepare=async pin=>{
      if(!recoveryReady||busy.current||activeRef.current||pin.state!=='available'||!pin.binding||!query.trim())return;
      if(pageInfo.status!=='available'||!sameSite(pageInfo.url,pin.site)){
        setError('请先切换至该任务获准网站，再从 Web Flow 点击运行。');return;
      }
      const id='webflow:'+global.crypto.randomUUID();
      const item={clientRequestId:id,taskId:pin.taskId,version:pin.version,at:Date.now(),
        task:pin.binding,params:{query:query.trim(),limit:3}};
      const epoch=observation.current;
      busy.current=true;activeRef.current=id;setError('');setNotice('');
      setActive({...item,state:'saving'});
      try{
        await save(pendingKey,item,null);
        if(!alive.current)return;
        pendingRef.current=item;
        // Stop or navigation may have invalidated this preparation during I/O.
        if(activeRef.current!==id||observation.current!==epoch||cancelledRef.current===id)return;
        const ready={clientRequestId:id,task:pin.binding,params:{query:query.trim(),limit:3}};
        stagedRef.current=ready;setStaged(ready);setActive({...item,state:'ready'});
        setNotice('原步骤已保存并读回。点击“确认手动运行”才会执行网页操作。');
      }catch(e){
        if(alive.current){
          // start has never been called in this instance. Keep cancellation
          // only, even if storage committed but its acknowledgement was lost.
          localCancellation.current={clientRequestId:id,task:pin.binding,params:item.params};
          setError('运行步骤未确认保存：'+safeError(e));setActive({...item,state:'unknown'});
        }
      }finally{busy.current=false;}
    };
    const run=pin=>{
      // Nothing asynchronous precedes this SDK start. Preparation was saved
      // by the preceding button, so the trusted parent sees the actual click.
      const ready=stagedRef.current;
      if(!ready||busy.current||cancelledRef.current===ready.clientRequestId||
        activeRef.current!==ready.clientRequestId)return;
      if(!pin||pin.state!=='available'||!M.pinsEqual(pin.binding,ready.task)||
        pin.binding.installationId!==ready.task.installationId||pin.binding.generation!==ready.task.generation){
        setError('固定安装身份发生变化；不能执行已保存步骤，请查询或停止原请求。');return;
      }
      const id=ready.clientRequestId,epoch=++observation.current;
      stagedRef.current=null;setStaged(null);setError('');setNotice('');
      setActive({clientRequestId:id,taskId:pin.taskId,state:'preparing'});
      try{
        Promise.resolve(request('tasks.start',ready)).then(async snapshot=>{
          // ACK alone cannot release the step: accept requires its matching
          // durable Result and an affirmative retirement acknowledgement.
          if(!current(id,epoch))return;
          await accept(id,pin,snapshot,epoch);
        }).catch(e=>failObservation(id,pin,epoch,e));
      }catch(e){failObservation(id,pin,epoch,e);}
    };
    const readOriginal=(entry)=>{
      const pin=PINNED.find(p=>p.taskId===entry?.taskId),id=entry?.clientRequestId;
      if(!id||!pin)return;
      if(activeRef.current&&activeRef.current!==id){setError('请先核对当前未释放的原请求。');return;}
      if(stagedRef.current?.clientRequestId===id){
        setNotice('本实例的步骤已保存但尚未提交；可以确认手动运行，或取消未运行步骤。');return;
      }
      if(localCancellation.current?.clientRequestId===id){
        setNotice('本实例从未提交此步骤；取消保存结果未确认，可以重试取消未运行步骤。');return;
      }
      if(timer.current)clearTimeout(timer.current);
      const epoch=++observation.current;
      stagedRef.current=null;setStaged(null);activeRef.current=id;forgetResult(id);
      setActive({...entry,state:'checking'});setError('');setNotice('');
      void (async()=>{
        try{
          if(!pendingRef.current){
            const item={clientRequestId:id,taskId:pin.taskId,version:entry.version||pin.version,at:entry.at||Date.now()};
            await save(pendingKey,item,null);
            if(!current(id,epoch))return;
            pendingRef.current=item;
          }
          await observe(id,pin,epoch);
        }catch(e){failObservation(id,pin,epoch,e);}
      })();
    };
    const readActive=()=>readOriginal(active);
    const cancelStaged=()=>{
      const ready=stagedRef.current||localCancellation.current;if(!ready||busy.current)return;
      const id=ready.clientRequestId,epoch=++observation.current;
      // Invalidate confirmation synchronously. This instance has never called
      // start for the staged ID; no platform operation needs to be stopped.
      stagedRef.current=null;setStaged(null);cancelledRef.current=id;
      localCancellation.current=ready;busy.current=true;
      setActive({clientRequestId:id,taskId:ready.task.taskId,state:'cancelling-local'});
      void save(pendingKey,null,id,()=>current(id,epoch)).then(saved=>{
        if(saved&&current(id,epoch)){
          pendingRef.current=null;activeRef.current=null;localCancellation.current=null;setActive(null);
          setNotice('未运行步骤已取消；没有派发网页操作。');
        }
      }).catch(e=>failObservation(id,ready.task,epoch,e)).finally(()=>{busy.current=false;});
    };
    const stopOriginal=(entry)=>{
      const id=entry?.clientRequestId;
      if(!id)return;
      if(activeRef.current&&activeRef.current!==id){setError('请先停止当前原请求。');return;}
      activeRef.current=id;cancelledRef.current=id;
      const epoch=++observation.current;
      if(timer.current)clearTimeout(timer.current);
      stagedRef.current=null;setStaged(null);forgetResult(id);
      setActive({...entry,state:'stopping'});
      setNotice('正在停止原请求；已产生的网页副作用不会撤销。停止后请查询原请求确认释放。');
      try{
        void Promise.resolve(request('tasks.stop',{clientRequestId:id})).then(s=>{
          if(current(id,epoch))setActive({...s,clientRequestId:id,taskId:entry.taskId});
        }).catch(e=>{
          if(current(id,epoch)){setActive({...entry,state:'unknown'});setError('停止结果未知：'+safeError(e));}
        });
      }catch(e){if(current(id,epoch))setError('停止结果未知：'+safeError(e));}
    };
    const stop=()=>stopOriginal(active);
    const openTask=pin=>{
      if(pin.state!=='available')return;
      setError('');void request('tasks.open',{taskId:pin.taskId}).catch(e=>{
        if(alive.current)setError('宿主任务管理入口不可用：'+safeError(e));
      });
    };
    const setTab=name=>{setPage(name);setDetail(null);setNotice('');};
    const sameTarget=pin=>pageInfo.status==='available'&&sameSite(pageInfo.url,pin.site);
    const rows=M.filterTasks(tasks,search,filter,settings.favorites);
    const summary=M.summary(tasks,history);
    const runDisabled=pin=>!recoveryReady||pin.state!=='available'||Boolean(activeRef.current)||!sameTarget(pin);
    const gotoScripts=()=>setTab('scripts');
    const banner=h('div',{className:'wf-banner'},
      '本页核对 '+PINNED.length+' 个固定脚本的安装。ChatGPT 自动运行的实时开关与精确批准范围见应用上方“自动运行”。');
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
            h('input',{id:'wf-query',className:'wf-input',value:query,maxLength:120,disabled:Boolean(activeRef.current),
              placeholder:'输入本次搜索关键词',onChange:e=>setQuery(e.target.value),autoComplete:'off'})),
          h('p',{className:'wf-sub'},sameTarget(pin)?
            '目标网站匹配；运行仍须经过原宿主的实时权限、站点及任务校验。':
            '当前标签页不是该任务的获准网站。请切换页面后重新打开 Web Flow。'),
          h('div',{className:'wf-actions'},
            Btn('保存运行步骤',()=>{void prepare(pin);},{primary:true,
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
          h(Status,{state:entry.state,text:'保存时运行：'+entry.state}),
          h('span',{className:'wf-sub'},entry.resultPersisted?'保存时曾观察持久结果':'持久结果未确认')),
        h('p',{className:'wf-sub'},'摘要（当前授权及结果须重新查询）：'+businessLabel(entry.business)+
          (entry.count!==null?' · '+entry.count+' 条':'')+
          '；原聊天交付 / AI 续答：未观察'),
        h('details',{className:'wf-help'},h('summary',null,'技术与证据'),
          detailList([['clientRequestId',h('code',{className:'wf-mono'},entry.clientRequestId)],
            ['runId',h('code',{className:'wf-mono'},entry.runId||'未取得')],
            ['resultId',h('code',{className:'wf-mono'},entry.resultId||'未取得')],
            ['原运行结果',entry.runtimeOk?'Controller 结果 outcome.ok=true':'未核验或执行失败'],
            ['资源释放',entry.retirementState],
            ['持久结果',entry.resultPersisted?'保存时原快照匹配':'未确认']])),
        active?.clientRequestId!==entry.clientRequestId&&h('div',{className:'wf-actions'},
          Btn('查询原请求',()=>readOriginal(entry)))
      ));
    const activeCard=()=>{
      if(!active)return null;
      const snapshot=snapshots[active.clientRequestId];
      const pin=PINNED.find(p=>p.taskId===active.taskId);
      const projection=snapshot&&pin?M.projectRun(snapshot,pin):null;
      return h(Card,{children:h('div',{className:'wf-stack'},
        h('div',{className:'wf-line wf-between'},h('h3',null,'原步骤'),
          h(Status,{state:active.state,text:'执行：'+active.state})),
        h('strong',null,(pin?.title||active.taskId)+' · v'+(active.version||pin?.version||'未确认')),
        h('p',{className:'wf-sub'},'目标网站：'+(pin?.site||'未确认')),
        h('code',{className:'wf-mono'},active.clientRequestId),
        h('p',{className:'wf-sub'},'资源释放：'+(snapshot?.retirementState||'未确认')+'；后续 B：不自动执行'),
        staged&&h('p',null,'已保存参数：'+staged.params.query),
        staged&&Btn('确认手动运行',()=>run(tasks.find(p=>p.taskId===staged.task.taskId)),{
          primary:true,disabled:tasks.find(p=>p.taskId===staged.task.taskId)?.state!=='available'||busy.current}),
        h('div',{className:'wf-actions'},Btn('查询原请求',readActive,{
          disabled:active.state==='saving'||active.state==='cancelling-local'}),
          staged?Btn('取消未运行步骤',cancelStaged):localCancellation.current?
            Btn('重试取消未运行步骤',cancelStaged,{disabled:active.state==='cancelling-local'}):
            Btn('停止原请求',stop,{disabled:active.state==='saving'})),
        pendingRef.current?.task&&h('details',{className:'wf-help'},h('summary',null,'保存时的任务身份'),
          detailList([['安装身份',pendingRef.current.task.installationId],
            ['授权代次',String(pendingRef.current.task.generation)],
            ['manifestHash',pendingRef.current.task.manifestHash],['contentHash',pendingRef.current.task.contentHash]])),
        projection?.resultPersisted&&h('div',{className:'wf-stack'},
          h('p',null,'原 Controller 持久结果 · '+(projection.runtimeOk?'执行成功':'执行未成功')),
          h('p',{className:'wf-mono'},'runId: '+snapshot.runId+' · resultId: '+snapshot.resultId),
          h('pre',{className:'wf-result'},JSON.stringify(snapshot.value??snapshot.result.outcome,null,2))),
        h('p',{className:'wf-sub'},'查询不创建执行。UNKNOWN、缺失记录或资源未释放时，保留原步骤，只能查询或停止。'))});
    };
    function overview(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'概览',note:'固定任务 · 真实安装核验与最近运行'}),
        h('div',{className:'wf-metrics','aria-label':'任务概况'},
          ...[['已审阅任务',summary.reviewed],['可手动运行',loading?'…':summary.available],
            ['需处理',loading?'…':summary.attention],['本应用记录',history.length]]
            .map(([label,n])=>h('span',{key:label},label+' ',h('strong',null,n)))),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'从 ChatGPT 自动运行'),
          h('ol',{className:'wf-help'},
            h('li',null,'打开上方“运行与授权 → 任务授权”，核对脚本、地址与参数。'),
            h('li',null,'在“使用说明”完成一次 ChatGPT 能力接入，再开启上方“自动运行”滑块。'),
            h('li',null,'保持侧栏打开，在已接入的 ChatGPT 项目中正常提出需求。AI 生成新候选后自动执行，无需每轮准备或复制指令。')),
          h('p',{className:'wf-sub'},'在“运行与授权 → 当前任务”查看进度和结果；结果也会回到原聊天。“记录”保存手动运行。'),
          h('div',{className:'wf-actions'},Btn('查看可用脚本',gotoScripts,{quiet:true}),
            Btn('使用与排障',()=>setTab('help'),{quiet:true}),
            Btn('刷新安装状态',()=>{void readTasks();},{quiet:true,disabled:loading})))}),
        summary.attention>0&&h('div',{className:'wf-banner wf-warning'},
          summary.attention+' 项固定任务不可用或版本变化。请在宿主任务目录核对，不要通过改名绕过固定身份。'),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('div',{className:'wf-line wf-between'},h('h3',null,'最近一次手动运行'),
            Btn('查看记录',()=>setTab('history'),{quiet:true})),
          summary.latest?historyCard(summary.latest,0):h('p',{className:'wf-sub'},'尚无手动运行摘要。自动运行的结果在触发任务的原聊天中查看。')
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
        h(Head,{title:'记录',note:'手动运行原步骤与最近 12 条摘要；自动结果见原聊天'}),
        h('div',{className:'wf-banner'},'摘要仅用于定位。点击原记录的“查询原请求”，由当前宿主重新核验授权并读取原结果；不会重新运行。结果完成、资源释放、原聊天交付和 AI 续答分别核对。'),
        activeCard(),
        history.length?h('ul',{className:'wf-history'},...history.map(historyCard)):
          h(Card,{extra:'wf-empty',children:[
            h('strong',{key:'empty'},'还没有可展示的执行摘要'),
            h('p',{key:'note',className:'wf-sub'},'保存运行步骤后再确认手动运行。关闭重开可按原步骤查询，摘要本身不是权威结果。'),
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
          h('p',{className:'wf-sub'},'使用本应用上方的“自动运行”滑块；打开“运行与授权 → 任务授权”核对已安装脚本、地址和参数并批准。开关与批准即时保存。'),
          h('p',{className:'wf-sub'},'若上方没有自动运行控件，请更新 OpenDesk Browser。保持可信侧栏打开后，在 ChatGPT 发送新消息；只有随后完整助手回复中的 webflow.task.intent.v1 候选可触发，用户消息、历史与引用不触发。'))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'开发与安装'),
          h('p',{className:'wf-sub'},'创建、导入、升级和卸载请使用宿主的「开发」或「我的 → 任务目录」；不会从沙箱打开私有宿主页面。'),
          h('p',{className:'wf-sub'},'当前绑定：'+PINNED.length+' 个固定版本 Task；版本变化需重新审阅并更新应用包。'))}),
        h(Card,{children:h('details',{className:'wf-help'},
          h('summary',null,'未来的多步骤流程'),
          h('p',null,'流程需要逐站授权、步骤依赖、原持久 Run/Result、恢复和 UNKNOWN 对账。项目现有队列只是离线状态模块；尚未接入真实派发，不显示流程启动按钮。'))}));
    }
    function helpPage(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'帮助',note:'首次使用或需要排障时查看',
          action:Btn('返回',()=>setTab('overview'),{quiet:true})}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'从 ChatGPT 自动运行'),
          h('p',null,'1. 打开应用上方“运行与授权 → 任务授权”，核对已批准任务的版本、精确地址和参数。已有有效批准可直接复用；改变参数需重新审核。'),
          h('p',null,'2. 在“运行与授权 → 使用说明”审阅一次能力说明，保存到 ChatGPT 当前项目的项目指令。普通聊天也可先发送能力说明一次，范围仅限该聊天。开启自动运行，保持侧栏打开。'),
          h('p',null,'3. 此后正常发送需求即可，AI 每次生成新候选。当前消息的等待、未执行、运行和结果在“当前任务”查看，真实结果单次回原聊天；结果未知时只查询或停止原请求，不补跑。'),
          h('h3',null,'未触发或需要停止'),
          h('p',null,'先核对上方开关、任务批准和原聊天任务卡的错误。未批准时在可信界面审核；协议格式、重复候选、安装变化或网站权限失败时按原错误处理。关闭开关只阻止新任务；已开始的任务在原聊天任务卡停止。'),
          h('p',null,'若上方没有自动运行或一次接入说明，请更新 OpenDesk Browser 后重开应用。它们来自 Browser 的可信组件，单独升级工具包不会更新该组件。'),
          h('h3',null,'手动运行一个真实任务'),
          h('p',null,'1. 在宿主任务目录安装并核验与本应用相同版本、哈希的 Controller Task。'),
          h('p',null,'2. 打开对应的 Google / 百度获准网站，再在 Web Flow → 脚本选择任务、输入关键词并点击运行。'),
          h('p',null,'3. 保存运行步骤并确认手动运行。关闭重开后在“记录 → 原步骤 → 查询原请求”核对同一执行；网页业务状态须单独核对。'),
          h('h3',null,'出现版本不匹配或 UNKNOWN'),
          h('p',null,'回到可信宿主核对安装身份、权限、站点和结果。不通过自动重试绕开未知副作用。'),
          h('p',null,'持续自动使用 webflow.task.intent.v1 严格五字段；原手动与一次批准使用 opendesk.task.intent.v1，保留各自授权、防重放与回执。'))}));
    }
    const sections={overview,scripts,history:records,settings:settingsPage,help:helpPage};
    return h('div',{className:'wf-app', 'data-theme':settings.theme},
      h('div',{className:'wf-head'},
      h('div',{className:'wf-tabs',role:'tablist','aria-label':'Web Flow 主导航'},
        ...[['overview','概览'],['scripts','脚本'],['history','记录']].map(([key,label],i)=>
          h('button',{key,type:'button',role:'tab',className:'wf-tab',id:'wf-tab-'+key,'aria-controls':'wf-panel',
            'aria-selected':page===key,'data-page':key,
            tabIndex:(['overview','scripts','history'].includes(page)?page:'overview')===key?0:-1,
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
        h('div',{className:'wf-head-actions'},
          Btn('?',()=>setTab('help'),{icon:true,ariaLabel:'帮助'}),
          Btn('⚙',()=>setTab('settings'),{icon:true,ariaLabel:'设置'}))),
      h('main',{className:'wf-body',role:'tabpanel',id:'wf-panel',
        'aria-label':({overview:'概览',scripts:'脚本',history:'记录',settings:'设置',help:'帮助'})[page],tabIndex:0},
        error&&h('div',{className:'wf-banner wf-warning',role:'alert'},
          h('p',null,error),Btn('关闭提示',()=>setError(''),{quiet:true})),
        notice&&h('div',{className:'wf-banner',role:'status'},
          h('p',null,notice),Btn('知道了',()=>setNotice(''),{quiet:true})),
        page!=='history'&&activeCard(),
        sections[page]()));
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

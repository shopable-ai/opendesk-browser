// Web Flow V0.3.2. The tool runs in its own opaque-origin Sidebar iframe.
// Its only privileged interactions are reviewed OpenDeskTool.request calls.
(function(global){
  'use strict';
  const tool=global.OpenDeskTool, R=global.OpenDeskPageReact, M=global.OpenDeskWebFlowModel;
  const W=global.OpenDeskMdWorkflow;
  const SharedSwitch=global.OpenDeskSidebarUI?.Switch;
  const mount=tool&&tool.root&&tool.root.querySelector('#webflow-app');
  if(!mount||!R||!M||typeof R.createRoot!=='function'||typeof tool.request!=='function'){
    if(mount)mount.textContent='Web Flow 无法加载受支持的公开 SDK / React 运行时。';
    return;
  }
  const h=(name,props,...children)=>R.createElement(name,props,...children);
  const PINNED=Object.freeze([
    Object.freeze({taskId:'baidu.search.top3',version:'1.1.5',
      manifestHash:'f49e274aadfeed12540aff028ff267b3772ebe35a2f16c154008542b76a5bf38',
      contentHash:'2b0f31c0d485355576cac11968170bb9eb41c9076df5bb6659f93d0173286181',
      title:'百度搜索 · 前三条自然结果',site:'https://www.baidu.com',icon:'百'}),
    Object.freeze({taskId:'google.search.top3',version:'1.0.3',
      manifestHash:'e1d6b92ac83fc3eb9b21a9b7b420e808e69326f4764fdb8c6d4ee88bef7271b3',
      contentHash:'241575bb72dccd1106132fc5561c7322fcb11b927e1940e30eda66bec38a09ee',
      title:'Google 搜索 · 前三条自然结果',site:'https://www.google.com',icon:'G'})
  ]);
  // Local presentation glyphs; neither these icons nor the preview grant abilities.
  const Icon=(name,filled=false)=>{
    const paths={
      search:'M20 20l-4.2-4.2 M17 10a7 7 0 1 1-14 0a7 7 0 0 1 14 0',
      filter:'M4 7h16 M7 12h10 M10 17h4',
      refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',
      play:'m8 5 11 7-11 7z',
      star:'m12 2 3.1 6.5 7.1 1-5.1 5 1.2 7-6.3-3.3-6.3 3.3 1.2-7-5.1-5 7.1-1Z',
      more:'M5 12h.01 M12 12h.01 M19 12h.01',
      chevron:'m8 5 7 7-7 7',
      help:'M9 9a3 3 0 0 1 6 1c0 2-3 2-3 4 M12 17v.5 M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18',
      settings:'M4 7h7m4 0h5M4 17h3m4 0h9 M15 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0 M11 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0'
    };
    return h('svg',{viewBox:'0 0 24 24',width:17,height:17,fill:filled?'currentColor':'none',
      stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round',
      'aria-hidden':'true',focusable:'false'},h('path',{d:paths[name]||paths.chevron}));
  };
  const labels={checking:'正在核验',available:'可手动运行',unavailable:'任务不可用',
    missing:'尚未安装',removed:'已卸载',disabled:'已停用',initialization:'初始化失败',
    changed:'固定版本不匹配',runtime:'待重新验证',error:'读取失败',unknown:'结果未知',running:'执行中'};
  const operation=tool.request.bind(tool);
  const Btn=(label,click,opts={})=>h('button',{
    key:opts.key||label,type:'button',className:'wf-btn'+(opts.primary?' wf-primary':'')+(opts.quiet?' wf-quiet':'')+
      (opts.icon?' wf-icon':'')+(opts.shortcut?' wf-shortcut':''),onClick:click,disabled:opts.disabled===true,
    title:opts.title,'aria-label':opts.ariaLabel||undefined,'aria-pressed':opts.pressed,'aria-current':opts.current,
    'aria-expanded':opts.expanded,'aria-haspopup':opts.popup,'aria-controls':opts.controls,
    'aria-describedby':opts.describedBy,id:opts.id,'data-wf-menu':opts.menuId,'data-wf-more':opts.moreId
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
  const pagePanelKey='webflow.pagePanelVisible.v1';
  const pendingKey='webflow.pending.v1';
  // Storage may return JSON object fields in a different order. Compare all
  // values while preserving array order, types, and missing/extra fields.
  const sameSavedValue=(a,b)=>{
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&
      a.length===b.length&&a.every((value,index)=>sameSavedValue(value,b[index]));
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length&&keys.every(key=>
      Object.hasOwn(b,key)&&sameSavedValue(a[key],b[key]));
  };

  function App(){
    // A first-entry hint is read-only and NEVER starts/retries any Task.
    const [page,setPage]=R.useState(
      tool.surface==='page'&&tool.initialPage?.view==='scripts'&&
      !Object.hasOwn(tool.initialPage,'section')?'scripts':'overview');
    const [settings,setSettings]=R.useState(defaultPrefs);
    const [tasks,setTasks]=R.useState(PINNED.map(pin=>({...pin,state:'checking',binding:null})));
    const [history,setHistory]=R.useState([]);
    const [loading,setLoading]=R.useState(true);
    const [pageInfo,setPageInfo]=R.useState({status:'unavailable'});
    const [error,setError]=R.useState('');
    const [configureError,setConfigureError]=R.useState('');
    const [notice,setNotice]=R.useState('');
    const [feedback,setFeedback]=R.useState('');
    const [search,setSearch]=R.useState('');
    const [filter,setFilter]=R.useState('all');
    const [sort,setSort]=R.useState('favorite');
    const [detail,setDetail]=R.useState(null);
    const [mdSource,setMdSource]=R.useState('https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md');
    const [mdPreview,setMdPreview]=R.useState(null);
    const [mdError,setMdError]=R.useState('');
    const [mdBusy,setMdBusy]=R.useState(false);
    const [active,setActive]=R.useState(null);
    const [saving,setSaving]=R.useState(false);
    const [panelPreference,setPanelPreference]=R.useState({status:'loading',value:false,etag:null});
    const [panelSaving,setPanelSaving]=R.useState(false);
    const panelPreferenceRef=R.useRef({status:'loading',value:false,etag:null});
    const panelSavingRef=R.useRef(false),panelDirtyRef=R.useRef(false),panelReadEpoch=R.useRef(0);
    const [showFilters,setShowFilters]=R.useState(false);
    const [more,setMore]=R.useState(null);
    const [hostNavigation,setHostNavigation]=R.useState({base:false,actions:false});
    const returnTab=R.useRef('overview');
    const [recoveryReady,setRecoveryReady]=R.useState(false);
    const [snapshots,setSnapshots]=R.useState({});
    const alive=R.useRef(true), seq=R.useRef(0), timer=R.useRef(null);
    const configuring=R.useRef(false), activeRef=R.useRef(null), historyRef=R.useRef([]);
    const observation=R.useRef(0), pendingRef=R.useRef(null);
    const recordWrites=R.useRef(Promise.resolve());
    const taskNotices=R.useRef(null);
    if(!taskNotices.current)taskNotices.current=M.createTaskNoticePublisher(tool.ui?.notify);
    const feedbackRef=R.useRef({revision:0,handle:null,timer:null});
    // Small, verified UI receipts use the existing R1.2 host. Unlike task notices,
    // these never depend on, authorize or mutate a Controller Run.
    const clearFeedback=()=>{
      const slot=feedbackRef.current;
      slot.revision++;
      if(slot.timer!==null){clearTimeout(slot.timer);slot.timer=null;}
      const prior=slot.handle;slot.handle=null;
      if(prior)try{void Promise.resolve(prior.dismiss()).catch(()=>{});}catch{}
      if(alive.current)setFeedback('');
    };
    const showFeedback=message=>{
      clearFeedback();
      const slot=feedbackRef.current,revision=slot.revision;
      const fallback=()=>{
        if(!alive.current||slot.revision!==revision)return;
        setFeedback(message);
        slot.timer=setTimeout(()=>{
          if(alive.current&&slot.revision===revision){setFeedback('');slot.timer=null;}
        },4500);
      };
      const open=tool.ui?.notify?.open;
      if(typeof open!=='function'){fallback();return;}
      let handle;
      try{handle=open({message,type:'success',position:'bottom-right',timeout:3500});}
      catch{fallback();return;}
      if(!handle||typeof handle.dismiss!=='function'||!handle.ready){
        fallback();return;
      }
      slot.handle=handle;
      void Promise.resolve(handle.ready).then(receipt=>{
        if(receipt?.status!=='accepted')fallback();
      },fallback);
    };
    const pageReadEpoch=R.useRef(0);
    const currentPageRef=R.useRef({status:'unavailable'}),taskReadPending=R.useRef(false);
    const prefsDirty=R.useRef(false);
    const request=R.useCallback((name,args)=>operation(name,args),[]);
    const adoptPanelPreference=state=>{panelPreferenceRef.current=state;setPanelPreference(state);};
    const readPanelPreference=R.useCallback(async()=>{
      const epoch=++panelReadEpoch.current;
      try{
        const reply=await request('storage.get',{key:pagePanelKey,withEtag:true});
        if(!alive.current||epoch!==panelReadEpoch.current||panelSavingRef.current)return null;
        if((reply?.value!==null&&typeof reply?.value!=='boolean')||typeof reply?.etag!=='string')
          throw Error('网页辅助面板设置数据无效');
        const current={status:'ready',value:reply.value===true,etag:reply.etag};
        adoptPanelPreference(current);panelDirtyRef.current=false;
        return current;
      }catch(error){
        if(alive.current&&epoch===panelReadEpoch.current&&!panelSavingRef.current){
          adoptPanelPreference({status:'error',value:false,etag:null});
          setError('网页显示设置读取失败：'+safeError(error));
        }
        return null;
      }
    },[request]);
    R.useEffect(()=>{
      void readPanelPreference();
      if(page!=='settings')return;
      // Multiple settings windows share the Host storage namespace.
      const refresh=()=>{if(!panelSavingRef.current)void readPanelPreference();};
      const interval=global.setInterval(refresh,1400);
      global.addEventListener('focus',refresh);
      return ()=>{global.clearInterval(interval);global.removeEventListener('focus',refresh);};
    },[page,readPanelPreference]);

    // The bridge conservatively marks trusted inputs as drafts. Reconcile
    // view-only controls on every render, retaining unconfirmed durable edits.
    R.useEffect(()=>{
      tool.setState?.({dirty:prefsDirty.current||panelDirtyRef.current,busy:saving||panelSaving});
    });

    const readTasks=R.useCallback(async()=>{
      const epoch=++seq.current;
      taskReadPending.current=true;
      setLoading(true);
      setTasks(old=>old.map(pin=>({...pin,state:'checking',binding:null,preparations:[],error:'',diagnostic:''})));
      const rows=await Promise.all(PINNED.map(async pin=>{
        try{
          const reply=await request('tasks.read',{taskId:pin.taskId});
          if(!reply?.task)return {...pin,state:'unavailable',binding:null,error:M.taskReadMessage()};
          if(!M.pinsEqual(pin,reply.task))
            return {...pin,state:'changed',binding:null,error:M.taskReadMessage({code:'E_REVISION'})};
          if(typeof reply.task.installationId!=='string'||!reply.task.installationId.trim()||
            !Number.isSafeInteger(reply.task.generation)||reply.task.generation<1)
            return {...pin,state:'unavailable',binding:null,error:M.taskReadMessage()};
          return {...pin,...M.taskMetadata(reply.manifest),state:reply.runtimeCurrent===false?'runtime':'available',binding:reply.task,
            preparations:M.taskPreparations(reply.preparations,reply.task)};
        }catch(e){return {...pin,state:M.errorState(e),binding:null,
          error:M.taskReadMessage(e),diagnostic:safeError(e)};}
      }));
      if(alive.current&&epoch===seq.current){taskReadPending.current=false;setTasks(rows);setLoading(false);}
    },[request]);

    // Host notifications are hints only. Never trust event details as task scope.
    // Re-read the bounded SDK operation and ignore stale replies.
    const readCurrentPage=R.useCallback(async()=>{
      const epoch=++pageReadEpoch.current;
      // Invalidate synchronously as well as in React: another click in this
      // event turn must not use the previous document's eligibility.
      currentPageRef.current={status:'checking'};
      setPageInfo(currentPageRef.current);
      try{
        const info=await request('currentPage.info',{});
        if(alive.current&&epoch===pageReadEpoch.current){
          currentPageRef.current=info&&typeof info==='object'?info:{status:'unavailable'};
          setPageInfo(currentPageRef.current);
        }
      }catch(e){
        if(alive.current&&epoch===pageReadEpoch.current){
          currentPageRef.current={status:'unavailable',message:safeError(e)};
          setPageInfo(currentPageRef.current);
        }
      }
    },[request]);

    R.useEffect(()=>{
      alive.current=true;
      let disposed=false;
      async function load(){
        try{
          const [prefs,records,pending]=await Promise.allSettled([
            request('storage.get',{key:'webflow.settings.v1'}),
            request('storage.get',{key:'webflow.recent.v1'}),
            request('storage.get',{key:pendingKey})
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
      void load();void readTasks();void readCurrentPage();
      return ()=>{disposed=true;alive.current=false;seq.current++;observation.current++;pageReadEpoch.current++;panelReadEpoch.current++;
        if(timer.current)clearTimeout(timer.current);
        taskNotices.current?.dispose();clearFeedback();};
    },[readTasks,readCurrentPage,request]);

    R.useEffect(()=>{
      const onPageChanged=()=>{void readCurrentPage();};
      tool.root.addEventListener('opendesk-page-changed',onPageChanged);
      return ()=>tool.root.removeEventListener('opendesk-page-changed',onPageChanged);
    },[readCurrentPage]);

    // R1.5 Host gear owns the settings entry; the sandbox owns its view.
    R.useEffect(()=>{
      const child=page==='settings'||page==='help'||page==='md';
      const view=child?page:'home';
      const base={page:view,title:child?(page==='help'?'帮助':page==='md'?'Markdown 任务队列':'Web Flow 设置'):'Web Flow',
        canBack:child,primary:null,secondary:null};
      const helpAction={id:'help',label:'帮助',icon:'diagnostics'};
      let actions=false,settingsEntry=false,accepted=false;
      if(typeof tool.setNavigation==='function'){
        const headers=tool.navigationFeatures?.headerActions===true;
        if(tool.navigationFeatures?.settingsPage===true){
          settingsEntry=tool.setNavigation({...base,settingsPage:'settings',
            ...(headers?{headerActions:[helpAction]}:{})})===true;
          if(settingsEntry){accepted=true;actions=headers;}
        }
        if(!accepted&&headers){
          actions=tool.setNavigation({...base,headerActions:[helpAction,
            {id:'settings',label:'应用偏好',icon:'settings'}]})===true;
          accepted=actions;
        }
        if(!accepted)accepted=tool.setNavigation(base)===true;
      }
      setHostNavigation({base:accepted,actions,settings:settingsEntry});
      const onNavigation=event=>{
        const info=event.detail;
        if(info?.action==='back'&&child){setPage(returnTab.current);setNotice('');}
        else if(settingsEntry&&info?.action==='settings'&&info.page==='settings'){
          if(!child)returnTab.current=page;
          setPage('settings');setNotice('');
        }
        else if(actions&&info?.action==='header'&&info.page===view&&
          (info.actionId==='help'||!settingsEntry&&info.actionId==='settings')){
          if(!child)returnTab.current=page;
          setPage(info.actionId);setNotice('');
        }
      };
      tool.root.addEventListener('opendesk-tool-navigation',onNavigation);
      return ()=>tool.root.removeEventListener('opendesk-tool-navigation',onNavigation);
    },[page]);

    R.useEffect(()=>{
      if(!showFilters&&!more)return;
      const onKey=event=>{
        if(event.key!=='Escape'||event.isComposing||event.keyCode===229)return;
        event.preventDefault();
        if(more){
          setMore(null);
          global.queueMicrotask(()=>tool.root.querySelector('[data-wf-menu="'+more+'"]')?.focus());
        }else if(showFilters){
          setShowFilters(false);
          global.queueMicrotask(()=>tool.root.querySelector('#wf-filter-toggle')?.focus());
        }
      };
      const onPointer=event=>{
        if(showFilters&&!event.target.closest?.('.wf-search-row'))setShowFilters(false);
        if(more&&!event.target.closest?.('.wf-menu-anchor'))setMore(null);
      };
      tool.root.addEventListener('keydown',onKey);
      tool.root.addEventListener('pointerdown',onPointer);
      return ()=>{
        tool.root.removeEventListener('keydown',onKey);
        tool.root.removeEventListener('pointerdown',onPointer);
      };
    },[showFilters,more]);

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
      if(!sameSavedValue(after&&after.value,value))
        throw Error('保存后读回不一致；请在宿主检查真实状态');
      return true;
    };
    const savePrefs=async value=>{
      if(saving)return;
      prefsDirty.current=true;
      setSaving(true);setError('');
      try{const confirmed=await save('webflow.settings.v1',value);
        if(confirmed&&alive.current){prefsDirty.current=false;setSettings(value);setNotice('');showFeedback('偏好已保存并读回。');}}
      catch(e){if(alive.current)setError('偏好未确认保存：'+safeError(e));}
      finally{if(alive.current)setSaving(false);}
    };
    const savePanelVisibility=async visible=>{
      const previous=panelPreferenceRef.current;
      if(panelSavingRef.current||previous.status!=='ready'||typeof visible!=='boolean'||previous.value===visible)return;
      panelSavingRef.current=true;setPanelSaving(true);panelDirtyRef.current=true;setError('');
      let writeFailure=null;
      try{await request('storage.set',{key:pagePanelKey,value:visible,ifMatch:previous.etag});}
      catch(error){writeFailure=error;}
      try{
        // Read independently even if the write ACK is lost or rejected.
        const reply=await request('storage.get',{key:pagePanelKey,withEtag:true});
        if(!alive.current)return;
        if((reply?.value!==null&&typeof reply?.value!=='boolean')||typeof reply?.etag!=='string')
          throw Error('网页显示设置读回结构无效');
        const current={status:'ready',value:reply.value===true,etag:reply.etag};
        adoptPanelPreference(current);panelDirtyRef.current=false;
        if(!writeFailure&&current.value===visible)
          showFeedback(visible?'网页辅助面板已开启并读回。':'网页辅助面板已关闭并读回。');
        else setError(writeFailure?
          '设置写入未确认，已重新读取当前有效状态：'+safeError(writeFailure):
          '设置写入回执与读回不一致，请核对当前显示状态。');
      }catch(error){
        if(alive.current){
          adoptPanelPreference({status:'error',value:false,etag:null});
          setError('网页显示设置结果未知，请重新进入设置核对，不能重复盲写：'+safeError(error));
        }
      }finally{
        panelSavingRef.current=false;
        if(alive.current)setPanelSaving(false);
      }
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
        taskNotices.current?.publish(id,next,pin);
        activeRef.current=null;
        setNotice('原请求已查询，资源已释放；后续任务仍须手动运行。');
        return;
      }
      taskNotices.current?.publish(id,next,pin);
      if(next.state==='unknown'||next.semantic==='UNKNOWN'||attempt>=45){
        setNotice('原请求仍未确定。保留同一步骤，只能查询或停止，不能重新运行。');return;
      }
      timer.current=setTimeout(()=>{void observe(id,pin,epoch,attempt+1);},1600);
    };
    const failObservation=(id,pin,epoch,e)=>{
      if(!current(id,epoch))return;
      forgetResult(id);setActive({clientRequestId:id,taskId:pin.taskId,state:'unknown'});
      // A failed trusted read invalidates the old optimistic toast; it does not prove a failed Run.
      taskNotices.current?.publish(id,{clientRequestId:id,taskId:pin.taskId,state:'unknown',semantic:'UNKNOWN'},pin);
      setNotice('');
      setError('原请求未确认：'+safeError(e)+'。请查询或停止原步骤，不能新建请求补跑。');
    };
    const observe=async(id,pin,epoch,attempt=0)=>{
      if(!current(id,epoch))return;
      try{await accept(id,pin,await request('tasks.read',{clientRequestId:id}),epoch,attempt);}
      catch(e){failObservation(id,pin,epoch,e);}
    };
    // UI-only: preserve the real click turn. The trusted sheet owns parameters,
    // preparation and execution; this consumer never starts a new request.
    const configure=(pin,preparationId)=>{
      if(runReason(pin)||taskReadPending.current||configuring.current)return;
      if(preparationId!==undefined&&!pin.preparations?.some(record=>record.preparationId===preparationId))return;
      configuring.current=true;setConfigureError('');
      try{
        const opened=preparationId===undefined?request('tasks.configure',{task:pin.binding}):
          request('tasks.configure',{task:pin.binding,preparationId});
        setMore(null);
        void Promise.resolve(opened).catch(e=>{
          if(alive.current)setConfigureError('运行配置未打开：'+safeError(e));
        }).finally(()=>{configuring.current=false;});
      }catch(e){configuring.current=false;if(alive.current)setConfigureError('运行配置未打开：'+safeError(e));}
    };
    const readOriginal=(entry)=>{
      const pin=PINNED.find(p=>p.taskId===entry?.taskId),id=entry?.clientRequestId;
      if(!id||!pin)return;
      if(activeRef.current&&activeRef.current!==id){setError('请先核对当前未释放的原请求。');return;}
      if(timer.current)clearTimeout(timer.current);
      const epoch=++observation.current;
      activeRef.current=id;forgetResult(id);
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
    const stopOriginal=(entry)=>{
      const id=entry?.clientRequestId;
      if(!id)return;
      if(activeRef.current&&activeRef.current!==id){setError('请先停止当前原请求。');return;}
      activeRef.current=id;
      const epoch=++observation.current;
      if(timer.current)clearTimeout(timer.current);
      forgetResult(id);
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
      if(pin.state==='checking')return;
      setError('');void request('tasks.open',{taskId:pin.taskId}).catch(e=>{
        if(alive.current)setError('宿主任务管理入口不可用：'+safeError(e));
      });
    };
    const setTab=name=>{
      if((name==='help'||name==='settings'||name==='md')&&['overview','scripts','history'].includes(page))
        returnTab.current=page;
      setPage(name);
      if(name==='scripts')void readCurrentPage();
      if(['overview','scripts','history'].includes(name)){
        setDetail(null);setMore(null);setShowFilters(false);
      }
      setNotice('');
    };
    const rows=M.filterTasks(tasks,search,filter,settings.favorites,sort);
    const summary=M.summary(tasks,history);
    const runStateLabel=state=>({
      completed:'执行完成',failed:'执行失败',unknown:'结果未知',stopped:'已停止',
      interrupted:'已中断',cancelled:'已取消',canceled:'已取消',
      running:'执行中',saving:'保存中',checking:'核验中',ready:'待确认运行',
      preparing:'正在提交',stopping:'停止请求中','cancelling-local':'取消保存中'
    })[state]||state||'未核验';
    const gotoScripts=()=>setTab('scripts');
    // Opening trusted configuration is not admission. Recovery errors and old
    // UNKNOWNs remain visible; the Authority fences preparation/execution.
    const runReason=pin=>!['available','runtime'].includes(pin.state)?labels[pin.state]||'任务不可用':
      !pin.binding?'固定安装身份未取得':'';
    const inspect=pin=>{
      const fromMenu=more===pin.taskId;
      setDetail(detail===pin.taskId?null:pin.taskId);setMore(null);
      if(fromMenu)global.queueMicrotask(()=>tool.root.querySelector('[data-wf-task-name="'+pin.taskId+'"]')?.focus());
    };

    const detailList=items=>h('dl',{className:'wf-detail'},...items.flatMap(([k,v])=>
      [h('dt',{key:k+'-key'},k),h('dd',{key:k+'-val'},v)]));
    const taskCard=pin=>{
      const star=settings.favorites.includes(M.taskKey(pin));
      const reason=runReason(pin),expanded=detail===pin.taskId;
      const focusMore=()=>global.queueMicrotask(()=>
        tool.root.querySelector('[data-wf-more="'+pin.taskId+'"]')?.focus());
      const closeDetails=()=>{
        setDetail(null);
        global.queueMicrotask(()=>tool.root.querySelector('[data-wf-task-name="'+pin.taskId+'"]')?.focus());
      };
      return h('article',{key:pin.taskId,className:'wf-task-row','data-menu-open':more===pin.taskId,
        onKeyDown:e=>{
          if(e.key!=='Escape'||e.nativeEvent?.isComposing)return;
          if(more===pin.taskId){e.stopPropagation();setMore(null);focusMore();}
          else if(expanded){e.stopPropagation();closeDetails();}
        },
        onBlur:e=>{if(more===pin.taskId&&!e.currentTarget.contains(e.relatedTarget))setMore(null);}},
        h('div',{className:'wf-task-main'},
          h('span',{className:'wf-task-icon','aria-hidden':'true'},pin.icon),
          h('div',{className:'wf-task-info'},
            h('button',{type:'button',className:'wf-task-name',title:pin.title,'data-wf-task-name':pin.taskId,
              'aria-expanded':expanded,'aria-controls':'wf-details-'+pin.taskId,onClick:()=>inspect(pin)},pin.title),
            h('div',{className:'wf-task-meta'},
              h('span',{className:'wf-truncate',title:pin.site},pin.site.replace('https://','')),
              h(Status,{state:pin.state})),
            h('div',{className:'wf-task-secondary'},
              h('span',null,pin.parameterCount==null?'参数待核对':'参数 '+pin.parameterCount+' 项'),
              h('span',null,'手动 · 双阶段确认'))),
          h('div',{className:'wf-item-buttons'},
            Btn(Icon('star',star),()=>toggleFavorite(pin),{key:'fav-'+pin.taskId,icon:true,shortcut:true,
              disabled:saving,title:star?'取消收藏':'收藏',
              ariaLabel:(star?'取消收藏 ':'收藏 ')+pin.title,pressed:star}),
            Btn(Icon('play'),()=>configure(pin),{
              key:'run-'+pin.taskId,icon:true,shortcut:true,primary:true,disabled:Boolean(reason),
              title:reason||'打开可信运行配置；点击不会执行',
              ariaLabel:reason?'无法运行 '+pin.title+'：'+reason:'准备运行 '+pin.title}),
            h('div',{className:'wf-menu-anchor'},
              Btn(Icon('more'),()=>setMore(more===pin.taskId?null:pin.taskId),
                {key:'more-'+pin.taskId,icon:true,ariaLabel:'更多操作：'+pin.title,
                  menuId:pin.taskId,moreId:pin.taskId,title:'更多操作',
                  expanded:more===pin.taskId,popup:'true',controls:'wf-menu-'+pin.taskId}),
              more===pin.taskId&&h('div',{id:'wf-menu-'+pin.taskId,className:'wf-menu',role:'group',
                'aria-label':pin.title+' 操作'},
                h('button',{type:'button',disabled:Boolean(reason),onClick:()=>configure(pin)},'配置运行'),
                h('button',{type:'button',onClick:()=>inspect(pin)},'查看详情'),
                h('button',{type:'button',disabled:saving,onClick:()=>{
                  setMore(null);void toggleFavorite(pin);}},star?'取消收藏':'收藏脚本'),
                pin.state==='available'&&h('button',{type:'button',
                  onClick:()=>{setMore(null);openTask(pin);}},'宿主管理'))))),
        pin.error&&h('p',{className:'wf-sub wf-row-error',role:'status'},pin.error),
        ['missing','removed','initialization','disabled','changed','runtime'].includes(pin.state)&&
          h('div',{className:'wf-actions'},
            Btn(['disabled','runtime'].includes(pin.state)?'打开任务管理':'打开安装审阅',()=>openTask(pin)),
            pin.state==='initialization'&&Btn('重试初始化',()=>{void readTasks();},{disabled:loading})),
        expanded&&h('div',{id:'wf-details-'+pin.taskId,className:'wf-task-detail wf-stack',
          'aria-label':pin.title+' 详情','aria-describedby':'wf-description-'+pin.taskId},
          h('strong',null,pin.title),
          h('p',{id:'wf-description-'+pin.taskId,className:'wf-sub'},pin.description||'任务说明待核对'),
          h('p',{className:'wf-sub'},'网站：'+(pin.siteOrigins?.join(' · ')||pin.site)),
          h('p',{className:'wf-sub'},pin.parameterCount==null?'参数待核对':'参数 '+pin.parameterCount+' 项；在可信运行配置中编辑'),
          Btn('收起详情',closeDetails,{quiet:true}))
      );
    };
    const historyCard=(entry,index)=>h('li',{key:entry.clientRequestId+'-'+index,className:'wf-record-row'},
      h('details',{className:'wf-record-details'},
        h('summary',{className:'wf-record-summary',title:'展开查看原请求证据'},
          h('div',{className:'wf-record-info'},
            h('strong',null,PINNED.find(p=>p.taskId===entry.taskId)?.title||entry.taskId),
            h('span',{className:'wf-sub'},time(entry.at)+' · 手动运行')),
          h(Status,{state:entry.state,text:runStateLabel(entry.state)}),
          h('span',{className:'wf-chevron','aria-hidden':'true'},Icon('chevron'))),
        h('div',{className:'wf-record-expanded wf-stack'},
          h('p',{className:'wf-sub'},'以下为保存时摘要，不是当前结果：'+businessLabel(entry.business)+
            (entry.count!==null?' · '+entry.count+' 条':'')+'。'),
          detailList([['clientRequestId',h('code',{className:'wf-mono'},entry.clientRequestId)],
            ['runId',h('code',{className:'wf-mono'},entry.runId||'未取得')],
            ['resultId',h('code',{className:'wf-mono'},entry.resultId||'未取得')],
            ['持久结果',entry.resultPersisted?'保存时原快照匹配':'未确认'],
            ['运行结果',entry.runtimeOk?'Controller outcome.ok=true（不等于网页业务成功）':'未核验或执行失败'],
            ['资源释放',entry.retirementState],
            ['网页业务',businessLabel(entry.business)],
            ['原聊天交付',entry.delivery==='not_observed'?'未观察':entry.delivery],
            ['AI 续答',entry.aiReply==='not_observed'?'未观察':entry.aiReply]]),
          active?.clientRequestId!==entry.clientRequestId&&Btn('查询原请求（只读）',()=>readOriginal(entry),
            {disabled:Boolean(activeRef.current&&activeRef.current!==entry.clientRequestId),
              title:activeRef.current&&activeRef.current!==entry.clientRequestId?'请先核对当前原请求':'读取同一请求，不重放执行'}))
      ));
    const activeCard=()=>{
      if(!active)return null;
      const snapshot=snapshots[active.clientRequestId];
      const pin=PINNED.find(p=>p.taskId===active.taskId);
      const projection=snapshot&&pin?M.projectRun(snapshot,pin):null;
      return h(Card,{children:h('div',{className:'wf-stack'},
        h('div',{className:'wf-line wf-between'},h('h3',null,'原步骤'),
          h(Status,{state:active.state,text:'阶段：'+runStateLabel(active.state)})),
        h('strong',null,(pin?.title||active.taskId)+' · v'+(active.version||pin?.version||'未确认')),
        h('p',{className:'wf-sub'},'目标网站：'+(pin?.site||'未确认')),
        h('code',{className:'wf-mono'},active.clientRequestId),
        h('p',{className:'wf-sub'},'资源释放：'+(snapshot?.retirementState||'未确认')+'；后续 B：不自动执行'),
        h('div',{className:'wf-actions'},Btn('查询原请求',readActive),
          Btn('停止原请求',stop)),
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
      return h('div',{className:'wf-stack wf-overview'},
        h(Card,{children:h('div',{className:'wf-stack'},
          h('div',{className:'wf-line wf-between'},
            h('div',{className:'wf-grow'},
              h('strong',null,active?'手动原步骤待核对':
                summary.attention?'有固定脚本需要处理':'当前没有待处理异常'),
              h('p',{className:'wf-sub'},active?'当前步骤只能只读查询或停止；不会自动补跑。':
                summary.attention?'请核对固定任务的安装、版本和权限。':
                '手动任务仅按已审阅的安装及网站范围使用。'),
              active&&h('code',{className:'wf-mono wf-active-locator',
                title:'待核对的原请求 clientRequestId'},active.clientRequestId)),
            (active||summary.attention>0)&&Btn(active?'处理原步骤':'查看原因',
              ()=>setTab(active?'history':'scripts'),{quiet:true})),
          h('div',{className:'wf-metrics','aria-label':'固定任务概况'},
            ...[['自带脚本',summary.reviewed],['可运行',loading?'…':summary.available],
              ['需处理',loading?'…':summary.attention]]
              .map(([label,n])=>h('span',{key:label},label+' ',h('strong',null,n)))))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('strong',null,'Markdown 两任务接续'),
          h('p',{className:'wf-sub'},'读取仓库任务文件，查看任务清单和输入版本；真实聊天自动执行接线仍待完成。'),
          Btn('打开 MD 任务队列',()=>setTab('md'),{quiet:true}))}),
        h('section',{className:'wf-stack','aria-label':'最近活动'},
          h('h3',null,'最近活动'),
          history.length?h('ul',{className:'wf-history'},...history.slice(0,3).map(historyCard)):
            h(Card,{children:h('p',{className:'wf-sub'},
              '暂无手动运行摘要。自动任务请在上方“运行与授权 → 当前任务”查看。')})));
    }

    // Preview is read-only. The sandbox has no authorized GitHub-private or
    // ChatGPT create/submit contract, so this UI MUST NOT invent a run.
    async function loadMdPreview(){
      if(mdBusy)return;
      setMdBusy(true);setMdError('');
      try{
        if(!W)throw Object.assign(new Error('当前安装包缺少 Markdown 解析资源，请从原安装器升级'),{code:'E_MD_MODULE'});
        const value=await W.readGithub(mdSource,{fetcher:async url=>{
          const result=await request('browser.network.request',{method:'GET',url,
            config:{responseType:'text',timeout:20000}});
          if(typeof result?.data!=='string'||!Number.isInteger(result.status))
            throw Object.assign(new Error('网络回执不完整'),{code:'E_MD_FETCH'});
          return {ok:result.status>=200&&result.status<300,status:result.status,
            text:async()=>result.data};
        }});
        let demoReady=true,demoReason='';
        try{W.spec(value.workflow);}catch(e){demoReady=false;demoReason=e.message;}
        if(alive.current)setMdPreview({value,demoReady,demoReason});
      }catch(e){
        if(alive.current){setMdPreview(null);setMdError((e.code||'E_MD_FETCH')+'：'+(e.message||'无法读取文件'));}
      }finally{if(alive.current)setMdBusy(false);}
    }
    function markdownPage(){
      const preview=mdPreview?.value?.source===mdSource?mdPreview:null,workflow=preview?.value?.workflow;
      return h('div',{className:'wf-stack'},
        h(Head,{title:'Markdown 任务队列',note:'从真实 GitHub Markdown 读取并解析。读取和刷新只更新预览，不触发聊天或任务。',
          action:Btn('返回概览',()=>setTab('overview'),{quiet:true})}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('label',{className:'wf-label',htmlFor:'wf-md-source'},'文件来源 · GitHub 公开 MD'),
          h('input',{id:'wf-md-source',className:'wf-input',type:'url',value:mdSource,
            onChange:e=>{setMdSource(e.target.value);setMdError('');},'aria-label':'Markdown 文件链接',
            placeholder:'https://github.com/owner/repo/blob/main/path.md'}),
          Btn(mdBusy?'正在读取…':'读取 / 刷新',()=>{void loadMdPreview();},{primary:true,disabled:mdBusy}),
          mdError&&h('p',{className:'wf-warning',role:'alert'},mdError),
          h('p',{className:'wf-sub'},'私有仓库及本地路径须通过已有可信工作区文件桥接另行授权。公开文件经现有 Browser Network SDK 读取；首次需要原宿主授予目标域名权限，失败时不使用假数据。'))}),
        workflow&&h(Card,{children:h('div',{className:'wf-stack'},
          h('strong',null,workflow.title),
          h('p',null,workflow.goal),
          h('p',{className:'wf-mono'},'输入版本 SHA-256：'+preview.value.version),
          h('ul',{className:'wf-history'},...workflow.tasks.map(task=>
            h('li',{key:task.id},
              h('strong',null,task.id+' '+task.title),
              h('p',{className:'wf-sub'},'输入：'+task.fields['输入'].replace(/\n/gu,' · ')),
              h('p',{className:'wf-sub'},'验收：'+task.acceptance+' · 未开始')))),
          !preview.demoReady&&h('p',{role:'alert',className:'wf-warning'},
            '两任务自动验收条件不满足：'+preview.demoReason))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('strong',null,'运行状态：未接入真实跨聊天执行'),
          h('p',{className:'wf-sub'},'缺少可信原子领取、新聊天初始化/监听/发送、成果持久读回和独立验收的正式宿主接线；不会将离线计算或模拟消息宣称为真实聊天。'),
          h('div',{className:'wf-line'},
            Btn('开始（待接线）',()=>{}, {disabled:true,primary:true}),
            Btn('暂停 / 继续',()=>{}, {disabled:true})),
          h('p',{className:'wf-sub'},'聊天：尚未创建 · 成果：尚未保存。运行记录须进入原持久账本，而不是保存在 MD 或另建队列。'))}));
    }

    function scripts(){
      return h('div',{className:'wf-stack'},
        h('div',{className:'wf-search-row'},
          h('input',{id:'wf-search',type:'search',className:'wf-input wf-search-input',
            'aria-label':'搜索脚本',placeholder:'搜索脚本或网站',
            value:search,onChange:e=>setSearch(e.target.value)}),
          Btn(Icon('filter'),()=>{setShowFilters(!showFilters);setMore(null);},
            {key:'filter',id:'wf-filter-toggle',icon:true,ariaLabel:'筛选脚本',title:'筛选脚本',
              expanded:showFilters,popup:'true',controls:'wf-filter-options'}),
          Btn(Icon('refresh'),()=>{void readTasks();void readCurrentPage();},
            {key:'refresh',icon:true,ariaLabel:'刷新脚本安装状态',title:'刷新脚本安装状态',
              disabled:loading}),
          showFilters&&h('div',{id:'wf-filter-options',className:'wf-filter-popover',role:'group',
            'aria-label':'脚本状态筛选'},
            h('strong',null,'显示任务'),
            ...[['all','全部'],['available','可运行'],['attention','需处理'],['favorite','收藏']]
              .map(([value,label])=>h('button',{key:value,type:'button',className:'wf-filter-option',
                'aria-pressed':filter===value,onClick:()=>{
                  setFilter(value);setShowFilters(false);
                  global.queueMicrotask(()=>tool.root.querySelector('#wf-filter-toggle')?.focus());
                }},label)),
             h('label',{className:'wf-label'},'排序方式',
               h('select',{className:'wf-select',value:sort,'aria-label':'脚本排序方式',
                 onChange:e=>setSort(e.target.value)},
                 h('option',{value:'favorite'},'收藏优先'),
                 h('option',{value:'name'},'按名称'))))),
        h('p',{className:'wf-sub'},rows.length+' / '+tasks.length+' 个固定脚本'),
        rows.length?h('div',{className:'wf-task-list'},...rows.map(taskCard)):
          h(Card,{extra:'wf-empty',children:[
            h('strong',{key:'empty'},'没有匹配的固定任务'),
            h('p',{key:'hint',className:'wf-sub'},'可清除筛选，或在宿主任务目录核对安装。'),
            Btn('清除筛选',()=>{setSearch('');setFilter('all');})
          ]}),
        h('p',{className:'wf-sub'},'任务安装、更新与停用仍由宿主可信任务目录负责。'));
    }
    function records(){
      return h('div',{className:'wf-stack'},
        h('p',{className:'wf-sub'},'共享运行引用来自宿主；历史手动记录仅为原请求摘要，不是当前结果。'),
        ...tasks.flatMap(pin=>(pin.preparations||[]).map(entry=>
          h(Card,{key:entry.preparationId,children:h('div',{className:'wf-stack'},
            h('strong',null,pin.title),
            h(Status,{state:entry.state,text:runStateLabel(entry.state)}),
            detailList([['preparationId',entry.preparationId],['runId',entry.runId||'未取得'],
              ['resultId',entry.resultId||'未取得'],['原记录状态',entry.settled?'已结算':'待核对']]),
            h('p',{className:'wf-sub'},'仅为原运行引用；结果与资源释放须在可信运行配置中核对。'),
            Btn('查看原运行',()=>configure(pin,entry.preparationId),{disabled:Boolean(runReason(pin))}))}))),
        activeCard(),
        history.length?h('ul',{className:'wf-history'},...history.map(historyCard)):
          !tasks.some(pin=>pin.preparations?.length)&&h(Card,{extra:'wf-empty',children:[
            h('strong',{key:'empty'},'暂无手动运行记录'),
            h('p',{key:'note',className:'wf-sub'},
              '记录是恢复定位信息，不是业务成功证明。可从脚本打开可信运行配置。')
          ]}));
    }
    function settingsPage(){
      return h('div',{className:'wf-stack'},
        !hostNavigation.base&&h(Head,{title:'Web Flow 设置',action:Btn('返回',()=>setTab(returnTab.current),{quiet:true})}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'网页显示'),
          h('div',{className:'wf-switch-row'},
            h('span',{className:'wf-switch-description'},
              h('strong',{id:'wf-page-panel-label'},'显示网页辅助面板'),
              h('span',{id:'wf-page-panel-description',className:'wf-sub'},
                '在支持的网站显示 Web Flow 辅助区域；关闭只影响页面显示，不停止后台任务。')),
            h('div',{className:'wf-switch-control'},
              typeof SharedSwitch==='function'?
                h(SharedSwitch,{
                  isSelected:panelPreference.status==='ready'&&panelPreference.value,
                  isDisabled:panelPreference.status!=='ready'||panelSaving,
                  onChange:visible=>{void savePanelVisibility(visible);},
                  'aria-labelledby':'wf-page-panel-label',
                  'aria-describedby':'wf-page-panel-description'
                }):
                h('label',{className:'wf-switch-native'},
                  h('input',{type:'checkbox',role:'switch',
                    checked:panelPreference.status==='ready'&&panelPreference.value,
                    disabled:panelPreference.status!=='ready'||panelSaving,
                    onChange:event=>{void savePanelVisibility(event.target.checked);},
                    'aria-labelledby':'wf-page-panel-label',
                    'aria-describedby':'wf-page-panel-description'}),
                  h('span',{className:'wf-switch-track','aria-hidden':true})))),
          h('p',{className:'wf-sub',role:'status'},
            panelSaving?'正在保存并核对网页显示状态…':
            panelPreference.status==='loading'?'正在读取网页显示设置…':
            panelPreference.status!=='ready'?'设置状态尚未确认，请重新进入设置核对。':
            panelPreference.value?'网页辅助面板已开启。':'网页辅助面板已关闭。'))}),
        h(Card,{children:h('label',{className:'wf-label'},'外观主题',
          h('select',{className:'wf-select',value:settings.theme,disabled:saving,
            onChange:e=>{void savePrefs({...settings,theme:e.target.value});}},
            h('option',{value:'system'},'跟随系统'),h('option',{value:'light'},'浅色'),
            h('option',{value:'dark'},'深色')))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'运行与授权'),
          h('p',{className:'wf-sub'},
            '自动运行及授权在上方可信控制区管理；关闭只阻止未来准入，不能撤销已发生的操作。UNKNOWN 必须查询原请求。'))}),
        h(Card,{children:h('div',{className:'wf-stack'},
          h('h3',null,'开发与安装'),
          h('p',{className:'wf-sub'},'创建、导入、升级和卸载请使用宿主的「开发」或「我的 → 任务目录」；不会从沙箱打开私有宿主页面。'),
          h('p',{className:'wf-sub'},'当前绑定：'+PINNED.length+' 个固定版本 Task；版本变化需重新审阅并更新应用包。'))}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'未来的多步骤流程'),
          h('p',null,'流程需要逐站授权、步骤依赖、原持久 Run/Result、恢复和 UNKNOWN 对账。项目现有队列只是离线状态模块；尚未接入真实派发，不显示流程启动按钮。'))}));
    }
    function helpPage(){
      return h('div',{className:'wf-stack'},
        h(Head,{title:'使用与排障',action:!hostNavigation.base&&Btn('返回',()=>setTab(returnTab.current),{quiet:true})}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'从 ChatGPT 自动运行'),
          h('p',null,'1. 打开应用上方“运行与授权 → 任务授权”，核对已批准任务的版本、精确地址和参数。已有有效批准可直接复用；允许更换关键词时，规则内换词无需重复批准。'),
          h('p',null,'2. 在“运行与授权 → 使用说明”复制能力说明，向普通新聊天发送一次；也可选择保存为项目指令。已接入聊天无需重复。开启自动运行后可关闭侧栏，保留 ChatGPT 标签页。'),
          h('p',null,'3. 此后正常发送需求即可，AI 每次生成新候选。当前消息的等待、未执行、运行和结果在“当前任务”查看，真实结果单次回原聊天；结果未知时只查询或停止原请求，不补跑。'))}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'未触发或需要停止'),
          h('p',null,'先核对上方开关、任务批准和“运行与授权 → 当前任务”的错误。未批准时在可信界面审核；协议格式、重复候选、安装变化或网站权限失败时按原错误处理。关闭开关只阻止新任务；已开始的任务在“运行与授权 → 当前任务”停止。'),
          h('p',null,'若上方没有自动运行或一次接入说明，请更新 OpenDesk Browser 后重开应用。它们来自 Browser 的可信组件，单独升级工具包不会更新该组件。'))}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'手动运行一个真实任务'),
          h('p',null,'首次使用会安装两个自带固定搜索脚本，不会自动运行或开启自动触发。主动卸载或停用的选择会保留；可从脚本行打开安装审阅或任务管理恢复。初始化失败可重试并查看诊断。网站及任务执行授权仍需原可信审阅，已有有效授权无需重复批准。'),
          h('p',null,'1. 在宿主任务目录安装并核验与本应用相同版本、哈希的 Controller Task。'),
          h('p',null,'2. 打开对应的 Google / 百度获准网站，点击 Web Flow → 脚本 ▶，在可信共享抽屉填写参数。'),
          h('p',null,'3. 在共享抽屉先“保存并核对”，再明确点击“确认执行一次”；旧版原请求在“记录”中只读查询或停止，UNKNOWN 不自动重跑。'))}),
        h(Card,{children:h('div',{className:'wf-stack wf-help'},
          h('h3',null,'出现版本不匹配或 UNKNOWN'),
          h('p',null,'回到可信宿主核对安装身份、权限、站点和结果。不通过自动重试绕开未知副作用。'),
          h('p',null,'持续自动使用 webflow.task.intent.v1 严格五字段；原手动与一次批准使用 opendesk.task.intent.v1，保留各自授权、防重放与回执。'))}));
    }
    const sections={overview,scripts,history:records,md:markdownPage,settings:settingsPage,help:helpPage};
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
        !hostNavigation.actions&&h('div',{className:'wf-head-actions',role:'group','aria-label':'帮助与偏好'},
          Btn(h(R.Fragment,null,Icon('help'),h('span',null,'帮助')),()=>setTab('help'),
            {key:'help',quiet:true,ariaLabel:'帮助',title:'帮助与使用说明',controls:'wf-panel',
              current:page==='help'?'page':undefined}),
          !hostNavigation.settings&&Btn(h(R.Fragment,null,Icon('settings'),h('span',null,'偏好')),()=>setTab('settings'),
            {key:'settings',quiet:true,ariaLabel:'应用偏好',title:'应用偏好',controls:'wf-panel',
              current:page==='settings'?'page':undefined}))),
      h('main',{className:'wf-body',role:'tabpanel',id:'wf-panel',
        'aria-label':({overview:'概览',scripts:'脚本',history:'记录',md:'Markdown 任务队列',settings:'Web Flow 设置',help:'帮助'})[page],tabIndex:0},
        error&&h('div',{className:'wf-banner wf-warning',role:'alert'},
          h('p',null,error),Btn('关闭提示',()=>setError(''),{quiet:true})),
        configureError&&h('div',{className:'wf-banner wf-warning',role:'alert'},
          h('p',null,configureError),Btn('关闭配置提示',()=>setConfigureError(''),{quiet:true})),
        notice&&h('div',{className:'wf-banner',role:'status'},
          h('p',null,notice),Btn('×',()=>setNotice(''),
            {quiet:true,icon:true,ariaLabel:'关闭状态提示',title:'关闭状态提示'})),
        feedback&&h('div',{className:'wf-banner','data-wf-feedback':'fallback',role:'status'},
          h('p',null,feedback)),
        page==='scripts'&&active&&activeRef.current&&h('div',{className:'wf-banner wf-line wf-between',role:'status'},
          h('span',null,'有原请求待核对；只能查询或停止。'),
          Btn('查询原请求',readActive),Btn('查看记录',()=>setTab('history'),{quiet:true})),
        sections[page]()));
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

/* Preview-only: OpenDesk framework update-notice proposal.
   Never invokes an installer, downloads code, or requests Chrome permissions. */
(() => {
  'use strict';
  if (document.getElementById('odupd-lab')) return;
  const controls = document.querySelector('.demo-controls');
  const aside = document.getElementById('sidepanel');
  const web = document.querySelector('.web-main');
  const footer = aside && aside.querySelector('.panel-footer');
  if (!controls || !aside || !web || !footer) return;

  const css = document.createElement('style');
  css.textContent = [
    '.odupd-lab{position:relative;z-index:110;flex:none;font:12px/1.5 inherit;color:var(--od-ink)}',
    '.odupd-lab>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;min-height:30px;padding:4px 10px;border:1px solid var(--od-line);border-radius:8px;background:var(--od-paper);font-weight:650}',
    '.odupd-lab>summary::-webkit-details-marker{display:none}.odupd-lab>summary:after{content:"⌄";color:var(--od-sub)}',
    '.odupd-lab-panel{position:absolute;top:36px;right:0;width:272px;max-width:min(88vw,340px);padding:13px;display:grid;gap:9px;background:var(--od-paper);border:1px solid var(--od-line);box-shadow:0 12px 30px #17233d26;border-radius:12px}',
    '.odupd-lab-panel label{display:grid;gap:4px;color:var(--od-sub);font-size:11px}.odupd-lab-panel select{width:100%;height:34px;border:1px solid var(--od-input-border);border-radius:7px;background:var(--od-paper);color:var(--od-ink);padding:0 8px;font:inherit;font-size:12px}',
    '.odupd-lab-panel .odupd-lab-actions{display:flex;gap:6px}.odupd-lab-panel button{min-height:32px;padding:5px 9px;border-radius:7px;border:1px solid var(--od-line);background:var(--od-paper);color:var(--od-ink);cursor:pointer}',
    '.odupd-lab-panel button:first-child{background:var(--od-brand);color:white;border-color:var(--od-brand)}',
    '.odupd-lab-panel small{color:var(--od-sub);font-size:11px}',
    '.odupd-lab-panel .odupd-lab-actions{display:flex;flex-wrap:wrap}',
    '.odupd-lab-panel .odupd-lab-actions button{flex:1;white-space:nowrap}',
    '.odupd-history-link{border:0;background:transparent;color:var(--od-accent-ink);font-size:11px;cursor:pointer;padding:2px 4px;font-weight:550}',
    '.odupd-lab-panel #odupd-frequency-note{display:block;padding:7px 8px;border-radius:7px;border:1px solid var(--od-line);background:var(--od-muted);color:var(--od-ink);font-size:11px;line-height:1.5}',
    '.odupd-toast{position:absolute;right:14px;bottom:96px;z-index:45;width:min(352px,calc(100% - 28px));padding:12px 13px;border-radius:12px;background:var(--od-paper);color:var(--od-ink);border:1px solid var(--od-line);box-shadow:0 10px 32px #1423452b;text-align:left}',
    '.odupd-toast[hidden],.odupd-banner[hidden],.odupd-sheet[hidden]{display:none!important}',
    '.odupd-toast-head{display:flex;align-items:center;gap:8px;min-width:0}.odupd-mark{flex:none;width:25px;height:25px;display:grid;place-items:center;border-radius:7px;background:var(--od-brand);color:white;font-size:11px;font-weight:800}',
    '.odupd-toast-head strong{flex:1;min-width:0;font-size:12px;line-height:1.45}.odupd-x{border:0;background:none;color:var(--od-sub);font-size:19px;line-height:1;cursor:pointer;min-height:30px;min-width:30px}',
    '.odupd-toast p{font-size:12px!important;line-height:1.5!important;margin:7px 0 10px!important;color:var(--od-sub)}',
    '.odupd-toast-actions{display:flex;gap:7px;justify-content:flex-end}.odupd-toast-actions button{padding:5px 9px;min-height:32px;border-radius:7px;border:1px solid var(--od-line);background:var(--od-paper);color:var(--od-ink);cursor:pointer;font-size:12px}',
    '.odupd-toast-actions button:first-child{border-color:var(--od-brand);background:var(--od-brand);color:white}',
    '.odupd-banner{display:flex;align-items:center;gap:8px;padding:8px 11px;min-height:45px;border-top:1px solid var(--od-line);background:var(--od-paper);color:var(--od-ink);font-size:12px}',
    '.odupd-banner .odupd-new{flex:none;font-size:9px;font-weight:800;letter-spacing:.02em;border-radius:4px;padding:2px 4px;color:var(--od-accent-ink);background:var(--od-muted);border:1px solid var(--od-line)}',
    '.odupd-banner .odupd-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.odupd-banner button{border:0;background:none;color:var(--od-accent-ink);font-size:12px;font-weight:650;white-space:nowrap;cursor:pointer;padding:5px 2px}',
    '.sidepanel.odupd-ready{position:relative}',
    '.odupd-sheet{position:absolute;inset:101px 0 29px;z-index:75;min-height:0;display:flex;flex-direction:column;overflow:auto;padding:15px 14px 18px;gap:13px;color:var(--od-ink);background:var(--od-paper);border-top:1px solid var(--od-line);box-shadow:0 -6px 20px #10224116}',
    '.odupd-sheet-head{display:flex;align-items:center;gap:8px}.odupd-sheet-head strong{flex:1;font-size:14px}.odupd-sheet-head button{width:32px;height:32px;border:1px solid var(--od-line);border-radius:7px;background:var(--od-paper);color:var(--od-ink);font-size:19px;cursor:pointer}',
    '.odupd-sheet-versions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;color:var(--od-sub);font-size:11px}.odupd-v-pill{border:1px solid var(--od-line);border-radius:99px;padding:2px 8px;background:var(--od-muted);color:var(--od-ink)}',
    '.odupd-sheet h3{margin:0;font-size:12px;line-height:1.5}.odupd-sheet p{font-size:12px;margin:0;color:var(--od-sub);line-height:1.65}',
    '.odupd-sheet ul{margin:0;padding-left:18px;font-size:12px;line-height:1.7}.odupd-sheet li{margin:0 0 5px}',
    '.odupd-permissions{padding:10px;border:1px solid var(--od-line);border-radius:9px;background:var(--od-muted)}',
    '.odupd-permissions strong{display:block;font-size:12px;margin-bottom:3px}.odupd-permissions.warn{background:var(--od-warning-bg);color:var(--od-warning-ink)}',
    '.odupd-sheet-actions{display:grid;gap:7px;margin-top:1px}.odupd-sheet-actions button{min-height:36px;border:1px solid var(--od-line);border-radius:8px;background:var(--od-paper);color:var(--od-ink);font-size:12px;cursor:pointer}',
    '.odupd-sheet-actions button.primary{background:var(--od-brand);color:white;border-color:var(--od-brand);font-weight:650}',
    '.odupd-sheet-actions button:disabled{opacity:.5;cursor:not-allowed}',
    '.odupd-preferences{margin-top:8px;border-top:1px solid var(--od-line);padding-top:12px;display:grid;gap:7px}',
    '.odupd-preferences label{display:grid;gap:5px;font-size:12px}.odupd-preferences select{height:36px;border:1px solid var(--od-input-border);border-radius:8px;padding:0 8px;color:var(--od-ink);background:var(--od-paper)}',
    '.odupd-sheet .odupd-footnote{font-size:11px;color:var(--od-sub)}',
    '@media (max-width:720px){.odupd-toast{right:10px;bottom:88px}.odupd-lab-panel{right:auto;left:0}}',
    '@media (prefers-reduced-motion:reduce){.odupd-toast,.odupd-sheet{scroll-behavior:auto}}'
  ].join('\n');
  document.head.append(css);

  const lab = document.createElement('details');
  lab.className = 'odupd-lab';
  lab.id = 'odupd-lab';
  lab.innerHTML = [
    '<summary aria-label="打开更新通知场景">更新提醒演示</summary>',
    '<div class="odupd-lab-panel">',
    '<label>更新场景<select id="odupd-scenario">',
    '<option value="tool-ready">提示词工具 · 有新版本</option>',
    '<option value="browser-applied">Browser 本体 · 已自动更新</option>',
    '<option value="browser-pending">Browser 本体 · 待应用</option>',
    '<option value="permission">工具升级 · 新增权限</option>',
    '<option value="multiple">多个扩展 · 合并提醒</option>',
    '<option value="tool-applied">提示词工具 · 更新已完成</option>',
    '<option value="none">没有更新</option>',
    '</select></label>',
    '<label>提醒方式<select id="odupd-mode"><option value="toast">网页轻提醒 + 侧栏入口</option><option value="badge">仅侧栏入口</option><option value="silent">静默（只在扩展管理中查看）</option></select></label>',
    '<label>网页提醒范围<select id="odupd-scope"><option value="supported">仅已授权的适用网站</option><option value="sidebar">仅 OpenDesk 侧栏</option></select></label>',
    '<label>模拟当前网页<select id="odupd-tab"><option value="A">A · ChatGPT</option><option value="B">B · DeepSeek</option><option value="C">C · Gemini</option></select></label>',
    '<div class="odupd-lab-actions"><button id="odupd-advance" type="button">推进 24 小时</button><button id="odupd-history" type="button">更新记录</button></div>',
    '<div class="odupd-lab-actions"><button id="odupd-replay" type="button">重放当前场景</button><button id="odupd-reset" type="button">恢复默认</button></div>',
    '<small id="odupd-frequency-note" role="status" aria-live="polite">多标签共享计数：演示模式。</small>',
    '<small>仅展示通知、版本与确认流程。不会下载、安装、重载或申请权限。</small>',
    '</div>'
  ].join('');
  controls.prepend(lab);

  const toast = document.createElement('section');
  toast.id = 'odupd-toast';
  toast.className = 'odupd-toast';
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  toast.innerHTML = [
    '<div class="odupd-toast-head"><span class="odupd-mark" aria-hidden="true">OD</span>',
    '<strong id="odupd-toast-title"></strong>',
    '<button id="odupd-toast-close" class="odupd-x" type="button" aria-label="关闭本次更新提醒">×</button></div>',
    '<p id="odupd-toast-body"></p>',
    '<div class="odupd-toast-actions"><button id="odupd-toast-open" type="button">查看更新</button>',
    '<button id="odupd-toast-later" type="button">稍后</button></div>'
  ].join('');
  web.append(toast);

  const banner = document.createElement('div');
  banner.id = 'odupd-banner';
  banner.className = 'odupd-banner';
  banner.setAttribute('role','status');
  banner.innerHTML = [
    '<span class="odupd-new" id="odupd-banner-pill">NEW</span>',
    '<span class="odupd-summary" id="odupd-banner-summary"></span>',
    '<button id="odupd-banner-open" type="button" aria-label="查看更新说明">查看</button>'
  ].join('');
  footer.before(banner);
  const historyLink=document.createElement('button');
  historyLink.id='odupd-footer-history';
  historyLink.type='button';
  historyLink.className='odupd-history-link';
  historyLink.textContent='更新记录';
  historyLink.setAttribute('aria-label','查看更新记录（预览）');
  footer.prepend(historyLink);
  aside.classList.add('odupd-ready');

  const sheet = document.createElement('section');
  sheet.id = 'odupd-sheet';
  sheet.className = 'odupd-sheet';
  sheet.setAttribute('aria-label','更新说明与通知设置');
  sheet.hidden = true;
  sheet.innerHTML = [
    '<div class="odupd-sheet-head"><strong id="odupd-detail-title">更新说明</strong><button id="odupd-detail-close" aria-label="关闭更新说明" type="button">×</button></div>',
    '<div class="odupd-sheet-versions"><span id="odupd-current-version" class="odupd-v-pill"></span><span aria-hidden="true">→</span><span id="odupd-next-version" class="odupd-v-pill"></span></div>',
    '<div><h3>本次改进</h3><ul id="odupd-changes"></ul></div>',
    '<div class="odupd-permissions" id="odupd-permission-box"><strong id="odupd-permission-title">权限变化</strong><p id="odupd-permission-copy"></p></div>',
    '<p id="odupd-detail-description"></p>',
    '<div class="odupd-sheet-actions">',
    '<button id="odupd-review" class="primary" type="button">审阅并更新</button>',
    '<button id="odupd-snooze" type="button">稍后提醒</button>',
    '<button id="odupd-ignore" type="button">忽略此版本</button>',
    '</div>',
    '<div class="odupd-preferences"><h3>通知偏好 · 本工具</h3>',
    '<label>提醒方式<select id="odupd-preference-mode"><option value="toast">网页轻提醒 + 侧栏入口</option><option value="badge">仅侧栏入口</option><option value="silent">静默</option></select></label>',
    '<p class="odupd-footnote">仅控制提醒，不控制 Chrome 自动更新，也不代替工具更新的安装审阅。正式设置由可信宿主保存。</p></div>',
    '<p class="odupd-footnote" id="odupd-demo-status" role="status" aria-live="polite">交互演示，所有版本与更新动作均为模拟。</p>'
  ].join('');
  aside.append(sheet);

  const el = id => document.getElementById(id);
  const CHANGES = {
    'tool-ready': {title:'提示词快捷按钮',from:'v1.1.20',to:'v1.1.21',head:'提示词快捷按钮有新版本',body:'修复快捷栏体验，更新需在 OpenDesk 中审阅确认。',items:['改善部分网站输入框重建后的显示稳定性','优化提示词快捷栏的键盘和触屏操作','保留已有提示词、草稿和网站规则'],permission:'本次示例无新增能力；真实变化以可信安装审阅为准。',action:'审阅并更新',canInstall:true},
    'permission': {title:'提示词快捷按钮',from:'v1.1.20',to:'v1.2.0',head:'提示词快捷按钮有新版本',body:'新版涉及能力变化，需先确认权限。',items:['新增一个可选网页能力（模拟）','旧版继续正常使用，升级前不会自动启用新能力'],permission:'模拟新增能力：必须展示具体能力和网站范围，用户明确确认后才允许更新。',action:'查看权限并审阅',canInstall:true,warning:true},
    'browser-applied': {title:'OpenDesk Browser',from:'v1.9.3',to:'v1.9.4',head:'OpenDesk Browser 已更新',body:'浏览器已完成扩展更新，可以查看此次变化。',items:['优化扩展列表与网页体验（演示）','保留当前工具数据及安装状态'],permission:'本体更新已由浏览器完成；此处只展示更新说明。',action:'',canInstall:false,done:true},
    'browser-pending': {title:'OpenDesk Browser',from:'v1.9.3',to:'v1.9.4',head:'OpenDesk Browser 更新已就绪',body:'浏览器会在合适时机应用更新，避免打断当前工作。',items:['新版已由浏览器下载（模拟）','有正在运行的任务时不主动强制重载'],permission:'不自动刷新当前网页或取消任务；由浏览器更新生命周期负责。',action:'',canInstall:false},
    'multiple': {title:'OpenDesk 扩展管理',from:'3 项',to:'待处理',head:'3 项扩展有更新',body:'更新已合并提醒，避免不同扩展同时弹出消息。',items:['提示词快捷按钮：有新版待审阅','阅读目录：更新已完成','网页剪藏：有新版待审阅'],permission:'逐个工具独立展示来源、版本与能力变化；不能批量跳过确认。',action:'查看提示词更新',canInstall:false,multiple:true},
    'tool-applied': {title:'提示词快捷按钮',from:'v1.1.20',to:'v1.1.21',head:'提示词快捷按钮已更新',body:'这只是模拟完成状态；正式安装需要真实可信回执。',items:['已完成模拟安装流程','已有提示词与网站设置仍保留'],permission:'没有触发真实安装或权限请求。',action:'',canInstall:false,done:true}
  };
  // The preview has no trusted background owner. Simulated A/B/C tabs share one
  // in-memory notice journal and a browser-local preview snapshot, NOT an actual
  // cross-tab atomic lease. Production must use the trusted single-writer contract.
  const HOUR=3600000,DAY=24*HOUR;
  const PREVIEW_KEY='opendesk.prompt-shortcuts.preview.update-frequency-r11';
  let state={scenario:'tool-ready',mode:'toast',scope:'supported',detail:false,confirm:false,focus:null,tab:'A',now:Date.now(),records:{},lastGlobalAt:0,status:'未触发'};
  let toastTimer=null;
  try {
    const prefs=JSON.parse(localStorage.getItem('opendesk.preview.update-prefs.v1')||'{}');
    if(['toast','badge','silent'].includes(prefs.mode))state.mode=prefs.mode;
    if(['supported','sidebar'].includes(prefs.scope))state.scope=prefs.scope;
  }catch{}
  try {
    const data=JSON.parse(localStorage.getItem(PREVIEW_KEY)||'{}');
    if(data&&typeof data==='object'&&!Array.isArray(data)){
      if(data.records&&typeof data.records==='object'&&!Array.isArray(data.records))state.records=data.records;
      if(Number.isFinite(data.lastGlobalAt)&&data.lastGlobalAt>=0)state.lastGlobalAt=data.lastGlobalAt;
    }
  }catch{}
  el('odupd-mode').value=state.mode;
  el('odupd-scope').value=state.scope;
  el('odupd-tab').value=state.tab;

  function savePrefs(){try{localStorage.setItem('opendesk.preview.update-prefs.v1',JSON.stringify({mode:state.mode,scope:state.scope}));}catch{}}
  function persist(){try{localStorage.setItem(PREVIEW_KEY,JSON.stringify({records:state.records,lastGlobalAt:state.lastGlobalAt}));}catch{}}
  function current(){return CHANGES[state.scenario]||null;}
  function record(){
    const key=state.scenario;
    const data=state.records[key];
    if(data&&typeof data==='object'&&Number.isInteger(data.count)&&data.count>=0&&data.count<=2)return data;
    return state.records[key]={count:0,shownTab:'',ignored:false,viewed:false,dismissed:false,snoozeUntil:0,lastShownAt:0};
  }
  function setText(id,text){el(id).textContent=text;}
  function stopTimer(){if(toastTimer!==null){clearTimeout(toastTimer);toastTimer=null;}}
  function dismiss(reason){
    const r=record();r.shownTab='';r.dismissed=true;r.snoozeUntil=0;
    state.status=reason;stopTimer();persist();render();
  }
  function armTimer(){
    stopTimer();
    if(toast.hidden)return;
    toastTimer=setTimeout(()=>{
      toastTimer=null;
      if(state.detail||toast.hidden)return;
      if(toast.matches(':hover')||toast.matches(':focus-within')){armTimer();return;}
      dismiss('12 秒自动收起：当前版本不再主动弹出');
    },12000);
  }
  function showToastIfEligible(){
    const d=current(),r=record();
    if(!d||state.mode!=='toast'||state.scope!=='supported'||r.ignored||r.dismissed||r.viewed||r.shownTab)return false;
    if(r.count>=2)return false;
    if(r.count===1&&(!r.snoozeUntil||state.now<r.snoozeUntil))return false;
    if(state.lastGlobalAt&&state.now-state.lastGlobalAt<DAY)return false;
    // In the preview, current "tab" is a UI selection; no actual Chrome tab is opened.
    r.count+=1;
    r.shownTab=state.tab;
    r.lastShownAt=state.now;
    r.snoozeUntil=0;
    state.lastGlobalAt=state.now;
    state.status='已在模拟页面 '+state.tab+' 提醒第 '+r.count+' 次（同版本最多 2 次）';
    persist();return true;
  }
  function openSheet(trigger){
    state.focus=trigger||document.activeElement;
    const r=record();r.viewed=true;r.shownTab='';r.snoozeUntil=0;
    state.status='已查看详情：不会再主动弹此版本；更新中心保留待处理项';
    state.detail=true;state.confirm=false;
    stopTimer();persist();render();
    el('odupd-detail-close').focus();
  }
  function closeSheet(){
    state.detail=false;state.confirm=false;render();
    if(state.focus&&state.focus.isConnected)state.focus.focus();
  }
  function snooze(){
    const r=record();
    if(r.count===1&&!r.viewed){
      r.snoozeUntil=state.now+DAY;r.shownTab='';r.dismissed=false;
      state.status='已稍后：24 小时内不提醒，之后最多再弹一次';
    }else{
      r.shownTab='';r.dismissed=true;r.snoozeUntil=0;
      state.status='已达最多 2 次：本版本不会再弹';
    }
    stopTimer();persist();render();
  }
  function resetCurrent(){
    state.records[state.scenario]={count:0,shownTab:'',ignored:false,viewed:false,dismissed:false,snoozeUntil:0,lastShownAt:0};
    state.lastGlobalAt=0;state.detail=false;state.confirm=false;
    state.status='已重新触发当前演示候选（只在预览中重置）';
    stopTimer();showToastIfEligible();persist();render();
  }
  function render(){
    const d=current(),r=record();
    const valid=Boolean(d&&!r.ignored);
    el('odupd-scenario').value=state.scenario;
    el('odupd-mode').value=state.mode;
    el('odupd-scope').value=state.scope;
    el('odupd-tab').value=state.tab;
    el('odupd-preference-mode').value=state.mode;
    const onOwner=r.shownTab===state.tab;
    const showCurrentToast=valid&&onOwner&&!state.detail&&state.mode==='toast'&&state.scope==='supported';
    toast.hidden=!showCurrentToast;
    if(showCurrentToast){
      setText('odupd-toast-title',d.head);
      setText('odupd-toast-body',d.body);
      el('odupd-toast-later').textContent=r.count===1?'稍后（24小时）':'不再弹出';
    }else stopTimer();
    const showBar=valid&&state.mode!=='silent'&&(!d.done||!r.viewed);
    banner.hidden=!showBar;
    if(showBar){
      setText('odupd-banner-summary',d.title+' · '+(d.done?'已更新':d.multiple?'3 项待查看':'有更新'));
      setText('odupd-banner-pill',r.viewed?'待更新':'NEW');
    }
    const until=r.snoozeUntil>state.now?Math.ceil((r.snoozeUntil-state.now)/HOUR)+' 小时后可再提醒':r.snoozeUntil?'已达到稍后时间；等待安全页面':'无';
    setText('odupd-frequency-note','当前模拟标签：'+state.tab+' · 已弹 '+r.count+'/2 次 · 稍后：'+until+'。'+state.status+'。打开 B/C 不会重弹；此计数只是预览。');
    sheet.hidden=!state.detail;
    if(!state.detail||!d){return;}
    setText('odupd-detail-title',d.title+' · 更新说明');
    setText('odupd-current-version',d.from);
    setText('odupd-next-version',d.to);
    const list=el('odupd-changes');list.replaceChildren();
    d.items.forEach(item=>{const li=document.createElement('li');li.textContent=item;list.append(li);});
    el('odupd-permission-box').classList.toggle('warn',Boolean(d.warning));
    setText('odupd-permission-title',d.warning?'新增权限需确认':'权限与数据');
    setText('odupd-permission-copy',d.permission);
    setText('odupd-detail-description',d.multiple?'每个工具独立审阅，不能批量跳过确认。':d.done?'仅为模拟更新已完成状态，未收到真实安装回执。':d.canInstall?'查看更新内容后，由可信安装器再次校验版本、来源、包字节与新增能力。':'此状态由 Chrome 的更新生命周期管理，通知不能阻止自动安装。');
    const review=el('odupd-review');
    review.hidden=!d.canInstall&&!d.multiple;
    review.textContent=d.multiple?d.action:state.confirm?'模拟确认更新（不安装）':d.action;
    el('odupd-snooze').textContent='关闭详情，保留记录';
    el('odupd-ignore').hidden=Boolean(d.done);
    setText('odupd-demo-status',state.confirm?'已进入模拟安装审阅阶段，尚未安装；取消不会改为已更新。':'此页面仅供交互测试，无真实 Chrome 跨标签锁、更新下载、安装或权限请求。');
  }
  function showCurrent(){
    if(showToastIfEligible()){render();armTimer();}
    else render();
  }
  el('odupd-scenario').addEventListener('change',event=>{
    stopTimer();state.scenario=event.target.value;state.detail=false;state.confirm=false;
    state.status='切换更新场景';showCurrent();
  });
  el('odupd-mode').addEventListener('change',event=>{
    state.mode=event.target.value;
    if(state.mode!=='toast'&&record().shownTab){dismiss('当前网页通知已关闭');}
    savePrefs();render();
  });
  el('odupd-scope').addEventListener('change',event=>{
    state.scope=event.target.value;
    if(state.scope!=='supported'&&record().shownTab){dismiss('网页提醒范围设为仅侧栏');}
    savePrefs();render();
  });
  el('odupd-preference-mode').addEventListener('change',event=>{
    state.mode=event.target.value;
    if(state.mode!=='toast'&&record().shownTab){dismiss('提醒方式更改');}
    savePrefs();render();
  });
  el('odupd-tab').addEventListener('change',event=>{
    const prior=record();
    if(prior.shownTab){prior.shownTab='';prior.dismissed=true;stopTimer();persist();}
    state.tab=event.target.value;state.status='模拟进入 '+state.tab+' 标签页；已弹版本不会再弹';
    showCurrent();
  });
  el('odupd-advance').addEventListener('click',()=>{
    state.now+=DAY+60000;state.status='模拟时钟推进 24 小时零 1 分';
    showCurrent();
  });
  el('odupd-replay').addEventListener('click',()=>{resetCurrent();lab.open=false;armTimer();});
  el('odupd-reset').addEventListener('click',()=>{
    stopTimer();
    state={scenario:'tool-ready',mode:'toast',scope:'supported',detail:false,confirm:false,focus:null,tab:'A',now:Date.now(),records:{},lastGlobalAt:0,status:'已恢复默认演示数据'};
    savePrefs();persist();showCurrent();lab.open=false;
  });
  el('odupd-toast-close').addEventListener('click',()=>dismiss('点击 ×：关闭本版本提醒，保留更新中心 NEW'));
  el('odupd-toast-later').addEventListener('click',snooze);
  el('odupd-toast-open').addEventListener('click',event=>openSheet(event.currentTarget));
  el('odupd-banner-open').addEventListener('click',event=>openSheet(event.currentTarget));
  el('odupd-footer-history').addEventListener('click',event=>openSheet(event.currentTarget));
  el('odupd-history').addEventListener('click',event=>{openSheet(event.currentTarget);lab.open=false;});
  el('odupd-detail-close').addEventListener('click',closeSheet);
  el('odupd-snooze').addEventListener('click',closeSheet);
  el('odupd-ignore').addEventListener('click',()=>{
    const r=record();r.ignored=true;r.shownTab='';r.dismissed=true;
    state.status='已忽略当前候选，本版本不再弹；更高新版本仍可提醒';
    stopTimer();persist();closeSheet();
  });
  el('odupd-review').addEventListener('click',()=>{
    const d=current();if(!d)return;
    if(d.multiple){
      state.scenario='tool-ready';state.confirm=false;state.status='聚合通知改为单项审阅';
      render();return;
    }
    if(!d.canInstall)return;
    if(!state.confirm){state.confirm=true;render();return;}
    // This is a simulation, never an actual install receipt.
    state.scenario='tool-applied';
    state.records['tool-applied']={count:0,shownTab:'',ignored:false,viewed:true,dismissed:true,snoozeUntil:0,lastShownAt:0};
    state.status='模拟确认已完成（没有真实安装或权限变化）';
    state.confirm=false;persist();render();
  });
  toast.addEventListener('pointerenter',stopTimer);
  toast.addEventListener('pointerleave',armTimer);
  toast.addEventListener('focusin',stopTimer);
  toast.addEventListener('focusout',armTimer);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(state.detail){event.preventDefault();closeSheet();}
      else if(!toast.hidden&&toast.contains(document.activeElement)){event.preventDefault();dismiss('按 Escape 关闭当前网页提醒');}
    }
  });
  // Preview tabs are not real tabs. Storage events update the displayed counters
  // when this HTML is separately opened, but are NOT an atomic cross-tab lock.
  window.addEventListener('storage',event=>{
    if(event.key!==PREVIEW_KEY)return;
    try {
      const next=JSON.parse(event.newValue||'{}');
      if(next.records&&typeof next.records==='object')state.records=next.records;
      if(Number.isFinite(next.lastGlobalAt))state.lastGlobalAt=next.lastGlobalAt;
    }catch{return;}
    state.status='从另一个预览窗口同步了模拟记录';
    stopTimer();render();
  });
  showCurrent();
  armTimer();
})();

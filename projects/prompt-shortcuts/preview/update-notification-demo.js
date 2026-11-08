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
    '<div class="odupd-lab-actions"><button id="odupd-replay" type="button">重新触发</button><button id="odupd-reset" type="button">恢复默认</button></div>',
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
  let state = {scenario:'tool-ready',mode:'toast',scope:'supported',closed:false,ignored:new Set(),seen:new Set(),detail:false,confirm:false,focus:null};
  try { const saved=JSON.parse(localStorage.getItem('opendesk.preview.update-prefs.v1')||'{}');
    if (['toast','badge','silent'].includes(saved.mode)) state.mode=saved.mode;
    if (['supported','sidebar'].includes(saved.scope)) state.scope=saved.scope;
  } catch {}
  el('odupd-mode').value=state.mode;
  el('odupd-scope').value=state.scope;

  function savePrefs() {try{localStorage.setItem('opendesk.preview.update-prefs.v1',JSON.stringify({mode:state.mode,scope:state.scope}));}catch{}}
  function current() {return CHANGES[state.scenario]||null;}
  function ignored() {return state.ignored.has(state.scenario);}
  function setText(id,txt) {el(id).textContent=txt;}
  function closeSheet() {state.detail=false;state.confirm=false;render();if(state.focus?.isConnected)state.focus.focus();}
  function openSheet(trigger) {if(!current())return;state.focus=trigger||document.activeElement;state.seen.add(state.scenario);state.detail=true;state.confirm=false;render();el('odupd-detail-close').focus();}
  function render() {
    const d=current(),valid=Boolean(d&&!ignored());
    el('odupd-scenario').value=state.scenario;
    el('odupd-mode').value=state.mode;
    el('odupd-scope').value=state.scope;
    el('odupd-preference-mode').value=state.mode;
    const showBar=valid&&state.mode!=='silent'&&(!d.done||!state.seen.has(state.scenario));
    banner.hidden=!showBar;
    if(showBar) {
      setText('odupd-banner-summary',d.title+' · '+(d.done?'已更新':d.multiple?'3 项待查看':'有更新'));
      setText('odupd-banner-pill',state.seen.has(state.scenario)?'更新':'NEW');
    }
    const showToast=valid&&!state.closed&&state.mode==='toast'&&state.scope==='supported'&&!state.detail;
    toast.hidden=!showToast;
    if(showToast) {setText('odupd-toast-title',d.head);setText('odupd-toast-body',d.body);}
    sheet.hidden=!state.detail;
    if(!state.detail||!d)return;
    setText('odupd-detail-title',d.title+' · 更新说明');
    setText('odupd-current-version',d.from);
    setText('odupd-next-version',d.to);
    const list=el('odupd-changes');list.replaceChildren();
    d.items.forEach(item=>{const li=document.createElement('li');li.textContent=item;list.append(li);});
    el('odupd-permission-box').classList.toggle('warn',Boolean(d.warning));
    setText('odupd-permission-title',d.warning?'新增权限需确认':'权限与数据');
    setText('odupd-permission-copy',d.permission);
    setText('odupd-detail-description',d.multiple?'每个工具独立审阅，不在这里批量安装。':d.done?'该版本状态仅用于演示，未收到任何真实安装回执。':d.canInstall?'查看新版本内容后，由现有可信安装器校验身份、来源、包字节和新增能力。':'本状态由 Chrome 更新机制管理，无法通过本提醒跳过安装。');
    const review=el('odupd-review');
    review.hidden=!d.canInstall&&!d.multiple;
    review.textContent=d.multiple?d.action:state.confirm?'模拟确认更新（不安装）':d.action;
    el('odupd-snooze').textContent=d.done?'关闭':'稍后提醒';
    el('odupd-ignore').hidden=Boolean(d.done);
    setText('odupd-demo-status',state.confirm?'演示已进入审阅确认阶段；真实产品仍必须调用现有安装器并取得回执。':'本页面是交互预览，没有下载、更新、重载、安装或获取权限。');
  }
  el('odupd-scenario').addEventListener('change',e=>{state.scenario=e.target.value;state.closed=false;state.detail=false;state.confirm=false;render();});
  el('odupd-mode').addEventListener('change',e=>{state.mode=e.target.value;savePrefs();render();});
  el('odupd-scope').addEventListener('change',e=>{state.scope=e.target.value;savePrefs();render();});
  el('odupd-preference-mode').addEventListener('change',e=>{state.mode=e.target.value;savePrefs();render();});
  el('odupd-replay').addEventListener('click',()=>{state.closed=false;state.ignored.delete(state.scenario);state.seen.delete(state.scenario);state.detail=false;state.confirm=false;render();lab.open=false;});
  el('odupd-reset').addEventListener('click',()=>{state={scenario:'tool-ready',mode:'toast',scope:'supported',closed:false,ignored:new Set(),seen:new Set(),detail:false,confirm:false,focus:null};savePrefs();render();lab.open=false;});
  el('odupd-toast-close').addEventListener('click',()=>{state.closed=true;render();});
  el('odupd-toast-later').addEventListener('click',()=>{state.closed=true;render();});
  el('odupd-toast-open').addEventListener('click',e=>openSheet(e.currentTarget));
  el('odupd-banner-open').addEventListener('click',e=>openSheet(e.currentTarget));
  el('odupd-detail-close').addEventListener('click',closeSheet);
  el('odupd-snooze').addEventListener('click',()=>{state.closed=true;closeSheet();});
  el('odupd-ignore').addEventListener('click',()=>{state.ignored.add(state.scenario);state.closed=true;closeSheet();});
  el('odupd-review').addEventListener('click',()=>{
    const d=current();
    if(!d)return;
    if(d.multiple){state.scenario='tool-ready';state.closed=true;state.confirm=false;render();return;}
    if(!d.canInstall)return;
    if(!state.confirm){state.confirm=true;render();return;}
    state.scenario='tool-applied';state.closed=false;state.confirm=false;state.seen.delete('tool-applied');render();
  });
  document.addEventListener('keydown',event=>{if(state.detail&&event.key==='Escape'){event.preventDefault();closeSheet();}});
  render();
})();

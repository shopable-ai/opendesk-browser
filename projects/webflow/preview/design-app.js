// DESIGN SIMULATION ONLY. No real privileges, clipboard, storage or dispatch.
(()=>{
 'use strict';
 const root=document.getElementById('od-preview-app'),get=id=>document.getElementById(id);
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=(id,text,action,variant='secondary')=>`<button id="${id}" type="button" class="od-button od-button--${variant}" data-do="${action}">${text}</button>`;
 const tasks={baidu:{name:'百度搜索',id:'baidu.search.top3',version:'1.1.2',url:'https://www.baidu.com/',ready:true},google:{name:'Google 搜索',id:'google.search.top3',version:'1.0.0',url:'https://www.google.com/',ready:false}};
 let s,returnRuntime,returnManual,returnRecord,returnDetail,prePage='overview',page='overview',dirty=false,composing=false,prepareEpoch=0;
 const runtime=get('runtime-dialog'),manual=get('manual-dialog');
 const notice=(id,text,error=false)=>{get(id).textContent=text;get(id).hidden=!text;get(id).setAttribute('role',error?'alert':'status');};
 const focus=id=>get(id)?.focus({preventScroll:true});
 const lab=document.createElement('section');
 lab.id='webflow-design-lab';lab.className='preview-diagnostic-area';lab.setAttribute('aria-label','Web Flow 离线场景');
 lab.innerHTML=`<details class="od-disclosure od-surface od-surface--padded" open><summary>Web Flow 交互场景 · 仅改本页内存</summary><p class="od-note">设计同步 v0.3.7 的运行面板结构；非正式源码、安装或执行证据。上方公共状态切换会重置模拟。草稿编辑或审核期间锁定场景，关闭面板保留草稿。</p><div class="preview-controls"><label for="lab-auth">授权状态<select id="lab-auth" class="od-field"><option value="none">无批准 / 开关关闭</option><option value="approved">已有批准 / 开关开启</option><option value="loading">正在读取</option><option value="invalid">安装变化 / 批准失效</option><option value="revoked">批准已撤销</option><option value="save-fail">下一次保存失败</option><option value="unknown">状态未知</option></select></label><label for="lab-task">当前任务<select id="lab-task" class="od-field"><option value="empty">空态</option><option value="waiting">等待完整回复</option><option value="running">运行中</option><option value="success">成功</option><option value="failed">失败</option><option value="unknown">UNKNOWN</option></select></label><button id="lab-reply" class="od-button od-button--secondary" type="button">模拟收到完整候选</button></div><p id="lab-feedback" class="od-note" role="status">此处为预览实验台，不属于正式工具。复制仅演示反馈，不写剪贴板。</p></details>`;
 get('od-preview-controls').after(lab);
 function draft(){return {key:get('grant-task').value,url:get('grant-url').value.trim(),query:get('grant-query').value.trim(),limit:3};}
 function sampleScope(){return {key:'baidu',url:tasks.baidu.url,query:'OpenDesk Browser',limit:3};}
 function lockLab(){const locked=dirty||s.review||s.preparing||manual.open;
  lab.querySelectorAll('select,button').forEach(el=>el.disabled=locked);
  get('od-preview-controls').querySelectorAll('button,select').forEach(el=>el.disabled=locked);
 }
 function facts(scope){const task=tasks[scope.key];return `<p class="od-body"><strong>${esc(task.name)} · ${task.version}</strong><br>${esc(scope.url)}</p><div><strong class="od-field-label">完整参数</strong><pre class="od-result">${esc(JSON.stringify({query:scope.query,limit:scope.limit},null,2))}</pre></div><details class="od-disclosure"><summary>安装身份 · 固定版本与来源</summary><p class="od-note">以下为设计用身份，不是本机安装凭据。</p><pre class="od-result">taskId: ${task.id}\nversion: ${task.version}\nscriptId: design-script-${scope.key}\nrevision: design-revision-1\ninstallationId: design-install-${scope.key}\ngeneration: 2\nmanifestHash / contentHash: 设计占位，不用于授权</pre></details>`;}
 function summary(){
  const messages={none:'尚无批准',approved:'1 项精确批准有效',loading:'正在读取状态…',invalid:'安装变化 · 需重新批准',revoked:'批准已撤销',unknown:'状态未确认 · 不会自动重试','save-fail':s.grant?'1 项精确批准有效':'尚无批准'};
  get('auto-enabled').setAttribute('aria-checked',String(s.enabled));
  get('auto-enabled').textContent='自动运行 · '+(['loading','unknown'].includes(s.auth)?'待确认':s.enabled?'开启':'关闭');
  get('auto-enabled').disabled=['loading','unknown'].includes(s.auth);
  get('auto-summary').textContent=['loading','unknown'].includes(s.auth)?messages[s.auth]:(s.enabled?'已开启':'已关闭')+' · '+messages[s.auth];
  get('next-step').textContent=s.grant&&s.auth==='approved'?(s.enabled?'生成本次指令，在 ChatGPT 发送；结果回到原聊天。':'批准已保存；自动运行仍关闭，请先开启开关。'):'先审核一个任务的精确范围，之后生成本次指令。';
  get('start-guide').textContent=s.grant&&s.auth==='approved'?(s.enabled?'生成本次指令':'前往自动运行开关'):'审核任务范围';
  get('prompt-return-switch').hidden=s.enabled;
  get('generate-prompt').className='od-button od-button--'+(get('prompt-section').hidden?'primary':'secondary');
  get('copy-prompt').className='od-button od-button--'+(s.enabled?'primary':'secondary');
  const labels={approved:'批准有效。仍需逐次核验真实网站权限。',none:'尚无批准。准备审核不会授予权限或执行。',loading:'正在读取批准与安装状态，尚未确认。',invalid:'安装身份已变化，原批准不能使用。请重新审核。',revoked:'批准已撤销，仅阻止未来准入，不回滚已有动作。',unknown:'状态未知。保留上次范围，不声称已保存；请重新读取。','save-fail':'下一次保存将模拟失败；当前读回状态未改变。'};
  get('grant-status').textContent=labels[s.auth];
  get('grant-status').hidden=Boolean(s.review);
  get('grant-status').className='od-alert'+(['invalid','revoked','unknown'].includes(s.auth)?' od-alert--warning':'');
  get('grant-status').setAttribute('role',['invalid','unknown'].includes(s.auth)?'alert':'status');
  const blocked=['loading','unknown'].includes(s.auth);
  get('grant-form').hidden=s.review||Boolean(s.grant&&s.auth==='approved'&&!s.editing);
  get('grant-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=blocked||s.preparing);
  get('prepare-grant').textContent=s.preparing?'正在核验范围…':'准备审核范围';
  get('grant-review').hidden=!s.review;
  get('approved-scope').hidden=!(s.grant&&['approved','unknown'].includes(s.auth)&&!s.editing&&!s.review);
  for(const id of ['generate-prompt','edit-grant'])get(id).disabled=blocked;
  get('revoke-grant').disabled=s.auth==='loading';
  get('grant-refresh').hidden=!['loading','unknown'].includes(s.auth);
  get('grant-diagnostic').textContent=s.auth==='unknown'?'WRITE_OR_READ_UNCONFIRMED：不自动重试。':s.auth==='invalid'?'INSTALLATION_CHANGED：精确批准失效。':'没有诊断错误。';
  get('approved-summary').innerHTML=s.grant?facts(s.grant):'';
  lockLab();
 }
 function showPage(next){
  if(['help','settings'].includes(next)&&!['help','settings'].includes(page))prePage=page;
  page=next;
  for(const key of ['overview','scripts','records','help','settings'])get('page-'+key).hidden=key!==next;
  const selected=['help','settings'].includes(next)?prePage:next;
  for(const key of ['overview','scripts','records']){const label=({overview:'概览',scripts:'脚本',records:'记录'})[key];get('app-'+key).setAttribute('aria-selected',String(key===selected));get('app-'+key).setAttribute('aria-label',label);get('app-'+key).textContent=(key===selected?'✓ ':'')+label;get('app-'+key).className='od-button od-button--'+(key===selected?'secondary':'quiet');get('app-'+key).tabIndex=key===selected?0:-1;}
  get('sidebar-tool-title').textContent='Web Flow'+(['help','settings'].includes(next)?' / '+(next==='help'?'帮助':'设置'):'');
  get('sidebar-tool-back').setAttribute('aria-label',['help','settings'].includes(next)?'返回 Web Flow '+({overview:'概览',scripts:'脚本',records:'记录'})[prePage]:'返回扩展列表');
  if(['help','settings'].includes(next))focus('page-'+next);
  else if(document.activeElement?.closest('[hidden]'))focus('app-'+next);
 }
 function tabGroup(id,keys,prefix,callback){
  for(const [i,key] of keys.entries()){
   const el=get(prefix+key);
   el.addEventListener('click',()=>callback(key));
   el.addEventListener('keydown',e=>{
    if(e.isComposing||composing||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowLeft'?-1:1)+keys.length)%keys.length;
    callback(keys[n]);focus(prefix+keys[n]);
   });
  }
 }
 function runtimeTab(key){
  // Each section owns its feedback. A previous grant message must not claim
  // "not executed" above the current task's successful receipt.
  notice('runtime-notice','');
  for(const t of ['task','grant','help']){const label=({task:'当前任务',grant:'任务授权',help:'使用说明'})[t];get('runtime-'+t+'-panel').hidden=t!==key;get('runtime-'+t).setAttribute('aria-selected',String(t===key));get('runtime-'+t).setAttribute('aria-label',label);get('runtime-'+t).textContent=(t===key?'✓ ':'')+label;get('runtime-'+t).className='od-button od-button--'+(t===key?'secondary':'quiet');get('runtime-'+t).tabIndex=t===key?0:-1;}
 }
 function openRuntime(key='task',opener=document.activeElement){
  if(!runtime.open){returnRuntime=opener;runtime.showModal();}
  runtimeTab(key);focus('runtime-'+key);
 }
 function renderScripts(){
  const query=get('script-search').value.trim().toLowerCase(),filter=get('script-filter').value;
  const rows=Object.entries(tasks).filter(([,t])=>(t.name+' '+t.id+' '+t.url).toLowerCase().includes(query)&&(filter==='all'||(filter==='available')===t.ready));
  get('script-count').textContent=`${rows.length} 个匹配任务`;
  get('script-empty').hidden=rows.length>0;get('script-list').hidden=!rows.length;
  get('script-list').firstElementChild.innerHTML=rows.map(([key,t])=>`<article class="preview-row"><span><strong class="od-body">${t.name}</strong><br><span class="od-note">${new URL(t.url).hostname} · ${t.version}<br>${t.ready?'固定任务 · 可手动运行':'安装或网站许可未就绪'}</span></span><div class="preview-actions">${button('task-detail-'+key,'详情','detail:'+key,'quiet')}${button('task-run-'+key,'运行','manual:'+key,'quiet')}</div></article>`).join('');
 }
 function runDescription(){return ({empty:'还没有当前任务',waiting:'等待完整助手回复',running:'任务运行中',success:'任务已完成',failed:'任务执行失败',unknown:'结果未知 · UNKNOWN'})[s.run];}
 function renderTask(){
  let html=`<h3 class="od-title" tabindex="-1" id="task-heading">${runDescription()}</h3>`;
  if(s.run==='empty')html+='<p class="od-alert">在任务授权中生成指令，发送给 ChatGPT 后，这里显示本次进度。</p>'+button('task-to-grant','去任务授权','grant');
  else if(s.run==='waiting')html+='<p class="od-alert" role="status">回复仍在生成，尚未派发。只有随后唯一完整助手回复可以进入核验；用户消息、引用与历史均不触发。</p>'+button('task-cancel','取消等待','cancel','secondary');
  else {
   const q=s.runScope||s.grant||sampleScope();
   html+=`<p class="od-body">${tasks[q.key].name} · ${tasks[q.key].version}<br>${esc(q.url)}<br>关键词：${esc(q.query)}</p><p class="od-note">来源：${s.runSource==='manual'?'手动运行':'ChatGPT · 精确批准'}</p>`;
   if(s.run==='running')html+='<p class="od-alert" role="status">正在提取网页结果。关闭自动运行不会停止本次任务。</p>'+button('task-stop','停止当前任务','stop');
   if(s.run==='success')html+='<p class="od-body"><strong>网页结果</strong>：已提取 3 条搜索结果。</p><ol class="od-body"><li>OpenDesk Browser · 项目介绍</li><li>OpenDesk · 使用说明</li><li>OpenDesk · 固定任务示例</li></ol><dl class="od-stack"><div><dt>持久结果</dt><dd>已保存 · 同次 Run / Result</dd></div><div><dt>资源释放</dt><dd>已释放</dd></div><div><dt>原聊天交付</dt><dd>'+ (s.runSource==='manual'?'手动运行不自动交付原聊天':'已送达一次 · 触发任务的原聊天')+'</dd></div><div><dt>AI 续答</dt><dd>尚未核验</dd></div></dl>';
   if(s.run==='failed')html+='<p class="od-alert od-alert--error" role="alert">网页结构变化，未得到有效结果。没有自动重试。</p><p class="od-note">持久结果：已保存失败回执 · 资源：已释放 · 原聊天：'+(s.runSource==='manual'?'手动运行不交付原聊天':'失败通知待确认')+'。</p>';
   if(s.run==='unknown')html+='<p class="od-alert od-alert--warning" role="alert">请求结果尚未确认。保留原请求，不能补跑。</p><p class="od-note">持久结果：未确认 · 资源释放：未确认 · 原聊天交付：'+(s.runSource==='manual'?'手动运行不适用':'未确认')+'。请先核对原请求。</p>'+button('task-query','核对原请求','query');
   html+=`<details class="od-disclosure"><summary>原始结果与运行身份</summary><p class="od-note">设计数据，非网站实测。</p><pre class="od-result">${esc(JSON.stringify({requestId:s.requestId,runId:'design-run-'+s.requestId,resultId:s.run==='success'?'design-result-'+s.requestId:null,state:s.run,source:s.runSource||'auto',value:s.run==='success'?{query:q.query,results:[{title:'OpenDesk Browser · 项目介绍'},{title:'OpenDesk · 使用说明'},{title:'OpenDesk · 固定任务示例'}]}:null},null,2))}</pre></details>`;
  }
  get('current-task').innerHTML=html;
 }
 function reset(auth='none',long=false){
  prepareEpoch++;dirty=false;s={auth,enabled:auth==='approved',grant:auth==='approved'||auth==='invalid'?sampleScope():null,review:null,editing:false,preparing:false,run:'empty',requestId:null,serial:0,promptSerial:0,manual:[],manualDrafts:{},staged:null,runScope:null};
  get('grant-task').value='baidu';get('grant-url').value=tasks.baidu.url;get('grant-query').value=long?'OpenDesk Browser 完整长关键词，用于验证摘要自然换行且不截断。'.repeat(4):'OpenDesk Browser';
  get('prompt-section').hidden=true;get('generate-prompt').textContent='生成 ChatGPT 指令';get('grant-review').hidden=true;get('grant-error').hidden=true;
  get('lab-auth').value=auth;get('lab-task').value='empty';notice('runtime-notice','');notice('app-notice','');
  get('manual-records').innerHTML='<p class="od-alert">还没有手动运行记录。</p>';
  summary();renderTask();renderScripts();showPage('overview');
 }
 get('auto-enabled').addEventListener('click',()=>{
  if(s.auth==='save-fail'){s.auth='unknown';s.enabled=false;notice('app-notice','开关保存失败，当前状态未确认。请打开运行面板重新读取，不会自动重试。',true);}
  else{s.enabled=!s.enabled;notice('app-notice',s.enabled?'自动准入已开启；只接受已批准精确范围。':'未来自动准入已关闭；已开始的任务不会因此停止。');}
  summary();
 });
 get('runtime-open').addEventListener('click',()=>openRuntime());
 get('runtime-close').addEventListener('click',()=>runtime.close());
 runtime.addEventListener('cancel',e=>{if(composing||e.isComposing)e.preventDefault();});
 runtime.addEventListener('close',()=>{(returnRuntime?.isConnected&&returnRuntime.getClientRects().length?returnRuntime:get('runtime-open')).focus();});
 root.addEventListener('compositionstart',()=>{composing=true;});root.addEventListener('compositionend',()=>{composing=false;});
 for(const dialog of root.querySelectorAll('dialog'))dialog.addEventListener('keydown',e=>{
  if(composing||e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();return;}
  if(e.key!=='Tab')return;
  const items=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter(el=>el.tabIndex>=0&&!el.closest('[hidden],details:not([open]) > :not(summary)')&&el.getClientRects().length);
  if(!items.length)return;
  e.preventDefault();const active=document.activeElement,i=items.indexOf(active);
  if(i<0&&active&&dialog.contains(active)){
   const inDirection=items.filter(el=>Boolean(active.compareDocumentPosition(el)&(e.shiftKey?2:4)));
   (e.shiftKey?inDirection.at(-1)||items.at(-1):inDirection[0]||items[0]).focus();
  }else items[i<0?(e.shiftKey?items.length-1:0):(i+(e.shiftKey?-1:1)+items.length)%items.length].focus();
 });
 tabGroup('app-tabs',['overview','scripts','records'],'app-',showPage);
 tabGroup('runtime-tabs',['task','grant','help'],'runtime-',runtimeTab);
 get('help-open').addEventListener('click',()=>showPage('help'));get('settings-open').addEventListener('click',()=>showPage('settings'));
 get('sidebar-tool-back').addEventListener('opendesk-preview-back',e=>{if(['help','settings'].includes(page)){e.preventDefault();const old=page;showPage(prePage);focus(old+'-open');}});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!runtime.open&&!manual.open&&!composing&&!e.isComposing&&['help','settings'].includes(page)){e.preventDefault();const old=page;showPage(prePage);focus(old+'-open');}});
 root.addEventListener('click',e=>{const pageButton=e.target.closest('[data-page]'),runtimeButton=e.target.closest('[data-runtime]');if(pageButton)showPage(pageButton.dataset.page);if(runtimeButton)openRuntime(runtimeButton.dataset.runtime,e.target);});
 get('start-guide').addEventListener('click',()=>{if(s.grant&&s.auth==='approved'&&!s.enabled){focus('auto-enabled');notice('app-notice','请点击自动运行开关，或按 Space 开启。批准没有自动开启开关。');}else openRuntime('grant');});
 get('script-search').addEventListener('input',()=>{if(!composing)renderScripts();});get('script-search').addEventListener('compositionend',renderScripts);
 get('script-filter').addEventListener('change',renderScripts);get('clear-filter').addEventListener('click',()=>{get('script-search').value='';get('script-filter').value='all';renderScripts();focus('script-search');});
 for(const id of ['grant-url','grant-query','grant-limit','grant-task'])get(id).addEventListener(id==='grant-task'?'change':'input',()=>{
  dirty=true;s.review=null;prepareEpoch++;
  if(id==='grant-task')get('grant-url').value=tasks[get(id).value].url;
  get('grant-error').hidden=true;for(const id of ['grant-task','grant-query','grant-url'])get(id).removeAttribute('aria-invalid');
  notice('runtime-notice','草稿已修改，尚未批准；关闭面板会保留。');lockLab();
 });
 get('grant-form').addEventListener('submit',e=>{
  e.preventDefault();if(composing||s.preparing)return;
  const scope=draft(),task=tasks[scope.key];
  const error=!scope.query?'请输入搜索关键词。':scope.url!==task.url?'精确网址必须为 '+task.url:!task.ready?'此固定任务的安装或网站许可未就绪，不能准备批准。':'';
  if(error){notice('grant-error',error,true);const id=!scope.query?'grant-query':scope.url!==task.url?'grant-url':'grant-task';get(id).setAttribute('aria-invalid','true');focus(id);return;}
  s.preparing=true;const epoch=++prepareEpoch;summary();
  setTimeout(()=>{
   if(epoch!==prepareEpoch)return;
   s.preparing=false;s.review=scope;get('review-summary').innerHTML=facts(scope);summary();notice('runtime-notice','范围审核已就绪。尚未批准或执行。');
   if(runtime.open){focus('review-title');get('review-title').scrollIntoView({block:'nearest'});}
  },120);
 });
 get('cancel-review').addEventListener('click',()=>{prepareEpoch++;s.review=null;summary();focus('grant-query');notice('runtime-notice','返回修改。未授予批准，也未执行任务。');});
 get('approve-grant').addEventListener('click',()=>{
  if(!s.review)return;
  if(s.auth==='save-fail'){s.auth='unknown';s.review=null;dirty=false;notice('runtime-notice','批准保存失败，未确认生效。不会执行或自动重试，请重新读取。',true);}
  else{s.grant={...s.review};s.review=null;s.editing=false;s.auth='approved';dirty=false;notice('runtime-notice','批准已保存。开关独立控制未来准入；现在可生成指令。');}
  summary();focus(s.auth==='approved'?'generate-prompt':'grant-refresh');
 });
 get('edit-grant').addEventListener('click',()=>{s.editing=true;dirty=true;get('prompt-section').hidden=true;summary();notice('runtime-notice','正在编辑新范围，原批准保持有效。只有明确批准后才替换；可放弃草稿。');focus('grant-query');});
 get('discard-draft').addEventListener('click',()=>{const scope=s.grant||sampleScope();prepareEpoch++;dirty=false;s.review=null;s.editing=false;s.preparing=false;get('grant-task').value=scope.key;get('grant-url').value=scope.url;get('grant-query').value=scope.query;for(const id of ['grant-task','grant-query','grant-url'])get(id).removeAttribute('aria-invalid');notice('grant-error','');summary();notice('runtime-notice','草稿已放弃，原批准和开关未改变；没有执行。');focus(s.grant&&s.auth==='approved'?'edit-grant':'prepare-grant');});
 get('revoke-grant').addEventListener('click',()=>{s.auth='revoked';s.grant=null;s.review=null;dirty=false;get('prompt-section').hidden=true;summary();notice('runtime-notice','批准已撤销，只阻止未来准入；已开始的任务不回滚。');focus('prepare-grant');});
 get('grant-refresh').addEventListener('click',()=>{s.auth='none';s.enabled=false;s.grant=null;summary();notice('app-notice','');notice('runtime-notice','已重新读取：开关关闭，无有效批准。未重试保存或执行。');focus('prepare-grant');});
 get('generate-prompt').addEventListener('click',()=>{
  if(!s.grant||s.auth!=='approved')return;
  const scope=s.grant;
  const candidate={protocol:'webflow.task.intent.v1',candidateId:'design-wf-'+(++s.promptSerial),taskId:tasks[scope.key].id,targetUrl:scope.url,args:{query:scope.query,limit:scope.limit}};
  get('prompt-text').value='请仅回复一个语言标记为 opendesk-task 的 JSON 代码块，完整保留以下 JSON 的五个字段及值，不添加其他说明：'+JSON.stringify(candidate).replaceAll('/',String.raw`\u002f`);
  get('prompt-section').hidden=false;get('generate-prompt').textContent='生成下一次指令';get('copy-feedback').textContent='';
  get('generate-prompt').className='od-button od-button--secondary';
  get('copy-prompt').className='od-button od-button--'+(s.enabled?'primary':'secondary');
  get('prompt-return-switch').className='od-button od-button--primary';
  notice('runtime-notice','本次指令已生成，未执行。'+(s.enabled?'请在 ChatGPT 原对话发送。':'请先开启自动运行，再发送。'));
  focus('prompt-text');get('prompt-section').scrollIntoView({block:'nearest'});
 });
 const selectPrompt=()=>{focus('prompt-text');get('prompt-text').select();};
 get('select-prompt').addEventListener('click',selectPrompt);
 get('copy-prompt').addEventListener('click',()=>{selectPrompt();get('copy-feedback').textContent='复制反馈演示：指令已选中；本预览未写剪贴板。可按 ⌘C / Ctrl+C 手动复制。';});
 get('prompt-return-switch').addEventListener('click',()=>{returnRuntime=get('auto-enabled');runtime.close();notice('app-notice','指令和草稿已保留，请明确开启自动运行后再发送。');});
 get('current-task').addEventListener('click',e=>{
  const action=e.target.closest('[data-do]')?.dataset.do;
  if(action==='grant')openRuntime('grant');
  if(action==='cancel'){s.run='empty';renderTask();notice('runtime-notice','等待已取消；没有提交执行。');focus('task-heading');}
  if(action==='stop'){s.run='unknown';syncManual();renderTask();notice('runtime-notice','停止已请求，结果和资源释放尚未确认。不会自动重试或回滚。');focus('task-heading');}
  if(action==='query'){notice('runtime-notice','原请求 '+s.requestId+' 仍未确认；未新建请求或重新执行。');}
 });
 get('script-list').addEventListener('click',e=>{
  const action=e.target.closest('[data-do]')?.dataset.do;if(!action)return;
  const [kind,key]=action.split(':'),task=tasks[key];
  if(kind==='detail'){returnDetail=e.target;get('detail-content').innerHTML=`<p class="od-body"><strong>${task.name} · ${task.version}</strong><br>${task.url}</p><p class="od-note">${task.ready?'固定委托可手动运行。自动批准须另在运行面板审核。':'安装或网站许可未就绪，不回退到其他同名任务。'}</p><details class="od-disclosure"><summary>任务编号</summary><p class="od-technical">${task.id}</p></details>`;get('detail-dialog').showModal();focus('detail-close');return;}
  returnManual=e.target;
  if(!task.ready){notice('app-notice','Google 固定任务的安装或网站许可未就绪。请在原宿主核对；没有执行。',true);return;}
  if(['running','unknown'].includes(s.run)){openRuntime('task',e.target);notice('runtime-notice','存在运行中或未知请求，只能查询或停止。');return;}
  s.manualTask=key;s.manualSaved=false;get('manual-context').textContent=task.name+' · '+task.version+' · '+task.url;
  get('manual-form').hidden=Boolean(s.staged);get('manual-confirm').hidden=true;get('manual-recover').hidden=!s.staged;get('manual-query').value=s.manualDrafts[key]||'';get('manual-query').disabled=false;notice('manual-error','');notice('manual-notice','');manual.showModal();focus(s.staged?'manual-read-staged':'manual-query');lockLab();
 });
 function renderRecords(){get('manual-records').innerHTML=s.manual.length?s.manual.map(row=>`<div class="od-surface od-surface--padded"><p class="od-body">${esc(row.scope.query)}</p><p class="od-note">原请求 ${row.id}<br>${({saved:'已保存，尚未提交',cancelled:'已取消，未执行',running:'运行中',success:'结果已保存，资源已释放',failed:'执行失败，未重试',unknown:'结果未知，不补跑'})[row.state]}</p>${button('manual-record-'+row.id,'查询原请求','read:'+row.id)}</div>`).join(''):'<p class="od-alert">还没有手动运行记录。</p>';}
 function syncManual(){const row=s.manual.find(row=>row.id===s.requestId);if(row&&s.runSource==='manual')row.state=s.run;renderRecords();}
 function openRecord(id,opener){const row=s.manual.find(row=>row.id===id);if(!row)return;returnRecord=opener;get('record-content').innerHTML=`<p class="od-note">只读核对，不改变当前运行、不新建请求。</p>${facts(row.scope)}<p class="od-body">原请求：${row.id}<br>状态：${({saved:'已保存但尚未提交；没有执行',cancelled:'已取消；没有执行',running:'运行中，持久结果与释放待核对',success:'结果已保存 · 资源已释放',failed:'执行失败，未重试',unknown:'结果未知；不补跑'})[row.state]}</p><p class="od-note">来源：手动 · 原聊天交付：不适用。AI 续答：未核验。</p>`;get('record-dialog').showModal();focus('record-close');}
 get('manual-form').addEventListener('submit',e=>{e.preventDefault();if(composing||s.staged)return;if(!get('manual-query').value.trim()){notice('manual-error','请输入搜索关键词。',true);get('manual-query').setAttribute('aria-invalid','true');focus('manual-query');return;}s.manualSaved=true;s.staged={id:'design-manual-'+(++s.serial),scope:{key:s.manualTask,url:tasks[s.manualTask].url,query:get('manual-query').value.trim(),limit:3},state:'saved'};s.manual.push(s.staged);renderRecords();get('manual-confirm-summary').innerHTML=facts(s.staged.scope);get('manual-confirm').hidden=false;get('manual-form').hidden=true;focus('manual-run');});
 get('manual-query').addEventListener('input',()=>{s.manualDrafts[s.manualTask]=get('manual-query').value;notice('manual-error','');get('manual-query').removeAttribute('aria-invalid');});
 get('manual-run').addEventListener('click',()=>{if(!s.manualSaved||!s.staged)return;s.manualSaved=false;s.requestId=s.staged.id;s.run='running';s.runSource='manual';s.runScope={...s.staged.scope};s.staged=null;syncManual();manual.close();renderTask();openRuntime('task',get('task-run-'+s.manualTask));});
 get('manual-read-staged').addEventListener('click',e=>{if(s.staged)openRecord(s.staged.id,e.target);});
 get('manual-cancel-staged').addEventListener('click',()=>{if(s.staged)s.staged.state='cancelled';s.staged=null;s.manualSaved=false;renderRecords();get('manual-recover').hidden=true;get('manual-form').hidden=false;notice('manual-notice','原步骤已取消，没有提交执行；草稿仍保留。');focus('manual-query');});
 get('manual-records').addEventListener('click',e=>{const action=e.target.closest('[data-do]')?.dataset.do;if(action)openRecord(action.slice(5),e.target);});
 get('manual-close').addEventListener('click',()=>manual.close());manual.addEventListener('cancel',e=>{if(composing||e.isComposing)e.preventDefault();});
 manual.addEventListener('close',()=>{s.manualSaved=false;lockLab();returnManual?.focus();});
 for(const [name,restore] of [['record',()=>returnRecord],['detail',()=>returnDetail]]){get(name+'-close').addEventListener('click',()=>get(name+'-dialog').close());get(name+'-dialog').addEventListener('cancel',e=>{if(composing||e.isComposing)e.preventDefault();});get(name+'-dialog').addEventListener('close',()=>restore()?.focus());}
 get('lab-auth').addEventListener('change',()=>{s.auth=get('lab-auth').value;s.enabled=s.auth==='approved';s.grant=['approved','invalid'].includes(s.auth)?sampleScope():null;get('prompt-section').hidden=true;summary();notice('app-notice','');notice('lab-feedback','已切换授权场景，现有请求和手动记录保持原身份。');});
 get('lab-task').addEventListener('change',()=>{
  s.run=get('lab-task').value;
  if(s.run==='empty'){s.requestId=null;s.runSource=null;s.runScope=null;}
  else if(s.run==='waiting'){s.runSource='auto';s.runScope=s.grant||sampleScope();s.requestId='design-wait-'+(++s.serial);}
  else if(!s.requestId){s.runSource='auto';s.runScope=s.grant||sampleScope();s.requestId='design-request-'+(++s.serial);}
  syncManual();renderTask();notice('lab-feedback','已切换展示状态。空态或等待回复使用新的展示上下文；其他结果状态保留同一请求，原历史不改写。未派发真实任务。');
 });
 get('lab-reply').addEventListener('click',()=>{
  if(!s.enabled||s.auth!=='approved'){notice('lab-feedback','候选被阻止：需要已开启的开关和有效精确批准。没有执行。',true);return;}
  if(['running','unknown'].includes(s.run)){notice('lab-feedback','已有未决原请求，不能再次派发。',true);return;}
  s.run='running';s.runSource='auto';s.runScope={...s.grant};s.requestId='design-auto-'+(++s.serial);get('lab-task').value='running';renderTask();notice('lab-feedback','模拟候选通过准入；结果状态可用上方场景切换。');
 });
 const publicMap={ready:'approved',empty:'none',error:'save-fail',denied:'none',revoked:'revoked',busy:'loading',long:'none'};
 for(const el of get('preview-state').querySelectorAll('[data-state]'))el.addEventListener('click',()=>{reset(publicMap[el.dataset.state],el.dataset.state==='long');for(const b of get('preview-state').querySelectorAll('[data-state]'))b.setAttribute('aria-pressed',String(b===el));});
 get('reset-items').addEventListener('click',()=>reset());root.addEventListener('opendesk-preview-reset',()=>reset());
 get('od-design-theme').addEventListener('change',()=>{root.dataset.previewTheme=get('od-design-theme').value;notice('app-notice','此主题示例使用固定 Neutral 组件；运行面板维持浅色，宿主始终浅色。');});
 reset();
 // Initial scenario is no grant; align the generic external state indicator.
 for(const b of get('preview-state').querySelectorAll('[data-state]'))b.setAttribute('aria-pressed',String(b.dataset.state==='denied'));
})();

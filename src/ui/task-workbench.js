import {permissionPattern} from '../environment.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {createTaskPackage, validateTaskParams} from '../platform/tasks/contract.js';
import {digestUtf8} from '../platform/protocol.js';
import {PROGRAM_DRAFT_FORMAT, PROGRAM_DRAFT_LIMIT, validateProgramDraft} from './program-source.js';

const states={candidate:'待验证',verified:'本机验证通过',available:'本地可用'};
const terminal=new Set(['completed','failed','stopped','interrupted']);
const runStateNames={preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'保存结果中',completed:'成功',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
const textValue=value=>value===undefined?'undefined':JSON.stringify(value,null,2);

export function createTaskWorkbench({client,host,currentPageTarget,api=globalThis.chrome,
  document:doc=globalThis.document,importDraft,executionSource}) {
  const get=id=>doc.getElementById(id);
  const editorSource=executionSource || (() => get('script-source').value);
  let disposed=false, working=false, running=false, activeRunId=null, catalog=[], installed=[], renderKey=null;
  let catalogSequence=0, historySequence=0, currentPage=currentPageTarget?.snapshot;
  let catalogSurface=false, catalogQuery='', catalogFilter='all';
  let localQuery='', localFilter='current';
  const parameterDrafts=new Map();
  // A late RunHost event must update the launching task, never the newly selected one.
  const taskNotices=new Map();
  let runOwnerKey=null, runOwnerTitle='';
  const listeners=[];
  // This channel is a hint only. The recipient always re-reads the authoritative
  // Task Catalog through the existing Host Client; no task data crosses it.
  const updates=typeof globalThis.BroadcastChannel==='function'
    ?new globalThis.BroadcastChannel('opendesk-task-catalog-updates-v1'):null;
  const announce=()=>updates?.postMessage({type:'catalog-changed'});
  updates?.addEventListener?.('message',event=>{
    if(!disposed&&event.data?.type==='catalog-changed')refresh().catch(fail);
  });
  const listen=(node,event,fn)=>{node.addEventListener(event,fn);listeners.push({node,event,fn});};
  const fail=error=>{
    if(disposed)return;
    const message=`${error?.code || 'E_TASK'}：${error?.message || error}`;
    get('task-status').textContent=message;
    get('task-catalog-status').textContent=message;
    get('local-discover-status').textContent=message;
    get('task-dev-status').textContent=message;
  };
  const option=(name,value)=>new Option(name,value);
  function navigate(name) {
    if(!['tasks','discover','develop','catalog'].includes(name))return;
    if(name==='catalog'&&!catalogSurface) {
      // Package import and installation live only in a separate full-size
      // extension tab. Sidebar Discover is a view of installed local tasks.
      Promise.resolve().then(()=>api.tabs.create({url:api.runtime.getURL('ui/tool.html')})).catch(fail);
      return;
    }
    for(const [element,view] of [
      ['tasks','tasks'],['local-discover','discover'],['develop','develop'],['discover','catalog']
    ])get('workbench-'+element).hidden=view!==name;
    for(const [view,id] of [['tasks','tab-my-tasks'],['discover','tab-discover'],['develop','tab-develop']]) {
      const tab=get(id);
      tab.setAttribute('aria-selected',String(name===view));
      tab.tabIndex=name===view?0:-1;
    }
    syncRunDock(name);
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTab=name;
    if(name==='discover')renderLocalDiscovery();
  }
  // Keep the owning Stop control visible across Sidebar tab changes;
  // do not move or restart the run when the user enters Discover/Developer.
  function syncRunDock(view=doc.documentElement?.dataset?.opendeskTab) {
    const taskOwns=Boolean(activeRunId && host.currentRun===activeRunId);
    const draftOwns=Boolean(host.currentRun && !taskOwns);
    get('task-dock').hidden=catalogSurface || (taskOwns?false:draftOwns || view!=='tasks');
    get('develop-dock').hidden=catalogSurface || (draftOwns?false:taskOwns || view!=='develop');
    // The dock follows the real RunHost owner, not the selected task or visible tab.
    // On another view (or another task), expose only that owner's Stop control.
    const selected=installedRow();
    const stopOnly=taskOwns && (view!=='tasks' || runOwnerKey!== (selected && identity(selected))) ||
      draftOwns && view!=='develop';
    get('workspace-dock').dataset.stopOnly=String(Boolean(stopOnly));
    get('task-stop').setAttribute('aria-label',taskOwns
      ? `停止「${runOwnerTitle || '当前任务'}」` : '停止当前任务');
    // Idle Discover is a search view, not a second permanent action bar.
    // Never expose an unrelated Run/Save action in a cross-view Stop dock.
    get('workspace-dock').hidden=get('task-dock').hidden && get('develop-dock').hidden;
  }
  function showCatalogPage() {
    catalogSurface=true;
    if(doc.documentElement?.dataset) doc.documentElement.dataset.opendeskSurface='catalog';
    navigate('catalog');
  }
  const identity=row=>`${row.taskId}@${row.version}`;
  const candidate=()=>catalog.find(row=>identity(row)===get('task-catalog-list').value);
  const installedRow=()=>installed.find(row=>row.taskId===get('task-installed-list').value);
  const candidateFor=row=>row && catalog.find(value=>value.taskId===row.taskId&&value.version===row.version);
  function renderTaskStatus() {
    const row=installedRow(),selectedKey=row?identity(row):null;
    const otherOwner=runOwnerKey && runOwnerKey!==selectedKey && (running || (activeRunId && host.currentRun===activeRunId));
    get('task-status').textContent=otherOwner
      ? `「${runOwnerTitle}」${activeRunId && host.currentRun===activeRunId?'正在运行，底部可停止':'正在准备，暂不可启动其他任务'}`
      :selectedKey?taskNotices.get(selectedKey)||'':'';
  }
  function setTaskNotice(taskKey,message) {
    if(disposed||!taskKey)return;
    taskNotices.set(taskKey,message);
    renderTaskStatus();
  }
  const formatCandidate=row=>{
    if(!row)return '尚无候选任务';
    const manifest=row.manifest;
    return `${manifest.title} · v${row.version}\n${manifest.description}\n作者：${manifest.author} · 来源：${manifest.source}\n适用：${manifest.siteOrigins.join(', ')}\n权限：${manifest.permissions.join(', ')}\n状态：${states[row.stage] || row.stage}${row.verifiedAt?' · 有本机运行验证记录':''}`;
  };
  function clearChildren(node) {node.replaceChildren();}
  function renderForm(row) {
    const wrapper=get('task-params-form'),key=identity(row);
    if(renderKey===key)return;
    if(renderKey) {
      const prior={};
      for(const control of wrapper.children) {
        const name=control?.dataset?.taskParam;
        if(name)prior[name]=control.type==='checkbox'?{checked:control.checked}:{value:control.value};
      }
      parameterDrafts.set(renderKey,prior);
    }
    renderKey=key;clearChildren(wrapper);
    const schema=row.manifest.paramsSchema;
    for(const [name,rule] of Object.entries(schema.properties)) {
      const label=doc.createElement('label');label.textContent=`${rule.title}${schema.required.includes(name)?' *':''}`;
      const control=rule.enum?doc.createElement('select'):doc.createElement('input');
      control.dataset.taskParam=name;control.dataset.taskType=rule.type;
      control.id='task-param-'+name;
      label.htmlFor=control.id;
      if(rule.enum) {
        if(!schema.required.includes(name)&&rule.default===undefined)control.append(option('（不填写）',''));
        for(const value of rule.enum)control.append(option(String(value),String(value)));
        if(Object.hasOwn(rule,'default'))control.value=String(rule.default);
      }else if(rule.type==='boolean') {
        control.type='checkbox';control.checked=rule.default===true;
      }else{
        control.type=rule.type==='number'||rule.type==='integer'?'number':'text';
        if(control.type==='number')control.step=rule.type==='integer'?'1':'any';
        if(rule.minLength!==undefined)control.minLength=rule.minLength;
        if(rule.maxLength!==undefined)control.maxLength=rule.maxLength;
        if(rule.minimum!==undefined)control.min=String(rule.minimum);
        if(rule.maximum!==undefined)control.max=String(rule.maximum);
        if(Object.hasOwn(rule,'default'))control.value=String(rule.default);
        control.required=schema.required.includes(name);
      }
      wrapper.append(label,control);
      if(rule.description){const help=doc.createElement('p');help.className='hint';help.textContent=rule.description;wrapper.append(help);}
    }
    const prior=parameterDrafts.get(key);
    if(prior){
      for(const control of wrapper.children){
        const value=prior[control?.dataset?.taskParam];
        if(!value)continue;
        if(Object.hasOwn(value,'checked'))control.checked=value.checked;
        else control.value=value.value;
      }
    }
    // An empty form is intentional: do not take up space to explain "no params".
    if(!Object.keys(schema.properties).length)wrapper.textContent='';
  }
  function paramsFromForm(schema) {
    const result={};
    for(const [name,rule] of Object.entries(schema.properties)) {
      const control=get('task-param-'+name);
      if(!control)throw {code:'E_PARAMS',message:`缺少参数输入：${name}`};
      let value;
      if(rule.type==='boolean')value=control.checked;
      else if(rule.enum&&control.value===''&&!schema.required.includes(name)&&!Object.hasOwn(rule,'default'))continue;
      else if(control.value===''&&!schema.required.includes(name)&&!Object.hasOwn(rule,'default'))continue;
      else if(rule.type==='integer'||rule.type==='number')value=control.value===''?NaN:Number(control.value);
      else value=control.value;
      if(rule.enum) {
        // Select serializes string representations; restore the declared primitive.
        const choice=rule.enum.find(item=>String(item)===String(control.value));
        if(choice!==undefined)value=choice;
      }
      result[name]=value;
    }
    return validateTaskParams(schema,result);
  }
  function update() {
    if(disposed)return;
    const row=installedRow(),info=candidateFor(row),selected=candidate();
    const available=row?.enabled && info?.stage==='available';
    let siteAvailable=false,origin='';
    if(currentPage?.status==='available') {
      origin=new URL(currentPage.url).origin;
      siteAvailable=info?.manifest.siteOrigins.includes(origin)===true;
    }
    const siteState=origin?(siteAvailable?'matched':'unmatched'):'unavailable';
    const siteMessage=origin?(siteAvailable?'适用于当前网页':'当前网页不适用'):'当前网页不可运行';
    get('task-current-site').textContent=siteMessage;
    get('task-current-site').dataset.state=siteState;
    get('task-current-site').title=origin || '';
    get('task-run').disabled=working||running||!!host.currentRun||!available||!siteAvailable;
    get('task-stop').disabled=!activeRunId || host.currentRun!==activeRunId;
    get('task-fork-draft').disabled=!row||working;
    get('task-toggle').disabled=!row||working;
    get('task-toggle').textContent=row?.enabled?'停用任务':'启用任务';
    get('task-uninstall').disabled=!row||working;
    get('task-verify').disabled=working||!selected||selected.stage!=='candidate';
    get('task-publish').disabled=working||!selected||selected.stage!=='verified';
    get('task-install').disabled=working||!selected||selected.stage!=='available'||
      selected.installed&&selected.enabled;
    get('task-install').textContent=selected?.installed?'已安装':'安装确定版本';
    get('task-create-candidate').disabled=working;
    syncRunDock();
  }
  function renderInstalledCards() {
    const parent=get('task-installed-cards'),selected=get('task-installed-list').value,
      workspace=get('task-selected-workspace');
    const focused=doc.activeElement;
    const focusedTaskId=parent.contains?.(focused) && focused?.dataset?.taskId || null;
    const focusedInWorkspace=workspace.contains?.(focused) || false;
    let replacementFocus=null;
    // Move the same live controls under the selected card, never recreate them.
    // Keeping the original nodes preserves input focus, listeners and run ownership.
    parent.replaceChildren();
    if(!installed.length){
      workspace.hidden=true;
      const empty=doc.createElement('p');
      empty.className='hint';
      empty.textContent='还没有任务。前往「发现」→「导入」添加本地任务。';
      parent.append(empty,workspace);
      if(focusedInWorkspace)get('tab-my-tasks').focus?.({preventScroll:true});
      return;
    }
    let attached=false;
    for(const row of installed){
      const info=candidateFor(row),group=doc.createElement('div'),button=doc.createElement('button');
      group.className='task-card-group'+(row.taskId===selected?' selected':'');
      button.type='button';button.className='task-card';
      button.dataset.taskId=row.taskId;
      button.setAttribute('aria-pressed',String(row.taskId===selected));
      button.setAttribute('aria-expanded',String(row.taskId===selected));
      button.setAttribute('aria-controls','task-selected-workspace');
      const badge=doc.createElement('span');badge.className='task-card-icon';
      badge.textContent=(info?.manifest.title || row.taskId).slice(0,1).toUpperCase();
      badge.setAttribute('aria-hidden','true');
      const copy=doc.createElement('span');copy.className='task-card-copy';
      const title=doc.createElement('strong');title.textContent=info?.manifest.title || row.taskId;
      const subtitle=doc.createElement('small');subtitle.textContent=info?.manifest.description || '已安装任务';
      copy.append(title,subtitle);
      const state=doc.createElement('span');state.className='task-card-state'+(row.enabled?'':' off');
      state.textContent=row.enabled?'':'已停用';
      button.append(badge,copy,state);
      if(focusedTaskId===row.taskId)replacementFocus=button;
      button.addEventListener('click',()=>{
        const wasFocused=doc.activeElement===button;
        get('task-installed-list').value=row.taskId;renderInstalledSelection();
        if(wasFocused) {
          for(const next of get('task-installed-cards').querySelectorAll?.('.task-card')||[])
            if(next.dataset.taskId===row.taskId){next.focus?.({preventScroll:true});break;}
        }
      });
      group.append(button);
      if(row.taskId===selected){workspace.hidden=false;group.append(workspace);attached=true;}
      parent.append(group);
    }
    if(!attached){workspace.hidden=true;parent.append(workspace);}
    if(focusedInWorkspace && focused?.isConnected!==false)focused.focus?.({preventScroll:true});
    else replacementFocus?.focus?.({preventScroll:true});
  }
  function renderInstalled() {
    const sel=get('task-installed-list'),prior=sel.value;
    sel.replaceChildren(option(installed.length?'请选择已安装任务':'暂无已安装任务',''));
    for(const row of installed) {
      const info=candidateFor(row);
      sel.append(option(`${info?.manifest.title || row.taskId} · v${row.version}${row.enabled?'':'（已停用）'}`,row.taskId));
    }
    if(installed.some(row=>row.taskId===prior))sel.value=prior;
    else if(installed.length)sel.value=installed[0].taskId;
    renderInstalledSelection();
  }
  function renderInstalledSelection() {
    const row=installedRow(),info=candidateFor(row);
    get('task-installed-detail').textContent=info
      ?`适用网站：${info.manifest.siteOrigins.join('、')}\n所需能力：${info.manifest.permissions.join('、')}\n来源：${info.manifest.source} · v${row.version}`
      :'';
    get('task-result-panel').hidden=true;
    get('task-history-panel').hidden=true;
    get('task-result').textContent='';
    renderTaskStatus();
    if(info)renderForm(info);
    else{renderKey=null;clearChildren(get('task-params-form'));}
    renderInstalledCards();
    update();refreshHistory().catch(fail);
  }
  function renderLocalDiscovery() {
    const parent=get('local-discover-cards');
    const focused=doc.activeElement;
    const focusedTaskId=parent.contains?.(focused) && focused?.dataset?.taskId || null;
    let replacementFocus=null;
    parent.replaceChildren();
    let origin=null;
    if(currentPage?.status==='available') {
      try {origin=new URL(currentPage.url).origin;} catch { /* No stale site fallback. */ }
    }
    for(const value of ['current','all','disabled'])
      get('local-filter-'+value).setAttribute('aria-pressed',String(localFilter===value));
    const rows=installed.map(row=>({row,info:candidateFor(row)}))
      .filter(item=>item.info && (
        localFilter==='all' ||
        localFilter==='disabled' && !item.row.enabled ||
        localFilter==='current' && item.row.enabled && origin &&
          item.info.manifest.siteOrigins.includes(origin)
      ))
      .filter(({row,info})=>[
        info.manifest.title,info.manifest.description,row.taskId,...info.manifest.siteOrigins
      ].join(' ').toLocaleLowerCase().includes(localQuery));
    // Live count is accessible to screen readers; the visible list speaks for itself.
    get('local-discover-count').textContent=`找到 ${rows.length} 个已安装任务 · 本机共 ${installed.length} 个`;
    if(!rows.length) {
      const empty=doc.createElement('p');
      empty.className='local-discovery-empty';
      empty.textContent=!installed.length
        ? '还没有任务，点击「导入」添加。'
        : localFilter==='current' && !origin
          ? '当前网页不可用，可切换「全部」查看。'
          : localFilter==='current' && !localQuery
            ? '当前网页暂无可用任务，试试「全部」。'
            : '没有匹配的任务，试试其他关键词。';
      parent.append(empty);
    }
    for(const {row,info} of rows) {
      const matches=!!origin && info.manifest.siteOrigins.includes(origin);
      const card=doc.createElement('button');card.type='button';
      card.className='local-discovery-card';card.dataset.taskId=row.taskId;
      card.setAttribute('aria-label',`选择 ${info.manifest.title}，返回我的任务。适用网站：${info.manifest.siteOrigins.join('、')}`);
      const icon=doc.createElement('span');icon.className='task-card-icon';
      icon.textContent=(info.manifest.title||row.taskId).slice(0,1).toUpperCase();
      icon.setAttribute('aria-hidden','true');
      const copy=doc.createElement('span');copy.className='local-discovery-copy';
      const title=doc.createElement('strong');title.textContent=info.manifest.title;
      const description=doc.createElement('small');description.textContent=info.manifest.description;
      copy.append(title,description);
      const state=doc.createElement('span');
      state.className='local-discovery-state'+(!row.enabled?' off':!matches?' other':'');
      state.textContent=!row.enabled?'已停用':matches?(localFilter==='current'?'':'当前网页适用'):'其他网站';
      card.append(icon,copy,state);
      if(focusedTaskId===row.taskId)replacementFocus=card;
      card.addEventListener('click',()=>{
        if(disposed || !installed.some(value=>value.taskId===row.taskId))return;
        get('task-installed-list').value=row.taskId;
        renderInstalledSelection();
        navigate('tasks'); // Explicit Run click still performs native permission admission.
        for(const next of get('task-installed-cards').querySelectorAll?.('.task-card')||[])
          if(next.dataset.taskId===row.taskId){next.focus?.({preventScroll:true});break;}
      });
      parent.append(card);
    }
    if(focusedTaskId){
      if(replacementFocus)replacementFocus.focus?.({preventScroll:true});
      else get('local-discover-search').focus?.({preventScroll:true});
    }
    get('local-discover-status').textContent='';
  }
  function renderCatalog(preserve) {
    const sel=get('task-catalog-list'),old=preserve||sel.value;
    sel.replaceChildren(option(catalog.length?'请选择候选版本':'目录中没有任务',''));
    for(const row of catalog)sel.append(option(`${row.manifest.title} · v${row.version} · ${states[row.stage]}`,identity(row)));
    if(catalog.some(row=>identity(row)===old))sel.value=old;
    renderCatalogCards();
    renderCandidate();
  }
  function renderCatalogCards() {
    const parent=get('task-catalog-cards'),current=get('task-catalog-list').value;
    parent.replaceChildren();
    const rows=catalog.filter(row=>{
      if(catalogFilter==='installed'&&!row.installed) return false;
      if(catalogFilter==='available'&&row.stage!=='available')return false;
      if(catalogFilter==='candidate'&&row.stage!=='candidate')return false;
      const manifest=row.manifest;
      return [manifest.title,manifest.description,manifest.author,manifest.source,...manifest.siteOrigins]
        .join(' ').toLocaleLowerCase().includes(catalogQuery);
    });
    get('task-catalog-count').textContent=`共 ${rows.length} 个本地任务版本`;
    if(!rows.length){
      const empty=doc.createElement('p');empty.className='hint';
      empty.textContent='没有匹配的任务，请尝试其他关键词或分类。';
      parent.append(empty);return;
    }
    for(const row of rows){
      const button=doc.createElement('button');button.type='button';button.className='catalog-card';
      if(identity(row)===current)button.className+=' selected';
      const title=doc.createElement('strong');title.textContent=row.manifest.title;
      const summary=doc.createElement('small');summary.textContent=row.manifest.description;
      const state=doc.createElement('span');state.className='catalog-card-state';
      state.textContent=`${states[row.stage]||row.stage} · v${row.version}${row.installed?' · 已安装':''}`;
      button.append(title,summary,state);
      button.addEventListener('click',()=>{
        get('task-catalog-list').value=identity(row);
        renderCatalogCards();renderCandidate();
      });
      parent.append(button);
    }
  }
  function renderCandidate() {
    const row=candidate(),reader=get('task-catalog-detail');
    reader.replaceChildren();
    if(!row) {
      reader.textContent='请选择任务卡片，查看完整用途、来源和所需权限。';
      update();return;
    }
    const heading=doc.createElement('h3');heading.textContent=row.manifest.title;
    const subtitle=doc.createElement('p');subtitle.className='catalog-reader-desc';
    subtitle.textContent=row.manifest.description;
    const meta=doc.createElement('div');meta.className='catalog-reader-facts';
    for(const [name,value] of [
      ['版本',row.version],['作者',row.manifest.author],['来源',row.manifest.source],
      ['适用网站',row.manifest.siteOrigins.join('、')],
      ['所需权限',row.manifest.permissions.join('、')],
      ['验证状态',states[row.stage] || row.stage]]){
      const fact=doc.createElement('div');fact.className='catalog-reader-fact';
      const key=doc.createElement('span');key.textContent=name;
      const val=doc.createElement('strong');val.textContent=value;
      fact.append(key,val);meta.append(fact);
    }
    const advanced=doc.createElement('details');
    const summary=doc.createElement('summary');summary.textContent='高级：版本和源码校验身份';
    const hashes=doc.createElement('pre');
    hashes.textContent=`源码 SHA-256：${row.manifest.program.sourceHash}\nManifest SHA-256：${row.manifestHash}`;
    advanced.append(summary,hashes);
    const note=doc.createElement('p');note.className='catalog-reader-note';
    note.textContent=row.stage==='available'
      ? '只有当前确定版本通过本地可信验证后，才可明确安装。浏览器网站权限仍需单独批准。'
      : '此任务尚未达到本地可安装状态；导入与作者自述不构成可信审核结果。';
    reader.append(heading,subtitle,meta,advanced,note);
    update();
  }
  async function refresh(preferred,{skipUnchanged=false}={}) {
    const seq=++catalogSequence;
    const result=await client.request('listTaskCatalog',{});
    if(disposed||seq!==catalogSequence)return;
    if(skipUnchanged&&JSON.stringify([catalog,installed])===JSON.stringify([result.catalog,result.installed]))return;
    catalog=result.catalog;installed=result.installed;
    renderInstalled();renderCatalog(preferred);renderLocalDiscovery();
  }
  async function refreshHistory() {
    const seq=++historySequence,row=installedRow();
    if(!row){
      get('task-history').textContent='';
      get('task-history-panel').hidden=true;
      get('task-result-panel').hidden=true;
      return;
    }
    const view=await client.controller.snapshotControllerRun({});
    if(disposed||seq!==historySequence||installedRow()?.taskId!==row.taskId)return;
    const runs=view.runs.filter(value=>value.revision?.scriptId===row.scriptId).slice(-8).reverse();
    const matching=view.results.filter(value=>value.revision?.scriptId===row.scriptId);
    const history=get('task-history');
    history.replaceChildren();
    if(!runs.length){
      history.textContent='';
      get('task-history-panel').hidden=true;
      get('task-result-panel').hidden=true;
      return;
    }
    const list=doc.createElement('div');list.className='task-history-entries';
    for(const [index,run] of runs.entries()){
      const result=matching.find(value=>value.runId===run.runId);
      const state=runStateNames[run.state]||run.state||'状态待确认';
      const entry=doc.createElement('details');entry.className='task-history-entry';
      const summary=doc.createElement('summary');
      summary.textContent=`${state} · 最近第 ${index+1} 次`;
      const output=doc.createElement('pre');
      output.textContent=result
        ? result.outcome?.ok?textValue(decodeValue(result.outcome.valueWire)):
          `${result.outcome?.error?.code || 'E_TASK'}：${result.outcome?.error?.message || '执行失败'}`
        :'结果尚未交付或受权限限制';
      const technical=doc.createElement('details');technical.className='task-history-tech';
      const technicalHeading=doc.createElement('summary');technicalHeading.textContent='技术信息';
      const technicalContent=doc.createElement('pre');
      technicalContent.textContent=`runId：${run.runId}\n状态：${run.state}\n版本：${run.revision?.revision??'未知'}`;
      technical.append(technicalHeading,technicalContent);
      entry.append(summary,output,technical);list.append(entry);
    }
    history.append(list);
    get('task-history-panel').hidden=false;
    get('task-result-panel').hidden=false;
    const latest=matching.find(value=>value.runId===runs[0].runId);
    get('task-result').textContent=latest
      ?latest.outcome?.ok?textValue(decodeValue(latest.outcome.valueWire)):
        `${latest.outcome?.error?.code || 'E_TASK'}：${latest.outcome?.error?.message || '执行失败'}`
      :'最近一次运行尚无可显示结果';
    if(activeRunId&&identity(row)===runOwnerKey&&runs.some(value=>value.runId===activeRunId)){
      const live=matching.find(value=>value.runId===activeRunId);
      if(live)setTaskNotice(identity(row),`本次任务：${runStateNames[live.state]||live.state}`);
    }
    update();
  }
  async function createCandidate() {
    const id=get('script-id').value.trim(),revision=Number(get('script-revision').value);
    if(!id || id.startsWith('task:') || !Number.isSafeInteger(revision)||revision<1)
      throw {code:'E_REVISION',message:'请先保存普通程序版本'};
    const captured=currentPageTarget.capture(); // Freeze site before first await.
    const saved=await client.controller.getControllerScript({scriptId:id,revision});
    if(get('script-id').value.trim()!==id || Number(get('script-revision').value)!==revision ||
      saved.sourceUtf8!==editorSource())
      throw {code:'E_REVISION',message:'脚本版本或编辑内容已变化，请重新确认并保存'};
    const manifest={format:'opendesk.task.v1',taskId:get('task-dev-id').value.trim(),
      version:get('task-dev-version').value.trim(),title:get('task-dev-title').value.trim(),
      description:get('task-dev-description').value.trim(),author:get('task-dev-author').value.trim(),
      source:'local-developer',siteOrigins:[new URL(captured.url).origin],
      permissions:['page.automation'],entryFormat:'async-main',
      program:{revision:saved.revision,sourceHash:await digestUtf8(saved.sourceUtf8)},
      paramsSchema:JSON.parse(get('task-dev-schema').value)};
    const pkg=await createTaskPackage(manifest,saved.sourceUtf8);
    await currentPageTarget.revalidate(captured); // Reject wrong-site candidate after async work.
    const value=await client.request('importTaskPackage',{package:pkg});
    await refresh(identity(value));announce();
    get('task-dev-status').textContent=`已创建待验证候选 ${identity(value)}；请先运行相同源码并提供真实 runId`;
    navigate('catalog');
  }
  async function readFile() {
    const file=get('task-package-file').files?.[0];
    if(!file)return;
    // Capture the File first, then allow the same file to be selected again
    // after either a successful import or a rejected/failed handoff.
    get('task-package-file').value='';
    if(file.size>PROGRAM_DRAFT_LIMIT)throw {code:'E_LIMIT',message:'文件超过程序草稿包大小上限'};
    const sourceUtf8=await file.text();
    const parsed=file.name.toLowerCase().endsWith('.js') ? null : JSON.parse(sourceUtf8);
    const project=parsed?.format===PROGRAM_DRAFT_FORMAT ? await validateProgramDraft(parsed) : null;
    if(!project && file.size>100000)throw {code:'E_LIMIT',message:'文件超过任务包大小上限'};
    if(project || file.name.toLowerCase().endsWith('.js')) {
      const draft=project || sourceUtf8;
      if(catalogSurface) {
        const response=await api.runtime.sendMessage({protocol:'opendesk.sidebar.draft-import.v1',
          ...(project ? {draft} : {sourceUtf8})}).catch(error=>{
          const message=error?.message || String(error);
          if(message.includes('Receiving end does not exist'))return;
          throw {code:'E_DRAFT_TRANSPORT',message};
        });
        if(!response?.ok)throw response?.error || {code:'E_HOST_NOT_FOUND',message:'请在同一窗口打开 Sidebar，再重新导入 JavaScript 草稿'};
        get('task-catalog-status').textContent='已导入同窗口 Sidebar 的未保存草稿；返回目标网页，在「开发」明确运行。未保存、未安装、未自动执行。';
        return;
      }
      if(importDraft)await importDraft(draft);
      else {
        get('script-id').value=`import-${Date.now()}`;
        get('script-revision').value='';
        get('script-source').value=sourceUtf8;
        get('script-source').dispatchEvent(new Event('input',{bubbles:true}));
      }
      navigate('develop');
      get('task-dev-status').textContent='JavaScript 已进入未保存草稿；不能跳过任务验证直接安装';
    }else{
      const value=await client.request('importTaskPackage',{package:parsed});
      await refresh(identity(value));announce();
      get('task-catalog-status').textContent=`已导入待验证任务 ${identity(value)}；未自动赋予可信状态`;
    }
  }
  function run(event) {
    if(!event.isTrusted||disposed||running||working||host.currentRun)return;
    let chosen,params,site,permission,captured;
    try {
      chosen=installedRow();const info=candidateFor(chosen);
      if(!chosen?.enabled||info?.stage!=='available')throw {code:'E_PERMISSION',message:'当前任务未启用或不可安装'};
      captured=currentPageTarget.capture();
      site=new URL(captured.url).origin;
      if(!info.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'此任务不适用于当前网站'};
      params=paramsFromForm(info.manifest.paramsSchema);
      chosen={...chosen,manifestHash:info.manifestHash,title:info.manifest.title};
      // The native permission request must begin within the trusted click.
      permission=api.permissions.request({origins:[permissionPattern(captured.url)]});
    }catch(error){fail(error);return;}
    running=true;activeRunId=null;runOwnerKey=identity(chosen);runOwnerTitle=chosen.title||chosen.taskId;
    get('task-result-panel').hidden=true;update();
    setTaskNotice(runOwnerKey,'正在授权并重新验证冻结的目标网页');
    (async()=>{
      if(!await permission)throw {code:'E_PERMISSION',message:'用户拒绝了网站授权'};
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭'};
      await currentPageTarget.revalidate(captured);
      const resolved=await client.request('resolveInstalledTask',{taskId:chosen.taskId});
      await currentPageTarget.revalidate(captured); // Close resolve -> start document race.
      if(resolved.taskId!==chosen.taskId || resolved.version!==chosen.version || resolved.manifestHash!==chosen.manifestHash)
        throw {code:'E_REVISION',message:'安装的任务版本已改变，请重新选择'};
      if(!resolved.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'安装网站权限不匹配'};
      const claim=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,
          contentHash:resolved.contentHash},params,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},
        deadlineAt:Date.now()+30000});
      activeRunId=claim.runId;
      setTaskNotice(runOwnerKey,`运行中：${resolved.manifest.title} · v${resolved.version}`);
      update(); // Expose the owning Stop immediately; do not rely on a later host event.
      await host.completion;
    })().catch(error=>setTaskNotice(identity(chosen),`${error?.code||'E_TASK'}：${error?.message||error}`)).finally(async()=>{
      running=false;
      if(disposed)return;
      renderTaskStatus();update(); // Retire the visible Stop without waiting for history RPC.
      try{await refreshHistory();}catch(error){fail(error);}
      renderTaskStatus();update();
    });
  }
  async function verify() {
    const row=candidate();
    if(!row)throw {code:'E_SCHEMA',message:'先选择候选'};
    const runId=get('task-verify-run').value.trim()||get('script-run-id').value.trim();
    if(!runId)throw {code:'E_VERIFICATION',message:'需要真实运行的 runId'};
    const result=await client.request('verifyTaskCandidate',{taskId:row.taskId,version:row.version,runId});
    await refresh(identity(result));announce();
    get('task-catalog-status').textContent=`${identity(result)}：已核对本机持久运行及页面原生回执；不代表第三方审核`;
  }
  async function publish() {
    const row=candidate();if(!row)throw {code:'E_SCHEMA',message:'先选择候选'};
    const value=await client.request('makeTaskAvailable',{taskId:row.taskId,version:row.version,manifestHash:row.manifestHash});
    await refresh(identity(value));announce();get('task-catalog-status').textContent=`${identity(value)} 已成为本地可安装版本`;
  }
  async function install() {
    const row=candidate();if(!row)throw {code:'E_SCHEMA',message:'先选择任务'};
    const previous=installed.find(value=>value.taskId===row.taskId);
    const installedTask=await client.request('installTask',{taskId:row.taskId,version:row.version,
      manifestHash:row.manifestHash,expectedInstalledVersion:previous?.version ?? null});
    await refresh(identity(row));announce();
    get('task-status').textContent=`已安装 ${installedTask.taskId} · v${installedTask.version}`;
    const installedMessage=`已安装「${row.manifest.title}」v${installedTask.version}。返回目标网页，在 Sidebar「我的任务」填写参数并运行。`;
    get('task-catalog-status').textContent=installedMessage;
    get('task-install-feedback').textContent=installedMessage;
    // The full-page catalog has no visible Sidebar tabs/dock. Never navigate
    // it to a hidden task pane after installation.
    if(!catalogSurface)navigate('tasks');
  }
  async function toggle() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择已安装任务'};
    await client.request('setInstalledTaskEnabled',{taskId:row.taskId,version:row.version,enabled:!row.enabled});
    await refresh();announce();get('task-status').textContent=row.enabled?'任务已停用':'任务已重新启用';
  }
  async function uninstall() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择已安装任务'};
    await client.request('uninstallTask',{taskId:row.taskId,version:row.version});
    await refresh();announce();get('task-status').textContent='已卸载确定版本；历史结果仍可保留';
  }
  async function fork() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择任务'};
    const value=await client.request('getTaskCandidate',{taskId:row.taskId,version:row.version});
    if(importDraft)await importDraft(value.package.sourceUtf8);
    else {
      get('script-id').value=`draft-${row.taskId}-${Date.now()}`;
      get('script-revision').value='';
      get('script-source').value=value.package.sourceUtf8;
      get('script-source').dispatchEvent(new Event('input',{bubbles:true}));
    }
    navigate('develop');
    get('task-dev-status').textContent='已复制独立未保存草稿；原已安装版本未变化';
  }
  const asyncAction=fn=>async()=>{
    if(working||disposed)return;
    working=true;update();
    try{await fn();}catch(error){fail(error);}finally{working=false;update();}
  };
  const tabOrder=[['tasks','tab-my-tasks'],['discover','tab-discover'],['develop','tab-develop']];
  for(const [index,[tab,id]] of tabOrder.entries()){
    listen(get(id),'click',()=>{
      navigate(tab);
      if(tab==='tasks'||tab==='discover')refresh(undefined,{skipUnchanged:true}).catch(fail);
    });
    listen(get(id),'keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabOrder.length;
      else if(event.key==='ArrowLeft')next=(index+tabOrder.length-1)%tabOrder.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabOrder.length-1;
      else return; // Enter/Space retain native button activation.
      event.preventDefault();
      navigate(tabOrder[next][0]);
      get(tabOrder[next][1]).focus?.({preventScroll:true});
      if(tabOrder[next][0]==='tasks'||tabOrder[next][0]==='discover')
        refresh(undefined,{skipUnchanged:true}).catch(fail);
    });
  }
  listen(get('open-catalog'),'click',()=>navigate('catalog'));
  listen(get('local-discover-open-catalog'),'click',()=>navigate('catalog'));
  listen(get('local-discover-search'),'input',()=>{
    localQuery=get('local-discover-search').value.trim().toLocaleLowerCase();
    renderLocalDiscovery();
  });
  for(const value of ['current','all','disabled'])
    listen(get('local-filter-'+value),'click',()=>{
      localFilter=value;renderLocalDiscovery();
    });
  listen(get('task-search'),'input',()=>{
    catalogQuery=get('task-search').value.trim().toLocaleLowerCase();
    renderCatalogCards();
  });
  listen(get('task-categories'),'click',event=>{
    const selected=event.target.closest?.('button[data-catalog-filter]');
    if(!selected)return;
    catalogFilter=selected.dataset.catalogFilter;
    for(const button of get('task-categories').querySelectorAll('button[data-catalog-filter]'))
      button.classList.toggle('selected',button.dataset.catalogFilter===catalogFilter);
    renderCatalogCards();
  });
  listen(get('task-params-form'),'submit',event=>event.preventDefault());
  listen(get('task-installed-list'),'change',renderInstalledSelection);
  listen(get('task-catalog-list'),'change',renderCandidate);
  listen(get('task-run'),'click',run);
  listen(get('task-stop'),'click',asyncAction(()=>activeRunId && host.currentRun===activeRunId?
    host.stop({runId:activeRunId,controller:true}):Promise.resolve()));
  listen(get('task-refresh'),'click',asyncAction(()=>refresh()));
  listen(get('task-catalog-refresh'),'click',asyncAction(()=>refresh()));
  listen(get('task-create-candidate'),'click',asyncAction(createCandidate));
  listen(get('task-package-file'),'change',asyncAction(readFile));
  listen(get('task-verify'),'click',asyncAction(verify));
  listen(get('task-publish'),'click',asyncAction(publish));
  listen(get('task-install'),'click',asyncAction(install));
  listen(get('task-toggle'),'click',asyncAction(toggle));
  listen(get('task-uninstall'),'click',asyncAction(uninstall));
  listen(get('task-fork-draft'),'click',asyncAction(fork));
  const unsubscribePage=currentPageTarget?.subscribe(next=>{
    currentPage=next;update();renderLocalDiscovery();
  });
  const unsubscribeRun=host.subscribe(value=>{
    if(disposed)return;
    if(value?.runId&&value.runId===activeRunId) {
      setTaskNotice(runOwnerKey,`任务状态：${runStateNames[value.state]||value.state||'运行中'}`);
      if(terminal.has(value.state))refreshHistory().catch(fail);
    }
    renderTaskStatus();update();
  });
  const unsubscribeConn=client.subscribeConnection?.(state=>{if(state.connected)refresh().catch(fail);});
  client.ready.then(()=>refresh()).catch(fail);
  navigate('tasks');update();
  return {navigate,showCatalogPage,refresh,focusInstalledTask(taskId) {
    const selectedRow=installed.find(row=>row.taskId===taskId && row.enabled);
    if(disposed||!selectedRow)return false;
    get('task-installed-list').value=taskId;
    renderInstalledSelection();navigate('tasks');
    return true;
  },receiveDraft(sourceUtf8) {
    if(disposed || catalogSurface || typeof importDraft !== 'function')throw {code:'E_HOST_NOT_FOUND',message:'Sidebar 编辑器不可用'};
    const applied=importDraft(sourceUtf8);
    if(applied?.then)return applied.then(() => {if(!disposed)navigate('develop');});
    navigate('develop');
  },dispose() {
    if(disposed)return;disposed=true;
    unsubscribePage?.();unsubscribeRun?.();unsubscribeConn?.();
    for(const {node,event,fn} of listeners)node.removeEventListener(event,fn);
    listeners.length=0;updates?.close?.();
  }};
}

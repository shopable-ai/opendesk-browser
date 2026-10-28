(() => {
  'use strict';
  const tool = globalThis.OpenDeskTool;
  const root = tool.root;
  const el = id => root.querySelector('#' + id);
  const pendingEditors=new Set();
  const sdk = globalThis.ScrapyAppSdk.createSdk((operation, payload) => tool.request(operation, payload));
  let draftValid = true, editing = false, shownConfig = '', shownTarget, shownRows, shownEditorConfig='';
  let shownEpoch = 0, shownProfiles = '', naming = null, actionFocus;
  const restoreActionFocus = () => {
    const target = typeof actionFocus === 'string' ? root.querySelector(actionFocus) : actionFocus;
    const folded = target?.closest?.('details:not([open])');
    (folded?.querySelector('summary') || target)?.focus?.();
  };
  function message(id, text) {el(id).textContent = text; el(id).hidden = !text;}
  function render(state) {
    const busy = state.phase === 'starting' || (Boolean(state.clientRequestId) && !state.retired);
    if (shownEpoch !== state.profileEpoch) {
      shownEpoch = state.profileEpoch; pendingEditors.clear(); draftValid = true;
      shownConfig = ''; shownEditorConfig = ''; message('config-error','');
      for (const id of ['field-key','field-selector','field-attr']) el(id).value = '';
      el('field-read').value = 'text';
    }
    const locked = busy || state.saving || Boolean(naming) || Boolean(state.pendingAction);
    const managementLocked = locked || !state.storageReady || Boolean(state.conflict);
    const profiles = JSON.stringify([state.records.map(({id,name})=>({id,name})),state.selectedId,managementLocked]);
    if (profiles !== shownProfiles) {
      shownProfiles = profiles; el('profile-list').replaceChildren();
      for (const row of state.records) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.name;
        button.setAttribute('data-profile-id',row.id); button.setAttribute('aria-pressed',String(row.id === state.selectedId));
        button.disabled = managementLocked;
        button.addEventListener('click',()=>{actionFocus='[data-profile-id="'+row.id+'"]';app.selectProfile(row.id);
          if(app.state.pendingAction)el('profile-confirm-cancel').focus?.();}); el('profile-list').append(button);
      }
    }
    const current = state.records.find(row=>row.id === state.selectedId);
    el('profile-current').textContent = (current?.name || '未保存配置') + (state.dirty ? ' · 未保存' : '');
    const fieldCount = Object.keys(state.config.itemConfig).filter(key=>!key.startsWith('_')).length;
    el('config-summary').textContent = fieldCount+' 个字段 · '+(state.config.nextPageSelector ? '分页' : '当前页')+(state.config.detail ? ' + 详情' : '');
    el('new-profile').disabled = managementLocked;
    el('copy-profile').disabled = managementLocked || !draftValid || Boolean(pendingEditors.size);
    el('rename-profile').disabled = managementLocked || !current || state.dirty;
    el('delete-profile').disabled = managementLocked || !current;
    el('profile-confirm').hidden = !state.pendingAction;
    const action = state.pendingAction;
    el('profile-confirm-text').textContent = !action ? '' : action.type === 'delete'
      ? '确认删除「'+current.name+'」？'+(state.dirty?'未保存的 JSON 或未应用编辑也将丢弃。':'')
      : '未保存的 JSON 或未应用编辑将丢弃。确认'+({new:'新建配置',select:'切换配置',saved:'用远端完整列表替换草稿'}[action.type])+'？';
    el('profile-confirm-accept').disabled = busy || state.saving;
    el('profile-confirm-cancel').disabled = busy || state.saving;
    el('profile-naming').hidden = !naming;
    el('profile-name').disabled = busy || state.saving;
    el('profile-name-submit').disabled = busy || state.saving;
    el('profile-name-cancel').disabled = busy || state.saving;
    const config = JSON.stringify(state.config, null, 2);
    if(!editing && !pendingEditors.size && config!==shownEditorConfig){
      shownEditorConfig=config;
      const c=state.config,d=c.detail;
      el('list-container').value=c.itemConfig._listContainer||'';el('list-item').value=c.itemConfig._listItem||'';
      el('field-summary').textContent='已有字段：'+Object.keys(c.itemConfig).filter(k=>!k.startsWith('_')).join('、');
      el('next-selector').value=c.nextPageSelector||'';el('max-pages').value=c.maxPages??5;el('dedupe-key').value=c.dedupeKey||'';
      el('detail-enabled').checked=Boolean(d);el('detail-url-field').value=d?.urlField||'';el('detail-id-field').value=d?.identityField||'';
      el('detail-fields').value=JSON.stringify(d?.itemConfig||{},null,2);el('detail-numbers').value=(d?.numberFields||[]).join(',');
    }
    for(const id of ['list-container','list-item','field-key','field-selector','field-read','apply-field','next-selector','max-pages','dedupe-key','detail-enabled','detail-url-field','detail-id-field','detail-fields','detail-numbers','apply-crawl'])el(id).disabled=locked||!draftValid;
    el('field-attr').disabled=locked||!draftValid||el('field-read').value!=='attr';
    if(shownRows!==state.result?.data){
      shownRows=state.result?.data;const rows=Array.isArray(shownRows)?shownRows:[];
      el('record-summary').textContent=Array.isArray(shownRows)?'共 '+rows.length+' 条记录'+(rows.length>50?'，表格显示前 50 条；完整记录见 JSON / 下载':''):'尚无记录';
      const table=el('record-table');table.replaceChildren();
      if(rows.length){
        const allKeys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
        const keys=allKeys.includes('title')?['title',...allKeys.filter(key=>key!=='title')]:allKeys;
        const head=document.createElement('thead'),tr=document.createElement('tr');
        for(const key of keys){const th=document.createElement('th');th.scope='col';th.textContent=key;tr.append(th);}head.append(tr);table.append(head);
        const body=document.createElement('tbody');
        for(const row of rows.slice(0,50)){const line=document.createElement('tr');for(const key of keys){const td=document.createElement('td'),value=row[key];td.textContent=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);line.append(td);}body.append(line);}table.append(body);
      }
    }
    if (!editing && config !== shownConfig) {el('config-json').value = config; shownConfig = config; el('target-url').value = state.config.url;}
    if (shownTarget !== state.target) {
      shownTarget = state.target; el('target-url').value = state.config.url;
      el('page-title').textContent = state.target?.title || '当前网页不可用';
    }
    let targetMatches = false;
    try {targetMatches = Boolean(state.target) && new URL(state.config.url).origin === new URL(state.target.url).origin;} catch {}
    el('start').disabled = locked || state.phase === 'unknown' || !targetMatches || !draftValid || Boolean(pendingEditors.size);
    el('stop').disabled = !busy || state.retired || state.stopAccepted;
    el('save-config').disabled = managementLocked || !draftValid || Boolean(pendingEditors.size);
    el('save-config').textContent = state.saving ? '保存中…' : state.dirty || !draftValid ? '保存配置 · 未保存' : '保存配置';
    el('config-json').disabled = locked || Boolean(pendingEditors.size);
    el('target-url').disabled = locked || Boolean(pendingEditors.size);
    el('load-config').disabled = locked;
    el('use-saved').disabled = locked;
    el('refresh-run').disabled = !state.clientRequestId || state.retired;
    el('download-json').disabled = state.result == null;
    el('download-csv').disabled = !Array.isArray(state.result?.data);
    el('export-actions').hidden = state.result == null;
    const rows = Array.isArray(state.result?.data) ? state.result.data : [];
    el('record-scroll').hidden = !rows.length;
    el('table-help').hidden = !rows.length;
    el('result-empty').hidden = rows.length > 0;
    el('result-empty').textContent = state.result == null
      ? busy ? '采集中，记录将在任务返回后显示。' : '开始采集后，在这里查看记录和下载结果。'
      : Array.isArray(state.result.data) ? '本次结果没有记录，可展开运行详情查看原因。' : '本次结果没有表格数据，可查看原始结果或下载完整 JSON。';
    let status = targetMatches ? '准备采集' : '请确认采集目标', tone = '';
    if (state.phase === 'unknown') {status = '运行状态待确认'; tone = 'error';}
    else if (state.phase === 'starting') status = '正在准备采集…';
    else if (busy) status = state.stopRequested ? '正在停止 · 等待原实例退出' : '正在采集…';
    else if (state.retired) {
      const host = state.snapshot?.status, engine = state.result?.engine?.status;
      if (host === 'completed' && engine === 'completed' && state.result?.list?.engine?.status !== 'partial') {status = '采集完成'; tone = 'success';}
      else if (engine === 'partial' || state.result?.list?.engine?.status === 'partial') status = '采集结束 · 含部分结果';
      else if (['stopped','cancelled'].includes(host) || engine === 'cancelled') status = '采集已停止';
      else {status = '采集结束 · 请查看运行详情'; tone = 'error';}
    }
    el('run-summary').textContent = status;
    el('run-summary').setAttribute('data-tone',tone);
    let help = '';
    if (state.phase === 'unknown') help = '开始结果未知，请刷新原实例状态；不要重复开始。';
    else if (!draftValid) help = '完整 JSON 有误，请展开「编辑采集规则 → 高级 · 完整 JSON」修正。';
    else if (pendingEditors.size) help = '有未应用的'+[pendingEditors.has('fields')?'字段':'',pendingEditors.has('crawl')?'分页与详情':''].filter(Boolean).join('、')+'编辑，请先点击对应的「应用」按钮。';
    else if (!state.target) help = '请先打开目标网页，再刷新当前网页。';
    else if (!busy && !targetMatches) help = '目标网址与当前网页不同源，请切换到目标网站后刷新当前网页。';
    else if (state.saving) help = '正在保存配置，请稍候。';
    else if (naming || state.pendingAction) help = '请先完成或取消上方的配置操作。';
    message('run-help', help);
    el('config-json').setAttribute('aria-invalid',String(!draftValid));
    el('host-status').textContent = state.host;
    el('engine-status').textContent = state.engine;
    el('stop-status').textContent = state.stopAccepted ? '已受理' : state.stopRequested ? '已请求，等待确认' : '未请求';
    el('retired-status').textContent = state.retired ? '已确认退休' : busy ? '尚未确认' : '尚无运行';
    el('result').textContent = state.snapshot ? JSON.stringify(state.snapshot, null, 2) : '尚无结果';
    el('run-profile').textContent = state.runProfile ? '本次运行配置：'+state.runProfile.name : '尚无运行';
    message('app-error', state.error); message('app-notice', state.notice);
    el('conflict').hidden = state.storageReady && !state.conflict;
    el('use-saved').hidden = !state.conflict;
    tool.setState?.({dirty: state.dirty || !draftValid || Boolean(pendingEditors.size) || Boolean(naming), busy: busy || state.saving});
  }
  const app = globalThis.ScrapyAppModel.createApp(sdk, render);
  el('config-json').addEventListener('input', () => {
    editing = true;
    try {
      app.edit(JSON.parse(el('config-json').value)); el('target-url').value = app.state.config.url;
      draftValid = true; message('config-error', '');
    } catch (error) {draftValid = false; app.touch(); message('config-error', error.message);}
    editing = false; shownConfig = JSON.stringify(app.state.config, null, 2); render(app.state);
  });
  el('target-url').addEventListener('change', () => {
    try {app.edit({...JSON.parse(el('config-json').value), url: el('target-url').value}); draftValid = true; message('config-error', '');}
    catch (error) {draftValid = false; app.touch(); message('config-error', error.message);}
    render(app.state);
  });
  function updateConfig(which,change){
    try{
      const config=change(JSON.parse(el('config-json').value));app.edit(config);
      pendingEditors.delete(which);draftValid=true;shownConfig='';shownEditorConfig='';message('config-error','');render(app.state);
      message('app-notice',pendingEditors.size?'当前部分已应用，请继续应用另一处编辑':'配置已应用；点击开始采集运行，或保存配置');
    }catch(error){message('config-error',error.message);}
  }
  for(const [which,ids] of [['fields',['list-container','list-item','field-key','field-selector','field-read','field-attr']],['crawl',['next-selector','max-pages','dedupe-key','detail-enabled','detail-url-field','detail-id-field','detail-fields','detail-numbers']]]){
    for(const id of ids)el(id).addEventListener('input',()=>{pendingEditors.add(which);app.touch();message('app-notice','请先点击应用字段，或应用分页与详情，再运行或保存');});
  }
  el('field-read').addEventListener('change',()=>{el('field-attr').disabled=el('field-read').value!=='attr';});
  el('apply-field').addEventListener('click',()=>updateConfig('fields',c=>{
    const key=el('field-key').value.trim(),selector=el('field-selector').value.trim();
    if((key||selector)&&(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||!selector))throw new Error('请填写字段名与 CSS 选择器');
    const itemConfig={...c.itemConfig};
    for(const [id,name] of [['list-container','_listContainer'],['list-item','_listItem']]){
      if(el(id).value.trim())itemConfig[name]=el(id).value.trim();else delete itemConfig[name];
    }
    const read=el('field-read').value;
    const attr=el('field-attr').value.trim();
    if(key){
      if(read==='attr'&&!/^[\w:-]+$/.test(attr))throw new Error('请填写有效属性名');
      itemConfig[key]=selector+'::'+(read==='attr'?attr:'text');
    }
    return {...c,itemConfig};
  }));
  el('apply-crawl').addEventListener('click',()=>updateConfig('crawl',c=>{
    const next=el('next-selector').value.trim(),key=el('dedupe-key').value.trim();
    delete c.nextPageSelector;delete c.maxPages;delete c.dedupeKey;
    if(next){c.nextPageSelector=next;c.maxPages=Number(el('max-pages').value);}
    if(key)c.dedupeKey=key;
    if(el('detail-enabled').checked){
      c.detail={...(c.detail||{}),urlField:el('detail-url-field').value.trim(),identityField:el('detail-id-field').value.trim(),
        itemConfig:JSON.parse(el('detail-fields').value),numberFields:el('detail-numbers').value.split(',').map(k=>k.trim()).filter(Boolean)};
    }else delete c.detail;
    return c;
  }));
  el('refresh-target').addEventListener('click', () => app.refreshTarget());
  el('start').addEventListener('click', () => app.start(el('target-url').value));
  el('stop').addEventListener('click', () => app.stop());
  function openNaming(type, source) {
    actionFocus=el(source); naming=type; const current=app.state.records.find(row=>row.id===app.state.selectedId);
    el('profile-name').value = type === 'rename' ? current.name : type === 'copy' ? (current?.name || '配置')+' 副本' : '';
    el('profile-name-heading').textContent = type === 'rename' ? '重命名配置' : type === 'copy' ? '保存独立副本' : '保存新配置';
    message('profile-name-error',''); render(app.state); el('profile-name').focus?.();
  }
  function closeNaming() {naming=null; render(app.state); restoreActionFocus();}
  el('save-config').addEventListener('click', () => app.state.selectedId ? app.save() : openNaming('save','save-config'));
  el('copy-profile').addEventListener('click',()=>openNaming('copy','copy-profile'));
  el('rename-profile').addEventListener('click',()=>openNaming('rename','rename-profile'));
  el('profile-name-cancel').addEventListener('click',closeNaming);
  async function submitName() {
    const method={save:'save',copy:'copyProfile',rename:'renameProfile'}[naming];
    if (!method) return;
    const success=await app[method](el('profile-name').value);
    if (success) closeNaming(); else {message('profile-name-error',app.state.error); el('profile-name').focus?.();}
  }
  el('profile-name-submit').addEventListener('click',submitName);
  el('profile-name').addEventListener('keydown',event=>{
    if(event.key==='Enter' && !event.isComposing){event.preventDefault();submitName();}
  });
  for (const [id,method] of [['new-profile','newProfile'],['delete-profile','deleteProfile']])
    el(id).addEventListener('click',()=>{actionFocus=el(id);app[method]();if(app.state.pendingAction)el('profile-confirm-cancel').focus?.();});
  el('profile-confirm-cancel').addEventListener('click',()=>{app.cancelAction();restoreActionFocus();});
  el('profile-confirm-accept').addEventListener('click',async()=>{await app.confirmAction();el('profile-current').focus?.();});
  root.addEventListener('keydown',event=>{
    if (event.key !== 'Escape' || app.state.saving) return;
    if (naming) {event.preventDefault();closeNaming();}
    else if (app.state.pendingAction) {event.preventDefault();app.cancelAction();restoreActionFocus();}
  });
  el('load-config').addEventListener('click', () => app.load());
  el('use-saved').addEventListener('click', () => {
    actionFocus=el('use-saved'); app.useSaved();
  });
  el('refresh-run').addEventListener('click', () => app.refresh());
  el('download-json').addEventListener('click', () => app.download());
  el('download-csv').addEventListener('click', () => app.download('csv'));
  const onPageChanged = () => app.refreshTarget();
  root.addEventListener('opendesk-page-changed', onPageChanged);
  // Poll only real host status; this timer never advances the engine or invents results.
  const timer = setInterval(() => app.refresh(), 1000);
  globalThis.addEventListener('pagehide', () => {
    clearInterval(timer); root.removeEventListener('opendesk-page-changed', onPageChanged); app.dispose();
  }, {once: true});
  render(app.state); app.load(); app.refreshTarget();
})();

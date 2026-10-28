(() => {
  'use strict';
  const tool = globalThis.OpenDeskTool;
  const root = tool.root;
  const el = id => root.querySelector('#' + id);
  const pendingEditors=new Set();
  const sdk = globalThis.ScrapyAppSdk.createSdk((operation, payload) => tool.request(operation, payload));
  let draftValid = true, editing = false, shownConfig = '', shownTarget, shownRows, shownEditorConfig='';
  function message(id, text) {el(id).textContent = text; el(id).hidden = !text;}
  function render(state) {
    const busy = state.phase === 'starting' || (Boolean(state.clientRequestId) && !state.retired);
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
    for(const id of ['list-container','list-item','field-key','field-selector','field-read','apply-field','next-selector','max-pages','dedupe-key','detail-enabled','detail-url-field','detail-id-field','detail-fields','detail-numbers','apply-crawl'])el(id).disabled=state.saving||!draftValid;
    el('field-attr').disabled=state.saving||!draftValid||el('field-read').value!=='attr';
    if(shownRows!==state.result?.data){
      shownRows=state.result?.data;const rows=Array.isArray(shownRows)?shownRows:[];
      el('record-summary').textContent=Array.isArray(shownRows)?'共 '+rows.length+' 条记录'+(rows.length>50?'，表格显示前 50 条；完整记录见 JSON / 下载':''):'尚无记录';
      const table=el('record-table');table.replaceChildren();
      if(rows.length){
        const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
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
    el('start').disabled = busy || state.phase === 'unknown' || !state.target || !draftValid || Boolean(pendingEditors.size);
    el('stop').disabled = !busy || state.retired || state.stopAccepted;
    el('save-config').disabled = state.saving || !draftValid || !state.storageReady || Boolean(state.conflict) || Boolean(pendingEditors.size);
    el('save-config').textContent = state.saving ? '保存中…' : state.dirty || !draftValid ? '保存配置 · 未保存' : '保存配置';
    el('config-json').disabled = state.saving || Boolean(pendingEditors.size);
    el('target-url').disabled = state.saving;
    el('load-config').disabled = state.saving;
    el('use-saved').disabled = state.saving;
    el('refresh-run').disabled = !state.clientRequestId || state.retired;
    el('download-json').disabled = state.result == null;
    el('download-csv').disabled = !Array.isArray(state.result?.data);
    el('host-status').textContent = state.host;
    el('engine-status').textContent = state.engine;
    el('stop-status').textContent = state.stopAccepted ? '已受理' : state.stopRequested ? '已请求，等待确认' : '未请求';
    el('retired-status').textContent = state.retired ? '已确认退休' : busy ? '尚未确认' : '尚无运行';
    el('result').textContent = state.snapshot ? JSON.stringify(state.snapshot, null, 2) : '尚无结果';
    message('app-error', state.error); message('app-notice', state.notice);
    el('conflict').hidden = state.storageReady && !state.conflict;
    el('use-saved').hidden = !state.conflict;
    tool.setState?.({dirty: state.dirty || !draftValid || Boolean(pendingEditors.size), busy: busy || state.saving});
  }
  const app = globalThis.ScrapyAppModel.createApp(sdk, render);
  el('config-json').addEventListener('input', () => {
    editing = true;
    try {
      app.edit(JSON.parse(el('config-json').value)); draftValid = true; message('config-error', '');
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
  el('save-config').addEventListener('click', () => app.save());
  el('load-config').addEventListener('click', () => app.load());
  el('use-saved').addEventListener('click', () => {
    pendingEditors.clear();draftValid = true; shownConfig = ''; shownEditorConfig=''; message('config-error', ''); app.useSaved();
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

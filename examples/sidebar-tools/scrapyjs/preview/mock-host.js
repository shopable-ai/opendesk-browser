/* Offline SDK boundary only. AI review and runner data are explicitly simulated.
   No Chrome, fetch, credentials, persistent storage or real capture. */
(() => {
  'use strict';
  const scenario = globalThis.__opendeskPreviewScenario;
  if (!['success', 'empty', 'error', 'permission-denied', 'loading', 'untrusted'].includes(scenario))
    throw Error('E_SCRAPYJS_PREVIEW_SCENARIO');
  const task = Object.freeze({...globalThis.__opendeskPreviewTask});
  if (task.taskId !== 'scrapyjs.capture' || !task.manifestHash || !task.contentHash)
    throw Error('E_SCRAPYJS_PREVIEW_TASK_IDENTITY');
  const clone = value => JSON.parse(JSON.stringify(value));
  const error = (code, message) => Object.assign(Error('[纯模拟] ' + message), {code});
  const demo = {url: 'http://127.0.0.1:43111/demo-form.html',
    itemConfig: {_listContainer: '#sample-list', _listItem: 'li', title: '.::text'}};
  const douban = {url: 'https://book.douban.com/top250',
    itemConfig: {_listContainer: '.grid_view', _listItem: 'tr.item', title: '.pl2 a::text', rating: '.rating_nums::text'}};
  let value = scenario === 'empty' ? null : {schemaVersion: 1, selectedId: 'demo', records: [
    {id: 'demo', name: scenario === 'untrusted' ? '<img src=x onerror=alert(1)> 默认 demo' : '默认 demo', config: demo},
    {id: 'douban', name: '豆瓣图书', config: douban}
  ]};
  let revision = 1, sequence = 0;
  let runnerValue=null,runnerRevision=0;
  const runs = new Map();
  const localRuns=new Map(),localRequests=new Map(),aiRequests=new Map();
  const aiInfo={provider:'纯模拟 Host（未调用 AI）',model:'模拟配置',endpoint:null,generation:1};
  const etag = () => 'preview-memory-' + revision;
  const terminal = new Set(['completed', 'failed', 'cancelled']);
  function snapshot(run) {
    if (run.state === 'running' && scenario !== 'loading' && Date.now() >= run.finishAt) {
      run.state = scenario === 'error' ? 'failed' : 'completed';
      run.value = scenario === 'error' ? {data: [], engine: {status: 'failed', message: '模拟采集失败'}} : {
        data: scenario === 'empty' ? [] : [{title: scenario === 'untrusted'
          ? '<script>alert("仅文本")</script>' : '模拟记录 A', source: '纯模拟结果，不来自网站'},
        {title: '模拟记录 B', source: '纯模拟结果，不来自网站'}], engine: {status: 'completed'}};
    }
    // A terminal response precedes retirement; keep the original run identity.
    if (terminal.has(run.state)) run.terminalReads++;
    return clone({clientRequestId: run.clientRequestId, runId: run.runId, taskId: task.taskId,
      state: run.state, value: run.value, result: run.value,
      retirementState: run.terminalReads > 1 ? 'released' : 'pending'});
  }
  function mockReview(payload){
    const dialog=document.createElement('dialog');dialog.className='scrapy-local-runner';
    dialog.setAttribute('aria-label','纯模拟 AI 发送审阅');
    dialog.style.cssText='width:calc(100% - 24px);max-width:620px;max-height:90vh;overflow:auto;background:var(--od-paper);color:var(--od-ink);border:1px solid var(--od-line);border-radius:var(--radius-control)';
    const heading=document.createElement('h2');heading.textContent='纯模拟 AI 发送审阅 · 不会发送网络请求';
    const content=document.createElement('pre');content.textContent=JSON.stringify({recipient:aiInfo,request:payload.request,context:payload.context},null,2);
    const accept=document.createElement('button');accept.id='mock-ai-approve';accept.textContent='确认模拟发送';
    const cancel=document.createElement('button');cancel.id='mock-ai-cancel';cancel.textContent='取消模拟发送';
    dialog.append(heading,content,accept,cancel);document.body.append(dialog);
    return new Promise((resolve,reject)=>{
      const finish=approved=>{dialog.close();dialog.remove();aiRequests.set(payload.requestId,{state:approved?'completed':'cancelled'});approved?resolve():reject(error('E_CANCELLED','已取消模拟审阅'));};
      aiRequests.set(payload.requestId,{state:'review',cancel:()=>finish(false)});
      accept.onclick=()=>finish(true);cancel.onclick=()=>finish(false);
      dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();
    });
  }
  function localSnapshot(run){
    const snap=run.snapshot;
    if(run.stoppedAt){snap.status='STOPPED';snap.workerExited=Date.now()-run.stoppedAt>200;snap.stopReason='USER_STOP';snap.previewPassed=false;}
    else if(snap.status!=='COMPLETED'&&snap.status!=='FAILED'){
      const elapsed=Date.now()-run.startedAt;
      snap.status=elapsed<100?'QUEUED':'RUNNING';
      snap.pagesVisited=Math.min(run.pages,Math.floor(elapsed/200));
      snap.recordsCount=scenario==='empty'?0:snap.pagesVisited*2;
      if(scenario!=='loading'&&elapsed>=run.pages*200+150){
        snap.status=scenario==='error'?'FAILED':'COMPLETED';snap.workerExited=true;
        snap.previewPassed=snap.mode==='preview'&&snap.status==='COMPLETED'&&snap.recordsCount>0;
        snap.stopReason=snap.status==='FAILED'?'SIMULATED_ERROR':'SIMULATED_PAGE_LIMIT';
        snap.errors=snap.status==='FAILED'?[{code:'SIMULATED_ERROR',message:'纯模拟采集错误'}]:[];
      }
    }
    snap.completeness=Object.fromEntries(snap.fields.map(field=>[field,{nonEmpty:snap.recordsCount,total:snap.recordsCount,ratio:snap.recordsCount?1:0}]));
    return clone(snap);
  }
  function downloadSimulated(text,filename){
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='SIMULATED-'+filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    return {started:true,simulated:true};
  }
  function localRequest(payload){
    if(payload.method==='POST'&&payload.path==='/v1/runs'){
      const body=payload.body;
      if(!body?.requestId||localRequests.has(body.requestId)||!['preview','full'].includes(body.mode)||
        ![1,2,3].includes(body.previewPages)||payload.targetOrigin!==new URL(body.config.url).origin)
        throw error('E_PREVIEW_IDENTITY','模拟创建身份、页数或 scope 无效');
      if([...localRuns.values()].some(run=>!localSnapshot(run).workerExited))throw error('E_RUN_BUSY','原模拟 worker 尚未退出');
      if(body.mode==='full'){
        const original=localRuns.get(body.previewRunId),preview=original&&localSnapshot(original);
        if(!preview?.previewPassed||!preview.workerExited||preview.configHash!==body.configHash||JSON.stringify(preview.config)!==JSON.stringify(body.config))
          throw error('E_PREVIEW_REQUIRED','模拟试采认证失效');
      }
      const runId='simulated-local-'+(++sequence),fields=Object.keys(body.config.itemConfig).filter(key=>!key.startsWith('_'));
      const hash=body.configHash||'simulated-config-'+runId;
      const run={startedAt:Date.now(),pages:body.mode==='preview'?body.previewPages:Math.min(body.config.maxPages||3,3),snapshot:{
        runId,requestId:body.requestId,previewRunId:body.previewRunId||null,configHash:hash,mode:body.mode,status:'QUEUED',
        pagesVisited:0,recordsCount:0,fields,completeness:{},errors:[],stopReason:null,workerExited:false,previewPassed:false,config:clone(body.config),simulated:true}};
      localRuns.set(runId,run);localRequests.set(body.requestId,runId);return localSnapshot(run);
    }
    const byRequest=payload.path?.match(/^\/v1\/runs\/by-request\/([\w.-]+)$/);
    const path=payload.path?.match(/^\/v1\/runs\/([\w.-]+)(\/stop|\/records\?offset=(\d+)&limit=(\d+))?$/);
    const run=localRuns.get(byRequest?localRequests.get(byRequest[1]):path?.[1]);
    if(!run)throw error('E_RUN_NOT_FOUND','未找到原模拟 run');
    if(byRequest&&payload.method==='GET')return localSnapshot(run);
    if(path?.[2]==='/stop'&&payload.method==='POST'){
      if(!localSnapshot(run).workerExited)run.stoppedAt=Date.now();return localSnapshot(run);
    }
    if(payload.method==='GET'&&path?.[3]){
      const snap=localSnapshot(run),offset=Number(path[3]),limit=Number(path[4]);
      return {records:localRecords(run).slice(offset,offset+limit),total:snap.recordsCount,offset};
    }
    if(payload.method==='GET'&&!path?.[2])return localSnapshot(run);
    throw error('E_PREVIEW_UNSUPPORTED','模拟端点不支持此操作');
  }
  function localRecords(run){
    const snap=localSnapshot(run);
    return Array.from({length:snap.recordsCount},(_,index)=>Object.fromEntries(snap.fields.map(field=>[field,
      scenario==='untrusted'&&index===0?'<script>仅模拟文本</script>':`纯模拟 ${field} · ${index+1}（非网页数据）`])));
  }
  const request = async (operation, payload = {}) => {
    const allowed = ['storage.get', 'storage.set', 'currentPage.info', 'tasks.read',
      'tasks.start', 'tasks.stop', 'browser.downloads.text','ai.info','ai.generate','ai.cancel','localTasks.request','localTasks.export'];
    if (!allowed.includes(operation)) throw error('E_PREVIEW_UNSUPPORTED', '不支持此操作');
    if (scenario === 'permission-denied') throw error('E_PERMISSION_DENIED', '模拟权限不足；不能申请真实权限');
    if(operation==='ai.info')return clone(aiInfo);
    if(operation==='ai.generate'){
      if(payload.providerGeneration!==1||aiRequests.has(payload.requestId))throw error('E_PREVIEW_IDENTITY','模拟 AI 身份无效');
      await mockReview(payload);
      return {requestId:payload.requestId,providerGeneration:1,metadata:{simulated:true,status:'SIMULATED'},
        proposal:scenario==='error'?'模拟无效 JSON':{...clone(payload.context.currentConfig),url:payload.context.page.url}};
    }
    if(operation==='ai.cancel'){
      const current=aiRequests.get(payload.requestId);current?.cancel?.();
      return {requestId:payload.requestId,state:aiRequests.get(payload.requestId)?.state||'cancelled'};
    }
    if(operation==='localTasks.request')return localRequest(payload);
    if(operation==='localTasks.export'){
      const run=localRuns.get(payload.runId);if(!run||!['jsonl','csv'].includes(payload.format))throw error('E_PREVIEW_EXPORT','模拟导出身份无效');
      const records=localRecords(run),fields=run.snapshot.fields;
      const csv=value=>'"'+String(/^[=+@\-\t\r]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';
      const text=payload.format==='jsonl'?records.map(row=>JSON.stringify(row)).join('\n')+'\n':
        [fields,...records.map(row=>fields.map(field=>row[field]))].map(row=>row.map(csv).join(',')).join('\r\n');
      return downloadSimulated(text,'scrapyjs-'+payload.runId+'.'+payload.format);
    }
    if (operation.startsWith('storage.')) {
      if(payload.key==='local-runner-state'){
        if(operation==='storage.get'){
          if(payload.withEtag!==true)throw error('E_PREVIEW_ETAG','读取模拟运行指针需要 ETag');
          return {value:clone(runnerValue),etag:'preview-runner-'+runnerRevision};
        }
        if(payload.ifMatch!=='preview-runner-'+runnerRevision)throw error('E_STORAGE_CONFLICT','模拟运行指针冲突');
        if(new TextEncoder().encode(JSON.stringify(payload.value)).byteLength>8192)throw error('E_PREVIEW_LIMIT','模拟运行指针超限');
        runnerValue=clone(payload.value);runnerRevision++;return {saved:true};
      }
      if (payload.key !== 'capture-config') throw error('E_PREVIEW_KEY', '仅允许本工具存储键');
      if (operation === 'storage.get') {
        if (payload.withEtag !== true) throw error('E_PREVIEW_ETAG', '读取需要 ETag');
        return {value: clone(value), etag: etag()};
      }
      if (payload.ifMatch !== etag()) throw error('E_STORAGE_CONFLICT', '内存版本冲突，未保存');
      if (new TextEncoder().encode(JSON.stringify(payload.value)).byteLength > 8192)
        throw error('E_PREVIEW_LIMIT', '内存配置超过上限');
      value = clone(payload.value); revision++;
      return {saved: true, etag: etag()};
    }
    if (operation === 'currentPage.info') return {status: 'available',
      url: value?.records?.find(row => row.id === value.selectedId)?.config.url || demo.url,
      title: scenario === 'untrusted' ? '<img src=x onerror=alert(1)>' : '离线模拟 demo 网页（未连接真实页面）'};
    if (operation === 'tasks.read' && payload.taskId === task.taskId && !payload.clientRequestId)
      return {task: clone(task)};
    if (operation === 'tasks.start') {
      if (JSON.stringify(payload.task) !== JSON.stringify(task) ||
          typeof payload.clientRequestId !== 'string' || !payload.clientRequestId || !payload.params)
        throw error('E_PREVIEW_IDENTITY', '固定 Task 或请求身份无效');
      const existing = runs.get(payload.clientRequestId);
      if (existing) {
        if (existing.params !== JSON.stringify(payload.params)) throw error('E_PREVIEW_IDENTITY', '禁止复用身份变更参数');
        return snapshot(existing);
      }
      if ([...runs.values()].some(run => run.terminalReads < 2))
        throw error('E_PREVIEW_BUSY', '上次模拟运行尚未退休');
      const run = {clientRequestId: payload.clientRequestId, runId: 'preview-run-' + (++sequence),
        params: JSON.stringify(payload.params), state: 'running', value: null,
        finishAt: Date.now() + 900, terminalReads: 0};
      runs.set(payload.clientRequestId, run);
      return snapshot(run);
    }
    if (operation === 'tasks.read' || operation === 'tasks.stop') {
      const run = runs.get(payload.clientRequestId);
      if (!run) throw error('E_PREVIEW_IDENTITY', '未找到此模拟请求身份');
      if (operation === 'tasks.stop' && !terminal.has(run.state)) run.state = 'cancelled';
      return snapshot(run);
    }
    if (operation === 'browser.downloads.text') {
      if(payload.filename==='scrapyjs-ai-config.json'&&typeof payload.text==='string'&&new TextEncoder().encode(payload.text).byteLength<=150000)
        return downloadSimulated(payload.text,payload.filename);
      const exportable = [...runs.values()].some(run => run.value !== null);
      if (!exportable || typeof payload.text !== 'string' ||
          new TextEncoder().encode(payload.text).byteLength > 150000 ||
          !/^scrapyjs-result\.(json|csv)$/.test(payload.filename))
        throw error('E_PREVIEW_EXPORT', '仅允许下载有界的模拟结果');
      const url = URL.createObjectURL(new Blob([payload.text], {type: 'text/plain;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'SIMULATED-' + payload.filename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return {started: true};
    }
    throw error('E_PREVIEW_UNSUPPORTED', '请求格式无效');
  };
  const root = document.getElementById('tool-root');
  Object.defineProperty(globalThis, 'OpenDeskTool', {value: Object.freeze({root, request})});
})();

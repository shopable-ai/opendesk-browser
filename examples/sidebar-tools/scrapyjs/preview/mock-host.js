/* Offline SDK boundary only. No Chrome, network, persistent storage or capture. */
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
  let aiPending = null, aiRevision = 1;
  const aiRequests = new Map();
  const runs = new Map();
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
  const request = async (operation, payload = {}) => {
    const allowed = ['storage.get', 'storage.set', 'currentPage.info', 'tasks.read',
      'tasks.start', 'tasks.stop', 'browser.downloads.text', 'ai.info', 'ai.generate', 'ai.cancel'];
    if (!allowed.includes(operation)) throw error('E_PREVIEW_UNSUPPORTED', '不支持此操作');
    if (scenario === 'permission-denied') throw error('E_PERMISSION_DENIED', '模拟权限不足；不能申请真实权限');
    if (operation.startsWith('storage.')) {
      if (payload.key === 'ai-pending-request') {
        const etag = 'preview-ai-' + aiRevision;
        if (operation === 'storage.get') return {value: clone(aiPending), etag};
        if (payload.ifMatch !== etag) throw error('E_STORAGE_CONFLICT', 'AI 内存版本冲突');
        if (payload.value !== null && (payload.value?.schemaVersion !== 1 || typeof payload.value.requestId !== 'string'))
          throw error('E_PREVIEW_IDENTITY', 'AI 请求身份无效');
        aiPending = clone(payload.value); aiRevision++;
        return {saved: true};
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
    if (operation === 'ai.info') return {provider: '离线演示', model: '固定示例提案（非模型）', generation: 1};
    if (operation === 'ai.generate') {
      if (payload.providerGeneration !== 1 || payload.requestId !== aiPending?.requestId || aiRequests.has(payload.requestId))
        throw error('E_PREVIEW_IDENTITY', 'AI 原请求身份不符或重复');
      const current = payload.context?.currentConfig;
      if (!current?.itemConfig || typeof payload.request !== 'string') throw error('E_PREVIEW_AI', '缺少配置或需求');
      const operation = {state: 'running'};
      aiRequests.set(payload.requestId, operation);
      await new Promise(resolve => setTimeout(resolve, 700));
      if (operation.state === 'cancelled') throw error('E_CANCELLED', '已停止固定示例提案');
      operation.state = 'completed';
      const config = clone(current);
      config.itemConfig.column_title = clone(config.itemConfig.title || '.::text');
      return {requestId: payload.requestId, providerGeneration: 1, proposal: JSON.stringify(config),
        metadata: {simulation: true, fixedProposal: '仅演示新增 column_title，不理解输入或读取网页'}};
    }
    if (operation === 'ai.cancel') {
      const operation = aiRequests.get(payload.requestId);
      if (!operation) return {requestId: payload.requestId, state: 'unknown'};
      if (operation.state === 'running') operation.state = 'cancelled';
      return {requestId: payload.requestId, state: operation.state};
    }
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
      const exportable = [...runs.values()].some(run => run.value !== null);
      const configExport = /^scrapyjs-ai-config\.json$/.test(payload.filename);
      if ((!exportable && !configExport) || typeof payload.text !== 'string' ||
          new TextEncoder().encode(payload.text).byteLength > 150000 ||
          !/^scrapyjs-(?:result\.(json|csv)|ai-config\.json)$/.test(payload.filename))
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
  const setState = ({dirty = false, busy = false} = {}) => parent.postMessage({
    type: 'scrapyjs-preview-state', dirty: Boolean(dirty), busy: Boolean(busy)
  }, '*');
  let conversation={visible:false,open:false};
  const publishConversation=()=>parent.postMessage({type:'scrapyjs-preview-conversation-state',...conversation},'*');
  const setConversationState=value=>{
    if(!value||typeof value.visible!=='boolean'||typeof value.open!=='boolean'||Object.keys(value).some(key=>!['visible','open'].includes(key)))throw error('E_PREVIEW_CONVERSATION_STATE','无效展示状态');
    conversation={visible:value.visible,open:value.open};publishConversation();
  };
  window.addEventListener('message',event=>{
    if(event.source!==parent)return;
    if(event.data?.type==='scrapyjs-preview-conversation-sync')return publishConversation();
    if(event.data?.type!=='scrapyjs-preview-conversation-action'||event.data.action!=='toggle'||!conversation.visible)return;
    root.dispatchEvent(new CustomEvent('opendesk:conversation-action',{detail:{action:'toggle'}}));
  });
  Object.defineProperty(globalThis, 'OpenDeskTool', {value: Object.freeze({root, request, setState,setConversationState})});
})();

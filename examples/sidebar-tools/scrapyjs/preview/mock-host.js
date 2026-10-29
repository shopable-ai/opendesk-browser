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
      'tasks.start', 'tasks.stop', 'browser.downloads.text'];
    if (!allowed.includes(operation)) throw error('E_PREVIEW_UNSUPPORTED', '不支持此操作');
    if (scenario === 'permission-denied') throw error('E_PERMISSION_DENIED', '模拟权限不足；不能申请真实权限');
    if (operation.startsWith('storage.')) {
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

/* Single integration boundary for the public task API. No tab IDs or executable source. */
(() => {
  'use strict';
  const TASK_ID = 'scrapyjs.capture';
  const STORAGE_KEY = 'capture-config';
  const bytes = text => new TextEncoder().encode(text).byteLength;
  function createSdk(request) {
    let task;
    const project = row => ({...row, status: row.state, result: row.value,
      durableResult: row.result, engineStatus: row.value?.engine?.status,
      accepted: ['stopping', 'cancelled'].includes(row.state),
      retired: row.retirementState === 'released' || (row.state === 'cancelled' && !row.runId)});
    return {
      currentPage: () => request('currentPage.info', {}),
      async prepare() {
        const resolved = await request('tasks.read', {taskId: TASK_ID});
        if (!resolved?.task) throw new Error('请先经原安装审阅链安装固定采集 Task');
        task = resolved.task;
      },
      start: async (config, url, clientRequestId) => {
        if (!task) throw new Error('固定 Task 尚未确认安装身份');
        const configJson = JSON.stringify(config.itemConfig);
        if (bytes(configJson) > 4096) throw new Error('itemConfig 超过 configJson 的 4096 字节上限');
        const {url:configuredUrl,itemConfig,waitForSelector,timeoutMs,...options}=config;
        const optionsJson=JSON.stringify(options);
        if(bytes(optionsJson)>4096)throw new Error('分页、详情与处理配置超过 4096 字节');
        const params = {url: configuredUrl, configJson, optionsJson, waitForSelector: waitForSelector || '', timeoutMs: timeoutMs ?? 30000};
        return project(await request('tasks.start', {task, clientRequestId, params}));
      },
      read: async clientRequestId => project(await request('tasks.read', {clientRequestId})),
      stop: async clientRequestId => project(await request('tasks.stop', {clientRequestId})),
      load: () => request('storage.get', {key: STORAGE_KEY, withEtag: true}),
      async save(value, etag) {
        if (bytes(JSON.stringify(value)) > 8192) throw new Error('配置超过 8192 字节，未保存');
        const result = await request('storage.set', {key: STORAGE_KEY, value, ifMatch: etag});
        if (result?.saved !== true) throw new Error('保存结果未知，请保留草稿并重新读取');
        return result;
      },
      async download(value, format = 'json') {
        if (!['json','csv'].includes(format)) throw new Error('不支持的导出格式');
        let text = JSON.stringify(value, null, 2);
        if (format === 'csv') {
          const data = value.result?.data ?? value.value?.data;
          if (!Array.isArray(data)) throw new Error('结果中没有可导出的记录数组');
          const keys = [...new Set(data.flatMap(row => Object.keys(row)))];
          const cell = v => '"' + String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replaceAll('"','""') + '"';
          text = [keys.map(cell).join(','), ...data.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
          if (!keys.length) throw new Error('没有可导出的字段');
        }
        if (bytes(text) > 150000) throw new Error('完整导出超过 150000 字节，不能导出；未截断结果');
        return request('browser.downloads.text', {text, filename: 'scrapyjs-result.' + format});
      }
    };
  }
  globalThis.ScrapyAppSdk = Object.freeze({TASK_ID, createSdk, bytes});
})();

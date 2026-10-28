/* Single integration boundary for the public task API. No tab IDs or executable source. */
(() => {
  'use strict';
  const TASK_ID = 'scrapyjs.capture';
  const STORAGE_KEY = 'capture-config';
  const bytes = text => new TextEncoder().encode(text).byteLength;
  function createSdk(request) {
    return {
      currentPage: () => request('currentPage.info', {}),
      // Provisional task shape: reconcile here with the platform owner before packaging.
      start: (config, url) => {
        const configJson = JSON.stringify(config.itemConfig);
        if (bytes(configJson) > 4096) throw new Error('itemConfig 超过 configJson 的 4096 字节上限');
        const params = {url: config.url, configJson, waitForSelector: config.waitForSelector || '', timeoutMs: config.timeoutMs ?? 30000};
        return request('tasks.start', {taskId: TASK_ID, params, expectedUrl: url});
      },
      read: runId => request('tasks.read', {runId}),
      stop: runId => request('tasks.stop', {runId}),
      load: () => request('storage.get', {key: STORAGE_KEY, withEtag: true}),
      async save(value, etag) {
        if (bytes(JSON.stringify(value)) > 8192) throw new Error('配置超过 8192 字节，未保存');
        const result = await request('storage.set', {key: STORAGE_KEY, value, ifMatch: etag});
        if (result?.saved !== true) throw new Error('保存结果未知，请保留草稿并重新读取');
        return result;
      },
      async download(value) {
        const text = JSON.stringify(value, null, 2);
        if (bytes(text) > 150000) throw new Error('完整 JSON 超过 150000 字节，不能导出；未截断结果');
        return request('file.download', {text, filename: 'scrapyjs-result.json'});
      }
    };
  }
  globalThis.ScrapyAppSdk = Object.freeze({TASK_ID, createSdk, bytes});
})();

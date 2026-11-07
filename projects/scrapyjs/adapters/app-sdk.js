/* Public fixed Controller / explicit HTTP Task boundary. No tab IDs or executable source. */
(() => {
  'use strict';
  const TASK_ID = 'scrapyjs.capture';
  const STORAGE_KEY = 'capture-config';
  const bytes = text => new TextEncoder().encode(text).byteLength;
  const CATALOG_FORMAT = 'scrapyjs.config-catalog.gzip.v1';
  async function transform(input, stream, limit) {
    const reader = new Blob([input]).stream().pipeThrough(stream).getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {await reader.cancel(); throw new Error(`配置存储超过 ${limit} 字节`);}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {result.set(chunk, offset); offset += chunk.byteLength;}
    return result;
  }
  async function storedCatalog(value) {
    const text = JSON.stringify(value);
    if (bytes(text) <= 8192) return value;
    if (value?.schemaVersion !== 1 || !Array.isArray(value.records)) throw new Error('配置超过 8192 字节，未保存');
    if (bytes(text) > 32768) throw new Error('全部命名配置超过 32768 字节，未保存');
    const packed = await transform(text, new CompressionStream('gzip'), 8192);
    const result = {format: CATALOG_FORMAT, data: btoa(String.fromCharCode(...packed))};
    if (bytes(JSON.stringify(result)) > 8192) throw new Error('压缩后的配置超过 8192 字节，未保存');
    return result;
  }
  async function loadedCatalog(value) {
    if (value?.format !== CATALOG_FORMAT) return value;
    if (Object.keys(value).some(key => !['format','data'].includes(key)) || typeof value.data !== 'string' ||
        bytes(JSON.stringify(value)) > 8192) throw new Error('压缩配置格式无效');
    const input = Uint8Array.from(atob(value.data), character => character.charCodeAt(0));
    const unpacked = await transform(input, new DecompressionStream('gzip'), 32768);
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(unpacked));
  }
  function createSdk(request) {
    let task, controller;
    const requestRoutes = new Map();
    const configRoute = config => config?.executionMode === 'http-local' ? 'tasks' : 'controllers';
    const requestRoute = clientRequestId => requestRoutes.get(clientRequestId) || 'controllers';
    const project = row => ({...row, status: row.state, result: row.value,
      durableResult: row.result, engineStatus: row.value?.engine?.status,
      accepted: ['stopping', 'cancelled'].includes(row.state),
      retired: row.retirementState === 'released' || (row.state === 'cancelled' && !row.runId)});
    return {
      currentPage: () => request('currentPage.info', {}),
      async prepare(config) {
        task = undefined; controller = undefined;
        const route = configRoute(config);
        let resolved;
        try {resolved = await request(route + '.read', route === 'tasks' ? {taskId: TASK_ID} : {});}
        catch (error) {
          if (error.code === 'E_BUILTIN_VERSION_UNAVAILABLE') throw Object.assign(new Error(
            route === 'tasks'
              ? '固定采集任务与当前运行时不匹配；请更新 scrapyjs 应用及其固定采集任务。采集配置已保留，保存配置不会更新任务验证。'
              : '固定采集 Controller 与当前运行时不匹配；请更新 scrapyjs 应用。采集配置已保留，保存配置不会更新 Controller。'), {code: error.code});
          throw error;
        }
        if (route === 'tasks') {
          if (!resolved?.task) throw new Error('请先经原安装审阅链安装固定采集 Task');
          task = resolved.task;
        } else {
          if (!resolved?.controller) throw new Error('请先经原安装审阅链安装含固定 Controller 的 scrapyjs 应用');
          controller = resolved.controller;
        }
      },
      start: async (config, url, clientRequestId) => {
        const route = configRoute(config);
        if (route === 'tasks' ? !task : !controller) throw new Error(route === 'tasks'
          ? '固定 Task 尚未确认安装身份' : '固定 Controller 尚未确认安装身份');
        const configJson = JSON.stringify(config.itemConfig);
        if (bytes(configJson) > 4096) throw new Error('itemConfig 超过 configJson 的 4096 字节上限');
        const {url:configuredUrl,itemConfig,waitForSelector,timeoutMs,output,...options}=config;
        const optionsJson=JSON.stringify(options);
        if(bytes(optionsJson)>4096)throw new Error('分页、详情与处理配置超过 4096 字节');
        const params = {url: configuredUrl, configJson, optionsJson, waitForSelector: waitForSelector || '', timeoutMs: timeoutMs ?? 30000};
        requestRoutes.set(clientRequestId, route);
        return project(await request(route + '.start', {...(route === 'tasks' ? {task} : {}), clientRequestId, params}));
      },
      read: async clientRequestId => project(await request(requestRoute(clientRequestId) + '.read', {clientRequestId})),
      inspect: async (input,clientRequestId) => {
        if(!controller)throw new Error('固定 Controller 尚未确认安装身份');
        const {url,...inspection}=input;
        requestRoutes.set(clientRequestId, 'controllers');
        return project(await request('controllers.start',{clientRequestId,params:{url,configJson:'{}',
          optionsJson:JSON.stringify({inspection}),waitForSelector:'',timeoutMs:35000}}));
      },
      stop: async clientRequestId => project(await request(requestRoute(clientRequestId) + '.stop', {clientRequestId})),
      async load() {
        const record = await request('storage.get', {key: STORAGE_KEY, withEtag: true});
        return {...record, value: await loadedCatalog(record.value)};
      },
      async save(value, etag) {
        if (!(etag === null || typeof etag === 'string')) throw new Error('缺少 ETag，禁止无条件保存');
        const stored = await storedCatalog(value);
        const result = await request('storage.set', {key: STORAGE_KEY, value: stored, ifMatch: etag});
        if (result?.saved !== true) throw new Error('保存结果未知，请保留草稿并重新读取');
        return result;
      },
      async download(value, format = 'json', output) {
        if (!['json','csv'].includes(format)) throw new Error('不支持的导出格式');
        let text = JSON.stringify(value, null, 2);
        if (format === 'csv') {
          const data = value.result?.data ?? value.value?.data;
          if (!Array.isArray(data)) throw new Error('结果中没有可导出的记录数组');
          let keys = [...new Set(data.flatMap(row => Object.keys(row)))];
          // A per-download order must include every actual result field exactly once.
          // It is independent of the collection-rule order stored in configuration.
          if (output && Object.hasOwn(output, 'fieldOrder')) {
            if (!Array.isArray(output.fieldOrder)) throw new Error('CSV 列顺序无效，必须包含全部结果字段且不重复');
            const order = [...output.fieldOrder], available = new Set(keys);
            if (order.length !== keys.length || new Set(order).size !== keys.length ||
                order.some(key => typeof key !== 'string' || !available.has(key)))
              throw new Error('CSV 列顺序无效，必须包含全部结果字段且不重复');
            keys = order;
          }
          const cell = v => {
            let value=String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v);
            if(typeof v==='string' && (/^[\s\u0000-\u001f]*[=+@-]/u.test(value)||/^[\t\r\n]/u.test(value)))value="'"+value;
            return '"'+value.replaceAll('"','""')+'"';
          };
          const headers = keys.map(key => {
            const name = output?.fieldNames && Object.hasOwn(output.fieldNames,key) ? output.fieldNames[key] : undefined;
            if (name !== undefined && (typeof name !== 'string' || Array.from(name).length > 80 || bytes(name) > 240 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('CSV 表头名称无效');
            return typeof name === 'string' && name.trim() ? name.normalize('NFC').trim() : key;
          });
          if (output && new Set(headers).size !== headers.length) throw new Error('CSV 表头名称重复，请使用不同名称');
          text = [headers.map(cell).join(','), ...data.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
          if (!keys.length) throw new Error('没有可导出的字段');
        }
        if (bytes(text) > 150000) throw new Error('完整导出超过 150000 字节，不能导出；未截断结果');
        return request('browser.downloads.text', {text, filename: 'scrapyjs-result.' + format});
      }
    };
  }
  globalThis.ScrapyAppSdk = Object.freeze({TASK_ID, createSdk, bytes});
})();

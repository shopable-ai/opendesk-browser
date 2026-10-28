(() => {
  'use strict';
  const DEFAULT_URL = 'http://127.0.0.1:43111/demo-form.html';
  const DEFAULT_CONFIG = {url: DEFAULT_URL, itemConfig: {_listContainer: '#sample-list', _listItem: 'li', title: '.::text'}};
  const copy = value => JSON.parse(JSON.stringify(value));
  // The public codec and Chrome Storage may reorder object keys during readback.
  const configValue = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row);
  const terminal = new Set(['completed', 'failed', 'stopped', 'cancelled']);
  function validateConfig(value) {
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    if (!object(value)) throw new Error('配置必须是 JSON 对象');
    if (Object.keys(value).some(key => !['url', 'itemConfig', 'waitForSelector', 'timeoutMs', 'nextPageSelector', 'maxPages', 'dedupeKey', 'detail', 'validation', 'fieldRequirements', 'processing'].includes(key))) throw new Error('仅接受字段、分页、详情和处理的声明式配置，不接受执行代码');
    targetUrl(value.url);
    if (!object(value.itemConfig) || !Object.keys(value.itemConfig).length) throw new Error('itemConfig 必须是非空对象');
    // Preserve native SDK selector/descriptor/nested-field grammar. Engine owns CSS/XPath parsing.
    const walk = (node, depth = 0) => {
      if (depth > 12) throw new Error('itemConfig 嵌套过深');
      for (const [key, rule] of Object.entries(node)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('不允许的字段名称');
        if (typeof rule === 'string') {if (!rule.trim()) throw new Error('选择器不能为空');}
        else if (object(rule)) {
          if (Object.hasOwn(rule, 'selector')) {
            if (typeof rule.selector !== 'string' || !rule.selector.trim() ||
                Object.keys(rule).some(k => !['selector', 'read', 'attr', 'cardinality'].includes(k)) ||
                (rule.read !== undefined && !['text', 'attr', 'innerHTML', 'outerHTML'].includes(rule.read)) ||
                (rule.cardinality !== undefined && !['one', 'many', 'auto'].includes(rule.cardinality)) ||
                (rule.read === 'attr' && (typeof rule.attr !== 'string' || !/^[\w:-]+$/.test(rule.attr))) ||
                (rule.read !== 'attr' && rule.attr !== undefined)) throw new Error('字段描述符无效');
          } else {if (!Object.keys(rule).length) throw new Error('嵌套字段不能为空'); walk(rule, depth + 1);}
        } else throw new Error('字段必须是选择器或描述符');
      }
    };
    walk(value.itemConfig);
    for (const key of ['_listContainer', '_listItem']) {
      if (value.itemConfig[key] !== undefined && (typeof value.itemConfig[key] !== 'string' || !value.itemConfig[key].trim())) throw new Error(key + ' 必须是选择器');
    }
    if (value.itemConfig._listItem !== undefined && value.itemConfig._listContainer === undefined) throw new Error('_listItem 需要 _listContainer');
    if (!Object.keys(value.itemConfig).some(key => !['_listContainer', '_listItem'].includes(key))) throw new Error('至少需要一个采集字段');
    if (value.waitForSelector !== undefined && (typeof value.waitForSelector !== 'string' || !value.waitForSelector.trim())) throw new Error('waitForSelector 必须是非空选择器');
    if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 60000)) throw new Error('timeoutMs 必须是 1–60000 的整数');
    if (value.nextPageSelector !== undefined && (typeof value.nextPageSelector !== 'string' || !value.nextPageSelector.trim() || value.nextPageSelector.length > 1024 || /^\(?\.?\//.test(value.nextPageSelector))) throw new Error('下一页必须是 CSS 选择器');
    if (value.maxPages !== undefined && (!Number.isInteger(value.maxPages) || value.maxPages < 1 || value.maxPages > 10)) throw new Error('页数上限必须是 1–10');
    if (value.dedupeKey !== undefined && (typeof value.dedupeKey !== 'string' || value.dedupeKey.startsWith('_') || !Object.hasOwn(value.itemConfig,value.dedupeKey))) throw new Error('去重字段必须是已有字段');
    if (value.detail !== undefined) {
      const d=value.detail;
      if (!object(d) || Object.keys(d).some(k=>!['urlField','identityField','itemConfig','waitForSelector','numberFields'].includes(k)) ||
          !object(d.itemConfig) || [d.urlField,d.identityField].some(k=>typeof k!=='string'||k.startsWith('_')||!Object.hasOwn(value.itemConfig,k)) ||
          !Object.hasOwn(d.itemConfig,d.identityField)) throw new Error('详情必须绑定列表 URL 字段和共同身份字段');
      walk(d.itemConfig);
      if(Object.keys(d.itemConfig).some(k=>!k.startsWith('_')&&k!==d.identityField&&Object.hasOwn(value.itemConfig,k))) throw new Error('详情字段不能覆盖列表字段');
      if(d.numberFields!==undefined && (!Array.isArray(d.numberFields)||d.numberFields.length>20||d.numberFields.some(k=>typeof k!=='string'||k.startsWith('_')||!Object.hasOwn(d.itemConfig,k)))) throw new Error('数字处理字段必须是已有详情字段');
      if(d.waitForSelector!==undefined && (typeof d.waitForSelector!=='string'||!d.waitForSelector.trim()||d.waitForSelector.length>1024)) throw new Error('详情等待选择器无效');
    }
    if (value.validation !== undefined && (!object(value.validation)||Object.keys(value.validation).some(k=>!['version','rowShape'].includes(k))||value.validation.version!==1||typeof value.validation.rowShape!=='string')) throw new Error('校验需要 version:1 与 rowShape');
    if (value.fieldRequirements !== undefined && (!value.validation||!Array.isArray(value.fieldRequirements)||value.fieldRequirements.length>20||value.fieldRequirements.some(r=>!object(r)||Object.keys(r).some(k=>!['key','required','valueType'].includes(k))||!Object.hasOwn(value.itemConfig,r.key)||typeof r.required!=='boolean'||!['text','number','date','url','image'].includes(r.valueType)))) throw new Error('字段校验配置无效');
    if (value.processing !== undefined && (!object(value.processing)||Object.keys(value.processing).some(k=>!['version','rules'].includes(k))||value.processing.version!==1||!Array.isArray(value.processing.rules)||value.processing.rules.length>8||value.processing.rules.some(r=>!object(r)||Object.keys(r).some(k=>!['op','field'].includes(k))||r.op!=='splitPublication'||!Object.hasOwn(value.itemConfig,r.field)))) throw new Error('仅支持原引擎 splitPublication 处理规则');
    const {url,itemConfig,waitForSelector,timeoutMs,...options}=value;
    if(new TextEncoder().encode(JSON.stringify(options)).byteLength>4096) throw new Error('分页、详情与处理配置超过 4096 字节');
    if (new TextEncoder().encode(JSON.stringify(value.itemConfig)).byteLength > 4096) throw new Error('itemConfig 超过 configJson 的 4096 字节上限');
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192) throw new Error('配置超过 8192 字节');
    return copy(value);
  }
  function targetUrl(value) {
    if (typeof value !== 'string') throw new Error('请填写目标 URL');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请选择普通 HTTP(S) 当前网页');
    return url.href;
  }
  function createApp(sdk, onChange = () => {}) {
    const state = {config: copy(DEFAULT_CONFIG), target: null, phase: 'idle', host: '尚未连接', engine: '尚未运行', runId: null,
      clientRequestId: null, result: null, snapshot: null, error: '', notice: '', stopRequested: false, stopAccepted: false, retired: false,
      dirty: false, saving: false, storageReady: false, conflict: null};
    let etag, revision = 0, loadGeneration = 0, pageGeneration = 0, disposed = false, stopping = false, reading = false;
    const emit = () => { if (!disposed) onChange(state); };
    const active = () => Boolean(state.clientRequestId) && !state.retired;
    function touch() {state.dirty = true; revision++; emit();}
    function edit(value) {state.config = validateConfig(value); touch();}
    async function refreshTarget() {
      const generation = ++pageGeneration;
      state.target = null; emit();
      try {
        const info = await sdk.currentPage();
        if (generation !== pageGeneration || disposed) return;
        if (info?.status !== 'available') throw new Error(info?.message || '当前网页不可用');
        state.target = {title: String(info.title || ''), url: targetUrl(info.url)};
        state.host = '当前网页已连接';
      } catch (error) {if (generation === pageGeneration) {state.target = null; state.host = error.message;}}
      emit();
    }
    async function load({replace = false} = {}) {
      const before = revision, generation = ++loadGeneration;
      try {
        const record = await sdk.load();
        if (disposed || generation !== loadGeneration) return;
        if (!record || !Object.hasOwn(record, 'etag')) throw new Error('存储未返回 ETag，禁止覆盖');
        const config = record.value == null ? copy(DEFAULT_CONFIG) : validateConfig(record.value);
        if (before !== revision || (state.dirty && !replace)) {
          state.conflict = {config, etag: record.etag}; state.notice = '已读到保存版本；草稿仍保留';
        } else {
          etag = record.etag; state.config = config; state.dirty = false; state.conflict = null; state.storageReady = true;
          state.notice = '已读取保存配置';
        }
      } catch (error) {state.error = error.message;}
      emit();
    }
    function useSaved() {
      if (!state.conflict) return;
      state.config = state.conflict.config; etag = state.conflict.etag; state.conflict = null;
      state.storageReady = true; state.dirty = false; revision++; emit();
    }
    async function save() {
      if (state.saving) return;
      state.error = ''; state.notice = '';
      if (!state.storageReady || state.conflict) {state.error = '请先读取保存版本，解决存储冲突后再保存'; emit(); return;}
      const before = revision, savedConfig = validateConfig(state.config);
      state.saving = true; emit();
      try {
        await sdk.save(savedConfig, etag);
        // Verify the full value before accepting the readback ETag for the next CAS write.
        const record = await sdk.load();
        if (!record || !Object.hasOwn(record, 'etag') || configValue(record.value) !== configValue(savedConfig)) {
          state.storageReady = false; throw new Error('保存后版本已变化，请重新读取；草稿保留');
        }
        etag = record.etag;
        if (before === revision) state.dirty = false;
        state.notice = '配置已保存，可关闭后重开';
      } catch (error) {
        state.error = error.message; state.storageReady = false;
        // A conflict is never retried as an unconditional write.
        await load();
      } finally {state.saving = false; emit();}
    }
    function apply(snapshot) {
      if (!snapshot || snapshot.clientRequestId !== state.clientRequestId ||
          (state.runId && snapshot.runId !== state.runId)) throw new Error('任务响应身份不匹配');
      if (snapshot.runId) state.runId = snapshot.runId;
      state.snapshot = snapshot; state.host = String(snapshot.status || '状态未知');
      state.engine = String(snapshot.engineStatus || snapshot.result?.engine?.status || '未报告');
      if(snapshot.result?.list?.engine?.status==='partial')state.engine+=' · 列表 partial ('+snapshot.result.list.engine.stopReason+')';
      if (Object.hasOwn(snapshot, 'result')) state.result = snapshot.result;
      state.retired = snapshot.retired === true;
      // Terminal host state is not evidence that the original runtime has retired.
      state.phase = state.retired ? 'retired' : (state.stopRequested ? 'stopping' : 'running');
      if (terminal.has(snapshot.status) && !state.retired) state.notice = '宿主已终结，等待原运行实例退休确认';
    }
    async function refresh() {
      if (!active() || reading || disposed) return;
      reading = true;
      try {apply(await sdk.read(state.clientRequestId)); state.error = '';}
      catch (error) {state.error = error.message;}
      finally {reading = false; emit();}
    }
    async function stop() {
      state.stopRequested = true; emit();
      if (!active() || stopping || state.stopAccepted || disposed) return;
      stopping = true;
      try {
        const receipt = await sdk.stop(state.clientRequestId);
        if (receipt?.clientRequestId !== state.clientRequestId ||
            (state.runId && receipt.runId !== state.runId)) throw new Error('停止响应身份不匹配');
        if (receipt.runId) state.runId = receipt.runId;
        state.stopAccepted = receipt.accepted === true;
        if (!state.stopAccepted) throw new Error('停止未确认受理，请刷新原实例状态');
        state.phase = 'stopping'; state.host = '停止已受理';
        if (receipt.retired === true) {state.retired = true; state.phase = 'retired';}
      } catch (error) {state.error = error.message;}
      finally {stopping = false; emit();}
    }
    async function start(url) {
      if (['starting', 'unknown'].includes(state.phase) || active() || disposed) return;
      state.error = ''; state.notice = '';
      let sent = false;
      try {
        const config = validateConfig(state.config), expected = targetUrl(url);
        if (!state.target || new URL(expected).origin !== new URL(state.target.url).origin) throw new Error('目标 URL 必须与可信当前网页同源，请刷新当前网页');
        state.phase = 'starting'; state.stopRequested = false; state.stopAccepted = false;
        state.retired = false; state.runId = null; state.clientRequestId = null; state.result = null; state.snapshot = null; state.engine = '等待引擎'; emit();
        await sdk.prepare();
        const generation = pageGeneration;
        const info = await sdk.currentPage();
        if (generation !== pageGeneration || info?.status !== 'available' || targetUrl(info.url) !== state.target?.url) throw new Error('当前网页已变化，请重新确认目标');
        if (state.stopRequested || disposed) {state.phase = 'idle'; state.notice = '已取消，未发起任务'; return;}
        sent = true;
        state.clientRequestId = crypto.randomUUID(); emit();
        const receipt = await sdk.start({...config, url: expected}, state.target.url, state.clientRequestId);
        if (receipt?.clientRequestId !== state.clientRequestId) throw new Error('开始响应身份不匹配');
        if (!receipt || typeof receipt.runId !== 'string' || !receipt.runId) {
          state.phase = 'unknown'; throw new Error('开始结果未知，缺少运行身份；请勿重复开始');
        }
        state.runId = receipt.runId; state.phase = 'running'; state.host = String(receipt.status || '已受理');
        if (state.stopRequested && !state.stopAccepted) await stop();
        if (!disposed) await refresh();
      } catch (error) {
        if (state.phase === 'starting') state.phase = sent ? 'unknown' : 'idle';
        state.error = error.message;
        if (sent && state.stopRequested && !disposed) await refresh();
      } finally {emit();}
    }
    async function download(format = 'json') {
      try {
        if (!state.snapshot || state.result == null) throw new Error('尚无可导出的真实结果');
        const receipt = await sdk.download(state.snapshot, format);
        if (receipt?.started !== true) throw new Error('下载请求结果未知');
        state.notice = '已请求下载完整 ' + format.toUpperCase() + '，请在浏览器下载列表确认'; state.error = '';
      } catch (error) {state.error = error.message;}
      emit();
    }
    return {state, edit, touch, refreshTarget, load, useSaved, save, start, stop, refresh, download,
      dispose() {disposed = true; pageGeneration++;}};
  }
  globalThis.ScrapyAppModel = Object.freeze({createApp, validateConfig, DEFAULT_CONFIG});
})();

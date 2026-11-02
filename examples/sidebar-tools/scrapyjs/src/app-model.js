(() => {
  'use strict';
  const DEFAULT_URL = 'http://127.0.0.1:43111/demo-form.html';
  const DEFAULT_CONFIG = {url: DEFAULT_URL, itemConfig: {_listContainer: '#sample-list', _listItem: 'li', title: '.::text'}};
  const EMPTY_CONFIG = {url: '', itemConfig: {}};
  const copy = value => JSON.parse(JSON.stringify(value));
  // The public codec and Chrome Storage may reorder object keys during readback.
  const configValue = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row);
  const terminal = new Set(['completed', 'failed', 'stopped', 'cancelled']);
  function validateConfig(value, {runtime = 'browser', draft = false} = {}) {
    const pageLimit = runtime === 'local' ? 50 : 10;
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    if (!object(value)) throw new Error('配置必须是 JSON 对象');
    if (Object.keys(value).some(key => !['url', 'itemConfig', 'waitForSelector', 'timeoutMs', 'nextPageSelector', 'maxPages', 'dedupeKey', 'detail', 'validation', 'fieldRequirements', 'processing', 'executionMode', 'http', 'output'].includes(key))) throw new Error('仅接受字段、分页、详情和处理的声明式配置，不接受执行代码');
    if (!draft || value.url !== '') targetUrl(value.url);
    const httpLocal = value.executionMode === 'http-local';
    if (value.executionMode !== undefined && !httpLocal) throw new Error('executionMode 仅支持 http-local；DOM 模式请省略此字段');
    if (httpLocal) {
      if (!/^http:\/\/127\.0\.0\.1:43121(?:[/?#]|$)/.test(value.url) || new URL(value.url).origin !== 'http://127.0.0.1:43121')
        throw new Error('本机 HTTP 仅允许 http://127.0.0.1:43121；公网未开放');
      if (value.url.includes('#')) throw new Error('本机 HTTP URL 不接受 hash');
      if (['waitForSelector','nextPageSelector','detail','processing','validation','fieldRequirements','dedupeKey'].some(key => Object.hasOwn(value, key))) throw new Error('本机 HTTP 不接受 DOM 等待、分页选择器、详情、处理、校验或去重配置');
    } else if (value.http !== undefined) throw new Error('http 配置仅用于本机 HTTP 模式');
    if (value.http !== undefined) {
      const http = value.http;
      if (!object(http) || Object.keys(http).some(key => !['userAgent','headers'].includes(key))) throw new Error('http 仅接受 userAgent 和 headers');
      const headerValue = text => typeof text === 'string' && /^[\x20-\x7e]*$/.test(text);
      if (http.userAgent !== undefined && (!headerValue(http.userAgent) || http.userAgent.length > 512)) throw new Error('User-Agent 必须留空或为 1–512 个可打印 ASCII 字符');
      if (http.headers !== undefined) {
        if (!object(http.headers)) throw new Error('Headers 必须是普通请求头的字符串对象');
        const names = new Set();
        for (const [key, text] of Object.entries(http.headers)) {
          const name = key.toLowerCase();
          if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || !headerValue(text) || names.has(name) ||
              /^(sec-|proxy-|x-opendesk-)/.test(name) ||
              ['__proto__','constructor','prototype','user-agent','host','connection','keep-alive','te','trailer','upgrade','expect','accept-encoding','content-length','transfer-encoding','cookie','authorization','origin','referer'].includes(name))
            throw new Error('Headers 值仅接受可打印 ASCII，头名不能大小写重复；UA 请独立填写，身份与传输控制头不可配置');
          names.add(name);
        }
      }
    }
    // Export metadata stays in the profile, never in capture-engine options.
    if (value.output !== undefined) {
      const output = value.output, names = output?.fieldNames;
      if (!object(output) || Object.keys(output).some(key => !['fieldNames','fieldOrder'].includes(key)) || (names !== undefined && (!object(names) || Object.keys(names).length > 64)))
        throw new Error('输出表头仅接受 fieldNames 名称对象，最多 64 个字段');
      for (const [key, label] of Object.entries(names || {})) {
        if (!key.trim() || key.length > 128 || ['__proto__','constructor','prototype'].includes(key) ||
            typeof label !== 'string' || Array.from(label).length > 80 || new TextEncoder().encode(label).byteLength > 240 ||
            /[\u0000-\u001f\u007f]/.test(key + label)) throw new Error('输出表头名称最多 80 字符、240 字节，不能含控制字符或保留字段名');
      }
      const order = output.fieldOrder;
      if (order !== undefined && (!Array.isArray(order) || order.length > 64 || new Set(order).size !== order.length ||
          order.some(key => typeof key !== 'string' || !key.trim() || key.length > 128 || ['__proto__','constructor','prototype'].includes(key) || /[\u0000-\u001f\u007f]/.test(key))))
        throw new Error('字段排序必须是不重复的字段名数组，最多 64 个字段');
      if (new TextEncoder().encode(JSON.stringify(output)).byteLength > 2048) throw new Error('输出表头名称配置超过 2048 字节');
    }
    if (!object(value.itemConfig) || (!draft && !Object.keys(value.itemConfig).length)) throw new Error('itemConfig 必须是非空对象');
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
    if (httpLocal) {
      if (Object.keys(value.itemConfig).length > 32) throw new Error('本机 HTTP 最多 32 个字段');
      for (const [key, path] of Object.entries(value.itemConfig)) {
        if (!/^[\p{L}_][\p{L}\p{N}_-]{0,63}$/u.test(key) || ['__proto__','constructor','prototype'].includes(key) ||
            typeof path !== 'string' || path.length > 128 || path.split('.').length > 4 ||
            !path.split('.').every(part => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part) && !['__proto__','constructor','prototype'].includes(part)))
          throw new Error('本机 HTTP 字段名需合法，JSON 点路径最多 4 段、128 字符，每段为 JS 标识符');
      }
    } else {
      walk(value.itemConfig);
      for (const key of ['_listContainer', '_listItem']) {
        if (value.itemConfig[key] !== undefined && (typeof value.itemConfig[key] !== 'string' || !value.itemConfig[key].trim())) throw new Error(key + ' 必须是选择器');
      }
      if (!draft && !Object.keys(value.itemConfig).some(key => !['_listContainer', '_listItem'].includes(key))) throw new Error('至少需要一个采集字段');
    }
    if (value.waitForSelector !== undefined && (typeof value.waitForSelector !== 'string' || !value.waitForSelector.trim())) throw new Error('waitForSelector 必须是非空选择器');
    if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 60000)) throw new Error('timeoutMs 必须是 1–60000 的整数');
    if (value.nextPageSelector !== undefined && (typeof value.nextPageSelector !== 'string' || !value.nextPageSelector.trim() || value.nextPageSelector.length > 1024 || /^\(?\.?\//.test(value.nextPageSelector))) throw new Error('下一页必须是 CSS 选择器');
    const maximumPages = httpLocal ? 3 : pageLimit;
    if (value.maxPages !== undefined && (!Number.isInteger(value.maxPages) || value.maxPages < 1 || value.maxPages > maximumPages)) throw new Error(httpLocal ? '本机 HTTP 页数上限必须是 1–3' : '页数上限必须是 1–' + maximumPages);
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
    const {url,itemConfig,waitForSelector,timeoutMs,output,...options}=value;
    if(new TextEncoder().encode(JSON.stringify(options)).byteLength>4096) throw new Error('分页、详情与处理配置超过 4096 字节');
    if (new TextEncoder().encode(JSON.stringify(value.itemConfig)).byteLength > 4096) throw new Error('itemConfig 超过 configJson 的 4096 字节上限');
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192) throw new Error('配置超过 8192 字节');
    const config = copy(value);
    // Storage codecs can sort object keys; an explicit array preserves the user's order.
    if (config.output?.fieldOrder) {
      const fields = Object.keys(config.itemConfig).filter(key => !key.startsWith('_'));
      const order = [...config.output.fieldOrder.filter(key => fields.includes(key)), ...fields.filter(key => !config.output.fieldOrder.includes(key))];
      let index = 0;
      config.itemConfig = Object.fromEntries(Object.entries(config.itemConfig).map(([key,rule]) => key.startsWith('_') ? [key,rule] : [order[index],config.itemConfig[order[index++]]]));
    }
    if (httpLocal && config.timeoutMs !== undefined) config.timeoutMs = Math.min(config.timeoutMs, 15000);
    return config;
  }
  function targetUrl(value) {
    if (typeof value !== 'string') throw new Error('请填写目标 URL');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请选择普通 HTTP(S) 当前网页');
    return url.href;
  }
  const MAX_PROFILES = 32;
  const storageBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  function profileName(value) {
    if (typeof value !== 'string') throw new Error('请填写配置名称');
    const name = value.normalize('NFC').trim();
    if (!name || Array.from(name).length > 60 || new TextEncoder().encode(name).byteLength > 180 || /[\u0000-\u001f\u007f]/.test(name))
      throw new Error('配置名称需为 1–60 个字符、最多 180 UTF-8 字节，不能含控制字符');
    return name;
  }
  function validateCatalog(value) {
    if (!value || Array.isArray(value) || value.schemaVersion !== 1 ||
        Object.keys(value).some(k => !['schemaVersion','selectedId','records'].includes(k)) ||
        !Array.isArray(value.records) || value.records.length > MAX_PROFILES) throw new Error(`配置记录格式无效，最多 ${MAX_PROFILES} 份`);
    const ids = new Set(), names = new Set();
    const records = value.records.map(row => {
      if (!row || Array.isArray(row) || Object.keys(row).some(k => !['id','name','config'].includes(k)) ||
          typeof row.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(row.id) || ids.has(row.id))
        throw new Error('配置记录身份无效或重复');
      const name = profileName(row.name), key = name.toLowerCase();
      if (names.has(key)) throw new Error('已有同名配置，请使用不同名称');
      ids.add(row.id); names.add(key);
      return {id: row.id, name, config: validateConfig(row.config)};
    });
    if (records.length ? !ids.has(value.selectedId) : value.selectedId !== null) throw new Error('选中的配置记录不存在');
    const catalog = {schemaVersion: 1, selectedId: value.selectedId, records};
    if (storageBytes(catalog) > 8192) throw new Error('全部命名配置超过 8192 字节，未保存；请减少配置数量或内容');
    return catalog;
  }
  function readCatalog(value) {
    if (value == null) return {schemaVersion: 1, selectedId: null, records: []};
    if (Object.hasOwn(value, 'schemaVersion')) return validateCatalog(value);
    // Keep old single-config bytes untouched until an explicit conditional save.
    return {schemaVersion: 1, selectedId: 'legacy-default', records: [{id: 'legacy-default', name: '默认配置', config: validateConfig(value)}]};
  }
  function createApp(sdk, onChange = () => {}) {
    const state = {config: copy(EMPTY_CONFIG), target: null, phase: 'idle', host: '尚未连接', engine: '尚未运行', runId: null,
      clientRequestId: null, preparationId: null, result: null, snapshot: null, error: '', notice: '', stopRequested: false, stopAccepted: false, retired: false,
      dirty: false, saving: false, storageReady: false, storageError: null, targetError: null, conflict: null,
      records: [], selectedId: null, profileEpoch: 0, pendingAction: null, runProfile: null};
    let etag, revision = 0, loadGeneration = 0, pageGeneration = 0, startGeneration = 0, disposed = false, stopping = false, reading = false;
    let catalog = readCatalog(null);
    const instanceId = crypto.randomUUID();
    let configurationUndo = null, lastWriteError = null;
    Object.defineProperty(state, 'configRevision', {enumerable: true, get: () => revision});
    const emit = () => { if (!disposed) onChange(state); };
    const active = () => Boolean(state.clientRequestId) && !state.retired;
    const busy = () => state.saving || Boolean(state.preparationId) || state.phase === 'starting' || state.phase === 'unknown' || active();
    const configIdentity = () => ({instanceId, profileId: state.selectedId, profileEpoch: state.profileEpoch, configRevision: revision});
    const businessError = (code, message) => Object.assign(new Error(message), {code});
    const configurationLock = () => disposed ? 'DISPOSED' : busy() || state.pendingAction ? 'LOCKED' : null;
    function assertConfiguration(expected) {
      const locked = configurationLock();
      if (locked) throw businessError(locked, '配置操作已锁定或实例已关闭');
      const current = configIdentity();
      if (!expected || Object.keys(expected).length !== 4 || Object.keys(current).some(key => expected[key] !== current[key]))
        throw businessError('STALE_STATE', '配置身份或修订已变化，请使用当前状态');
    }
    // One local transaction, shared with manual edit(), never a second config store.
    function applyConfiguration(expected, value) {
      assertConfiguration(expected);
      let config;
      try {config = validateConfig(value);} catch (error) {throw businessError('INVALID_INPUT', error.message);}
      const undoId = crypto.randomUUID();
      configurationUndo = {undoId, config: copy(state.config), dirty: state.dirty, revision: revision + 1,
        selectedId: state.selectedId, profileEpoch: state.profileEpoch};
      edit(config);
      return {status: 'applied', identity: configIdentity(), undoId, dirty: state.dirty};
    }
    function undoConfiguration(undoId) {
      const locked = configurationLock();
      if (locked) throw businessError(locked, '配置操作已锁定或实例已关闭');
      const undo = configurationUndo;
      if (!undo || typeof undoId !== 'string' || undo.undoId !== undoId) throw businessError('NO_UNDO', '这次修改已不可撤销');
      if (undo.revision !== revision || undo.selectedId !== state.selectedId || undo.profileEpoch !== state.profileEpoch)
        throw businessError('STALE_STATE', '后续操作已改变配置，不能覆盖当前草稿');
      configurationUndo = null;
      state.config = copy(undo.config); state.dirty = undo.dirty; state.notice = '已撤销本次配置修改';
      revision++; emit();
      return {status: 'undone', identity: configIdentity(), dirty: state.dirty};
    }
    const draftCheckpoints = new WeakSet();
    // UI-only dirty bookkeeping; never restore configuration or runtime state.
    function checkpointDraft() {
      const checkpoint = Object.freeze({config: state.config, profileEpoch: state.profileEpoch,
        selectedId: state.selectedId, dirty: state.dirty});
      draftCheckpoints.add(checkpoint);
      return checkpoint;
    }
    function cancelDraft(checkpoint, {keepDirty = false} = {}) {
      if (!draftCheckpoints.has(checkpoint) || keepDirty || busy() || state.pendingAction || disposed ||
          checkpoint.config !== state.config || checkpoint.profileEpoch !== state.profileEpoch ||
          checkpoint.selectedId !== state.selectedId) return false;
      state.dirty = checkpoint.dirty; revision++; emit();
      return true;
    }
    function touch() {
      if (busy() || state.pendingAction || disposed) throw new Error('保存或运行期间不能修改配置');
      state.dirty = true; state.notice = ''; revision++; emit();
    }
    function edit(value) {
      if (busy() || state.pendingAction || disposed) throw new Error('保存或运行期间不能修改配置');
      state.config = validateConfig(value, {draft: true}); touch();
    }
    function clearRun() {
      Object.assign(state, {runId: null, clientRequestId: null, result: null, snapshot: null, runProfile: null,
        phase: 'idle', host: state.target ? '当前网页已连接' : '尚未连接', engine: '尚未运行', stopRequested: false, stopAccepted: false, retired: false});
    }
    function selectLocal(id, dirty = false) {
      const row = catalog.records.find(row => row.id === id);
      state.selectedId = row?.id ?? null; state.config = copy(row?.config ?? EMPTY_CONFIG);
      state.dirty = dirty; state.pendingAction = null; state.profileEpoch++; revision++;
      clearRun();
    }
    function adopt(next) {
      catalog = copy(next); state.records = copy(next.records); selectLocal(next.selectedId);
      state.storageReady = true; state.storageError = null; state.conflict = null;
    }
    function writable() {
      if (busy() || disposed || state.pendingAction) return false;
      if (!state.storageReady || state.conflict) {
        state.error = '请先读取保存版本，解决存储冲突后再保存或切换'; emit(); return false;
      }
      return true;
    }
    async function refreshTarget() {
      const generation = ++pageGeneration;
      state.target = null; emit();
      try {
        const info = await sdk.currentPage();
        if (generation !== pageGeneration || disposed) return;
        if (info?.status !== 'available') throw Object.assign(new Error(info?.message || '当前网页不可用'),{code:info?.code||''});
        state.target = {title: String(info.title || ''), url: targetUrl(info.url)};
        state.host = '当前网页已连接'; state.targetError = null;
      } catch (error) {if (generation === pageGeneration) {state.target = null; state.host = error.message;state.targetError={code:error.code||'',message:error.message};}}
      emit();
    }
    async function load({preserve = false} = {}) {
      if (busy() || disposed || state.pendingAction) return;
      const before = revision, generation = ++loadGeneration;
      try {
        const record = await sdk.load();
        if (disposed || generation !== loadGeneration) return;
        if (!record || !(record.etag === null || typeof record.etag === 'string')) throw new Error('存储未返回 ETag，禁止覆盖');
        const saved = readCatalog(record.value);
        state.storageError = null;
        if (preserve || busy() || before !== revision || state.dirty) {
          state.conflict = {catalog: saved, config: copy(saved.records.find(row => row.id === saved.selectedId)?.config ?? EMPTY_CONFIG), etag: record.etag};
          state.notice = '已读到保存版本；草稿仍保留';
        } else {
          etag = record.etag; adopt(saved); state.error = '';
          state.notice = '已读取保存配置';
        }
      } catch (error) {if (generation === loadGeneration && !disposed) {state.storageReady = false;state.storageError={code:error.code||'',message:error.message};state.error = error.message;}}
      emit();
    }
    function useSaved() {
      if (!state.conflict || busy() || state.pendingAction || disposed) return;
      if (state.dirty) {state.pendingAction = {type: 'saved'}; emit(); return;}
      acceptSaved();
    }
    function acceptSaved() {
      const saved = state.conflict;
      if (!saved) return;
      etag = saved.etag; adopt(saved.catalog); state.error = ''; state.notice = '已读取保存配置'; emit();
    }
    async function commit(next, accepted, notice) {
      if (!writable()) return false;
      lastWriteError = null;
      state.error = ''; state.notice = '';
      try {next = validateCatalog(next);} catch (error) {lastWriteError = {code:'INVALID_INPUT', message:error.message}; state.error = error.message; emit(); return false;}
      ++loadGeneration;
      configurationUndo = null;
      state.saving = true; emit();
      try {
        await sdk.save(next, etag);
        if (disposed) return false;
        // Verify the full value before accepting the readback ETag for the next CAS write.
        const record = await sdk.load();
        if (!record || !(record.etag === null || typeof record.etag === 'string') || configValue(record.value) !== configValue(next)) {
          throw new Error('保存后版本已变化，请重新读取；草稿保留');
        }
        if (disposed) return false;
        catalog = next; state.records = copy(next.records);
        etag = record.etag;
        accepted(); state.notice = notice;
        return true;
      } catch (error) {
        if (disposed) return false;
        lastWriteError = {code: error.code || 'E_OUTCOME_UNKNOWN', message: error.message};
        state.error = error.message; state.storageReady = false;
        // A conflict is never retried as an unconditional write.
        state.saving = false;
        await load({preserve: true});
        return false;
      } finally {if (!disposed) {state.saving = false; emit();}}
    }
    function nextRecord(name, id, config) {
      const row = {id, name, config};
      const records = catalog.records.some(row => row.id === id) ? catalog.records.map(saved => saved.id === id ? row : saved) : [...catalog.records, row];
      return {schemaVersion: 1, selectedId: id, records};
    }
    async function save(name) {
      if (!writable()) return false;
      const current = catalog.records.find(row => row.id === state.selectedId);
      return commit(nextRecord(current?.name ?? name ?? '默认配置', current?.id ?? crypto.randomUUID(), state.config), () => {
        state.selectedId = catalog.selectedId; state.dirty = false; revision++;
      }, '配置已保存，可关闭后重开');
    }
    async function copyProfile(name) {
      if (!writable()) return false;
      return commit(nextRecord(name, crypto.randomUUID(), state.config), () => selectLocal(catalog.selectedId), '配置已保存为独立副本');
    }
    async function saveConfigurationCopy(expected, name) {
      assertConfiguration(expected);
      if (!state.storageReady || state.conflict) throw businessError('LOCKED', '请先解决保存版本或未知写入状态');
      if (name === undefined) {
        const source = catalog.records.find(row => row.id === state.selectedId)?.name || '配置';
        // Leave room for the suffix under both the character and UTF-8 limits.
        const stem = Array.from(source).slice(0, 40).join('');
        const names = new Set(catalog.records.map(row => row.name.toLowerCase()));
        let index = 1;
        do {name = stem + ' 副本' + (index === 1 ? '' : ' ' + index); index++;} while (names.has(name.toLowerCase()));
      }
      const saved = await copyProfile(name);
      if (disposed) return {status: 'blocked', code: 'DISPOSED'};
      if (saved) return {status: 'saved', identity: configIdentity(), profileId: state.selectedId,
        name: state.records.find(row => row.id === state.selectedId)?.name};
      const code = lastWriteError?.code || 'LOCKED';
      return {status: code === 'E_CONFLICT' || code === 'E_STORAGE_CONFLICT' ? 'conflict' :
        code === 'E_OUTCOME_UNKNOWN' ? 'unknown' : 'failed', code, message: lastWriteError?.message || state.error};
    }
    async function renameProfile(name) {
      if (!writable() || !state.selectedId) return false;
      if (state.dirty) {state.error = '请先保存当前草稿，再重命名'; emit(); return false;}
      const next = copy(catalog); next.records.find(row => row.id === state.selectedId).name = name;
      return commit(next, () => {revision++;}, '配置已重命名');
    }
    async function performAction(action) {
      if (action.type === 'saved') {acceptSaved(); return true;}
      if (!writable()) return false;
      if (action.type === 'new') {selectLocal(null, true); state.error = ''; state.notice = '新配置尚未保存，请编辑后命名保存'; emit(); return true;}
      if (action.type === 'select') {
        if (!catalog.records.some(row => row.id === action.id)) return false;
        const next = {...copy(catalog), selectedId: action.id};
        if (catalog.selectedId === action.id) {selectLocal(action.id); state.notice = '已切换配置'; emit(); return true;}
        return commit(next, () => selectLocal(action.id), '已切换配置');
      }
      const records = catalog.records.filter(row => row.id !== action.id);
      const next = {schemaVersion: 1, records, selectedId: records[0]?.id ?? null};
      return commit(next, () => selectLocal(next.selectedId), '配置已删除');
    }
    function requestAction(action) {
      if (!writable()) return false;
      if (action.type === 'select' && state.selectedId === action.id) return false;
      if (state.dirty || action.type === 'delete') {state.pendingAction = action; emit(); return false;}
      return performAction(action);
    }
    const newProfile = () => requestAction({type: 'new'});
    const selectProfile = id => requestAction({type: 'select', id});
    const deleteProfile = () => state.selectedId ? requestAction({type: 'delete', id: state.selectedId}) : false;
    function cancelAction() {state.pendingAction = null; emit();}
    async function confirmAction() {
      if (!state.pendingAction || busy() || disposed) return false;
      const action = state.pendingAction; state.pendingAction = null;
      return performAction(action);
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
      else if (state.retired && state.notice === '宿主已终结，等待原运行实例退休确认') state.notice = '';
    }
    const businessReceipt = (status, extra = {}) => ({status, clientRequestId:state.clientRequestId,
      runId:state.runId, hostStatus:state.snapshot?.status || state.host,
      engineStatus:state.result?.engine?.status || state.engine, retired:state.retired,
      hasResult:state.result != null, error:state.error, ...extra});
    async function refresh() {
      if (disposed) return businessReceipt('blocked');
      if (reading) return businessReceipt('observed', {refreshPending:true});
      if (!active()) return businessReceipt(state.snapshot ? 'observed' : 'blocked');
      const requestId = state.clientRequestId;
      reading = true;
      let status = 'observed';
      try {
        const snapshot = await sdk.read(requestId);
        if (disposed || requestId !== state.clientRequestId) return businessReceipt('blocked');
        apply(snapshot); state.error = '';
      } catch (error) {if (!disposed) state.error = error.message; status = 'failed';}
      finally {reading = false; emit();}
      return businessReceipt(disposed ? 'blocked' : status);
    }
    async function stop() {
      if (disposed) return businessReceipt('blocked');
      state.stopRequested = true; emit();
      if (state.preparationId) {
        state.notice = '已取消，未发起任务'; emit();
        return businessReceipt('accepted', {preparationId:state.preparationId, dispatchPrevented:true});
      }
      if (!active() || stopping || state.stopAccepted) return businessReceipt('blocked');
      const requestId = state.clientRequestId;
      stopping = true;
      let status = 'unknown';
      try {
        const receipt = await sdk.stop(requestId);
        if (disposed || requestId !== state.clientRequestId) return businessReceipt('blocked');
        if (receipt?.clientRequestId !== requestId ||
            (state.runId && receipt.runId !== state.runId)) throw new Error('停止响应身份不匹配');
        if (receipt.runId) state.runId = receipt.runId;
        state.stopAccepted = receipt.accepted === true;
        if (!state.stopAccepted) throw new Error('停止未确认受理，请刷新原实例状态');
        state.error = ''; status = 'accepted';
        state.phase = 'stopping'; state.host = '停止已受理';
        if (receipt.retired === true) {state.retired = true; state.phase = 'retired';}
      } catch (error) {if (!disposed) state.error = error.message;}
      finally {stopping = false; emit();}
      return businessReceipt(disposed ? 'blocked' : status);
    }
    async function start(url) {
      if (busy() || state.pendingAction || disposed) return businessReceipt('blocked');
      state.error = ''; state.notice = '';
      let sent = false;
      const attempt = ++startGeneration, profileEpoch = state.profileEpoch, preparationId = crypto.randomUUID();
      let requestId = null, runId = null;
      const current = () => !disposed && attempt === startGeneration && profileEpoch === state.profileEpoch &&
        (!sent || requestId === state.clientRequestId);
      const staleReceipt = () => businessReceipt('blocked', {stale:true, preparationId, clientRequestId:requestId, runId});
      const previous = {phase: state.phase, stopRequested: state.stopRequested, stopAccepted: state.stopAccepted};
      try {
        const expected = targetUrl(url), config = validateConfig({...state.config, url: expected});
        if (!state.target || new URL(expected).origin !== new URL(state.target.url).origin) throw new Error('目标 URL 必须与可信当前网页同源，请刷新当前网页');
        state.phase = 'starting'; state.stopRequested = false; state.stopAccepted = false;
        state.preparationId = preparationId;
        // A read begun before this run must not clear its identity/result, even after retirement.
        revision++;
        emit();
        await sdk.prepare(config);
        if (!current()) return staleReceipt();
        const generation = pageGeneration;
        const info = await sdk.currentPage();
        if (!current()) return staleReceipt();
        if (generation !== pageGeneration || info?.status !== 'available' || targetUrl(info.url) !== state.target?.url) throw new Error('当前网页已变化，请重新确认目标');
        if (state.stopRequested || disposed) {
          if (!disposed) state.notice = '已取消，未发起任务';
          return businessReceipt(disposed ? 'blocked' : 'cancelled', {preparationId:state.preparationId, dispatchPrevented:true});
        }
        const clientRequestId = requestId = crypto.randomUUID();
        const runProfile = {id: state.selectedId, name: state.records.find(row => row.id === state.selectedId)?.name ?? '未保存配置',url:expected,startedAt:new Date().toISOString(),config:copy(config)};
        // Replace the retired run only when dispatching its successor.
        state.runProfile = runProfile;
        state.retired = false; state.runId = null; state.clientRequestId = clientRequestId;
        state.result = null; state.snapshot = null; state.engine = '等待引擎';
        state.preparationId = null;
        sent = true; emit();
        const receipt = await sdk.start({...config, url: expected}, state.target.url, requestId);
        if (!current() || state.retired) return staleReceipt();
        if (receipt?.clientRequestId !== requestId || state.runId && receipt.runId !== state.runId) throw new Error('开始响应身份不匹配');
        if (!receipt || typeof receipt.runId !== 'string' || !receipt.runId) {
          state.phase = 'unknown'; throw new Error('开始结果未知，缺少运行身份；请勿重复开始');
        }
        state.runId = runId = receipt.runId; state.phase = 'running'; state.host = String(receipt.status || '已受理');
        if (state.stopRequested && !state.stopAccepted) await stop();
        if (!current()) return staleReceipt();
        await refresh();
      } catch (error) {
        if (!current() || sent && state.retired) return staleReceipt();
        if (sent) state.phase = 'unknown';
        state.error = error.message;
        if (sent && state.stopRequested && !disposed) await refresh();
      } finally {
        if (current()) {
          state.preparationId = null;
          if (!sent && state.phase === 'starting') Object.assign(state, previous);
          emit();
        }
      }
      return current() ? businessReceipt(!sent ? 'failed' : state.phase === 'unknown' ? 'unknown' : 'accepted') : staleReceipt();
    }
    async function download(format = 'json', output) {
      if (disposed) return businessReceipt('blocked');
      const binding = {snapshot:state.snapshot, result:state.result, clientRequestId:state.clientRequestId,
        runId:state.runId, profileEpoch:state.profileEpoch, generation:startGeneration};
      const originalReceipt = businessReceipt('failed');
      const current = () => !disposed && binding.generation === startGeneration &&
        binding.snapshot === state.snapshot && binding.result === state.result &&
        binding.clientRequestId === state.clientRequestId && binding.runId === state.runId && binding.profileEpoch === state.profileEpoch;
      state.notice = ''; state.error = ''; emit();
      let status = 'failed', outcomeError = '', errorCode = '';
      try {
        if (!['json', 'csv'].includes(format)) throw new Error('不支持的导出格式');
        if (!state.snapshot || state.result == null) throw new Error('尚无可导出的真实结果');
        status = 'unknown';
        const receipt = await sdk.download(binding.snapshot, format, output);
        if (receipt?.started !== true) throw new Error('下载请求结果未知');
        status = 'accepted';
        if (current()) {state.notice = '已请求下载完整 ' + format.toUpperCase() + '，请在浏览器下载列表确认'; state.error = '';}
      } catch (error) {outcomeError = error.message; errorCode = error.code || ''; if (current()) state.error = error.message;}
      if (current()) emit();
      return {...originalReceipt, status:disposed ? 'blocked' : status, error:outcomeError, errorCode, format, ...(!current() ? {stale:true} : {})};
    }
    return {state, edit, touch, checkpointDraft, cancelDraft, configIdentity, configurationLock, assertConfiguration,
      applyConfiguration, undoConfiguration, saveConfigurationCopy,
      refreshTarget, load, useSaved, save, copyProfile, renameProfile, newProfile, selectProfile, deleteProfile,
      cancelAction, confirmAction, start, stop, refresh, download,
      dispose() {disposed = true; pageGeneration++;}};
  }
  globalThis.ScrapyAppModel = Object.freeze({createApp, validateConfig, validateCatalog, DEFAULT_CONFIG, EMPTY_CONFIG, MAX_PROFILES});
})();

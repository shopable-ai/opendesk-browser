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
  const MAX_PROFILES = 10;
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
        !Array.isArray(value.records) || value.records.length > MAX_PROFILES) throw new Error('配置记录格式无效，最多 10 份');
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
    const state = {config: copy(DEFAULT_CONFIG), target: null, phase: 'idle', host: '尚未连接', engine: '尚未运行', runId: null,
      clientRequestId: null, result: null, snapshot: null, error: '', notice: '', stopRequested: false, stopAccepted: false, retired: false,
      dirty: false, saving: false, storageReady: false, conflict: null,
      records: [], selectedId: null, profileEpoch: 0, pendingAction: null, runProfile: null};
    let etag, revision = 0, loadGeneration = 0, pageGeneration = 0, disposed = false, stopping = false, reading = false;
    let catalog = readCatalog(null);
    const emit = () => { if (!disposed) onChange(state); };
    const active = () => Boolean(state.clientRequestId) && !state.retired;
    const busy = () => state.saving || state.phase === 'starting' || state.phase === 'unknown' || active();
    function touch() {
      if (busy() || state.pendingAction || disposed) throw new Error('保存或运行期间不能修改配置');
      state.dirty = true; revision++; emit();
    }
    function edit(value) {
      if (busy() || state.pendingAction || disposed) throw new Error('保存或运行期间不能修改配置');
      state.config = validateConfig(value); touch();
    }
    function clearRun() {
      Object.assign(state, {runId: null, clientRequestId: null, result: null, snapshot: null, runProfile: null,
        phase: 'idle', host: state.target ? '当前网页已连接' : '尚未连接', engine: '尚未运行', stopRequested: false, stopAccepted: false, retired: false});
    }
    function selectLocal(id, dirty = false) {
      const row = catalog.records.find(row => row.id === id);
      state.selectedId = row?.id ?? null; state.config = copy(row?.config ?? DEFAULT_CONFIG);
      state.dirty = dirty; state.pendingAction = null; state.profileEpoch++; revision++;
      clearRun();
    }
    function adopt(next) {
      catalog = copy(next); state.records = copy(next.records); selectLocal(next.selectedId);
      state.storageReady = true; state.conflict = null;
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
        if (info?.status !== 'available') throw new Error(info?.message || '当前网页不可用');
        state.target = {title: String(info.title || ''), url: targetUrl(info.url)};
        state.host = '当前网页已连接';
      } catch (error) {if (generation === pageGeneration) {state.target = null; state.host = error.message;}}
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
        if (preserve || busy() || before !== revision || state.dirty) {
          state.conflict = {catalog: saved, config: copy(saved.records.find(row => row.id === saved.selectedId)?.config ?? DEFAULT_CONFIG), etag: record.etag};
          state.notice = '已读到保存版本；草稿仍保留';
        } else {
          etag = record.etag; adopt(saved); state.error = '';
          state.notice = '已读取保存配置';
        }
      } catch (error) {if (generation === loadGeneration && !disposed) {state.storageReady = false; state.error = error.message;}}
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
      state.error = ''; state.notice = '';
      try {next = validateCatalog(next);} catch (error) {state.error = error.message; emit(); return false;}
      ++loadGeneration;
      state.saving = true; emit();
      try {
        await sdk.save(next, etag);
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
        state.error = error.message; state.storageReady = false;
        // A conflict is never retried as an unconditional write.
        state.saving = false;
        await load({preserve: true});
        return false;
      } finally {state.saving = false; emit();}
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
      if (busy() || state.pendingAction || disposed) return;
      state.error = ''; state.notice = '';
      let sent = false;
      try {
        const config = validateConfig(state.config), expected = targetUrl(url);
        if (!state.target || new URL(expected).origin !== new URL(state.target.url).origin) throw new Error('目标 URL 必须与可信当前网页同源，请刷新当前网页');
        state.phase = 'starting'; state.stopRequested = false; state.stopAccepted = false;
        // A read begun before this run must not clear its identity/result, even after retirement.
        revision++;
        state.runProfile = {id: state.selectedId, name: state.records.find(row => row.id === state.selectedId)?.name ?? '未保存配置'};
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
    return {state, edit, touch, refreshTarget, load, useSaved, save, copyProfile, renameProfile, newProfile, selectProfile, deleteProfile,
      cancelAction, confirmAction, start, stop, refresh, download,
      dispose() {disposed = true; pageGeneration++;}};
  }
  globalThis.ScrapyAppModel = Object.freeze({createApp, validateConfig, validateCatalog, DEFAULT_CONFIG, MAX_PROFILES});
})();

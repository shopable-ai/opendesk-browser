// ScrapyJS-only, declarative AI Action Adapter. No page execution or storage access.
import {completeCsvOutput} from './export-settings.js';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const reservedFields = new Set(['_listContainer', '_listItem']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function requireObject(value, message) {
  if (!isObject(value)) throw Error(message);
  return value;
}
function keys(value, allowed) {
  requireObject(value, 'AI 操作必须为对象。');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('AI 操作包含未受支持的参数。');
}
export function validateOperation(operation) {
  keys(operation, ['kind', 'format', 'mode', 'settingsSource']);
  if (!['capture.start', 'capture.stop', 'results.show', 'results.export'].includes(operation.kind) ||
      (operation.kind === 'results.export' ? !['json', 'csv'].includes(operation.format) : own(operation, 'format')))
    throw Error('AI 业务操作或导出格式无效。');
  if (['mode','settingsSource'].some(key => own(operation,key)) &&
      (operation.kind !== 'results.export' || operation.format !== 'csv') ||
      operation.mode !== undefined && !['raw','custom'].includes(operation.mode) ||
      operation.settingsSource !== undefined && (!['current','run'].includes(operation.settingsSource) || operation.mode !== 'custom'))
    throw Error('自定义 CSV 的模式或设置来源无效。');
  return {...operation};
}
// Bind a business request to its original data, not merely the selected view.
export function businessIdentity(state, kind) {
  if (kind === 'capture.stop') return JSON.stringify({runId:state.runId,
    clientRequestId:state.clientRequestId,preparationId:state.preparationId});
  const identity = {epoch:state.profileEpoch,configRevision:state.configRevision,config:state.config,page:state.target,
    runId:state.runId,clientRequestId:state.clientRequestId};
  // Stop/show follow the original run while its results continue to grow.
  if (!['capture.stop', 'results.show'].includes(kind)) {
    identity.result = state.result;
    identity.runOutput = state.runProfile?.config?.output;
  }
  return JSON.stringify(identity);
}
const businessLocks = new WeakSet(), consumed = new WeakSet();
export async function executeBusinessAction(app, proposal, {blocked = false} = {}) {
  const operation = validateOperation(proposal.operation), state = app.state;
  const preparingStop = operation.kind === 'capture.stop' && state.phase === 'starting' && Boolean(state.preparationId);
  const alreadyLocked = businessLocks.has(app);
  if (blocked || alreadyLocked && !preparingStop) throw Error('业务操作已锁定，请等待当前操作。');
  if (consumed.has(proposal)) throw Error('此动作已消费，不会自动重放。');
  if (proposal.identity !== businessIdentity(state, operation.kind)) throw Error('配置、网页或原运行结果身份已变化，请重新提议。');
  if (state.saving || state.pendingAction) throw Error('配置操作已锁定。');
  if (operation.kind === 'capture.start' && (state.phase === 'starting' || state.phase === 'unknown' ||
      state.clientRequestId && !state.retired)) throw Error('原运行未结束或结果未知，不可重复开始。');
  if (operation.kind === 'capture.stop' && !preparingStop && (!state.clientRequestId || state.retired || state.stopAccepted))
    throw Error('没有可停止的原运行。');
  if (operation.kind === 'results.export' && (!state.snapshot || state.result == null || state.snapshot.result !== state.result ||
      state.snapshot.clientRequestId !== state.clientRequestId || state.snapshot.runId !== state.runId))
    throw Error('尚无身份一致的真实结果可导出。');
  consumed.add(proposal);businessLocks.add(app);
  try {
    switch (operation.kind) {
      case 'capture.start': return await app.start(state.config.url);
      case 'capture.stop': return await app.stop();
      case 'results.show': return await app.refresh();
      case 'results.export': {
        const {output,warnings} = operation.mode === 'custom' ? completeCsvOutput(state.snapshot,
          structuredClone((operation.settingsSource === 'run' ? state.runProfile?.config : state.config)?.output || {})) : {output:undefined,warnings:[]};
        return {...await app.download(operation.format, output),warnings};
      }
    }
  } finally { if (!alreadyLocked) businessLocks.delete(app); }
}
function fieldKey(key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 128 || forbidden.has(key) || reservedFields.has(key))
    throw Error('AI 字段名称无效或属于引擎保留字段。');
  return key;
}
function mergeActions(base, actions) {
  if (!Array.isArray(actions) || !actions.length || actions.length > 16)
    throw Error('AI 配置操作必须包含 1–16 项受控动作。');
  const next = structuredClone(base);
  for (const action of actions) {
    requireObject(action, 'AI 动作必须是结构化对象。');
    switch (action.kind) {
      case 'field.upsert':
        keys(action, ['kind', 'key', 'rule']);
        next.itemConfig[fieldKey(action.key)] = action.rule;
        break;
      case 'field.remove':
        keys(action, ['kind', 'key']);
        if (!own(next.itemConfig, fieldKey(action.key))) throw Error('要移除的采集字段不存在。');
        delete next.itemConfig[action.key];
        break;
      case 'list.configure':
        keys(action, ['kind', 'container', 'item']);
        if (!own(action, 'container') && !own(action, 'item')) throw Error('请指定列表容器或列表项。');
        for (const [input, output] of [['container', '_listContainer'], ['item', '_listItem']]) {
          if (own(action, input)) {
            if (action[input] === null) delete next.itemConfig[output];
            else next.itemConfig[output] = action[input];
          }
        }
        break;
      case 'pagination.configure':
        keys(action, ['kind', 'maxPages', 'nextPageSelector']);
        if (!own(action, 'maxPages') && !own(action, 'nextPageSelector')) throw Error('请指定页数或下一页选择器。');
        for (const key of ['maxPages', 'nextPageSelector']) {
          if (own(action, key)) {
            if (action[key] === null) delete next[key];
            else next[key] = action[key];
          }
        }
        break;
      case 'detail.configure':
        keys(action, ['kind', 'detail']);
        if (!own(action, 'detail')) throw Error('缺少详情规则。');
        if (action.detail === null) delete next.detail;
        else next.detail = action.detail;
        break;
      case 'csv.configure': {
        keys(action, ['kind', 'fieldNames', 'fieldOrder']);
        if (!own(action, 'fieldNames') && !own(action, 'fieldOrder')) throw Error('请指定 CSV 表头或列顺序。');
        const output = {...(next.output || {})};
        if (own(action, 'fieldNames')) {
          requireObject(action.fieldNames, 'CSV 表头必须为字段与显示名称的映射。');
          const names = {...(output.fieldNames || {})};
          for (const [key, label] of Object.entries(action.fieldNames)) {
            fieldKey(key);
            if (label === null) delete names[key];
            else names[key] = label;
          }
          output.fieldNames = names;
        }
        if (own(action, 'fieldOrder')) {
          if (action.fieldOrder === null) delete output.fieldOrder;
          else output.fieldOrder = action.fieldOrder;
        }
        next.output = output;
        break;
      }
      default:
        throw Error('AI 返回了未授权的业务动作，未执行任何操作。');
    }
  }
  return next;
}
function describeDiff(diff) {
  const list = diff.fields.filter(row => row.kind !== '保留').map(row => row.kind + '字段 ' + row.key);
  if (diff.listChanged) list.push('调整列表范围');
  for (const row of diff.optionChanges) {
    list.push(row.key === 'output' ? '调整 CSV 表头或顺序' :
      ['nextPageSelector', 'maxPages'].includes(row.key) ? '调整分页 ' + row.key :
      row.key === 'detail' ? '调整详情规则' : '修改配置 ' + row.key);
  }
  return [...new Set(list)];
}

/**
 * Model output is untrusted data. This adapter only returns inspected data or
 * a validated configuration. The caller enforces actual user intent and the
 * original permission/lifecycle fences before invoking ScrapyJS APIs.
 */
export function resolveAiReply(raw, {base, expectedUrl, validate, changes, hasSample = false, allowFullConfig = true}) {
  const response = typeof raw === 'string' ? JSON.parse(raw) : raw;
  requireObject(response, 'AI 返回内容不是 JSON 对象。');
  if (response.type === 'operation') {
    keys(response, ['type', 'operation']);
    return {type:'operation', operation:validateOperation(response.operation)};
  }
  if (response.type === 'explain' || response.type === 'needs-input') {
    keys(response, response.type === 'explain' ? ['type', 'message'] : ['type', 'message', 'missing']);
    if (typeof response.message !== 'string' || !response.message.trim() || response.message.length > 3000)
      throw Error('AI 说明超出安全长度或为空。');
    if (response.type === 'needs-input' && (!Array.isArray(response.missing) ||
      response.missing.length > 8 || response.missing.some(item => typeof item !== 'string' || !item.trim() || item.length > 200)))
      throw Error('AI 补充资料要求不合法。');
    return {type: response.type, message: response.message.trim(), missing: response.missing || []};
  }

  let candidate;
  if (response.type === 'actions') {
    keys(response, ['type', 'actions']);
    candidate = mergeActions(base, response.actions);
  } else if (response.type === 'config.proposal') {
    keys(response, ['type', 'config']);
    if (!allowFullConfig) throw Error('未授权发送原配置，本轮只接受增量动作，不接受完整覆盖。');
    candidate = response.config;
  } else if (own(response, 'url') && own(response, 'itemConfig')) {
    // Support previous bridge replies without weakening validation.
    if (!allowFullConfig) throw Error('未授权发送原配置，本轮只接受增量动作。');
    candidate = response;
  } else {
    throw Error('AI 返回类型无效：只能说明、索取资料或提出受控配置变更。');
  }

  const config = validate(candidate);
  if (new URL(config.url).href !== new URL(expectedUrl).href)
    throw Error('AI 试图改变目标网址，请先在采集目标中确认网页。');
  const fields = new Set([...Object.keys(config.itemConfig), ...Object.keys(config.detail?.itemConfig || {})]
    .filter(key => !reservedFields.has(key)));
  // The original splitPublication pipeline emits these fixed result columns.
  if (config.processing?.rules.some(rule => rule.op === 'splitPublication')) {
    for (const key of ['publication_raw', 'author', 'translator', 'publisher', 'publication_date', 'price', 'currency'])
      fields.add(key);
  }
  for (const key of Object.keys(config.output?.fieldNames || {})) {
    if (!fields.has(key)) throw Error('CSV 显示名称引用了不存在的采集字段：' + key);
  }
  for (const key of config.output?.fieldOrder || []) {
    if (!fields.has(key)) throw Error('CSV 列顺序引用了不存在的采集字段：' + key);
  }
  const diff = changes(base, config);
  const actions = describeDiff(diff);
  const warnings = [];
  if (!hasSample && (diff.listChanged || diff.fields.some(row => row.kind !== '保留') ||
      diff.optionChanges.some(row => ['nextPageSelector', 'detail'].includes(row.key)))) {
    warnings.push('没有当前网页的 DOM 样本：新增或修改的选择器尚未经过网页验证，请先核对规则并通过原入口试采。');
  }
  if ((config.maxPages || 1) > 1 && !config.nextPageSelector && config.executionMode !== 'http-local') {
    warnings.push('已设置最多采集页数，但缺少下一页选择器，不能证明可以实际翻页。');
  }
  return {type: 'proposal', config, diff, actions, warnings};
}

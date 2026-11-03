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
// Object order is a codec detail; array order is part of the configuration.
const configValue = value => JSON.stringify(value, (_key, row) => isObject(row)
  ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row);

/** A deliberately small grammar, fully consumed from THIS turn, not AI/history. */
export function resolveConfigurationEditScope(request, base, {page = null} = {}) {
  const raw = request.trim();
  const quotePairs = {"'":"'",'"':'"','“':'”','‘':'’','「':'」','『':'』','`':'`'};
  // Only unquote a literal header value, never a quoted instruction.
  const text = raw.replace(/[。.!！]+$/u, '').trim().replace(
    /(表头改(?:成|为)\s*)(['"“‘「『`])([\p{L}\p{N}_-]+)(['"”’」』`])(?=\s*(?:$|[，,；;\n]))/gu,
    (value, prefix, open, label, close) => quotePairs[open] === close ? prefix + label : value);
  const clarify = () => ({type:'needs-input', message:'尚未修改配置，请完整说明字段与新表头、CSV 列顺序、最大页数或明确的字段选择器；无法根据网址推导网页规则。'});
  // A new list is inferred from an authorized page observation, never from a URL
  // or a previous configuration. Existing drafts keep the exact-edit contract.
  if (/(?:创建|新建|生成|建立|制作).{0,16}(?:采集|爬虫|配置|规则)|\b(?:create|generate|build)\b.{0,40}\b(?:config|scrap|collect)/iu.test(text) &&
      !/解释|讨论|示例|如果|假如|不要|不需要|不创建|如何|怎么|是否|[？?]|^["'“‘「『`]|\b(?:explain|discuss|if|don't|how)\b/iu.test(text)) {
    if (Object.keys(base.itemConfig).length || Object.keys(base).some(key=>!['url','itemConfig'].includes(key)))
      return {type:'needs-input',message:'请先在配置库新建空白配置，已有配置已保留。'};
    if (!page?.url || base.url && new URL(base.url).href!==new URL(page.url).href)
      return {type:'needs-input',message:'请先打开目标网页并刷新当前网页信息。'};
    if (!/(?:只|仅)采(?:集)?当前页|(?:只|仅)(?:采集)?(?:当前|本)页|\b(?:current page only|only (?:the )?current page)\b/iu.test(text))
      return {type:'needs-input',message:'请说明要采集的字段及范围；目前可从当前页创建列表配置。'};
    const names=text.match(/CSV\s*表头(?:分别)?(?:为|是|设为)\s*(.+?)(?=[，,]\s*(?:只|仅)|$)/iu);
    const headers=names?names[1].split(/[、，,]/u).map(value=>value.trim()):null;
    if(headers&&(headers.some(value=>!value||value.length>80)||new Set(headers).size!==headers.length))return clarify();
    return {type:'create',base:structuredClone(base),url:page.url,headers};
  }
  if (!text || /["'“”「」『』`<>]|引用|示例|样本中的|别人说|有人建议|不要|不需要|不必|不修改|不更改|别改|解释|说明|讨论|影响|风险|会怎样|会怎么样|为什么|为何|如何|怎么|是否|能否|如果|假如|[？?]|\b(?:don't|do not|explain|discuss|risk|impact|why|how|whether|if)\b/i.test(text))
    return {type:'readonly', message:'尚未修改配置，请直接说明要修改的内容。'};
  const expected = structuredClone(base), touched = new Set();
  const touch = key => {
    if (touched.has(key)) throw Error('请合并重复或矛盾的修改要求。');
    touched.add(key);
  };
  const field = key => {
    fieldKey(key);
    if (!own(base.itemConfig, key) && !own(base.detail?.itemConfig || {}, key))
      throw Error('字段不存在，请明确已有字段。');
    return key;
  };
  try {
    // Literal selector bytes must not pass through sentence-punctuation cleanup.
    const literal = raw.match(/^(?:请\s*)?把采集规则设为\s*([\w-]+)\s*字段[，,]\s*选择器\s+([^\s，,；;。]+)$/u);
    const copy = text.match(/^保留全部规则[，,]\s*只增加与\s*([\w-]+)\s*相同的\s*([\w-]+)[，,]\s*仅采当前页$/u);
    if (literal) {
      const [, key, selector] = literal;
      if (/[.!！]$/u.test(selector) &&
          (selector.slice(0,-1).match(/\\+$/u)?.[0].length || 0) % 2 !== 1)
        return clarify(); // Ambiguous sentence punctuation is never removed.
      fieldKey(key);
      expected.itemConfig[key] = selector;
      // Only an entirely empty workspace may initialize its URL from the page.
      if (!base.url) {
        if (Object.keys(base.itemConfig).length || !page?.url) return clarify();
        expected.url = page.url;
      }
    } else if (copy) {
      const [, source, destination] = copy;
      fieldKey(source);fieldKey(destination);
      if (!own(base.itemConfig, source) || own(base.itemConfig, destination)) return clarify();
      expected.itemConfig[destination] = structuredClone(base.itemConfig[source]);
      if (own(base, 'maxPages')) expected.maxPages = 1;
    } else {
      const clauses = text.split(/[，,；;\n]/u).map(part => part.trim());
      if (!clauses.length || clauses.length > 16 || clauses.some(part => !part)) return clarify();
      for (const [index, clause] of clauses.entries()) {
        let match;
        if ((match = clause.match(/^(?:请\s*)?(?:把\s*([\w-]+)\s*的\s*CSV\s*|(?:把\s*)?CSV\s*中\s*([\w-]+)\s*的\s*(?:字段\s*)?)表头改(?:成|为)\s*([\p{L}\p{N}_-]+)$/iu))) {
          const key = field(match[1] || match[2]), label = match[3];
          if (/并|同时|然后|但是|改成|改为|设为/u.test(label)) return clarify();
          touch('header.' + key);
          expected.output = {...expected.output, fieldNames:{...expected.output?.fieldNames, [key]:label}};
        } else if ((match = clause.match(/^(?:(?:请\s*)?把\s*)?(?:CSV\s*)?列顺序改为\s*([\w-]+(?:\s*、\s*[\w-]+)*)$/iu))) {
          touch('order');
          const order = match[1].split('、').map(key => field(key.trim()));
          if (new Set(order).size !== order.length) return clarify();
          expected.output = {...expected.output, fieldOrder:order};
        } else if ((match = clause.match(/^(?:请\s*)?把最大页数设为\s*([1-9]\d*)$/u))) {
          touch('maxPages');expected.maxPages = Number(match[1]);
        } else if (index === clauses.length - 1 && touched.size && /^(?:请\s*)?修改配置$/u.test(clause)) {
          // This suffix confirms the preceding explicit edits; it grants no scope.
          continue;
        } else return clarify();
      }
    }
    return {type:'edit', base:structuredClone(base), expected};
  } catch {
    return clarify();
  }
}

export function assertConfigurationEditScope(scope, base, candidate, validate) {
  if(scope.type==='create'){
    const config=validate(candidate),fields=Object.keys(config.itemConfig).filter(key=>!reservedFields.has(key));
    if(configValue(base)!==configValue(scope.base)||new URL(config.url).href!==new URL(scope.url).href||
      !config.itemConfig._listItem||!fields.length||(config.maxPages??1)!==1||
      Object.keys(config).some(key=>!['url','itemConfig','output','maxPages','timeoutMs','waitForSelector'].includes(key)))
      throw Error('新配置必须是当前网页的单页列表，不得增加翻页、详情或其他操作；未应用。');
    if(scope.headers){
      const order=config.output?.fieldOrder||fields;
      if(fields.length!==scope.headers.length||order.length!==fields.length||
        order.some((key,index)=>!fields.includes(key)||config.output?.fieldNames?.[key]!==scope.headers[index]))
        throw Error('AI 返回的字段和 CSV 表头与本轮要求不一致，未应用。');
    }
    return;
  }
  if (scope.type !== 'edit') throw Error(scope.message);
  if (configValue(base) !== configValue(scope.base) ||
      configValue(validate(candidate)) !== configValue(validate(scope.expected)))
    throw Error('AI 返回的配置超出本轮要求或指定值不一致，整批未应用；请编辑要求后重发。');
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

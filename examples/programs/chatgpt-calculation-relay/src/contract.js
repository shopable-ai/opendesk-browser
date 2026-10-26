// A deliberately bounded integer domain: |A| <= 2e6, |B| <= 2e12,
// both exactly representable as JavaScript safe integers.
export const INTEGER_LIMIT = 1000000;
const defaults = {addend:17, secondAddend:25, multiplier:3};
const fail = message => Object.assign(new Error('E_RELAY_PARAMS: ' + message), {code:'E_RELAY_PARAMS'});
export function calculationInput(value) {
  const input = {};
  for (const key of Object.keys(defaults)) {
    const number = value[key] === undefined ? defaults[key] : value[key];
    if (!Number.isSafeInteger(number) || Math.abs(number) > INTEGER_LIMIT)
      throw fail(key + ' 必须为 -1000000 到 1000000 的安全整数');
    input[key] = number;
  }
  if (!Number.isSafeInteger(input.addend + input.secondAddend) ||
      !Number.isSafeInteger((input.addend + input.secondAddend) * input.multiplier))
    throw fail('计算结果超出安全整数范围');
  return input;
}
export function sameInput(input, record) {
  const saved = calculationInput(record);
  return Object.keys(defaults).every(key => input[key] === saved[key]);
}
export function validateParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params) ||
      (params.operation !== undefined && !['run','status','inspect','reconcile'].includes(params.operation)) ||
      Object.keys(params).some(key => ![...Object.keys(defaults),'operation','runId'].includes(key)) ||
      (params.runId !== undefined && (typeof params.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(params.runId))))
    throw fail('参数或运行标识无效');
  calculationInput(params);
}

const replyError = message => Object.assign(new Error('E_RELAY_REPLY: ' + message), {code:'E_RELAY_REPLY'});
const checkReply = (ok, _code, message) => {if (!ok) throw replyError(message);};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function makePrompt(runId, step, operand, input = {secondAddend:25, multiplier:3}) {
  const calculation = step === 'A' ? `${operand} + ${input.secondAddend}` : `上一任务结果 ${operand} × ${input.multiplier}`;
  return `计算：${calculation}。只返回一行 JSON，字段必须是 ` +
    `{"runId":"${runId}","step":"${step}","value":数值}。不要代码块或解释。`;
}

export function parseReply(raw, runId, step, expected) {
  checkReply(typeof raw === 'string' && raw.length <= 4096 && !/[\r\n]/.test(raw.trim()),
    'E_RELAY_REPLY', '回复必须为有界单行 JSON');
  let result;
  try {result = JSON.parse(raw.trim());} catch {throw replyError('回复不是完整 JSON');}
  checkReply(result && !Array.isArray(result) && equal(Object.keys(result).sort(), ['runId','step','value']) &&
    result.runId === runId && result.step === step && Number.isSafeInteger(result.value) && result.value === expected,
    'E_RELAY_REPLY', '运行标识、步骤、字段或独立计算校验不符');
  return result;
}

// Validate existing v1 records without normalization, migration or invented evidence.
// A coherent journal is business evidence only, never proof of a Host execution.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.length > 0;
const conversation = value => typeof value === 'string' && /^c\/[a-z0-9-]{8,}$/i.test(value);
const messageId = (value, role) => identity(value) && value.startsWith(role + ':') && value.length > role.length + 1;
const completionSignal = 'official-turn-complete-or-copy-action; no-streaming; stable-twice';
const journalError = message => Object.assign(new Error('E_RELAY_STORAGE: ' + message), {code:'E_RELAY_STORAGE'});
const checkJournal = (ok, message) => {if (!ok) throw journalError(message);};
function matchesURL(value, route) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^(?:\/g\/[^/]+)?\/c\/([a-z0-9-]{8,})\/?$/i);
    return url.origin === 'https://chatgpt.com' && !url.username && !url.password &&
      url.searchParams.get('temporary-chat') !== 'true' && match &&
      'c/' + match[1].toLowerCase() === route;
  } catch {return false;}
}
export function validateJournal(record, runId = record?.runId) {
  checkJournal(object(record) && record.format === 'opendesk.chatgpt-calculation-relay.v1' &&
    typeof runId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(runId) && record.runId === runId &&
    Number.isSafeInteger(record.addend) && object(record.steps) && object(record.steps.A) && object(record.steps.B),
    '接力记录身份无效');
  let input;
  try {input = calculationInput(record);} catch {throw journalError('接力计算输入无效');}
  checkJournal(['queued','running','unknown','completed'].includes(record.status), '接力状态无效');
  const a = input.addend + input.secondAddend;
  for (const id of ['A','B']) {
    const step = record.steps[id], expected = id === 'A' ? a : a * input.multiplier;
    checkJournal(['queued','sending','sent','waiting_reply','completed','unknown'].includes(step.state), '步骤状态无效');
    // Unknown B may be the formerly queued step after a failed navigation;
    // a completed result may survive an unknown caused by final persistence.
    const prepared = step.prompt !== undefined || step.clickIntent !== undefined ||
      ['sending','sent','waiting_reply','completed'].includes(step.state) || step.result !== undefined || step.user !== undefined;
    if (prepared) {
      checkJournal(step.state !== 'queued', '排队步骤包含发送证据');
      checkJournal(step.prompt === makePrompt(runId, id, id === 'A' ? input.addend : a, input) &&
        step.nonce === runId + '-' + id && identity(step.documentId) &&
        (step.startRoute === null || conversation(step.startRoute)) && Array.isArray(step.baseline) &&
        step.baseline.every(identity) && new Set(step.baseline).size === step.baseline.length &&
        typeof step.clickIntent === 'boolean', '步骤发送身份或原文无效');
      if (id === 'B') checkJournal(record.steps.A.state === 'completed' &&
        step.startRoute === null && step.baseline.length === 0, 'B 缺少已完成 A 或全新对话');
    }
    if (['sent','waiting_reply','completed'].includes(step.state) || step.user !== undefined || step.result !== undefined) {
      const user = step.user;
      checkJournal(step.clickIntent === true && object(user) && user.role === 'user' &&
        messageId(user.key,'user') && !step.baseline.includes(user.key) && user.text === step.prompt &&
        user.documentId === step.documentId && conversation(user.route) && matchesURL(user.url,user.route) &&
        (step.startRoute === null || step.startRoute === user.route), '已发送用户消息身份无效');
    }
    if (step.state === 'completed' || step.result !== undefined) {
      const result = step.result;
      checkJournal(object(result) && ['completed','unknown'].includes(step.state), '已完成步骤缺少回复证据或状态不符');
      try {parseReply(result.raw,runId,id,expected);} catch {throw journalError('回复原文或算术校验不符');}
      checkJournal(result.runId === runId && result.step === id && result.value === expected &&
        result.documentId === step.documentId && result.conversation === step.user.route &&
        matchesURL(result.url,result.conversation) && result.userMessageId === step.user.key &&
        messageId(result.assistantMessageId,'assistant') && !step.baseline.includes(result.assistantMessageId) &&
        result.completionSignal === completionSignal, '已完成回复身份或完成信号无效');
    }
  }
  if (record.handoff !== undefined) {
    const handoff = record.handoff, result = record.steps.A.result;
    checkJournal(object(handoff) && ['navigating','bound'].includes(handoff.state) &&
      record.steps.A.state === 'completed' && handoff.fromDocumentId === result.documentId &&
      handoff.fromConversation === result.conversation && handoff.sourceStep === 'A' &&
      handoff.sourceJournalKey === record.format + ':' + runId, '导航交接来源无效');
    if (handoff.state === 'bound') checkJournal(identity(handoff.toDocumentId) &&
      handoff.toDocumentId !== handoff.fromDocumentId &&
      (record.steps.B.documentId === undefined || record.steps.B.documentId === handoff.toDocumentId), '导航重绑身份无效');
  }
  if (record.steps.B.prompt !== undefined) checkJournal(record.handoff?.state === 'bound', 'B 缺少可信导航交接');
  if (record.status === 'queued') checkJournal(record.steps.A.state === 'queued' && record.steps.B.state === 'queued', '排队状态不一致');
  if (record.status === 'unknown') checkJournal(object(record.error) && ['A','B'].includes(record.error.step) &&
    record.steps[record.error.step].state === 'unknown', '未知状态缺少原步骤围栏');
  if (record.status === 'completed') checkJournal(record.steps.A.state === 'completed' &&
    record.steps.B.state === 'completed' && record.handoff?.state === 'bound' && record.error === undefined &&
    record.steps.A.result.conversation !== record.steps.B.result.conversation, '最终完成状态不一致');
  return record;
}
export function validateRelayResult(result, runId = result?.runId) {
  validateJournal(result,runId);
  checkJournal(result.status === 'completed' && result.journalKey === result.format + ':' + runId, '最终业务返回无效');
  return result;
}

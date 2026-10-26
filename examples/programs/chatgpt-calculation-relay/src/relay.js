import {createConversationSession, assertBlank} from './conversation.js';
import {validateParams, calculationInput, sameInput, makePrompt, parseReply, validateJournal, validateRelayResult} from './contract.js';

const PREFIX = 'opendesk.chatgpt-calculation-relay.v1:';
export const ACTIVE_KEY = PREFIX + 'active';
export const journalKey = runId => PREFIX + runId;
const fail = (code, message) => Object.assign(new Error(code + ': ' + message), {code});
const requireState = (ok, code, message) => {if (!ok) throw fail(code, message);};
const parseRecord = raw => {
  if (raw === null || raw === undefined) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid record');
    return value;
  } catch {throw fail('E_RELAY_STORAGE', '存储内容无法解析，保留原记录');}
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export {makePrompt, parseReply} from './contract.js';

// One fixed A→B business flow, not a scheduler or a replacement RunHost.
// store is the public AppStorage facade. Tests exercise this same module with
// isolated dependencies; those tests never assert real Chrome execution.
export async function runCalculationRelay({site, store, params = {},
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  newId = () => 'relay-' + crypto.randomUUID(), limits = {ready:8000, send:6000, reply:40000, poll:500}}) {
  // The reviewed Task has a 120s deadline. Business work uses a shared 105s
  // budget with its final 5s reserved for persistence; never extend the Host deadline.
  const workDeadline = now() + (limits.total ?? 105000) - (limits.settle ?? 5000);
  const assertBudget = () => requireState(now() < workDeadline, 'E_RELAY_TIMEOUT', '接力总预算不足，停止新副作用并落账');
  validateParams(params);
  const input = calculationInput(params), {addend, secondAddend, multiplier} = input;
  const operation = params.operation ?? 'run';
  const active = parseRecord(await store.getItem(ACTIVE_KEY));
  if (active) requireState(typeof active.runId === 'string' && active.key === journalKey(active.runId),
    'E_RELAY_STORAGE', '当前接力指针无效');
  const runId = params.runId ?? (operation === 'status' ? active?.runId : newId());
  if (!runId) return {status:'not_found'};
  requireState(/^[a-zA-Z0-9_-]{8,80}$/.test(runId), 'E_RELAY_PARAMS', '运行标识无效');
  const key = journalKey(runId);
  const read = async () => {
    const record = parseRecord(await store.getItem(key));
    if (record !== null) validateJournal(record, runId);
    return record;
  };
  let state = await read();
  if (operation === 'status') return state ? {...state, journalKey:key, readOnly:true,
    statusSource:'persistent-journal', needsReconciliation:state.status !== 'completed'} : {status:'not_found', runId};
  if (operation === 'inspect') {
    const bound = await site.bind(), step = state?.steps[state.error?.step];
    requireState(!step || bound === step.documentId, 'E_RELAY_TARGET', '只读对账必须绑定原文档');
    return {runId, readOnly:true, record:state,
      observation:await site.read(step?.baseline), selectorDiagnostics:await site.inspect(runId)};
  }
  const reconciling = operation === 'reconcile';
  if (reconciling) requireState(params.runId && state?.status === 'unknown' && sameInput(input, state) &&
    active?.runId === runId && ['A','B'].includes(state.error?.step) &&
    state.steps[state.error.step].clickIntent === true,
    'E_RELAY_RECONCILE', '只能显式对账同一 runId 已有点击意图的未知步骤；禁止重发');
  if (state) {
    requireState(sameInput(input, state), 'E_RELAY_PARAMS', '同一 runId 不能更换测试输入');
    if (!reconciling) return {...state, journalKey:key, readOnly:true,
    statusSource:'persistent-journal', needsReconciliation:state.status !== 'completed'}; // A repeated Run is NOT a resend.
  }
  if (active && !reconciling) {
    const old = parseRecord(await store.getItem(active.key));
    requireState(old?.runId === active.runId && old.status === 'completed',
      'E_RELAY_PENDING', '前一接力未核清；仅允许 status 读取，禁止新发送');
    validateJournal(old, active.runId);
  }
  const assertOwner = async () => requireState((await store.getItem(ACTIVE_KEY)) === JSON.stringify({runId, key}),
    'E_RELAY_OWNER', '接力指针改变，停止发送');
  const write = async record => {
    await assertOwner();
    const raw = JSON.stringify({...record, updatedAt:now()});
    await store.setItem(key, raw);
    requireState(await store.getItem(key) === raw, 'E_RELAY_READBACK', '持久化读回不一致，停止接力');
    return JSON.parse(raw);
  };
  const wait = async (timeout, check) => {
    const deadline = Math.min(now() + timeout, workDeadline);
    for (;;) {
      assertBudget();
      const value = await check();
      if (value) return value;
      requireState(now() < deadline, 'E_RELAY_TIMEOUT', '等待期限已到；禁止补发');
      await sleep(limits.poll);
    }
  };
  const conversation = createConversationSession({site, wait, assertOwner, assertBudget, now, limits});
  const firstDocument = await conversation.bind();
  const initial = await site.read();
  let currentStep = reconciling ? state.error.step : 'A';
  if (reconciling) {
    requireState(firstDocument === state.steps[currentStep].documentId && initial.draft === '' && !initial.rich,
      'E_RELAY_RECONCILE', '对账必须回到原受控文档且无草稿/附件；未发送任何消息');
    await assertOwner();
  } else {
    assertBlank(initial); // Fail BEFORE claiming storage or changing an existing draft.
    await store.setItem(ACTIVE_KEY, JSON.stringify({runId, key}));
    await assertOwner();
    state = await write({format:'opendesk.chatgpt-calculation-relay.v1', runId, addend, secondAddend, multiplier,
      status:'queued', createdAt:now(), steps:{A:{state:'queued'}, B:{state:'queued'}}});
  }
  async function execute(stepId, snapshot, operand, expected, reconcile = false) {
    const observed = await conversation.exchange({snapshot, prompt:makePrompt(runId, stepId, operand, input),
      nonce:runId + '-' + stepId, reconcile, getStep:() => state.steps[stepId],
      saveStep:async step => {
        state.status = 'running';
        state.steps[stepId] = step;
        state = await write(state);
      }});
    const result = parseReply(observed.raw, runId, stepId, expected);
    state.steps[stepId].state = 'completed';
    state.steps[stepId].result = {...result, ...observed};
    state = await write(state);
    return (await read()).steps[stepId].result; // Actual trusted store read; not an in-memory handoff.
  }
  try {
    if (currentStep === 'A') await execute('A', initial, addend, addend + secondAddend, reconciling);
    const savedA = (await read()).steps.A;
    requireState(savedA.state === 'completed' && savedA.result?.value === addend + secondAddend,
      'E_RELAY_READBACK', 'A 未有效完成并持久化');
    let next = initial;
    if (currentStep === 'A') {
      state.handoff = {state:'navigating', fromDocumentId:firstDocument,
        fromConversation:savedA.result.conversation, sourceJournalKey:key, sourceStep:'A'};
      state = await write(state); // Persist BEFORE navigation; never use Page-world memory for B.
      currentStep = 'B';
      await assertOwner();
      assertBudget();
      const nextDocument = await conversation.newConversation(Math.min(20000, workDeadline - now()));
      requireState(nextDocument && nextDocument !== firstDocument, 'E_RELAY_DOCUMENT', '新文档未可信重新绑定');
      next = await wait(limits.ready, async () => {
        try {return await site.read();}
        catch (error) {if (String(error.message).startsWith('E_RELAY_SITE:')) return null; throw error;}
      });
      assertBlank(next);
      requireState(next.documentId === nextDocument && next.route === null && next.messages.length === 0,
        'E_RELAY_CONVERSATION', '导航后不是全新空对话');
      const readAfterNavigation = await read();
      requireState(readAfterNavigation?.steps.A.state === 'completed' &&
        equal(readAfterNavigation.steps.A.result, savedA.result), 'E_RELAY_READBACK', '导航后无法读回相同 A 结果');
      state = readAfterNavigation;
      state.handoff = {...state.handoff, state:'bound', toDocumentId:nextDocument};
      state = await write(state);
    } else {
      requireState(state.handoff?.state === 'bound' && state.handoff.toDocumentId === firstDocument,
        'E_RELAY_RECONCILE', 'B 缺少原导航交接身份');
    }
    await execute('B', next, savedA.result.value, savedA.result.value * multiplier,
      reconciling && state.error?.step === 'B');
    requireState(state.steps.B.result.conversation !== state.steps.A.result.conversation,
      'E_RELAY_CONVERSATION', 'A 与 B 不是不同对话');
    state.status = 'completed';
    delete state.error;
    state = await write(state);
    return validateRelayResult({...await read(), journalKey:key}, runId); // Business evidence, not a Host receipt.
  } catch (error) {
    state.status = 'unknown';
    state.steps[currentStep].state = 'unknown';
    state.error = {code:error.code || 'E_RELAY_OPERATION', message:String(error.message).slice(0,600), step:currentStep};
    try {state = await write(state);} catch { /* Prior sending/navigating write remains the fence. */ }
    throw fail('E_RELAY_UNKNOWN', `${state.error.message}；runId=${runId}；只读 status 对账，禁止自动重发`);
  }
}

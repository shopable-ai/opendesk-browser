const PREFIX = 'opendesk.chatgpt-calculation-relay.v1:';
export const ACTIVE_KEY = PREFIX + 'active';
export const journalKey = runId => PREFIX + runId;
const fail = (code, message) => Object.assign(new Error(code + ': ' + message), {code});
const requireState = (ok, code, message) => {if (!ok) throw fail(code, message);};
const parseRecord = raw => {
  if (raw === null || raw === undefined) return null;
  try {return JSON.parse(raw);} catch {throw fail('E_RELAY_STORAGE', '存储内容无法解析，保留原记录');}
};
const keys = snapshot => snapshot.messages.map(m => m.key);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function makePrompt(runId, step, operand) {
  const calculation = step === 'A' ? `${operand} + 25` : `上一任务结果 ${operand} × 3`;
  return `计算：${calculation}。只返回一行 JSON，字段必须是 ` +
    `{"runId":"${runId}","step":"${step}","value":数值}。不要代码块或解释。`;
}

export function parseReply(raw, runId, step, expected) {
  requireState(typeof raw === 'string' && raw.length <= 4096 && !/[\r\n]/.test(raw.trim()),
    'E_RELAY_REPLY', '回复必须为有界单行 JSON');
  let result;
  try {result = JSON.parse(raw.trim());} catch {throw fail('E_RELAY_REPLY', '回复不是完整 JSON');}
  requireState(result && !Array.isArray(result) && equal(Object.keys(result).sort(), ['runId','step','value']) &&
    result.runId === runId && result.step === step && Number.isSafeInteger(result.value) && result.value === expected,
    'E_RELAY_REPLY', '运行标识、步骤、字段或独立计算校验不符');
  return result;
}

// One fixed A→B business flow, not a scheduler or a replacement RunHost.
// store is the public AppStorage facade. Tests exercise this same module with
// isolated dependencies; those tests never assert real Chrome execution.
export async function runCalculationRelay({site, store, params = {},
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  newId = () => 'relay-' + crypto.randomUUID(), limits = {ready:8000, send:6000, reply:40000, poll:500}}) {
  // Use the existing MCP Run's deadlineMs:120000. Share a 105s budget and
  // reserve its final 5s for persistence; the Sidebar's fixed 30s is insufficient.
  const workDeadline = now() + (limits.total ?? 105000) - (limits.settle ?? 5000);
  const assertBudget = () => requireState(now() < workDeadline, 'E_RELAY_TIMEOUT', '接力总预算不足，停止新副作用并落账');
  const addend = params.addend ?? 17, operation = params.operation ?? 'run';
  requireState([17,19].includes(addend) && ['run','status'].includes(operation) &&
    Object.keys(params).every(key => ['addend','operation','runId'].includes(key)) &&
    (params.runId === undefined || /^[a-zA-Z0-9_-]{8,80}$/.test(params.runId)), 'E_RELAY_PARAMS', '测试参数无效');
  const active = parseRecord(await store.getItem(ACTIVE_KEY));
  if (active) requireState(typeof active.runId === 'string' && active.key === journalKey(active.runId),
    'E_RELAY_STORAGE', '当前接力指针无效');
  const runId = params.runId ?? (operation === 'status' ? active?.runId : newId());
  if (!runId) return {status:'not_found'};
  requireState(/^[a-zA-Z0-9_-]{8,80}$/.test(runId), 'E_RELAY_PARAMS', '运行标识无效');
  const key = journalKey(runId);
  const read = async () => {
    const record = parseRecord(await store.getItem(key));
    if (record) requireState(record.format === 'opendesk.chatgpt-calculation-relay.v1' && record.runId === runId &&
      [17,19].includes(record.addend) && record.steps?.A && record.steps?.B,
      'E_RELAY_STORAGE', '接力记录身份无效');
    return record;
  };
  let state = await read();
  if (operation === 'status') return state ? {...state, journalKey:key, readOnly:true} : {status:'not_found', runId};
  if (state) {
    requireState(state.addend === addend, 'E_RELAY_PARAMS', '同一 runId 不能更换测试输入');
    return {...state, journalKey:key, readOnly:true}; // An intentional second Run is NOT a resend.
  }
  if (active) {
    const old = parseRecord(await store.getItem(active.key));
    requireState(old?.runId === active.runId && old.status === 'completed',
      'E_RELAY_PENDING', '前一接力未核清；仅允许 status 读取，禁止新发送');
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
  const assertBlank = snapshot => requireState(snapshot.draft === '' && !snapshot.rich && snapshot.idle,
    'E_RELAY_DRAFT', '官网有草稿、附件或未完成回复；未改动官网内容');
  const firstDocument = await site.bind();
  const initial = await site.read();
  assertBlank(initial); // Fail BEFORE claiming storage or changing an existing draft.
  const pointer = JSON.stringify({runId, key});
  await store.setItem(ACTIVE_KEY, pointer);
  await assertOwner();
  state = await write({format:'opendesk.chatgpt-calculation-relay.v1', runId, addend,
    status:'queued', createdAt:now(), steps:{A:{state:'queued'}, B:{state:'queued'}}});
  let currentStep = 'A';
  async function execute(stepId, snapshot, operand, expected) {
    assertBlank(snapshot);
    state.status = 'running';
    state.steps[stepId] = {state:'sending', prompt:makePrompt(runId, stepId, operand),
      nonce:runId + '-' + stepId, startRoute:snapshot.route, documentId:snapshot.documentId,
      baseline:keys(snapshot), clickIntent:false};
    state = await write(state); // Write-ahead before even filling the website.
    await assertOwner();
    assertBudget();
    await site.fill(state.steps[stepId]);
    await wait(limits.send, async () => {
      const fresh = await site.read(state.steps[stepId].baseline), step = state.steps[stepId];
      requireState(fresh.documentId === step.documentId && fresh.route === step.startRoute &&
        equal(keys(fresh), step.baseline) && fresh.draft === step.prompt && !fresh.rich && fresh.idle,
        'E_RELAY_TARGET', '填入后的网页、草稿或轮次变化');
      return fresh.sendReady;
    });
    state.steps[stepId].clickIntent = true;
    state = await write(state); // A lost click ACK must leave a durable uncertainty fence.
    await assertOwner();
    assertBudget();
    await site.send(state.steps[stepId]); // Exactly once. Never in a retry loop.
    const step = state.steps[stepId];
    const tail = fresh => {
      requireState(fresh.documentId === step.documentId &&
        (step.startRoute === null || fresh.route === step.startRoute) &&
        equal(keys(fresh).slice(0, step.baseline.length), step.baseline),
        'E_RELAY_TARGET', '来源文档或历史轮次变化');
      const added = fresh.messages.slice(step.baseline.length);
      requireState(added.filter(m => m.role === 'user').length <= 1,
        'E_RELAY_TURN', '出现其他新增用户轮次，停止接力');
      if (added.length) requireState(added[0].role === 'user' && added[0].text === step.prompt,
        'E_RELAY_TURN', '新增用户消息不是本任务的实际发送内容');
      return added;
    };
    const sent = await wait(limits.send, async () => {
      const fresh = await site.read(step.baseline), added = tail(fresh);
      return fresh.route && added[0] ? {fresh, user:added[0]} : null;
    });
    state.steps[stepId].state = 'sent';
    state.steps[stepId].user = {...sent.user, url:sent.fresh.url, route:sent.fresh.route,
      documentId:sent.fresh.documentId, observedAt:now()};
    state = await write(state);
    state.steps[stepId].state = 'waiting_reply';
    state = await write(state);
    let signature = null;
    const completed = await wait(limits.reply, async () => {
      const fresh = await site.read(step.baseline), added = tail(fresh);
      requireState(fresh.route === sent.fresh.route && added[0]?.key === sent.user.key,
        'E_RELAY_TURN', '已确认的对话或用户轮次变化');
      const replies = added.slice(1);
      requireState(replies.length <= 1 && replies.every(m => m.role === 'assistant'),
        'E_RELAY_TURN', '助手回复轮次不唯一');
      const reply = replies[0];
      if (!reply?.complete || reply.streaming || fresh.busy) {signature = null; return null;}
      const current = JSON.stringify([fresh.route, reply.key, reply.text]);
      const stable = current === signature;
      signature = current;
      return stable ? {reply, fresh} : null; // Explicit completion AND a stable second observation.
    });
    const result = parseReply(completed.reply.text, runId, stepId, expected);
    state.steps[stepId].state = 'completed';
    state.steps[stepId].result = {...result, raw:completed.reply.text,
      conversation:completed.fresh.route, url:completed.fresh.url,
      documentId:completed.fresh.documentId, userMessageId:sent.user.key,
      assistantMessageId:completed.reply.key, completionSignal:'official-turn-complete-or-copy-action; no-streaming; stable-twice',
      completedAt:now()};
    state = await write(state);
    return (await read()).steps[stepId].result; // Actual trusted store read; not an in-memory handoff.
  }
  try {
    await execute('A', initial, addend, addend + 25);
    const savedA = (await read()).steps.A;
    requireState(savedA.state === 'completed' && savedA.result?.value === addend + 25,
      'E_RELAY_READBACK', 'A 未有效完成并持久化');
    state.handoff = {state:'navigating', fromDocumentId:firstDocument,
      fromConversation:savedA.result.conversation, sourceJournalKey:key, sourceStep:'A'};
    state = await write(state); // Persist BEFORE navigation; never use Page-world memory for B.
    currentStep = 'B';
    await assertOwner();
    assertBudget();
    const nextDocument = await site.newConversation(Math.min(20000, workDeadline - now()));
    requireState(nextDocument && nextDocument !== firstDocument, 'E_RELAY_DOCUMENT', '新文档未可信重新绑定');
    const next = await wait(limits.ready, async () => {
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
    await execute('B', next, readAfterNavigation.steps.A.result.value, readAfterNavigation.steps.A.result.value * 3);
    requireState(state.steps.B.result.conversation !== state.steps.A.result.conversation,
      'E_RELAY_CONVERSATION', 'A 与 B 不是不同对话');
    state.status = 'completed';
    state = await write(state);
    return {...await read(), journalKey:key}; // RunHost also persists this final Controller return.
  } catch (error) {
    state.status = 'unknown';
    state.steps[currentStep].state = 'unknown';
    state.error = {code:error.code || 'E_RELAY_OPERATION', message:String(error.message).slice(0,600), step:currentStep};
    try {state = await write(state);} catch { /* Prior sending/navigating write remains the fence. */ }
    throw fail('E_RELAY_UNKNOWN', `${state.error.message}；runId=${runId}；只读 status 对账，禁止自动重发`);
  }
}

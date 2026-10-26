// Official conversation mechanics independent of calculation prompts and JSON.
// saveStep must durably write AND read back each transition before resolving.
// The caller owns completion/unknown journal states. An exchange error never
// authorizes a retry: only explicit reconciliation may observe an existing click.
const fail = (code, message) => Object.assign(new Error(code + ': ' + message), {code});
const requireState = (ok, code, message) => {if (!ok) throw fail(code, message);};
const keys = snapshot => snapshot.messages.map(m => m.key);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const assertBlank = snapshot => requireState(snapshot.draft === '' && !snapshot.rich && snapshot.idle,
    'E_RELAY_DRAFT', '官网有草稿、附件或未完成回复；未改动官网内容 ' + JSON.stringify({
      draftLength:snapshot.draft.length, whitespaceOnly:/^\s*$/.test(snapshot.draft),
      rich:snapshot.rich, idle:snapshot.idle, busy:snapshot.busy}));

export function createConversationSession({site, wait, assertOwner, assertBudget, now, limits}) {
  return {
    bind:() => site.bind(),
    newConversation:timeout => site.newConversation(timeout),
    async exchange({snapshot, prompt, nonce, reconcile = false, getStep, saveStep}) {
      if (reconcile) {
        requireState(getStep()?.state === 'unknown' && getStep().clickIntent === true &&
          snapshot.documentId === getStep().documentId && snapshot.draft === '' && !snapshot.rich &&
          getStep().prompt === prompt,
          'E_RELAY_RECONCILE', '原发送内容与本次任务不符；禁止重发');
      } else {
        requireState(!getStep() || getStep().state === 'queued' && !getStep().clickIntent,
          'E_RELAY_RECONCILE', '已有发送记录只允许显式对账；禁止重发');
        assertBlank(snapshot);
        await saveStep({state:'sending', prompt,
          nonce, startRoute:snapshot.route, documentId:snapshot.documentId,
          baseline:keys(snapshot), clickIntent:false}); // Write-ahead before even filling the website.
        await assertOwner();
        assertBudget();
        await site.fill(getStep());
        await wait(limits.send, async () => {
          const fresh = await site.read(getStep().baseline), step = getStep();
          requireState(fresh.documentId === step.documentId && fresh.route === step.startRoute &&
            equal(keys(fresh), step.baseline) && fresh.draft === step.prompt && !fresh.rich && fresh.idle,
            'E_RELAY_TARGET', '填入后的网页、草稿或轮次变化');
          return fresh.sendReady;
        });
        await saveStep({...getStep(), clickIntent:true}); // A lost click ACK must leave a durable uncertainty fence.
        await assertOwner();
        assertBudget();
        await site.send(getStep()); // Exactly once. Never in a retry loop.
      }
      const step = getStep();
      const readAfterClick = async () => {
        try {return await site.read(step.baseline);}
        catch (error) {
          // A transient SPA route/editor is only an absent read, never a click retry.
          // Authority, transport and document errors still stop immediately.
          if (String(error.message).startsWith('E_RELAY_SITE:')) return null;
          throw error;
        }
      };
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
        const fresh = await readAfterClick();
        if (!fresh) return null;
        const added = tail(fresh);
        return fresh.route && added[0] ? {fresh, user:added[0]} : null;
      });
      await saveStep({...getStep(), state:'sent', user:{...sent.user, url:sent.fresh.url,
        route:sent.fresh.route, documentId:sent.fresh.documentId, observedAt:now()}});
      await saveStep({...getStep(), state:'waiting_reply'});
      let signature = null;
      const completed = await wait(limits.reply, async () => {
        const fresh = await readAfterClick();
        if (!fresh) {signature = null; return null;}
        const added = tail(fresh);
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
      return {raw:completed.reply.text,
        conversation:completed.fresh.route, url:completed.fresh.url,
        documentId:completed.fresh.documentId, userMessageId:sent.user.key,
        assistantMessageId:completed.reply.key, completionSignal:'official-turn-complete-or-copy-action; no-streaming; stable-twice',
        completedAt:now()};
    }
  };
}

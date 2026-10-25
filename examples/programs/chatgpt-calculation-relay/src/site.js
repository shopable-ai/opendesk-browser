// Site-specific DOM adapter over the existing, authorized Controller Page API.
// Composer/confirmation guards follow chatgpt-send-queue/src/site.js (read-only
// reference). Its Page-only factory cannot be imported by an independent project.
// This function is serialized by page.evaluate: keep every dependency inside it.
export function chatgptDOM(action, input = {}) {
  const doc = document, win = window;
  const fail = reason => ({ok:false, reason});
  const routeMatch = win.location.pathname.match(/^(?:\/g\/[^/]+)?\/c\/([a-z0-9-]{8,})\/?$/i);
  const route = routeMatch ? 'c/' + routeMatch[1].toLowerCase() : null;
  if (win !== win.top || win.location.origin !== 'https://chatgpt.com' ||
      (!route && win.location.pathname !== '/') ||
      new URL(win.location.href).searchParams.get('temporary-chat') === 'true')
    return fail('仅支持官方 ChatGPT 顶层持久对话或新对话首页');
  const visible = el => el.isConnected && !el.closest('[hidden],[inert],[aria-hidden="true"],[data-opendesk-ui-owner]') &&
    win.getComputedStyle(el).display !== 'none' && win.getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const editors = [...doc.querySelectorAll('#prompt-textarea,[data-testid="composer-input"],form textarea[data-testid],form [contenteditable="true"][role="textbox"][data-composer-markdown]')]
    .filter(el => visible(el) && (el.isContentEditable || typeof el.value === 'string'));
  if (editors.length !== 1) return fail('原生编辑器不存在或不唯一');
  const editor = editors[0], form = editor.closest('form');
  if (!form || !form.isConnected) return fail('无法确认原生表单');
  const draft = typeof editor.value === 'string' ? editor.value : (editor.innerText ?? editor.textContent ?? '');
  const rich = !!form.querySelector('[data-attachment-id],[data-file-id]') ||
    !!editor.querySelector('img,video,canvas,iframe,[data-attachment-id],[data-file-id]');
  const buttons = [...form.querySelectorAll('button')].filter(visible);
  const stops = buttons.filter(el => /^(stop-button|composer-stop-button)$/.test(el.getAttribute('data-testid') || '') ||
    /^(stop generating|stop generation|stop responding|stop|停止生成|停止回复|停止)$/i.test(el.getAttribute('aria-label') || ''));
  const sends = buttons.filter(el => /^(send-button|composer-send-button|composer-submit-button)$/.test(el.getAttribute('data-testid') || '') ||
    /^(send message|send prompt|send|发送消息|发送|送出)$/i.test(el.getAttribute('aria-label') || ''));
  if (stops.length > 1 || sends.length > 1) return fail('发送或停止按钮存在歧义');
  const selector = '[data-message-author-role="user"],[data-message-author-role="assistant"],[data-message-role="user"],[data-message-role="assistant"]';
  const nodes = [...doc.querySelectorAll(selector)].filter(el => !el.parentElement?.closest(selector));
  if (nodes.length > 160) return fail('测试对话历史过长，请使用专用短对话');
  const baseline = new Set(input.baseline || []);
  const messages = nodes.map(el => {
    const role = el.getAttribute('data-message-author-role') || el.getAttribute('data-message-role');
    const turn = el.closest('article,[data-testid^="conversation-turn-"],[data-turn-id]') || el;
    const id = el.getAttribute('data-message-id') || el.id || turn.getAttribute('data-turn-id') || turn.getAttribute('data-testid') || turn.id;
    const key = id ? role + ':' + id : null;
    const stateNode = el.closest('[data-talvt-turn-state]') || turn;
    const turnState = stateNode.getAttribute('data-talvt-turn-state');
    const streaming = (turnState && turnState !== 'complete') ||
      el.matches('[data-is-streaming="true"],[aria-busy="true"],.result-streaming') ||
      !!turn.querySelector('[data-is-streaming="true"],[aria-busy="true"],.result-streaming');
    const complete = role === 'assistant' && !streaming &&
      (turnState === 'complete' || !!turn.querySelector('[data-testid="copy-turn-action-button"],[data-assistant-message-actions]'));
    // History contributes identity only; read text solely for this new turn.
    const content = el.querySelector('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap,.markdown') || el;
    return {key, role, complete, streaming:!!streaming,
      text:input.baseline && !baseline.has(key) ? (content.innerText ?? content.textContent ?? '') : null};
  });
  const keys = messages.map(m => m.key);
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) return fail('网页消息缺少唯一轮次身份');
  const last = messages.at(-1);
  const idle = !stops.length && (!last || last.role === 'assistant' && last.complete);
  const sendReady = sends.length === 1 && !sends[0].disabled && sends[0].getAttribute('aria-disabled') !== 'true';
  const snapshot = {ok:true, url:win.location.href, route, draft, rich, idle, busy:!!stops.length,
    sendReady, messages};
  if (action === 'read') return snapshot;
  const equalKeys = expected => JSON.stringify(keys) === JSON.stringify(expected);
  const tokenKey = Symbol.for('opendesk.chatgpt-calculation-relay.prepared.v1');
  if (action === 'fill') {
    if (route !== input.route || !equalKeys(input.keys) || !idle || rich || draft !== '' ||
        editor.readOnly || editor.getAttribute('aria-disabled') === 'true') return fail('草稿、回复状态或目标已变化，未填入');
    if (typeof editor.value === 'string') {
      const proto = editor.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(editor, input.text);
      editor.dispatchEvent(new win.InputEvent('input', {bubbles:true, inputType:'insertText', data:input.text}));
    } else {
      editor.focus();
      const selection = win.getSelection(), range = doc.createRange();
      range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
      if (!doc.execCommand('insertText', false, input.text)) return fail('官网未接收输入，未点击发送');
    }
    const actual = typeof editor.value === 'string' ? editor.value : (editor.innerText ?? editor.textContent ?? '');
    if (!editor.isConnected || actual !== input.text) return fail('输入读回不一致，未点击发送');
    // A replaced React editor/form cannot inherit the right to click.
    editor[tokenKey] = {nonce:input.nonce, form, text:input.text, route, keys:input.keys};
    return {ok:true};
  }
  if (action === 'send') {
    const token = editor[tokenKey];
    if (!token || token.nonce !== input.nonce || token.form !== form || token.text !== input.text ||
        token.route !== route || !equalKeys(token.keys) || rich || !idle || !sendReady || draft !== input.text)
      return fail('准备令牌、编辑器或消息状态已变化，未点击发送');
    delete editor[tokenKey]; // Consume BEFORE the only click, including throwing clicks.
    sends[0].click();
    return {ok:true, clicked:true}; // Not a send receipt; the Controller must read the new user turn.
  }
  return fail('未知站点动作');
}

export function createChatGPTControllerSite(page) {
  let documentId = null;
  return {
    async bind() {
      const {document:target} = await page.observe({root:'body', maxDepth:1, maxNodes:1, maxChars:256});
      if (!target?.documentId || new URL(target.url).origin !== 'https://chatgpt.com')
        throw new Error('E_RELAY_TARGET: 缺少可信 ChatGPT documentId');
      documentId = target.documentId;
      return documentId;
    },
    async read(baseline) {
      const snapshot = await page.evaluate(chatgptDOM, 'read', {baseline});
      if (!snapshot.ok) throw new Error('E_RELAY_SITE: ' + snapshot.reason);
      return {...snapshot, documentId};
    },
    async fill(step) {
      const receipt = await page.evaluate(chatgptDOM, 'fill', {
        route:step.startRoute, keys:step.baseline, text:step.prompt, nonce:step.nonce});
      if (!receipt.ok) throw new Error('E_RELAY_FILL: ' + receipt.reason);
    },
    async send(step) {
      const receipt = await page.evaluate(chatgptDOM, 'send', {text:step.prompt, nonce:step.nonce});
      if (!receipt.ok || !receipt.clicked) throw new Error('E_RELAY_SEND: ' + receipt.reason);
    },
    async newConversation(timeout = 20000) {
      await page.goto('https://chatgpt.com/', {timeout, waitUntil:'domcontentloaded'});
      return this.bind(); // Use the existing Host navigation handoff, never carry A's document.
    }
  };
}

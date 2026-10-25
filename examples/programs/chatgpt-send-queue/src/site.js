// Conservative, DOM-only ChatGPT adapter. All selectors require real-site acceptance.
const URL_ORIGIN = 'https://chatgpt.com';
const EDITOR = '#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
const USER = '[data-message-author-role="user"],[data-message-role="user"]';
const ASSISTANT = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
const SEND_LABEL = /^(send message|send prompt|send|发送消息|发送|送出)$/i;
const STOP_LABEL = /^(stop generating|stop generation|stop responding|stop|停止生成|停止回复|停止)$/i;
const RICH = 'img,video,canvas,iframe,[data-attachment-id],[data-file-id]';

export const normal = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
function visible(el, win) {
  if (!el?.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const style = win.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    (el.getClientRects().length > 0 || el.getBoundingClientRect().width > 0);
}
function role(button) {
  const testId = button.getAttribute('data-testid') || '';
  const label = (button.getAttribute('aria-label') || button.getAttribute('title') || '').trim();
  if (/^(stop-button|composer-stop-button)$/.test(testId) || STOP_LABEL.test(label)) return 'stop';
  if (/^(send-button|composer-send-button|composer-submit-button)$/.test(testId) || SEND_LABEL.test(label)) return 'send';
  return null;
}
function one(nodes) { return nodes.length === 1 ? nodes[0] : null; }
function editorText(editor) {
  return typeof editor?.value === 'string' ? editor.value :
    (editor?.innerText ?? editor?.textContent ?? '');
}
function routeFor(win) {
  if (win.location.origin !== URL_ORIGIN) return null;
  const match = win.location.pathname.match(/(?:^|\/)c\/([a-z0-9-]{8,})(?:\/|$)/i);
  return match ? 'c/' + match[1].toLowerCase() : null;
}
function messageText(root) {
  const content = root.querySelector('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap') || root;
  return content.innerText ?? content.textContent ?? '';
}
function assistantCompleted(root) {
  if (!root) return false;
  const turn = root.closest('[data-talvt-turn-state]') || root;
  if (turn.getAttribute('data-talvt-turn-state') === 'complete') return true;
  if (turn.getAttribute('data-talvt-turn-state') && turn.getAttribute('data-talvt-turn-state') !== 'complete') return false;
  return Boolean(root.querySelector('[data-testid="copy-turn-action-button"],[data-assistant-message-actions]') ||
    turn.querySelector('[data-testid="copy-turn-action-button"]'));
}
function streaming(root) {
  if (!root) return false;
  const turn = root.closest('[data-talvt-turn-state]') || root;
  return (turn.hasAttribute('data-talvt-turn-state') && turn.getAttribute('data-talvt-turn-state') !== 'complete') ||
    Boolean(root.matches('[data-is-streaming="true"],[aria-busy="true"],.result-streaming') ||
      root.querySelector('[data-is-streaming="true"],[aria-busy="true"],.result-streaming'));
}
export function createChatGPTSite({doc = document, win = window} = {}) {
  function inspect() {
    const route = routeFor(win);
    if (!route || win !== win.top) return {ok:false,reason:'只支持已打开的 ChatGPT 对话'};
    const candidates = [...new Set([...doc.querySelectorAll(EDITOR)].filter(el =>
      (el.isContentEditable || typeof el.value === 'string') && visible(el,win) &&
      !el.closest('[data-opendesk-ui-owner]')))];
    const editor = one(candidates);
    if (!editor) return {ok:false,route,reason:'原生输入框不存在或不唯一'};
    const form = editor.closest('form');
    if (!form || !form.isConnected) return {ok:false,route,reason:'原生输入表单无法确认'};
    const nativeButtons = [...form.querySelectorAll('button')].filter(el => visible(el,win) && !el.closest('[data-opendesk-ui-owner]'));
    const stopButtons = nativeButtons.filter(el => role(el)==='stop');
    const sendButtons = nativeButtons.filter(el => role(el)==='send');
    if (stopButtons.length > 1 || sendButtons.length > 1) return {ok:false,route,reason:'原生发送按钮存在歧义'};
    const stopButton = one(stopButtons), sendButton = one(sendButtons);
    const nearby=nativeButtons.filter(el=>el.matches(
      'button[data-testid="composer-speech-button"],button[data-testid="voice-mode-button"],' +
      'button[aria-label="Start voice mode"],button[aria-label="开始语音模式"],' +
      'button[aria-label="Dictate button"]'));
    const anchorButton=stopButton||sendButton||one(nearby);
    const users = [...doc.querySelectorAll(USER)].filter(el=>!el.parentElement?.closest(USER));
    const assistants = [...doc.querySelectorAll(ASSISTANT)].filter(el=>!el.parentElement?.closest(ASSISTANT));
    const last = assistants.at(-1) || null;
    const busy = !!stopButton || streaming(last);
    const completed = !last || assistantCompleted(last);
    return {ok:true,route,form,editor,sendButton,stopButton,anchorButton,users,assistants,
      busy,idle:!busy && completed,answerComplete:assistantCompleted(last) && !streaming(last),
      draft:editorText(editor),rich:!!editor.querySelector?.(RICH) || !!form.querySelector('[data-attachment-id],[data-file-id]')};
  }
  function setDraft(editor,text) {
    if (!editor?.isConnected || editor.readOnly || editor.getAttribute('aria-disabled')==='true') return false;
    if (editor.querySelector?.(RICH)) return false;
    editor.focus();
    if (typeof editor.value === 'string') {
      const proto = editor.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement?.prototype : win.HTMLInputElement?.prototype;
      const setter = proto && Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if (!setter) return false;
      setter.call(editor,text);
      editor.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    } else if (editor.isContentEditable) {
      const selection = win.getSelection(), range = doc.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges(); selection.addRange(range);
      const command = text ? 'insertText' : 'delete';
      if (!doc.execCommand(command,false,text || null)) return false;
    } else return false;
    return editorText(editor) === text;
  }
  function clearForQueue(snapshot) {
    if (!snapshot.ok || snapshot.rich || !normal(snapshot.draft)) return {ok:false,reason:'草稿为空或包含附件'};
    const text=snapshot.draft;
    if (!setDraft(snapshot.editor,'')) return {ok:false,reason:'无法可靠清空原生草稿'};
    return {ok:true,text};
  }
  function restore(text,expected) {
    const snapshot=inspect();
    if (!snapshot.ok || snapshot.rich || (expected!==undefined && snapshot.draft!==expected))
      return false;
    return setDraft(snapshot.editor,text);
  }
  // Reclaim a queued message for editing in the actual website composer.
  // The old draft must be EXACTLY empty, including whitespace-only drafts.
  // A failed/ambiguous insertion never authorizes removing the queue item.
  function reclaimToComposer(text,initial) {
    const fresh=inspect();
    if(!initial?.ok||!fresh.ok||!initial.route||
      fresh.route!==initial.route||fresh.form!==initial.form||
      fresh.editor!==initial.editor)return {ok:false,reason:'会话或官网输入框已变化'};
    if(fresh.rich||initial.rich)return {ok:false,reason:'输入框包含附件，请先处理'};
    if(fresh.draft!==''||initial.draft!=='')
      return {ok:false,reason:'输入框已有草稿，请先发送或加入队列'};
    let applied=false;
    try{applied=setDraft(fresh.editor,text);}
    catch{return {ok:false,reason:'原生输入框写入失败，队列仍保留',mayHaveWritten:true};}
    const after=inspect();
    if(!applied||!after.ok||after.route!==fresh.route||
      after.form!==fresh.form||after.editor!==fresh.editor||
      after.rich||after.draft!==text)
      return {ok:false,reason:'原生输入框未能确认完整取回，队列仍保留',mayHaveWritten:true};
    try{
      if(typeof after.editor.setSelectionRange==='function')
        after.editor.setSelectionRange(text.length,text.length);
    }catch{/* Selection placement is not a data correctness gate. */}
    after.editor.focus();
    return {ok:true};
  }
  function prepare(text,initial) {
    const fresh=inspect();
    if(!initial?.ok || !fresh.ok || fresh.route!==initial.route ||
      fresh.form!==initial.form || fresh.editor!==initial.editor ||
      !fresh.idle || fresh.rich || fresh.draft!=='')
      return {ok:false,reason:'会话、输入框或原生草稿已改变'};
    const before={users:fresh.users,assistantCount:fresh.assistants.length,route:fresh.route};
    if(!setDraft(fresh.editor,text))return {ok:false,reason:'网页编辑器未接收待发内容'};
    const filled=inspect();
    if(!filled.ok || filled.route!==before.route || filled.form!==fresh.form ||
      filled.editor!==fresh.editor || filled.draft!==text || filled.rich)
      return {ok:false,reason:'填入内容后网页编辑器身份或草稿变化'};
    return {ok:true,token:{route:before.route,form:fresh.form,editor:fresh.editor,
      text,before}};
  }
  function commit(token) {
    // All checks are repeated on a separate poll to allow React to enable the
    // native button. A changed editor, draft, route, or prior user messages is
    // a hard failure before any send; it is never repaired with a second click.
    const fresh=inspect();
    if(!fresh.ok || fresh.route!==token.route || fresh.form!==token.form ||
      fresh.editor!==token.editor || fresh.rich ||
      fresh.draft!==token.text ||
      fresh.users.length!==token.before.users.length ||
      fresh.users.some((node,i)=>node!==token.before.users[i]))
      return {ok:false,stage:'before-click',reason:'准备发送期间原生编辑器、草稿或消息记录已变化'};
    if(fresh.busy)return {ok:false,stage:'before-click',reason:'网站开始了其他回复'};
    if(!fresh.sendButton || !fresh.idle || fresh.sendButton.disabled ||
      fresh.sendButton.getAttribute('aria-disabled')==='true')
      return {ok:false,retry:true};
    // After this click the outcome is UNKNOWN until an exact new user turn is seen.
    try {fresh.sendButton.click();}
    catch {return {ok:false,stage:'after-click',reason:'原生发送点击结果未知'};}
    return {ok:true,before:token.before};
  }
  function confirm(before,text,snapshot) {
    if (!snapshot.ok || snapshot.route!==before.route) return false;
    if (snapshot.users.length !== before.users.length+1) return false;
    const newMessage=snapshot.users.at(-1);
    return !before.users.includes(newMessage) && messageText(newMessage) === text;
  }
  function stop(snapshot) {
    const fresh=inspect();
    if (!fresh.ok || fresh.route!==snapshot.route || fresh.form!==snapshot.form ||
      !fresh.busy || !fresh.stopButton || fresh.stopButton!==snapshot.stopButton) return false;
    try { fresh.stopButton.click(); return true; } catch { return false; }
  }
  return Object.freeze({inspect,clearForQueue,restore,reclaimToComposer,prepare,commit,confirm,stop,normal});
}

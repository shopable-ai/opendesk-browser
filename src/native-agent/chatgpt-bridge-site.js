// Fixed first-party bridge DOM adapter; no queue, storage, network or authority.
// Selectors and native editing still require same-candidate website acceptance.
const URL_ORIGIN = 'https://chatgpt.com';
const EDITOR = '#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
const USER = '[data-message-author-role="user"],[data-message-role="user"],[data-chatgpt-search-unit-key$=":user"]';
const ASSISTANT = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
const SEND_LABEL = /^(send message|send prompt|send|发送消息|发送|送出)$/i;
const STOP_LABEL = /^(stop generating|stop generation|stop responding|stop|停止生成|停止回复|停止)$/i;
const RICH = 'img,video,canvas,iframe,[contenteditable="false"],[data-attachment-id],[data-file-id]';
const ATTACHMENTS = '[data-attachment-id],[data-file-id],[data-upload-id],[data-testid="file-thumbnail"],[data-testid*="attachment-preview"],[data-testid*="file-preview"],button[aria-label="Remove file"],button[aria-label="移除文件"]';

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
  // Only the observed single placeholder paragraph is empty. Extra paragraphs
  // and line breaks are user drafts even when they contain no text nodes.
  const paragraph=editor?.childNodes?.length===1?editor.childNodes[0]:null;
  if(editor?.isContentEditable && editor.textContent==='' && paragraph?.nodeType===1 &&
    paragraph.tagName==='P' && paragraph.getAttribute('data-empty-paragraph')==='true' &&
    paragraph.hasAttribute('data-placeholder') && paragraph.childNodes.length<=1 &&
    [...paragraph.childNodes].every(node=>node.nodeType===1 && node.tagName==='BR'))return '';
  // The official markdown editor represents each source line as a paragraph.
  // innerText follows CSS paragraph spacing rather than the submitted text.
  // Read only this observed shape; preserve every source line and text byte.
  const lines=editor?.isContentEditable && editor.hasAttribute?.('data-composer-markdown')?
    [...editor.childNodes]:[];
  if(lines.length && lines.some(node=>node.textContent!=='') && lines.every(node=>
    node.nodeType===1 && node.tagName==='P' &&
    !node.querySelector('br:not(.ProseMirror-trailingBreak)')))
    return lines.map(node=>node.textContent).join('\n');
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
export function createChatGPTBridgeSite({doc = document, win = window} = {}) {
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
    const users = [...doc.querySelectorAll(USER)].filter(el=>!el.parentElement?.closest(USER));
    const assistants = [...doc.querySelectorAll(ASSISTANT)].filter(el=>!el.parentElement?.closest(ASSISTANT));
    const last = assistants.at(-1) || null;
    const busy = !!stopButton || streaming(last);
    const completed = !last || assistantCompleted(last);
    return {ok:true,route,form,editor,sendButton,users,assistants,
      busy,idle:!busy && completed,answerComplete:assistantCompleted(last) && !streaming(last),
      draft:editorText(editor),rich:!!editor.querySelector?.(RICH) || !!form.querySelector(ATTACHMENTS) ||
        [...form.querySelectorAll('input[type="file"]')].some(input=>input.files?.length)};
  }
  function prepare(text,initial) {
    if(!initial?.ok || !initial.idle || initial.rich || initial.draft!=='' ||
      typeof text!=='string' || !text || initial.editor.readOnly || initial.editor.disabled ||
      initial.editor.getAttribute('aria-disabled')==='true')
      return {ok:false,reason:'原生输入框并非可编辑的空草稿'};
    initial.editor.focus();
    const fresh=inspect();
    if(doc.activeElement!==initial.editor || !fresh.ok || fresh.route!==initial.route ||
      fresh.form!==initial.form || fresh.editor!==initial.editor ||
      !fresh.idle || fresh.rich || fresh.draft!=='')
      return {ok:false,reason:'会话、输入框或原生草稿已改变'};
    const before={users:[...fresh.users],userTexts:fresh.users.map(messageText),route:fresh.route};
    // Use the browser editing command, as workspace-chatgpt.js does. Never
    // focus again after the empty-draft, attachment and unique-editor checks.
    if(typeof doc.execCommand!=='function')return {ok:false,reason:'浏览器不支持安全编辑命令'};
    if(fresh.editor.isContentEditable){
      const selection=win.getSelection();
      if(!selection || selection.rangeCount!==1 ||
        !(selection.anchorNode===fresh.editor || fresh.editor.contains(selection.anchorNode)) ||
        !(selection.focusNode===fresh.editor || fresh.editor.contains(selection.focusNode)))
        return {ok:false,reason:'无法确认原生输入框光标'};
    }
    try{if(!doc.execCommand('insertText',false,text))return {ok:false,reason:'网页编辑器未接收待发内容'};}
    catch{return {ok:false,reason:'原生编辑结果未知'};}
    const filled=inspect();
    if(!filled.ok || filled.route!==before.route || filled.form!==fresh.form ||
      filled.editor!==fresh.editor)
      return {ok:false,reason:'填入内容后网页编辑器身份变化'};
    if(filled.rich)return {ok:false,reason:'官网将待发文本转换为附件或不可编辑内容，未发送'};
    if(filled.draft!==text)
      return {ok:false,reason:'待发文本读回不一致（预期 '+text.length+'，实际 '+filled.draft.length+' 字符），未发送'};
    const token={route:before.route,form:fresh.form,editor:fresh.editor,text,before};
    tokens.add(token);
    return {ok:true,token};
  }
  const tokens=new WeakSet(),attempted=new WeakSet();
  function commit(token) {
    if(!tokens.has(token)||attempted.has(token))return {ok:false,reason:'未知或已尝试的发送，禁止重试'};
    // All checks are repeated on a separate poll to allow React to enable the
    // native button. A changed editor, draft, route, or prior user messages is
    // a hard failure before any send; it is never repaired with a second click.
    const fresh=inspect();
    if(!fresh.ok || fresh.route!==token.route || fresh.form!==token.form ||
      fresh.editor!==token.editor || fresh.rich ||
      fresh.draft!==token.text ||
      fresh.users.length!==token.before.users.length ||
      fresh.users.some((node,i)=>node!==token.before.users[i] || messageText(node)!==token.before.userTexts[i]))
      return {ok:false,stage:'before-click',reason:'准备发送期间原生编辑器、草稿或消息记录已变化'};
    if(fresh.busy)return {ok:false,stage:'before-click',reason:'网站开始了其他回复'};
    if(!fresh.sendButton || !fresh.idle || fresh.sendButton.disabled ||
      fresh.sendButton.getAttribute('aria-disabled')==='true')
      return {ok:false,retry:true};
    // After this click the outcome is UNKNOWN until an exact new user turn is seen.
    attempted.add(token); // even a throwing click consumes the sole attempt
    try {fresh.sendButton.click();}
    catch {return {ok:false,stage:'after-click',reason:'原生发送点击结果未知'};}
    return {ok:true,before:token.before};
  }
  function confirm(before,text,snapshot) {
    if (!snapshot.ok || snapshot.route!==before.route) return false;
    // ChatGPT may evict the oldest rendered turns after sending. Require an
    // unchanged contiguous suffix ending at the same current user node, plus
    // exactly one new result. Never accept remounted/replaced current turns,
    // internal gaps, additional user messages or a missing request anchor.
    if (!before.users.length || snapshot.users.length<2) return false;
    const offset=before.users.indexOf(snapshot.users[0]);
    if (offset<0 || snapshot.users.length!==before.users.length-offset+1 ||
      before.users.slice(offset).some((node,i)=>snapshot.users[i]!==node ||
        messageText(node)!==before.userTexts[offset+i])) return false;
    const newMessage=snapshot.users.at(-1);
    return !before.users.includes(newMessage) && messageText(newMessage) === text;
  }
  return Object.freeze({inspect,prepare,commit,confirm});
}

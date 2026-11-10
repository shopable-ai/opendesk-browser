// Conservative, DOM-only ChatGPT adapter. All selectors require real-site acceptance.
const URL_ORIGIN = 'https://chatgpt.com';
const EDITOR = '#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
const USER = '[data-message-author-role="user"],[data-message-role="user"],[data-content-search-unit-key$=":user"]';
const ASSISTANT = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
const SEND_LABEL = /^(send message|send prompt|send|发送消息|发送|送出)$/i;
const STOP_LABEL = /^(stop generating|stop generation|stop responding|stop|停止生成|停止回复|停止)$/i;
const RICH = 'img,video,canvas,iframe,[data-attachment-id],[data-file-id]';
// Large native pastes can become a text resource card without a file ID.
const ATTACHMENTS = '[data-attachment-id],[data-file-id],[data-composer-attachments][data-visible-attachments]';

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
// ChatGPT can unmount the oldest turns. Accept only a detached prefix,
// followed by the exact original tail and exactly `appended` new nodes.
// Never substitute text/IDs for node identity or proceed without an old anchor.
function matchesHistoryTail(before,current,appended=0) {
  const retained=current.length-appended, dropped=before.length-retained;
  if(retained<0 || dropped<0 || (before.length>0&&retained===0))return false;
  if(before.slice(0,dropped).some(node=>node.isConnected!==false))return false;
  return current.slice(0,retained).every((node,i)=>node===before[dropped+i]) &&
    current.slice(retained).every(node=>!before.includes(node));
}
function matchesConversationTail(before,snapshot,minAdded,maxAdded=minAdded) {
  if(!Array.isArray(before.history)||!Array.isArray(snapshot.history))return false;
  const added=snapshot.history.filter(node=>!before.history.includes(node)).length;
  return added>=minAdded && added<=maxAdded &&
    matchesHistoryTail(before.history,snapshot.history,added);
}
function matchesReplyHistory(before,snapshot) {
  if(!Array.isArray(before?.users)||!Array.isArray(before.assistants)||
    !Array.isArray(snapshot.users)||!Array.isArray(snapshot.assistants)||
    !Array.isArray(snapshot.history))return false;
  const usersAdded=snapshot.users.filter(node=>!before.users.includes(node)).length;
  const assistantsAdded=snapshot.assistants.filter(node=>!before.assistants.includes(node)).length;
  return matchesHistoryTail(before.users,snapshot.users,usersAdded) &&
    matchesHistoryTail(before.assistants,snapshot.assistants,assistantsAdded) &&
    matchesConversationTail(before,snapshot,usersAdded+assistantsAdded);
}
function editorText(editor) {
  if(typeof editor?.value==='string')return editor.value;
  if(editor?.isContentEditable && editor.childNodes){
    // Serialize logical paragraphs, not CSS layout. Chromium innerText can add
    // an extra newline for an empty DIV/P after native insertText. Each block
    // boundary is one newline; BR is one newline except an empty-block/caret
    // placeholder. Preserve every text node, space and intentional final line.
    const read=node=>{
      if(node.nodeType===3)return node.nodeValue??node.textContent??'';
      if(node.nodeName==='BR')return node.classList?.contains('ProseMirror-trailingBreak')?'':'\n';
      const children=[...node.childNodes];
      if(children.length===1&&children[0].nodeName==='BR'&&
        (node===editor||/^(P|DIV|LI|PRE|BLOCKQUOTE)$/.test(node.nodeName)))return '';
      let text='',previousBlock=false,seen=false;
      for(let i=0;i<children.length;i++){
        const child=children[i],block=/^(P|DIV|LI|PRE|BLOCKQUOTE)$/.test(child.nodeName);
        const part=read(child);if(!block&&part==='')continue;
        if(seen&&(block||previousBlock))text+='\n';
        text+=part;previousBlock=block;seen=true;
      }
      return text;
    };
    return read(editor);
  }
  return editor?.innerText ?? editor?.textContent ?? '';
}
function routeFor(win) {
  if (win.location.origin !== URL_ORIGIN) return null;
  const match = win.location.pathname.match(/(?:^|\/)c\/([a-z0-9-]{8,})(?:\/|$)/i);
  if(match)return {route:'c/' + match[1].toLowerCase()};
  // Discover the composer before the first native send creates a conversation.
  // A home/project URL is never a queue identity or a refresh-cache key.
  if(/^\/$/.test(win.location.pathname)||
    /^\/g\/g-p-[a-z0-9-]+\/project\/?$/i.test(win.location.pathname))
    return {route:null};
  return null;
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
  return (turn.hasAttribute('data-talvt-turn-state') && turn.getAttribute('data-talvt-turn-state') !== 'complete') || explicitStreaming(root);
}
function explicitStreaming(root) {
  return Boolean(root?.matches('[data-is-streaming="true"],[aria-busy="true"],.result-streaming') ||
    root?.querySelector('[data-is-streaming="true"],[aria-busy="true"],.result-streaming'));
}
export function createChatGPTSite({doc = document, win = window, isComposing = () => false} = {}) {
  let interrupted=null;
  function inspect() {
    const context = routeFor(win);
    if (!context || win !== win.top) return {ok:false,reason:'只支持 ChatGPT 新聊天、项目或已有对话'};
    const {route}=context;
    const candidates = [...new Set([...doc.querySelectorAll(EDITOR)].filter(el =>
      (el.isContentEditable || typeof el.value === 'string') && visible(el,win) &&
      !el.closest('[data-opendesk-ui-owner]')))];
    const editor = one(candidates);
    if (!editor) return {ok:false,route,reason:'原生输入框不存在或不唯一'};
    const form = editor.closest('form');
    if (!form || !form.isConnected) return {ok:false,route,reason:'原生输入表单无法确认'};
    // Public DOM state can only veto our writes. Its absence grants no
    // permission and never substitutes for the bridge's trusted Host checks.
    if(form.hasAttribute('data-opendesk-composer-owner'))
      return {ok:false,route,reason:'等待其他操作释放原生输入框'};
    const nativeButtons = [...form.querySelectorAll('button')].filter(el => visible(el,win) && !el.closest('[data-opendesk-ui-owner]'));
    const stopButtons = nativeButtons.filter(el => role(el)==='stop');
    const sendButtons = nativeButtons.filter(el => role(el)==='send');
    if (stopButtons.length > 1 || sendButtons.length > 1) return {ok:false,route,reason:'原生发送按钮存在歧义'};
    const stopButton = one(stopButtons), sendButton = one(sendButtons);
    const nearby=nativeButtons.filter(el=>el.matches(
      'button[data-testid="composer-speech-button"],button[data-testid="voice-mode-button"],' +
      'button[aria-label="Start voice mode"],button[aria-label="开始语音模式"],' +
      'button[aria-label="Start voice"],button[aria-label="开始语音"],' +
      'button[aria-label="Dictate button"]'));
    const anchorButton=stopButton||sendButton||one(nearby);
    const users = [...doc.querySelectorAll(USER)].filter(el=>!el.parentElement?.closest(USER));
    const assistants = [...doc.querySelectorAll(ASSISTANT)].filter(el=>!el.parentElement?.closest(ASSISTANT));
    const history = [...doc.querySelectorAll(USER+','+ASSISTANT)]
      .filter(el=>!el.parentElement?.closest(USER+','+ASSISTANT));
    const last = assistants.at(-1) || null;
    // ChatGPT can leave a stopped turn marked in_progress indefinitely.
    // Only our explicit stop, the exact same history, and a returned native
    // idle control can override that stale marker. Live streaming still vetoes.
    const nativeIdle=!!sendButton || nearby.some(el=>el.matches(
      'button[data-testid="voice-mode-button"],button[aria-label="Start voice mode"],'+
      'button[aria-label="开始语音模式"],button[aria-label="Start voice"],button[aria-label="开始语音"]'));
    const stopped=!!interrupted && interrupted.route===route && !stopButton && nativeIdle &&
      !explicitStreaming(last) && last===interrupted.assistants.at(-1) &&
      matchesHistoryTail(interrupted.users,users) &&
      matchesHistoryTail(interrupted.assistants,assistants) &&
      matchesConversationTail(interrupted,{history},0);
    const busy = !!stopButton || (!stopped && streaming(last));
    const completed = !last || stopped || assistantCompleted(last);
    return {ok:true,route,newConversation:route===null,form,editor,sendButton,stopButton,anchorButton,users,assistants,history,
      busy,idle:!busy && completed,answerComplete:!!last && completed && !busy,
      draft:editorText(editor),composing:isComposing(),
      rich:!!editor.querySelector?.(RICH) || !!form.querySelector(ATTACHMENTS)};
  }
  function setDraft(editor,text,initial) {
    if (!editor?.isConnected || editor.readOnly || editor.getAttribute('aria-disabled')==='true') return false;
    if (editor.querySelector?.(RICH)) return false;
    const unchanged=()=>{
      const fresh=inspect();
      return initial?.ok && !!initial.route && fresh.ok && fresh.route===initial.route &&
        fresh.form===initial.form && fresh.editor===editor &&
        fresh.draft===initial.draft && !fresh.rich && !fresh.composing;
    };
    if(!unchanged())return false;
    editor.focus();
    // Focusing may synchronously restore a website draft or replace its
    // composer. Check again before any destructive selection/write.
    if(!unchanged())return false;
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
      if(text){
        // Use the website editor's own plain-text paste handler. insertText
        // expands long multiline text into many native blocks and can stall
        // ChatGPT's editor. This event never reads/writes the system clipboard.
        if(typeof win.DataTransfer!=='function'||typeof win.ClipboardEvent!=='function')return false;
        const clipboardData=new win.DataTransfer();clipboardData.setData('text/plain',text);
        editor.dispatchEvent(new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
        // An ignored/partial/asynchronous paste is ambiguous. Do not follow it
        // with another write; the caller keeps the full source and stops.
      }else if(!doc.execCommand('delete',false,null))return false;
    } else return false;
    return editorText(editor) === text;
  }
  function clearForQueue(snapshot) {
    if(!snapshot.route)return {ok:false,reason:'请先在 ChatGPT 发送首条消息，建立对话后即可加入队列'};
    if (!snapshot.ok || snapshot.rich || snapshot.composing || !normal(snapshot.draft)) return {ok:false,reason:'草稿为空、包含附件或输入法尚未完成'};
    const text=snapshot.draft;
    // Website input handlers can replace the composer after the old element
    // accepted the clear. Only the currently active editor can confirm it.
    let cleared=false;
    try{cleared=setDraft(snapshot.editor,'',snapshot);}
    catch{/* The write may have happened before the website handler threw. */}
    const after=inspect();
    if(!cleared || !after.ok || after.route!==snapshot.route ||
      after.form!==snapshot.form || after.editor!==snapshot.editor ||
      after.rich || after.composing || after.draft!=='')
      return {ok:false,needsRecovery:true,text,
        reason:'原生输入框清空结果未确认，草稿未入队；请恢复或复制原文'};
    return {ok:true,text};
  }
  function restore(text,expected) {
    const snapshot=inspect();
    if (!snapshot.ok || snapshot.rich || (expected!==undefined && snapshot.draft!==expected))
      return false;
    try{if(!setDraft(snapshot.editor,text,snapshot))return false;}
    catch{return false;}
    const after=inspect();
    return after.ok && after.route===snapshot.route && after.form===snapshot.form &&
      after.editor===snapshot.editor && !after.rich && !after.composing && after.draft===text;
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
    try{applied=setDraft(fresh.editor,text,fresh);}
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
    return {ok:true};
  }
  function prepare(text,initial) {
    const fresh=inspect();
    if(!initial?.ok || !initial.route || !fresh.ok || fresh.route!==initial.route ||
      fresh.form!==initial.form || fresh.editor!==initial.editor ||
      !fresh.idle || fresh.rich || fresh.draft!=='')
      return {ok:false,mayHaveWritten:false,reason:'会话、输入框或原生草稿已改变'};
    const before={users:fresh.users,assistants:fresh.assistants,history:fresh.history,
      assistantCount:fresh.assistants.length,route:fresh.route};
    // Once setDraft is attempted, a false result or throwing website handler
    // cannot prove that the user has not received (and manually sent) the text.
    try {
      if(!setDraft(fresh.editor,text,fresh))
        return {ok:false,mayHaveWritten:true,reason:'网页编辑器未确认完整接收待发内容'};
      const filled=inspect();
      if(!filled.ok || filled.route!==before.route || filled.form!==fresh.form ||
        filled.editor!==fresh.editor || filled.draft!==text || filled.rich)
        return {ok:false,mayHaveWritten:true,reason:'填入内容后网页编辑器身份或草稿变化'};
    } catch {
      return {ok:false,mayHaveWritten:true,reason:'准备原生消息时出错，草稿写入结果未知'};
    }
    return {ok:true,token:{route:before.route,form:fresh.form,editor:fresh.editor,
      text,before}};
  }
  function commit(token) {
    // All checks are repeated on a separate poll to allow React to enable the
    // native button. A changed editor, draft, route, or prior user messages is
    // a hard failure before any send; it is never repaired with a second click.
    const fresh=inspect();
    if(!token.route || !fresh.ok || fresh.route!==token.route || fresh.form!==token.form ||
      fresh.editor!==token.editor || fresh.rich || fresh.composing ||
      fresh.draft!==token.text ||
      !matchesHistoryTail(token.before.users,fresh.users) ||
      !matchesConversationTail(token.before,fresh,0))
      return {ok:false,stage:'before-click',reason:'准备发送期间原生编辑器、草稿或消息记录已变化'};
    if(fresh.busy)return {ok:false,stage:'before-click',reason:'网站开始了其他回复'};
    if(!fresh.sendButton)return {ok:false,retry:true,reason:'未找到原生发送按钮'};
    if(!fresh.idle)return {ok:false,retry:true,reason:'上一条回复尚未确认完成'};
    if(fresh.sendButton.disabled || fresh.sendButton.getAttribute('aria-disabled')==='true')
      return {ok:false,retry:true,reason:'原生发送按钮尚未启用'};
    // After this click the outcome is UNKNOWN until an exact new user turn is seen.
    try {fresh.sendButton.click();}
    catch {return {ok:false,stage:'after-click',reason:'原生发送点击结果未知'};}
    return {ok:true,before:token.before};
  }
  function canReclaimPrepared(token) {
    const fresh=inspect();
    return !!token?.route && fresh.ok && fresh.route===token.route &&
      fresh.form===token.form && fresh.editor===token.editor &&
      !fresh.rich && !fresh.composing && !fresh.busy && fresh.draft===token.text &&
      matchesHistoryTail(token.before.users,fresh.users) &&
      matchesConversationTail(token.before,fresh,0);
  }
  function confirmationIssue(before,text,snapshot) {
    if (!before.route || !snapshot.ok || snapshot.route!==before.route) return '原对话或输入框已不可确认';
    if (!matchesHistoryTail(before.users,snapshot.users,1))
      return snapshot.users.length!==before.users.length+1?
        '用户消息数量与发送前记录不符':'历史用户消息节点已变化';
    if(!matchesConversationTail(before,snapshot,1,2))return '历史对话节点或顺序已变化';
    const newMessage=snapshot.users.at(-1);
    if(before.users.includes(newMessage))return '未找到唯一新增用户消息';
    if(messageText(newMessage)!==text)return '新增用户消息正文与队列不完全一致';
    return null;
  }
  function confirm(before,text,snapshot) {
    return confirmationIssue(before,text,snapshot)===null;
  }
  function replyComplete(before,confirmedUser,snapshot,gate) {
    if(gate?.historyInvalid || !confirmedUser || !snapshot.ok || snapshot.route!==before?.route)return false;
    const rejectHistory=()=>{
      // Once identity continuity is lost, replaying an old snapshot cannot
      // restore this gate's proof. This latch lives only in the existing gate.
      if(gate)gate.historyInvalid=true;
      return false;
    };
    if(!matchesReplyHistory(before,snapshot) ||
      (gate?.observed && !matchesReplyHistory(gate.observed,snapshot)))return rejectHistory();
    const {users,assistants,history}=snapshot;
    // The combined history must contain each role node exactly once, in DOM
    // order. Extra users are native follow-ups, never admission evidence.
    if(new Set(history).size!==history.length || history.length!==users.length+assistants.length ||
      history.some(node=>users.includes(node)===assistants.includes(node)) ||
      [users,assistants].some(nodes=>{
        const ordered=history.filter(node=>nodes.includes(node));
        return ordered.length!==nodes.length || ordered.some((node,i)=>node!==nodes[i]);
      }))return rejectHistory();
    const added=history.filter(node=>!before.history.includes(node));
    if(added[0]!==confirmedUser || !users.includes(confirmedUser) ||
      added.some((node,i)=>assistants.includes(node) && !users.includes(added[i-1])))return rejectHistory();
    // Observe valid growth even while busy. Later polls cannot replace or
    // reorder an already observed follow-up; only detached prefixes may go.
    if(gate)gate.observed={users:[...users],assistants:[...assistants],history:[...history]};
    const latestUser=users.at(-1),reply=assistants.at(-1);
    if(snapshot.busy || !snapshot.idle || !snapshot.answerComplete ||
      history.at(-1)!==reply || !added.includes(reply) ||
      typeof latestUser?.compareDocumentPosition!=='function')return false;
    const order=latestUser.compareDocumentPosition(reply);
    if((order&1) || !(order&4))return rejectHistory();
    return true;
  }
  function stop(snapshot) {
    const fresh=inspect();
    if (!snapshot.route || !fresh.ok || fresh.route!==snapshot.route || fresh.form!==snapshot.form ||
      fresh.editor!==snapshot.editor || fresh.rich || fresh.composing ||
      snapshot.draft!=='' || fresh.draft!=='' ||
      !fresh.busy || !fresh.stopButton || fresh.stopButton!==snapshot.stopButton ||
      fresh.stopButton.disabled || fresh.stopButton.getAttribute('aria-disabled')==='true') return false;
    try { fresh.stopButton.click(); interrupted=fresh; return true; } catch { return false; }
  }
  return Object.freeze({inspect,clearForQueue,restore,reclaimToComposer,prepare,commit,canReclaimPrepared,confirm,confirmationIssue,replyComplete,stop,normal});
}

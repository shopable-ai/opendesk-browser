const URL_ORIGIN = 'https://chatgpt.com';
const EDITOR = '#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
const USER = '[data-message-author-role="user"],[data-message-role="user"],[data-content-search-unit-key$=":user"]';
const ASSISTANT = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
const SEND_LABEL = /^(send message|send prompt|send|发送消息|发送|送出)$/i;
const STOP_LABEL = /^(stop generating|stop generation|stop responding|stop|停止生成|停止回复|停止)$/i;
const RICH = 'img,video,canvas,iframe,[data-attachment-id],[data-file-id]';
// Large pastes can become cards without file IDs.
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
// Allow detached prefixes and exact appends anchored to surviving DOM nodes.
function matchesHistoryTail(before,current,appended=0,requireAnchor=true) {
  const retained=current.length-appended, dropped=before.length-retained;
  if(retained<0 || dropped<0 || (requireAnchor&&before.length>0&&retained===0))return false;
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
function matchesReplyHistory(before,snapshot,requireRoleAnchor) {
  if(!Array.isArray(before?.users)||!Array.isArray(before.assistants)||
    !Array.isArray(snapshot.users)||!Array.isArray(snapshot.assistants)||
    !Array.isArray(snapshot.history))return false;
  const usersAdded=snapshot.users.filter(node=>!before.users.includes(node)).length;
  const assistantsAdded=snapshot.assistants.filter(node=>!before.assistants.includes(node)).length;
  return matchesHistoryTail(before.users,snapshot.users,usersAdded,requireRoleAnchor) &&
    matchesHistoryTail(before.assistants,snapshot.assistants,assistantsAdded,requireRoleAnchor) &&
    matchesConversationTail(before,snapshot,usersAdded+assistantsAdded);
}
function editorText(editor) {
  if(typeof editor?.value==='string')return editor.value;
  if(editor?.isContentEditable && editor.childNodes){
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
const streamingSignals='[data-is-streaming="true"],[aria-busy="true"],.result-streaming';
function explicitStreaming(root) {
  return Boolean(root?.matches(streamingSignals) || root?.querySelector(streamingSignals));
}
const chatgpt = Object.freeze({
  routeFor, editors:EDITOR, users:USER, assistants:ASSISTANT, attachments:ATTACHMENTS,
  composer:editor=>editor.closest('form'), controlRole:role, messageText, assistantCompleted, streaming,
  ownsHistoryNode(node,win){
    // Scope out only the known hidden transcript left by New Chat.
    const transcript=node.closest?.('[data-rail-chat-transcript]');
    return !transcript||visible(transcript,win)||visible(node,win);
  },
  placement(anchor,form,editor){
    const trailing=anchor?.closest('[data-composer-trailing-controls]');
    const grid=trailing?.parentElement;
    const field=grid&&[...grid.children].find(node=>node.contains(editor));
    const leading=grid?.querySelector(':scope > [data-composer-leading-controls]');
    return {toolbar:anchor?.parentElement,
      ...(field&&leading&&form.contains(grid)?{grid,field,leading,trailing}:{})};
  },
  unsupported:'只支持 ChatGPT 新聊天、项目或已有对话', allowLocalStopReceipt:true,
  idleControls:'button[data-testid="composer-speech-button"],button[data-testid="voice-mode-button"],' +
    'button[aria-label="Start voice mode"],button[aria-label="开始语音模式"],' +
    'button[aria-label="Start voice"],button[aria-label="开始语音"],' +
    'button[aria-label="Dictate button"]',
  stoppedIdleControls:'button[data-testid="voice-mode-button"],button[aria-label="Start voice mode"],' +
    'button[aria-label="开始语音模式"],button[aria-label="Start voice"],button[aria-label="开始语音"]'
});

export const createChatGPTSite=options=>createConversationSite(chatgpt,options);

export const geminiRoute=location=>{
  if(location?.origin!=='https://gemini.google.com')return null;
  const match=/^\/app(?:\/([a-z0-9_-]+))?\/?$/i.exec(location.pathname);
  return match?{route:match[1]?'app/'+match[1]:null}:null;
};
const geminiHidden='[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]';
const geminiCopy='button.copy-button,button[aria-label="Copy"],button[aria-label="Copy response"],button[aria-label="复制"],button[aria-label="复制回复"]';
const geminiAttachments='file-preview,file-carousel,attachment-preview,attachments-preview,'+
  '[data-test-id="file-preview"],[data-test-id="attachment-preview"],'+
  '[data-attachment-id],[data-file-id],img[src^="blob:"],img[src^="data:"]';
function geminiOwnReply(reply,win,user,historyRoot) {
  const turn=user?.parentElement;
  return turn?.matches('div.conversation-container')&&/^[a-f0-9]{16}$/i.test(turn.id)&&
    reply.parentElement===turn&&user.nextElementSibling===reply&&visible(user,win)&&
    historyRoot.querySelectorAll('div.conversation-container[id="'+turn.id+'"]').length===1;
}
function geminiStoppedBody(reply,win,user,historyRoot,body) {
  if(!body?.textContent.trim()||!visible(body,win)||!geminiOwnReply(reply,win,user,historyRoot)||
    reply.closest(geminiHidden)||reply.querySelector('model-response,user-query'))return null;
  const status=one([...reply.querySelectorAll(
    '.response-content > div.response-footer.gap.complete > response-info-line[role="status"]')]);
  return status&&!status.closest('message-content,'+geminiHidden)&&visible(status,win)&&
    normal(status.innerText??status.textContent)==='You stopped this response'?body:null;
}
const geminiBody=reply=>one([...reply.querySelectorAll('message-content .markdown')].filter(el=>!el.closest(geminiHidden)));
const gemini=Object.freeze({
  routeFor:win=>geminiRoute(win.location),
  editors:'rich-textarea .ql-editor[role="textbox"][contenteditable="true"]',
  users:'user-query',assistants:'model-response',attachments:geminiAttachments,
  historyRoot:(doc,win)=>one([...doc.querySelectorAll('chat-window')].filter(el=>visible(el,win))),
  composer:editor=>editor.closest('input-area-v2,input-area'),
  controlRole(button){
    const label=button.getAttribute('aria-label')?.trim()||'';
    if(button.matches('button.stop-button,send-button.stop button')||/^(Stop response|Stop generating|停止回复|停止生成)$/i.test(label))return 'stop';
    if(button.matches('button.send-button,send-button button:has(mat-icon[data-mat-icon-name="send"])')||/^(Send message|发送消息)$/i.test(label))return 'send';
    return null;
  },
  idleControls:'.speech_dictation_mic_button button,button.speech-button,button[aria-label="Use microphone"],button[aria-label="使用麦克风"]',
  placement(_button,form,editor){
    const toolbar=one([...form.querySelectorAll('.input-buttons-wrapper-bottom')]);
    const trailing=toolbar?.closest('.trailing-actions-wrapper');
    const grid=trailing?.parentElement;
    const field=grid&&[...grid.children].find(node=>node.contains(editor));
    const leading=grid?.querySelector(':scope > .leading-actions-wrapper');
    return {toolbar,gemini:true,...(field&&leading&&form.contains(grid)?{grid,field,leading,trailing}:{})};
  },
  insertText:(doc,text)=>doc.execCommand('insertText',false,text),
  hasAttachment:form=>[...form.querySelectorAll('input[type="file"]')].some(node=>node.files?.length),
  blocked(form,root,win){
    const notices='[role="alert"],mat-error,[data-test-id="quota-limit-message"]';
    return [...form.querySelectorAll(notices),...root.querySelectorAll(':scope > '+notices.replaceAll(',',',:scope > '))]
      .some(el=>visible(el,win)&&el.textContent.trim())?'网站输入框有提示，请先检查原生页面':null;
  },
  messageText(root){
    if(root.closest(geminiHidden)||root.querySelector(geminiAttachments))return null;
    const text=one([...root.querySelectorAll('[data-test-id="query-text"],.query-text')]
      .filter(el=>el.closest('user-query')===root&&!el.closest(geminiHidden)));
    if(!text)return null;
    const children=[...text.children];
    const padded=children[0]?.matches('h5.cdk-visually-hidden.screen-reader-user-query-label')===true;
    const lines=padded?children.slice(1):children;
    if(padded&&!lines.length)return null;
    if(!lines.length)return text.textContent;
    if(lines.some(line=>!line.matches('p.query-text-line')||line.childElementCount>0)||
      [...text.childNodes].some(node=>node.nodeType===3&&node.textContent.trim()))return null;
    const values=lines.map(line=>line.textContent);
    if(padded&&values.some(value=>value.length<2||!value.startsWith(' ')||!value.endsWith(' ')))return null;
    return values.map(value=>padded?value.slice(1,-1):value).join('\n');
  },
  admissionIssue(user,snapshot){
    // Gemini replaces optimistic turns; pin only the service response ID.
    const turn=user.parentElement;
    if(!turn?.matches('div.conversation-container')||!/^[a-f0-9]{16}$/i.test(turn.id)||
      snapshot.users.some(other=>other!==user&&other.parentElement?.id===turn.id))
      return '尚未找到 Gemini 已确认的消息回合';
    return null;
  },
  assistantCompleted(root,win,user,historyRoot){
    if(!root||root.closest(geminiHidden)||root.querySelector('model-response,user-query')||
      !geminiOwnReply(root,win,user,historyRoot))return false;
    const body=geminiBody(root);
    if(geminiStoppedBody(root,win,user,historyRoot,body))return true;
    const actions=one([...root.querySelectorAll('message-actions')].filter(el=>!el.closest(geminiHidden)));
    if(!body?.textContent.trim()||!actions||body.contains(actions)||actions.contains(body))return false;
    const copy=one([...actions.querySelectorAll(geminiCopy)].filter(el=>!el.closest(geminiHidden)));
    return !!copy&&!copy.disabled&&copy.getAttribute('aria-disabled')!=='true';
  },
  streaming(root,win,user,historyRoot){
    if(!explicitStreaming(root))return false;
    const body=geminiStoppedBody(root,win,user,historyRoot,geminiBody(root));
    if(!body)return true;
    // After Stop only the stale aria-busy may be ignored.
    return root.matches(streamingSignals)||[...root.querySelectorAll(streamingSignals)].some(el=>
      el!==body||el.matches('[data-is-streaming="true"],.result-streaming'));
  },
  requiresTrailingReply:true,
  unsupported:'只支持 Gemini 新聊天或已有对话'
});

export const createGeminiSite=options=>createConversationSite(gemini,options);

export const deepSeekConversationKey=/^a\/chat\/s\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const deepSeekRoute=(location,allowHome=false)=>{
  if(location?.origin!=='https://chat.deepseek.com'||!location.pathname.startsWith('/'))return null;
  if(allowHome&&location.pathname==='/'&&!location.search)return {route:null};
  const route=location.pathname.slice(1);
  return deepSeekConversationKey.test(route)?{route}:null;
};
const deepSeekControl='div.ds-button[role="button"].ds-button--primary.ds-button--circle';
const deepSeekUser='.ds-message.d29f3d7d > .fbb737a4';
const deepSeekAssistant='.ds-message > .ds-assistant-message-main-content';
const deepSeekAttachments=':scope > .b40079d7,:scope._1d5e44c,[data-attachment-id],[data-file-id]';
const deepSeekPath=(node,box,prefix)=>{
  const svg=one([...node.querySelectorAll('svg')]);
  const path=svg&&one([...svg.querySelectorAll('path')]);
  return svg?.getAttribute('viewBox')===box&&path?.getAttribute('d')?.startsWith(prefix);
};
const deepSeek=Object.freeze({
  routeFor:(win,allowHome)=>deepSeekRoute(win.location,allowHome),editors:'#root textarea[name="search"]',
  users:deepSeekUser,assistants:deepSeekAssistant,attachments:deepSeekAttachments,
  composer:editor=>editor.closest('._77cefa5'),
  historyRoot:(doc,win)=>one([...doc.querySelectorAll('#root .ds-virtual-list.ds-virtual-list--printable > .ds-virtual-list-items')]
    .filter(el=>visible(el,win))),
  ownsComposer:(list,form)=>!list.contains(form)&&list.closest('#root')===form.closest('#root'),
  controlSelector:deepSeekControl,requiresKnownControl:true,requiresTrailingReply:true,requiresSendForIdle:true,
  allowDetachedRolePrefixes:true,
  placement(button){
    return {toolbar:button?.closest('.bf38813a'),controls:'button,[role="button"]'};
  },
  controlRole(button){
    if(deepSeekPath(button,'0 0 16 16','M8.3125 0.980206C8.66767'))return 'send';
    if(deepSeekPath(button,'0 0 16 16','M2 4.88C2 3.68009'))return 'stop';
    if(deepSeekPath(button,'0 0 36 36','M34,18 C34,9.163444'))return 'loading';
    return null;
  },
  disabled:button=>button.classList.contains('ds-button--disabled'),
  hasAttachment:form=>form.classList.contains('_1d5e44c')||
    [...form.querySelectorAll('input[type="file"]')].some(node=>node.files?.length),
  messageText(root){
    if(root.childElementCount!==1||root.querySelector(RICH+','+deepSeekAttachments))return null;
    const body=one([...root.querySelectorAll(':scope > .ds-collapsible-text > div')]);
    if(!body||body.parentElement.childElementCount!==1||root.textContent!==body.textContent||
      [...body.querySelectorAll('*')].some(node=>!node.matches('span,br')))return null;
    return body.innerText??body.textContent;
  },
  assistantCompleted(body,win){
    if(!visible(body,win)||!body.textContent.trim())return false;
    const row=one([...body.parentElement.parentElement.querySelectorAll(':scope > div.ds-flex._0a3d93b')]
      .filter(el=>visible(el,win)));
    if(!row)return false;
    const copy=one([...row.querySelectorAll('div.ds-button[role="button"]')]
      .filter(el=>visible(el,win)&&deepSeekPath(el,'0 0 16 16','M6.14929 4.02032')));
    return !!copy&&!copy.classList.contains('ds-button--disabled')&&copy.getAttribute('aria-disabled')!=='true';
  },
  streaming(body){
    return explicitStreaming(body)||body?.parentElement?.matches(streamingSignals)||
      body?.parentElement?.parentElement?.matches(streamingSignals);
  },
  unsupported:'只支持 DeepSeek 新对话或已有对话'
});
export const createDeepSeekSite=options=>createConversationSite(deepSeek,options);

export function createConversationSite(profile,{doc=document,win=window,isComposing=()=>false,allowHome=false}={}) {
  const {users:userSelector,assistants:assistantSelector}=profile;
  const historySelector=userSelector+','+assistantSelector;
  const requireRoleAnchor=!profile.allowDetachedRolePrefixes;
  let interrupted=null;
  const disabled=button=>button.disabled||button.getAttribute('aria-disabled')==='true'||profile.disabled?.(button);
  function inspect() {
    const context = profile.routeFor(win,allowHome);
    if (!context || win !== win.top) return {ok:false,reason:profile.unsupported};
    const {route}=context;
    const candidates = [...new Set([...doc.querySelectorAll(profile.editors)].filter(el =>
      (el.isContentEditable || typeof el.value === 'string') && visible(el,win) &&
      !el.closest('[data-opendesk-ui-owner]')))];
    const editor = one(candidates);
    if (!editor) return {ok:false,route,reason:'原生输入框不存在或不唯一'};
    const form = profile.composer(editor);
    if (!form || !form.isConnected) return {ok:false,route,reason:'原生输入表单无法确认'};
    const historyless=profile===deepSeek&&route===null;
    const historyRoot=historyless?doc:profile.historyRoot?profile.historyRoot(doc,win):doc;
    if(!historyRoot||(historyRoot!==doc&&!(profile.ownsComposer?
      profile.ownsComposer(historyRoot,form):historyRoot.contains(form))))
      return {ok:false,route,reason:'原生会话区域不存在或不唯一'};
    const blocked=profile.blocked?.(form,historyRoot,win);
    if(blocked)return {ok:false,route,reason:blocked};
    if(form.hasAttribute('data-opendesk-composer-owner'))
      return {ok:false,route,reason:'等待其他操作释放原生输入框'};
    const nativeButtons = [...form.querySelectorAll(profile.controlSelector||'button')].filter(el => visible(el,win) && !el.closest('[data-opendesk-ui-owner]'));
    if(profile.requiresKnownControl&&(!one(nativeButtons)||!profile.controlRole(nativeButtons[0])))
      return {ok:false,route,reason:'无法确认原生发送状态'};
    const stopButtons = nativeButtons.filter(el => profile.controlRole(el)==='stop');
    const sendButtons = nativeButtons.filter(el => profile.controlRole(el)==='send');
    if (stopButtons.length > 1 || sendButtons.length > 1) return {ok:false,route,reason:'原生发送按钮存在歧义'};
    const stopButton = one(stopButtons), sendButton = one(sendButtons);
    const nearby=profile.idleControls?nativeButtons.filter(el=>el.matches(profile.idleControls)):[];
    const loadingButton=nativeButtons.find(el=>profile.controlRole(el)==='loading');
    const anchorButton=stopButton||sendButton||loadingButton||one(nearby);
    const findHistory=selector=>historyless?[]:[...historyRoot.querySelectorAll(selector)].filter(node=>
      !profile.ownsHistoryNode||profile.ownsHistoryNode(node,win));
    const users = findHistory(userSelector).filter(el=>!el.parentElement?.closest(userSelector));
    const assistants = findHistory(assistantSelector).filter(el=>!el.parentElement?.closest(assistantSelector));
    const history = findHistory(historySelector)
      .filter(el=>!el.parentElement?.closest(historySelector));
    const last = assistants.at(-1) || null;
    // Require the local Stop receipt and unchanged history.
    const nativeIdle=!!sendButton || !!profile.stoppedIdleControls &&
      nearby.some(el=>el.matches(profile.stoppedIdleControls));
    const stopped=profile.allowLocalStopReceipt && !!interrupted && interrupted.route===route && !stopButton && nativeIdle &&
      !explicitStreaming(last) && last===interrupted.assistants.at(-1) &&
      matchesHistoryTail(interrupted.users,users) &&
      matchesHistoryTail(interrupted.assistants,assistants) &&
      matchesConversationTail(interrupted,{history},0);
    const currentUser=users.at(-1);
    const busy = !!(stopButton||loadingButton) || (!stopped && profile.streaming(last,win,currentUser,historyRoot));
    const trailingReply=!profile.requiresTrailingReply||(!history.length&&route===null)||
      (history.at(-1)===last&&!!last&&history.at(-2)===currentUser&&!!currentUser);
    const completed = trailingReply && (!profile.requiresSendForIdle||!!sendButton) &&
      (!last || stopped || profile.assistantCompleted(last,win,currentUser,historyRoot));
    return {ok:true,route,newConversation:route===null,form,editor,sendButton,stopButton,anchorButton,users,assistants,history,
      placement:profile.placement?.(anchorButton,form,editor),
      busy,idle:!busy && completed,answerComplete:!!last && completed && !busy,
      draft:editorText(editor),composing:isComposing(),
      rich:!!editor.querySelector?.(RICH) || !!form.querySelector(profile.attachments) || !!profile.hasAttachment?.(form)};
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
      if(text&&profile.insertText){
        if(!profile.insertText(doc,text))return false;
      }else if(text){
        // Long insertText can stall ChatGPT.
        if(typeof win.DataTransfer!=='function'||typeof win.ClipboardEvent!=='function')return false;
        const clipboardData=new win.DataTransfer();clipboardData.setData('text/plain',text);
        editor.dispatchEvent(new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
      }else if(!doc.execCommand('delete',false,null))return false;
    } else return false;
    return editorText(editor) === text;
  }
  function clearForQueue(snapshot) {
    if(!snapshot.route)return {ok:false,reason:'当前对话暂不能加入队列'};
    if (!snapshot.ok || snapshot.rich || snapshot.composing || !normal(snapshot.draft)) return {ok:false,reason:'草稿为空、包含附件或输入法尚未完成'};
    const text=snapshot.draft;
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
    if(disabled(fresh.sendButton))
      return {ok:false,retry:true,reason:'原生发送按钮尚未启用'};
    try {fresh.sendButton.click();}
    catch {return {ok:false,stage:'after-click',reason:'原生发送点击结果未知'};}
    return {ok:true,before:token.before};
  }
  function submitFirst(initial) {
    const fresh=inspect();
    const reject=reason=>({ok:false,stage:'before-click',reason:reason+'；草稿已保留'});
    if(profile!==chatgpt||win.location.pathname!=='/'||!initial?.ok||initial.route!==null||
      !fresh.ok||fresh.route!==null||fresh.form!==initial.form||fresh.editor!==initial.editor||
      fresh.draft!==initial.draft||!normal(fresh.draft))return reject('新聊天或输入框已变化');
    if(initial.history.length||fresh.history.length)return reject('新聊天仍显示会话消息');
    if(fresh.rich)return reject('当前草稿包含附件或富内容');
    if(fresh.composing)return reject('请先完成输入法编辑');
    if(fresh.busy||!fresh.idle)return reject('ChatGPT 正在处理请求');
    if(!fresh.sendButton||
      fresh.sendButton!==initial.sendButton||disabled(fresh.sendButton))
      return reject('当前输入框的发送按钮不可用');
    try{fresh.sendButton.click();}
    catch{return {ok:false,stage:'after-click'};}
    return {ok:true};
  }
  function firstAdmission(before,snapshot) {
    if(profile!==chatgpt||before.route!==null||!snapshot.ok||!snapshot.route||
      !/^\/c\/[a-z0-9-]{8,}\/?$/i.test(win.location.pathname)||
      snapshot.history[0]!==snapshot.users[0]||
      (snapshot.history.length===2&&snapshot.history[1]!==snapshot.assistants[0]))return null;
    const bound={...before,route:snapshot.route};
    return confirm(bound,before.draft,snapshot)?bound:null;
  }
  function canReclaimPrepared(token,{snapshot: fresh=inspect(),allowComposing=false}={}) {
    return !!token?.route && fresh.ok && fresh.route===token.route &&
      fresh.form===token.form && fresh.editor===token.editor &&
      !fresh.rich && (allowComposing||!fresh.composing) && !fresh.busy && fresh.draft===token.text &&
      matchesHistoryTail(token.before.users,fresh.users) &&
      matchesConversationTail(token.before,fresh,0);
  }
  function confirmationIssue(before,text,snapshot) {
    if (!before.route || !snapshot.ok || snapshot.route!==before.route) return '原对话或输入框已不可确认';
    if (!matchesHistoryTail(before.users,snapshot.users,1,requireRoleAnchor))
      return snapshot.users.length!==before.users.length+1?
        '用户消息数量与发送前记录不符':'历史用户消息节点已变化';
    if(!matchesConversationTail(before,snapshot,1,2))return '历史对话节点或顺序已变化';
    const newMessage=snapshot.users.at(-1);
    if(before.users.includes(newMessage))return '未找到唯一新增用户消息';
    if(!requireRoleAnchor){
      const added=snapshot.history.filter(node=>!before.history.includes(node));
      if(added[0]!==newMessage || (added.length===2&&!snapshot.assistants.includes(added[1])))
        return '新增消息未按用户、回复顺序出现';
    }
    if(profile.messageText(newMessage)!==text)return '新增用户消息正文与队列不完全一致';
    return profile.admissionIssue?.(newMessage,snapshot)??null;
  }
  function sameHistory(before,snapshot,confirmedQueueUser) {
    if(!matchesHistoryTail(before.users,snapshot.users,0,false))return false;
    if(matchesHistoryTail(before.assistants,snapshot.assistants,0,false) &&
      matchesConversationTail(before,snapshot,0))return true;
    const user=before.users.at(-1),reply=snapshot.assistants.at(-1);
    return !!user&&(!!before.busy||user===confirmedQueueUser)&&!!reply&&before.history?.at(-1)===user&&
      snapshot.history?.at(-2)===user&&snapshot.history.at(-1)===reply&&
      matchesHistoryTail(before.assistants,snapshot.assistants,1,false)&&
      matchesConversationTail(before,snapshot,1);
  }
  function confirm(before,text,snapshot) {
    return confirmationIssue(before,text,snapshot)===null;
  }
  function replyComplete(before,confirmedUser,snapshot,gate) {
    if(gate?.historyInvalid || !confirmedUser || !snapshot.ok || snapshot.route!==before?.route)return false;
    const rejectHistory=()=>{
      if(gate)gate.historyInvalid=true;
      return false;
    };
    if(!matchesReplyHistory(before,snapshot,requireRoleAnchor) ||
      (gate?.observed && !matchesReplyHistory(gate.observed,snapshot,requireRoleAnchor)))return rejectHistory();
    const {users,assistants,history}=snapshot;
    if(new Set(history).size!==history.length || history.length!==users.length+assistants.length ||
      history.some(node=>users.includes(node)===assistants.includes(node)) ||
      [users,assistants].some(nodes=>{
        const ordered=history.filter(node=>nodes.includes(node));
        return ordered.length!==nodes.length || ordered.some((node,i)=>node!==nodes[i]);
      }))return rejectHistory();
    const added=history.filter(node=>!before.history.includes(node));
    if(added[0]!==confirmedUser || !users.includes(confirmedUser) ||
      added.some((node,i)=>assistants.includes(node) && !users.includes(added[i-1])))return rejectHistory();
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
      disabled(fresh.stopButton)) return false;
    try { fresh.stopButton.click(); interrupted=fresh; return true; } catch { return false; }
  }
  return Object.freeze({inspect,currentRoute:()=>profile.routeFor(win,allowHome),clearForQueue,restore,reclaimToComposer,prepare,commit,submitFirst,firstAdmission,canReclaimPrepared,confirm,confirmationIssue,sameHistory,replyComplete,stop,normal});
}

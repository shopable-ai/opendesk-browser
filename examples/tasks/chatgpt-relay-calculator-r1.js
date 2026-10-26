// OpenDesk Controller Standard draft. Run once in 「开发」 on a short, idle ChatGPT /c/<id>.
// Fixed A→B calculator feasibility probe; NOT an installed/background task queue.
// User must approve the Controller's website authority. No private ChatGPT API or hidden retry.
const RELAY_CALC_KEY = 'opendesk.chatgpt-relay-calculator.r1.active';
function relayFail(code,message){return Object.assign(new Error(message),{code});}
function relayInputs(params){
  const p=params && typeof params==='object'?params:{};
  if(Object.keys(p).some(k=>!['left','right','factor'].includes(k)))
    throw relayFail('E_RELAY_PARAMS','Only left/right/factor are allowed');
  const left=p.left??17,right=p.right??25,factor=p.factor??3;
  if(![left,right,factor].every(x=>Number.isSafeInteger(x)&&Math.abs(x)<=10000) ||
    !Number.isSafeInteger((left+right)*factor))throw relayFail('E_RELAY_PARAMS','Small safe integers required');
  return {left,right,factor};
}
function relayPrompt(step,runId,operands,factor){
  const head='只做计算，直接返回严格的单行 JSON，不添加说明或 Markdown。';
  if(step==='A')return head+' 计算 '+operands.left+' + '+operands.right+
    '。返回 {"runId":"'+runId+'","step":"A","result":计算结果}。';
  if(step==='B')return head+' 上一个对话真实读回的结果是 '+operands+
    '。计算 '+operands+' × '+factor+'。返回 {"runId":"'+runId+'","step":"B","result":计算结果}。';
  throw relayFail('E_RELAY_STEP','Unknown step');
}
function relayParse(text,runId,step,expected){
  const raw=String(text??'').trim();
  const wrapped=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(raw);
  let obj;
  try{obj=JSON.parse(wrapped?wrapped[1].trim():raw);}
  catch{throw relayFail('E_RELAY_RESPONSE',step+' was not JSON');}
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
      Object.keys(obj).sort().join(',')!=='result,runId,step'||obj.runId!==runId||
      obj.step!==step||!Number.isSafeInteger(obj.result)||obj.result!==expected)
    throw relayFail('E_RELAY_RESPONSE',step+' identity or arithmetic mismatch');
  return obj.result;
}
// Closure-free callback: existing admitted Controller page.evaluate (USER_SCRIPT).
function relayObservePage(){
  const url=new URL(location.href);
  const v=n=>{if(!n?.isConnected||n.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
    const s=getComputedStyle(n);return s.display!=='none'&&s.visibility!=='hidden'&&n.getClientRects().length>0;};
  const roots=css=>[...document.querySelectorAll(css)].filter(n=>!n.parentElement?.closest(css));
  const editorCss='#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
  const editors=[...new Set([...document.querySelectorAll(editorCss)].filter(n=>v(n)&&(n.isContentEditable||typeof n.value==='string')))];
  const editor=editors.length===1?editors[0]:null, form=editor?.closest('form');
  const users=roots('[data-message-author-role="user"],[data-message-role="user"]');
  const assistants=roots('[data-message-author-role="assistant"],[data-message-role="assistant"]');
  const text=node=>{const el=node?.querySelector('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap')||node;
    return el?.innerText??el?.textContent??'';};
  const last=assistants.at(-1),turn=last?.closest('[data-talvt-turn-state]')||last;
  const buttons=form?[...form.querySelectorAll('button')].filter(v):[];
  const stop=buttons.some(b=>/stop-button|stop generating|stop responding|停止生成|停止回复/i.test(
    (b.getAttribute('data-testid')||'')+' '+(b.getAttribute('aria-label')||b.getAttribute('title')||'')));
  const busy=stop||Boolean(turn?.getAttribute('data-talvt-turn-state')&&turn.getAttribute('data-talvt-turn-state')!=='complete')||
    Boolean(last?.matches('[aria-busy="true"],[data-is-streaming="true"]')||
      last?.querySelector('[aria-busy="true"],[data-is-streaming="true"]'));
  const done=!!last&&!busy&&(turn?.getAttribute('data-talvt-turn-state')==='complete'||
    !!turn?.querySelector('[data-testid="copy-turn-action-button"],[data-assistant-message-actions]'));
  const blank=editor?.isContentEditable&&editor.textContent===''&&!!editor.querySelector('p:only-child > br:only-child');
  const draft=typeof editor?.value==='string'?editor.value:blank?'':editor?.innerText??editor?.textContent??'';
  const rich=!!editor?.querySelector('img,video,canvas,iframe,[data-attachment-id],[data-file-id]')||
    !!form?.querySelector('[data-attachment-id],[data-file-id],[data-testid="file-thumbnail"]');
  return {url:url.href,origin:url.origin,path:url.pathname,users:users.length,assistants:assistants.length,
    lastUser:text(users.at(-1)),lastAnswer:text(last),editorCount:editors.length,
    draft,rich,busy,done,occupied:!!form?.getAttribute('data-opendesk-composer-owner'),
    shortHistory:users.length<=3&&assistants.length<=3,
    lastOrder:!!(users.at(-1)&&last&&(users.at(-1).compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING))};
}
// The only send operation. An uncertain outcome must NEVER be automatically retried.
async function relaySubmitOnce(message,before){
  if(location.href!==before.url||new URL(location.href).origin!=='https://chatgpt.com')
    throw new Error('Target changed before send');
  const css='#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"],form textarea[data-testid]';
  const editors=[...new Set([...document.querySelectorAll(css)].filter(n=>n.isConnected&&
    n.getClientRects().length>0&&!n.closest('[hidden],[inert],[aria-hidden="true"]')&&
    (n.isContentEditable||typeof n.value==='string')))];
  if(editors.length!==1)throw new Error('Editor is missing or ambiguous');
  const editor=editors[0],form=editor.closest('form');
  if(!form||form.hasAttribute('data-opendesk-composer-owner'))throw new Error('Composer is owned');
  const users=()=>[...document.querySelectorAll('[data-message-author-role="user"],[data-message-role="user"]')]
    .filter(n=>!n.parentElement?.closest('[data-message-author-role="user"],[data-message-role="user"]'));
  const assistants=()=>[...document.querySelectorAll('[data-message-author-role="assistant"],[data-message-role="assistant"]')]
    .filter(n=>!n.parentElement?.closest('[data-message-author-role="assistant"],[data-message-role="assistant"]'));
  const blank=()=>typeof editor.value==='string'?editor.value==='':
    editor.textContent===''&&(editor.childNodes.length===0||
      !!editor.querySelector('p:only-child > br:only-child'));
  if(users().length!==before.users||assistants().length!==before.assistants||!blank()||
      form.querySelector('[data-attachment-id],[data-file-id],[data-testid="file-thumbnail"]')||
      editor.querySelector?.('img,video,canvas,iframe,[data-attachment-id],[data-file-id]'))
    throw new Error('Draft, attachment or conversation changed');
  form.setAttribute('data-opendesk-composer-owner','relay-calculator-r1');
  editor.focus();
  if(document.activeElement!==editor||!editor.isConnected||editor.closest('form')!==form||!blank())
    throw new Error('Editor changed or draft restored on focus');
  let inserted=false;
  if(typeof editor.value==='string'){
    const proto=editor.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter){setter.call(editor,message);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:message}));inserted=true;}
  }else if(editor.isContentEditable){
    const sel=window.getSelection(),range=document.createRange();
    range.selectNodeContents(editor);sel.removeAllRanges();sel.addRange(range);
    inserted=document.execCommand('insertText',false,message);
  }
  const read=()=>typeof editor.value==='string'?editor.value:editor.innerText;
  if(!inserted||read()!==message)throw new Error('Prompt input/readback mismatch');
  const started=Date.now();
  let button=null;
  while(Date.now()-started<5000){
    if(location.href!==before.url||!editor.isConnected||editor.closest('form')!==form||
        form.getAttribute('data-opendesk-composer-owner')!=='relay-calculator-r1'||
        users().length!==before.users||assistants().length!==before.assistants||read()!==message)
      throw new Error('Target or prompt changed before click');
    const buttons=[...form.querySelectorAll('button')].filter(n=>n.isConnected&&n.getClientRects().length>0);
    const attr=b=>(b.getAttribute('data-testid')||'')+' '+(b.getAttribute('aria-label')||b.getAttribute('title')||'');
    const send=buttons.filter(b=>/^(send-button|composer-send-button|composer-submit-button)$/.test(b.getAttribute('data-testid')||'')||
      /^(send message|send prompt|send|发送消息|发送|送出)$/i.test(b.getAttribute('aria-label')||b.getAttribute('title')||''));
    if(send.length>1||buttons.some(b=>/stop-button|stop generating|stop responding|停止生成|停止回复/i.test(attr(b))))
      throw new Error('Send control is ambiguous or busy');
    if(send.length===1&&!send[0].disabled&&send[0].getAttribute('aria-disabled')!=='true'){
      button=send[0];break;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!button||read()!==message)throw new Error('Send not ready');
  button.click();  // Exactly one attempted native website click.
  return {clicked:true};
}

async function main(){
  const {left,right,factor}=relayInputs(params);
  const first=await page.evaluate(relayObservePage);
  if(first.origin!=='https://chatgpt.com'||!/^\/c\/[a-z0-9-]{8,}\/?$/i.test(first.path)||
    !first.shortHistory||first.editorCount!==1||first.draft!==''||
    first.rich||first.busy||first.occupied)
    throw relayFail('E_RELAY_PRECONDITION','Open a short idle existing ChatGPT test chat with empty composer');
  const prev=await AppStorage.getItem(RELAY_CALC_KEY);
  if(prev){
    let old;try{old=JSON.parse(prev);}catch{throw relayFail('E_RELAY_CHECKPOINT','Corrupt checkpoint; do not restart');}
    if(old.state!=='completed')
      throw relayFail('E_RELAY_RECONCILE','Previous send/navigation may have happened; inspect before restarting');
  }
  const runId=crypto.randomUUID();
  const record={version:1,runId,startedAt:new Date().toISOString(),input:{left,right,factor},sourceA:first.url};
  async function save(state,extra={}){
    Object.assign(record,extra,{state,updatedAt:new Date().toISOString()});
    const wire=JSON.stringify(record);
    await AppStorage.setItem(RELAY_CALC_KEY,wire);
    if(await AppStorage.getItem(RELAY_CALC_KEY)!==wire)
      throw relayFail('E_RELAY_CHECKPOINT','Durable checkpoint readback mismatch');
  }
  async function waitAnswer(before,prompt,step,expected,previousUrl=null){
    const expiry=Date.now()+42000;
    while(Date.now()<expiry){
      const shot=await page.evaluate(relayObservePage);
      const routeOk=step==='A'?shot.url===before.url:
        shot.origin==='https://chatgpt.com'&&/^\/c\/[a-z0-9-]{8,}\/?$/i.test(shot.path)&&shot.url!==previousUrl;
      if(!routeOk||!shot.shortHistory||shot.users>before.users+1||shot.assistants>before.assistants+1)
        throw relayFail('E_RELAY_AMBIGUOUS','Conversation identity or turn count changed');
      if(shot.users===before.users+1&&shot.lastUser===prompt&&
        shot.assistants===before.assistants+1&&shot.lastOrder&&shot.done&&!shot.busy){
        const value=relayParse(shot.lastAnswer,runId,step,expected);
        await new Promise(resolve=>setTimeout(resolve,850));
        const stable=await page.evaluate(relayObservePage);
        if(stable.url!==shot.url||stable.lastAnswer!==shot.lastAnswer||
          stable.lastUser!==prompt||stable.users!==shot.users||stable.assistants!==shot.assistants||
          !stable.done||stable.busy)throw relayFail('E_RELAY_AMBIGUOUS','Answer not stable');
        return {value,answer:shot.lastAnswer,conversationUrl:shot.url};
      }
      await new Promise(resolve=>setTimeout(resolve,450));
    }
    throw relayFail('E_RELAY_TIMEOUT',step+' has unknown send/reply outcome — never re-send automatically');
  }
  await save('initialized');
  const promptA=relayPrompt('A',runId,{left,right},factor);
  await save('A_may_have_sent',{promptA});
  await page.evaluate(relaySubmitOnce,promptA,first);
  const a=await waitAnswer(first,promptA,'A',left+right);
  await save('A_completed',{answerA:a.answer,resultA:a.value,conversationA:a.conversationUrl});
  await page.evaluate(()=>{document.querySelector('form[data-opendesk-composer-owner="relay-calculator-r1"]')
    ?.removeAttribute('data-opendesk-composer-owner');});

  const names=[['link','New chat'],['button','New chat'],['link','新聊天'],['button','新聊天'],
    ['link','新建聊天'],['button','新建聊天'],['link','新对话'],['button','新对话']];
  let newChat=null;
  for(const [role,name] of names){
    const locator=page.getByRole(role,{name,exact:true}),n=await locator.count();
    if(n>1)throw relayFail('E_RELAY_NEW_CHAT','Ambiguous new-chat control');
    if(n===1){if(newChat)throw relayFail('E_RELAY_NEW_CHAT','Multiple new-chat controls');newChat=locator;}
  }
  if(!newChat)throw relayFail('E_RELAY_NEW_CHAT','No unique new-chat control; inspect live DOM');
  await save('new_chat_may_have_navigated');
  await newChat.click({timeout:6000});
  let fresh=null;
  for(let n=0;n<30;n++){
    const s=await page.evaluate(relayObservePage);
    if(s.origin==='https://chatgpt.com'&&s.path==='/'&&s.users===0&&s.assistants===0&&
      s.editorCount===1&&s.draft===''&&!s.rich&&!s.busy&&!s.occupied){fresh=s;break;}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(!fresh)throw relayFail('E_RELAY_NEW_CHAT','New empty conversation not confirmed');
  const promptB=relayPrompt('B',runId,a.value,factor);
  await save('B_may_have_sent',{newChatStart:fresh.url,promptB});
  await page.evaluate(relaySubmitOnce,promptB,fresh);
  const b=await waitAnswer(fresh,promptB,'B',a.value*factor,a.conversationUrl);
  if(b.conversationUrl===a.conversationUrl)throw relayFail('E_RELAY_IDENTITY','B reused conversation A');
  await save('completed',{answerB:b.answer,resultB:b.value,conversationB:b.conversationUrl});
  await page.evaluate(()=>{document.querySelector('form[data-opendesk-composer-owner="relay-calculator-r1"]')
    ?.removeAttribute('data-opendesk-composer-owner');});
  return {kind:'opendesk.chatgpt.relay-calculator.result',version:1,runId,
    input:{left,right,factor},A:{value:a.value,url:a.conversationUrl},
    B:{inputFromA:a.value,value:b.value,url:b.conversationUrl},checkpointKey:RELAY_CALC_KEY};
}

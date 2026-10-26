import {fillGate,MAX_TEXT} from './model.js';
// Only the already-approved Page USER_SCRIPT world touches ChatGPT DOM.
// A website DOM snapshot is not a Chrome tab/documentId authorization.
const SELECTORS='#prompt-textarea,[data-testid="composer-input"],form [contenteditable="true"][role="textbox"][data-composer-markdown],form textarea[data-testid]';
const RICH='[data-attachment-id],[data-file-id],[data-upload-id],[data-testid*="attachment-preview"],[data-testid*="file-preview"],[data-testid="file-thumbnail"]';
export function createVoiceCleanupSite({doc=document,win=window}={}){
  const visible=el=>!!el?.isConnected&&!el.closest('[hidden],[inert],[aria-hidden="true"],[data-opendesk-ui-owner]')&&
    win.getComputedStyle(el).display!=='none'&&win.getComputedStyle(el).visibility!=='hidden'&&
    (el.getClientRects().length>0||el.getBoundingClientRect().width>0);
  const draftOf=editor=>{
    if(typeof editor.value==='string')return editor.value;
    const lines=editor?.hasAttribute?.('data-composer-markdown')?[...editor.childNodes]:[];
    if(lines.length&&lines.every(node=>node.nodeType===1&&node.tagName==='P'&&
      !node.querySelector('br:not(.ProseMirror-trailingBreak)'))&&lines.some(n=>n.textContent!==''))
      return lines.map(node=>node.textContent).join('\n');
    // A single placeholder paragraph is not user text.
    if(editor.textContent===''&&editor.querySelectorAll('p').length===1&&
       editor.querySelector('p')?.getAttribute('data-empty-paragraph')==='true')return '';
    return editor.innerText??editor.textContent??'';
  };
  function inspect(){
    if(win!==win.top||win.location.origin!=='https://chatgpt.com')
      return {ok:false,reason:'只支持 ChatGPT 官网顶层网页'};
    const editors=[...new Set([...doc.querySelectorAll(SELECTORS)].filter(visible))];
    if(editors.length!==1)return {ok:false,reason:'官网编辑器缺失或不唯一'};
    const editor=editors[0],form=editor.closest('form');
    if(!form?.isConnected||editor.readOnly||editor.disabled||
      editor.getAttribute('aria-disabled')==='true')
      return {ok:false,reason:'官网编辑器目前不可编辑'};
    return {ok:true,doc,editor,form,draft:draftOf(editor),rich:
      !!editor.querySelector('img,iframe,[contenteditable="false"]')||
      !!form.querySelector(RICH)||
      [...form.querySelectorAll('input[type="file"]')].some(x=>x.files?.length)||
      form.hasAttribute('data-opendesk-composer-owner')};
  }
  function capture(){
    const snapshot=inspect();
    if(!snapshot.ok)return snapshot;
    if(snapshot.rich)return {ok:false,reason:'编辑器已有附件或被其他工具占用'};
    return {ok:true,binding:{...snapshot,url:win.location.href}};
  }
  function check(binding,isComposing){
    return fillGate(binding,inspect(),{url:win.location.href,composing:isComposing()});
  }
  async function fill(binding,text,isComposing=()=>false){
    if(typeof text!=='string'||!text||text.length>MAX_TEXT)
      return {ok:false,outcome:'NOT_DISPATCHED',reason:'结果正文为空或过长'};
    let gate=check(binding,isComposing);
    if(!gate.ok)return {...gate,outcome:'NOT_DISPATCHED'};
    const editor=binding.editor;
    editor.focus(); // Focus can restore a React draft. Check again.
    gate=check(binding,isComposing);
    if(!gate.ok||doc.activeElement!==editor)return {ok:false,outcome:'NOT_DISPATCHED',
      reason:gate.ok?'未能确认输入焦点':gate.reason};
    // The only destructive action is the explicit, user-clicked insert.
    let attempted=false,accepted=false;
    try{
      if(typeof editor.value==='string'){
        const proto=editor.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
        if(!setter)return {ok:false,outcome:'NOT_DISPATCHED',reason:'编辑器不支持原生输入'};
        attempted=true;setter.call(editor,text);
        editor.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:text}));
        accepted=true;
      }else{
        if(!editor.isContentEditable||typeof doc.execCommand!=='function')
          return {ok:false,outcome:'NOT_DISPATCHED',reason:'编辑器不支持安全文本输入'};
        const selection=win.getSelection(),range=doc.createRange();
        range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);
        attempted=true;accepted=doc.execCommand('insertText',false,text)===true;
      }
    }catch{return {ok:false,outcome:attempted?'OUTCOME_UNKNOWN':'NOT_DISPATCHED',
      reason:'网页编辑回执不确定，请人工检查；不会重试'};}
    if(!accepted)return {ok:false,outcome:'OUTCOME_UNKNOWN',reason:'官网未确认文本插入；禁止重试'};
    const verified=()=>{
      const current=inspect();
      return current.ok&&win.location.href===binding.url&&current.doc===binding.doc&&
        current.editor===binding.editor&&current.form===binding.form&&!current.rich&&
        current.draft===text;
    };
    if(!verified())return {ok:false,outcome:'OUTCOME_UNKNOWN',reason:'写入后读回未匹配，请人工检查'};
    await new Promise(resolve=>win.setTimeout(resolve,80));
    if(!verified())return {ok:false,outcome:'OUTCOME_UNKNOWN',reason:'官网重新渲染后文本未保持'};
    return {ok:true,outcome:'VERIFIED',filled:true,sent:false,readBackVerified:true};
  }
  return {inspect,capture,check,fill};
}

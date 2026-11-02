import {CHATGPT_FILE_INTENT_PROTOCOL,normalizeChatGPTFileHint} from './chatgpt-file-intent-gate.js';

// First-party ISOLATED-world UI only: a click opens a trusted extension page.
// It does not read files, ask for a Native session or send a ChatGPT message.
export function initChatGPTFileIntentPage({api=chrome,doc=document,win=window}={}){
  if(win!==win.top||win.location.origin!=='https://chatgpt.com')return null;
  if(doc.getElementById('opendesk-chatgpt-files-entry'))return null;
  const root=doc.createElement('div');
  root.id='opendesk-chatgpt-files-entry';
  root.setAttribute('data-opendesk-ui-owner','chatgpt-files-entry');
  root.style.cssText='position:fixed;left:14px;bottom:14px;z-index:2147483644;max-width:min(320px,calc(100vw - 28px))';
  const shadow=root.attachShadow({mode:'closed'});
  const style=doc.createElement('style');
  style.textContent=':host{all:initial}*{box-sizing:border-box}.card{font:12px/1.45 system-ui,-apple-system,sans-serif;color:#1b2c49;background:#fff;border:1px solid #e1e8f1;border-radius:12px;padding:9px;box-shadow:0 4px 16px #0002}.head{display:flex;align-items:center;gap:8px}button{font:inherit;border-radius:8px;min-height:34px;cursor:pointer;padding:7px 10px;border:1px solid #8795a9;background:#f5f7fb;color:inherit}button.primary{background:#365eda;border-color:#365eda;color:#fff}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #365eda;outline-offset:2px}.detail{margin-top:8px;display:grid;gap:8px}.detail[hidden]{display:none}label{display:grid;gap:4px;color:#4b5e77}input{font:inherit;min-height:34px;width:100%;min-width:0;border:1px solid #8795a9;border-radius:8px;padding:7px;background:inherit;color:inherit}.note,.status{overflow-wrap:anywhere;color:#52647c}.status.error{color:#a8243f}@media(prefers-color-scheme:dark){.card{color:#ebf1f9;background:#182233;border-color:#374457}button{color:inherit;background:#28374c;border-color:#71849c}button.primary{color:#fff;background:#365eda;border-color:#365eda}input{border-color:#71849c}.note,.status,label{color:#bbc8db}.status.error{color:#ff9fae}}';
  const card=doc.createElement('section');card.className='card';
  const head=doc.createElement('div');head.className='head';
  const toggle=doc.createElement('button');toggle.type='button';
  toggle.textContent='通过 OpenDesk 处理本地文件';
  toggle.setAttribute('aria-expanded','false');
  const detail=doc.createElement('div');detail.className='detail';detail.hidden=true;
  const caption=doc.createElement('label');caption.textContent='.txt 文件名（可选，仅作提示）';
  const filename=doc.createElement('input');filename.type='text';filename.maxLength=512;
  filename.placeholder='例如 demo.txt';
  caption.append(filename);
  const note=doc.createElement('div');note.className='note';
  note.textContent='将在可信工作区重新选择授权目录和文件，并确认共享范围。此处不会直接读取、发送或保存文件。';
  const open=doc.createElement('button');open.type='button';open.className='primary';
  open.textContent='打开可信文件工作区';
  const status=doc.createElement('div');status.className='status';status.setAttribute('role','status');
  head.append(toggle);detail.append(caption,note,open,status);card.append(head,detail);
  shadow.append(style,card);(doc.body||doc.documentElement).append(root);
  let disposed=false,pending=false;
  const active=()=>{
    if(win.location.origin!=='https://chatgpt.com')return false;
    return /^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(win.location.pathname);
  };
  const update=()=>{
    if(disposed)return;
    root.hidden=!active();open.disabled=pending||!active();
  };
  const say=(value,error=false)=>{status.textContent=value;status.classList.toggle('error',error);};
  toggle.addEventListener('click',event=>{
    if(!event.isTrusted||disposed)return;
    detail.hidden=!detail.hidden;
    toggle.setAttribute('aria-expanded',String(!detail.hidden));
    update();
  });
  open.addEventListener('click',event=>{
    if(!event.isTrusted||disposed||pending||!active())return;
    let pathHint;
    try{pathHint=normalizeChatGPTFileHint(filename.value);}
    catch(error){say(error.message,true);return;}
    pending=true;update();say('正在打开可信 Workspace…');
    Promise.resolve(api.runtime.sendMessage({
      protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint
    })).then(reply=>{
      if(disposed)return;
      if(reply?.ok!==true)throw Object.assign(new Error(reply?.error?.message||'可信入口未接线'),{
        code:reply?.error?.code||'E_FILE_HANDOFF'});
      say('已打开可信工作区。请在扩展中选择文件和授权范围；本次没有读取或共享文件。');
    }).catch(error=>{if(!disposed)say((error.code||'E_FILE_HANDOFF')+' · '+error.message,true);})
      .finally(()=>{pending=false;update();});
  });
  update();
  const poll=win.setInterval(update,900);
  const dispose=()=>{
    if(disposed)return;disposed=true;win.clearInterval(poll);root.remove();
    win.removeEventListener('pagehide',dispose);
  };
  win.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({dispose});
}

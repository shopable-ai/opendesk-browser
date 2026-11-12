import {createSession} from './model.js';

const CSS=`
:host{all:initial;color-scheme:light dark}
.mini{box-sizing:border-box;width:min(348px,calc(100vw - 24px));padding:13px;border-radius:12px;
  border:1px solid color-mix(in srgb,currentColor 13%,transparent);background:Canvas;color:CanvasText;
  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  box-shadow:0 8px 30px #0002}
.head{font-size:14px;font-weight:650;margin:0 0 10px}
textarea{box-sizing:border-box;width:100%;min-height:82px;max-height:180px;resize:vertical;padding:9px;
  border:1px solid #9997;border-radius:8px;background:Canvas;color:CanvasText;font:inherit}
button{margin-top:9px;padding:8px 13px;border:0;border-radius:7px;background:#1666cf;color:#fff;font:inherit;
  cursor:pointer}button:disabled{opacity:.48;cursor:not-allowed}
.status{margin-top:9px;color:GrayText;white-space:pre-wrap}
.answer{margin:9px 0 0;padding:9px;background:color-mix(in srgb,CanvasText 4%,Canvas);
  border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}
a{display:inline-block;margin-top:8px;color:#2173d2}
`;
export function renderMiniChat(ui,{transport=null}={}){
  ui.addStyle(CSS);
  ui.host.style.top='auto';ui.host.style.bottom='16px';
  ui.host.style.right='12px';ui.host.style.left='auto';
  const doc=ui.content.ownerDocument;
  const section=doc.createElement('section');section.className='mini';
  section.setAttribute('aria-label','Subagent Mini Chat');
  const heading=doc.createElement('h2');heading.className='head';heading.textContent='Subagent';
  const input=doc.createElement('textarea');input.maxLength=3000;
  input.placeholder='输入交给独立 ChatGPT 对话的任务';input.setAttribute('aria-label','子代理任务');
  const button=doc.createElement('button');button.type='button';button.textContent='创建任务';
  const status=doc.createElement('div');status.className='status';status.setAttribute('role','status');
  const answer=doc.createElement('div');answer.className='answer';answer.hidden=true;
  const link=doc.createElement('a');link.textContent='打开原始对话 B';link.target='_blank';
  link.rel='noopener noreferrer';link.hidden=true;
  section.append(heading,input,button,status,answer,link);ui.content.append(section);
  const session=createSession({transport,onChange:paint});
  function paint(snapshot){
    status.textContent=snapshot.message;
    button.disabled=!session.isAvailable||snapshot.status!=='idle';
    input.disabled=snapshot.status!=='idle';
    answer.hidden=snapshot.status!=='completed';answer.textContent=snapshot.answer||'';
    link.hidden=snapshot.status!=='completed'||!snapshot.conversationUrl;
    if(!link.hidden)link.href=snapshot.conversationUrl;else link.removeAttribute('href');
  }
  // Prevent a disabled button from implying a working bridge.
  paint(session.isAvailable?session.snapshot:
    {status:'unavailable',message:'可信任务桥尚未接入；此界面不会发送。'});
  ui.on(button,'click',event=>{
    if(event.isTrusted!==true||!session.isAvailable)return;
    void session.create(input.value);
  });
  ui.setInterval(()=>{
    if(['running','unknown'].includes(session.snapshot.status))return session.read();
  },1800);
  ui.onDispose(()=>session.dispose());
  return session;
}

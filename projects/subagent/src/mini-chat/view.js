import {createSession} from './model.js';

const CSS=`
:host{color-scheme:light dark;--od-bg:Canvas;--od-fg:CanvasText;--od-muted:GrayText;
  --od-line:color-mix(in srgb,CanvasText 18%,Canvas);--od-mini-bottom:max(160px,25vh)}
@supports(height:100dvh){:host{--od-mini-bottom:max(160px,25dvh)}}
.mini{box-sizing:border-box;width:min(348px,calc(100vw - 24px));
  max-height:calc(100vh - var(--od-mini-bottom) - 16px);max-height:calc(100dvh - var(--od-mini-bottom) - 16px);overflow:auto;
  overscroll-behavior:contain;padding:13px;border-radius:12px;
  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.head{font-size:14px;font-weight:650;margin:0 0 10px}
.mini .od-input{min-height:82px;max-height:180px;resize:vertical;padding:9px;
  background:var(--od-bg);color:var(--od-fg);font:inherit}
.mini .od-button{margin-top:9px;padding:8px 13px;border-radius:7px;font:inherit}
.mini .od-button:disabled{cursor:not-allowed}
.status{margin-top:9px;white-space:pre-wrap}
.mini .od-result{margin:9px 0 0;padding:9px;background:color-mix(in srgb,CanvasText 4%,Canvas);
  font:inherit;max-height:260px;overflow:auto;overscroll-behavior:contain}
a{display:inline-block;margin-top:8px;color:LinkText}
[hidden]{display:none!important}
`;
export function renderMiniChat(ui,options={}){
  const {transport=null,initialRequest}=options;
  ui.addStyle(CSS);
  // Keep the floating task form above the native composer and its inline tools.
  ui.host.style.top='auto';ui.host.style.bottom='var(--od-mini-bottom)';
  ui.host.style.right='12px';ui.host.style.left='auto';
  ui.host.style.colorScheme='light dark';
  const doc=ui.content.ownerDocument;
  const win=doc.defaultView,sourceUrl=win.location.href;
  let stale=false,composing=false;
  // UI lifecycle fence only. Real installation/document authorization belongs
  // to the trusted transport; a URL read in the page never grants that authority.
  function assertCurrent(){
    if(stale||win.location.href!==sourceUrl){stale=true;ui.destroy();return false;}
    return true;
  }
  const section=doc.createElement('section');section.className='mini od-card';
  section.setAttribute('aria-label','Subagent Mini Chat');
  const heading=doc.createElement('h2');heading.className='head';heading.textContent='Subagent';
  const input=doc.createElement('textarea');input.className='od-input';input.maxLength=3000;
  input.placeholder='输入交给独立 ChatGPT 对话的任务';input.setAttribute('aria-label','子代理任务');
  const button=doc.createElement('button');button.className='od-button od-button--primary';
  button.type='button';button.textContent='创建任务';
  const status=doc.createElement('div');status.className='status od-status';status.setAttribute('role','status');
  const answer=doc.createElement('div');answer.className='answer od-result';answer.hidden=true;
  answer.tabIndex=0;answer.setAttribute('aria-label','子代理完整回答');
  const link=doc.createElement('a');link.textContent='打开原始对话 B';link.target='_blank';
  link.rel='noopener noreferrer';link.hidden=true;
  section.append(heading,input,button,status,answer,link);ui.content.append(section);
  const session=createSession({transport,assertCurrent,onChange:paint,
    ...(Object.hasOwn(options,'initialRequest')?{initialRequest}:{})});
  function paint(snapshot){
    if(!assertCurrent())return;
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
  function create(event){
    if(event.isTrusted!==true||!assertCurrent()||!session.isAvailable)return;
    return session.create(input.value,event);
  }
  ui.on(button,'click',create);
  ui.on(input,'compositionstart',()=>{composing=true;});
  ui.on(input,'compositionend',()=>{composing=false;});
  ui.on(input,'keydown',event=>{
    if(event.key!=='Enter'||(!event.ctrlKey&&!event.metaKey)||
      event.isComposing||composing||event.keyCode===229)return;
    if(event.isTrusted!==true||!assertCurrent()||!session.isAvailable)return;
    event.preventDefault();event.stopPropagation();return session.create(input.value,event);
  });
  for(const [target,type] of [[win.navigation,'currententrychange'],[win,'popstate'],
    [win,'hashchange'],[win,'pageshow']]){
    if(typeof target?.addEventListener==='function')ui.on(target,type,assertCurrent);
  }
  ui.setInterval(()=>{
    if(!assertCurrent())return;
    if(['running','unknown'].includes(session.snapshot.status))return session.read();
  },1800);
  ui.onDispose(()=>{stale=true;session.dispose();return session.ready;});
  return session;
}

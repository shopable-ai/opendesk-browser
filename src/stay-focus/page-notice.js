// Fixed first-party notice renderer in the existing ISOLATED Page Relay.
// The only authority is a Chrome runtime message addressed by the trusted SW.
// This module cannot bill time, change permissions, or install a DNR rule.
import {FOCUS_PAGE_NOTICE_PROTOCOL} from './policy.js';

export function installFocusPageNotice({api=globalThis.chrome,doc=globalThis.document,
  win=globalThis.window,setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
  if(!api?.runtime?.onMessage||!doc||!win||win.top!==win)return ()=>{};
  let host=null,timer=null;const seen=new Set();
  const remove=()=>{
    if(timer!==null){clearTimer(timer);timer=null;}
    host?.remove();host=null;
  };
  const handler=(message,_sender,reply)=>{
    if(message?.protocol!==FOCUS_PAGE_NOTICE_PROTOCOL)return false;
    if(message.kind==='clear'){remove();seen.clear();reply?.({displayed:false});return false;}
    if(message.kind!=='threshold'||![10,5,1].includes(message.minutes)||
       typeof message.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(message.day)||
       !Number.isSafeInteger(message.revision)||message.revision<0||
       message.revision>1000000000){reply?.({displayed:false});return false;}
    const key=message.day+':'+message.revision+':'+message.minutes;
    if(seen.has(key)||doc.visibilityState==='hidden'||!doc.documentElement){
      reply?.({displayed:false});return false;
    }
    seen.add(key);remove();
    host=doc.createElement('div');
    host.setAttribute('data-opendesk-focus-notice','');
    const root=host.attachShadow({mode:'closed'});
    const style=doc.createElement('style');
    style.textContent=':host{all:initial;position:fixed;z-index:2147483646;top:20px;right:16px;pointer-events:none;display:block}'+
      '.notice{box-sizing:border-box;max-width:min(320px,calc(100vw - 32px));padding:13px 15px;'+
      'border:1px solid #d7e0ee;border-left:4px solid #4265c9;border-radius:10px;'+
      'box-shadow:0 8px 30px #182e4a33;background:#fff;color:#14253e;'+
      'font:13px/1.5 system-ui,-apple-system,sans-serif;pointer-events:auto}'+
      '.notice.urgent{border-left-color:#ba3c4b}strong{display:block;font-size:14px;margin-right:30px}'+
      'p{margin:5px 0 0}button{float:right;border:0;background:transparent;'+
      'font:20px/1 system-ui;cursor:pointer;color:#52617a;min-width:28px;min-height:28px}';
    const panel=doc.createElement('section');
    panel.className='notice'+(message.minutes===1?' urgent':'');
    panel.setAttribute('role','status');
    const close=doc.createElement('button');close.type='button';close.textContent='×';
    close.setAttribute('aria-label','关闭 Stay Focus 提醒');close.addEventListener('click',remove);
    const title=doc.createElement('strong');
    title.textContent='Stay Focus · 娱乐时间提醒';
    const body=doc.createElement('p');
    body.textContent='今天的娱乐总额度大约还剩 '+message.minutes+' 分钟。';
    panel.append(close,title,body);root.append(style,panel);
    doc.documentElement.append(host);
    timer=setTimer(remove,message.minutes===1?10000:7000);
    reply?.({displayed:true});
    return false;
  };
  api.runtime.onMessage.addListener(handler);
  return ()=>{api.runtime.onMessage.removeListener(handler);remove();seen.clear();};
}

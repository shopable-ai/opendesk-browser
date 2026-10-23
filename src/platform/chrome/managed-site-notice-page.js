// Fixed ISOLATED content-script renderer for all finite site-budget.v3 apps.
// No privileged Chrome calls, app imports, usage writes, or access to page JS.
export const MANAGED_SITE_V3_NOTICE_PROTOCOL='opendesk.browser.site-budget.notice.v3';
export function installManagedSiteNoticePage({api=globalThis.chrome,doc=globalThis.document,
  win=globalThis.window,setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
  if(!api?.runtime?.onMessage||!doc||win?.top!==win)return ()=>{};
  const seen=new Set();let host=null,timer=null;
  const remove=()=>{if(timer!==null){clearTimer(timer);timer=null;}host?.remove();host=null;};
  const onMessage=(message,_sender,reply)=>{
    if(message?.protocol!==MANAGED_SITE_V3_NOTICE_PROTOCOL)return false;
    if(message.kind!=='threshold'||typeof message.toolId!=='string'||
       !/^[a-z][a-z0-9-]{1,39}$/.test(message.toolId)||
       !/^(?:g:[a-z][a-z0-9-]{0,23}|s:[a-z0-9.-]{1,253})$/.test(message.pool)||
       !Number.isInteger(message.minutes)||message.minutes<1||message.minutes>120||
       !/^\d{4}-\d\d-\d\d$/.test(message.day)||
       !Number.isSafeInteger(message.revision)||message.revision<0){
      reply?.({displayed:false});return false;
    }
    const key=[message.toolId,message.day,message.pool,message.revision,message.minutes].join(':');
    if(seen.has(key)||doc.visibilityState==='hidden'||!doc.documentElement){
      reply?.({displayed:false});return false;
    }
    if(seen.size>=400)seen.clear();
    seen.add(key);remove();
    host=doc.createElement('div');host.setAttribute('data-opendesk-site-budget-notice','');
    const shadow=host.attachShadow({mode:'closed'});
    const style=doc.createElement('style');
    style.textContent=':host{all:initial;position:fixed;z-index:2147483646;top:20px;right:16px;pointer-events:none}'+
      'section{box-sizing:border-box;max-width:min(320px,calc(100vw - 32px));padding:13px 15px;'+
      'background:white;color:#16253c;border:1px solid #dce4f1;border-left:4px solid #4265c9;'+
      'border-radius:10px;box-shadow:0 8px 30px #182e4a33;font:13px/1.5 system-ui;pointer-events:auto}'+
      'strong{display:block;font-size:14px;margin-right:32px}p{margin:6px 0 0}'+
      'button{float:right;border:0;background:none;cursor:pointer;font:20px system-ui;'+
      'color:#52617a;min-width:28px;min-height:28px}';
    const notice=doc.createElement('section');notice.setAttribute('role','status');
    const close=doc.createElement('button');close.type='button';close.textContent='×';
    close.setAttribute('aria-label','关闭网站限时提醒');close.addEventListener('click',remove);
    const title=doc.createElement('strong');title.textContent='OpenDesk · 网站使用提醒';
    const body=doc.createElement('p');
    body.textContent='当前网站的计量额度大约还剩 '+message.minutes+' 分钟。';
    notice.append(close,title,body);shadow.append(style,notice);
    doc.documentElement.append(host);
    timer=setTimer(remove,message.minutes<=1?10000:7000);
    reply?.({displayed:true});return false;
  };
  api.runtime.onMessage.addListener(onMessage);
  return ()=>{api.runtime.onMessage.removeListener(onMessage);remove();seen.clear();};
}

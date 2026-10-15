// Fixed Side Panel DOM, never loaded from sandbox package bytes.
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PERMISSION,ADBLOCK_STORE} from './policy.js';
export function createAdblockPermissionControls({api,doc,container,notice,runOperation}){
  let toolKey='',visible=false,enabled=false,busy=false,state=null,reading=false;
  let sequence=0,generation=0,refreshPending=false,listening=false;
  const section=doc.createElement('section');
  section.className='sidebar-tool-adblock-native od-surface';
  section.setAttribute('aria-label','广告拦截 Chrome 可信控制');
  section.hidden=true;
  function row(title,accessible){
    const line=doc.createElement('div');line.className='sidebar-toc-settings-row';
    const copy=doc.createElement('div'),caption=doc.createElement('strong'),hint=doc.createElement('p');
    caption.textContent=title;hint.className='sidebar-toc-settings-hint';copy.append(caption,hint);
    const button=doc.createElement('button');button.type='button';
    button.className='od-button od-button--secondary';
    button.setAttribute('role','switch');button.setAttribute('aria-label',accessible);
    button.setAttribute('aria-checked','false');line.append(copy,button);section.append(line);
    return {button,hint};
  }
  const global=row('广告拦截','全局广告拦截');
  const site=row('当前网站','当前网站的广告过滤');
  const info=doc.createElement('p');info.className='sidebar-toc-settings-hint';
  info.setAttribute('role','status');info.setAttribute('aria-live','polite');
  section.append(info);container.append(section);
  const report=(value,problem=false)=>{
    info.textContent=value;
    if(problem)notice(value,true);
  };
  function paint(){
    const verified=Boolean(enabled&&state?.rules?.verified===true&&state.permissions?.dnr);
    const on=Boolean(verified&&state.enabled);
    global.button.textContent=!enabled?'工具已停用':!state?'状态未确认':on?'开启':'关闭';
    global.button.setAttribute('aria-checked',String(on));
    global.button.disabled=!visible||!enabled||busy||!state;
    global.hint.textContent=!enabled?'在工具设置中启用后才可操作':
      !state?'正在核对 Chrome 规则':
      !state.permissions?.dnr?'需先批准 Chrome DNR 权限':
      !state.rules?.verified?'尚未通过 Chrome 原生读回':
      on?'广告与跟踪过滤已开启':'所有 AdBlock 规则已停止';
    const host=state?.currentHost||null;
    const siteOn=Boolean(host&&on&&!state.exceptions.includes(host));
    site.button.setAttribute('aria-checked',String(siteOn));
    site.button.setAttribute('aria-label',host?'网站 '+host+' 的广告过滤':'当前网站不可用');
    site.button.textContent=!host?'不可用':siteOn?'开启':'关闭';
    site.button.disabled=!visible||!enabled||busy||!on||!host;
    site.hint.textContent=host||'仅支持当前普通 HTTP(S) 网站';
  }
  const storageChanged=(changes,area)=>{
    if(area==='local'&&Object.hasOwn(changes,ADBLOCK_STORE))void refresh();
  };
  const permissionsChanged=()=>{void refresh();};
  function listen(next){
    if(listening===next)return;
    listening=next;
    for(const [event,listener] of [[api.storage?.onChanged,storageChanged],
      [api.permissions?.onAdded,permissionsChanged],[api.permissions?.onRemoved,permissionsChanged]])
      event?.[next?'addListener':'removeListener']?.(listener);
  }
  async function refresh(){
    if(!visible||!enabled)return;
    const captured=++sequence;
    state=null;paint();
    if(busy||reading){refreshPending=true;return;}
    refreshPending=false;reading=true;
    try{
      const data=await runOperation('adblock.status',{},null);
      if(visible&&captured===sequence){state=data;report('');paint();}
    }catch(e){if(visible&&captured===sequence){state=null;report('状态读取失败：'+String(e.message||e),true);paint();}}
    finally{reading=false;if(refreshPending)void refresh();}
  }
  function finish(){
    busy=false;paint();if(refreshPending||!state)void refresh();
  }
  async function operate(op,payload,event){
    if(event?.isTrusted!==true||busy||!visible||!enabled)return;
    const captured=sequence;
    busy=true;paint();report('正在核对 Chrome 规则…');
    try{
      const data=await runOperation(op,payload,event);
      if(captured!==sequence)return;
      if(data.rules?.verified!==true||
         (op==='adblock.enable'&&data.enabled!==true)||
         (op==='adblock.disable'&&data.enabled!==false))
        throw Error('Chrome 规则回读不一致');
      state=data;
      report(data.refreshRequired?'设置已生效于新请求，请刷新当前网站。':
        data.enabled?'Chrome 已确认过滤开启':'Chrome 已确认过滤关闭');
    }catch(e){if(captured===sequence){state=null;report((e.code||'E_ADBLOCK')+'：'+String(e.message||e),true);}}
    finally{finish();}
  }
  global.button.addEventListener('click',event=>{
    if(event?.isTrusted!==true||busy||!visible||!enabled||!state)return;
    if(state.enabled){void operate('adblock.disable',{},event);return;}
    // Native Chrome permission request MUST be invoked synchronously from
    // this extension-owned real click, not an iframe event or postMessage.
    const captured=generation;
    busy=true;paint();
    let request;
    try{request=api.permissions.request({permissions:[ADBLOCK_PERMISSION]});}
    catch(e){report('Chrome 授权请求失败：'+String(e.message||e),true);finish();return;}
    void Promise.resolve(request).then(granted=>{
      if(captured!==generation){finish();return;}
      if(!granted)throw Error('未批准 Chrome DNR，不会开启过滤');
      busy=false;return operate('adblock.enable',{},event);
    }).catch(e=>{
      if(captured===generation){state=null;report(String(e.message||e),true);}
      finish();
    });
  });
  site.button.addEventListener('click',event=>{
    if(event?.isTrusted!==true||!state?.currentHost||!state?.enabled)return;
    const host=state.currentHost;
    void operate('adblock.site.set',{host,filtering:state.exceptions.includes(host)},event);
  });
  function render(tool,readOnly=false,toolEnabled=false){
    const active=!readOnly&&tool?.id===ADBLOCK_ID&&tool.capabilities?.includes(ADBLOCK_CAPABILITY);
    const nextKey=active?tool.id+'@'+tool.version:'';
    const changed=nextKey!==toolKey||enabled!==Boolean(active&&toolEnabled);
    if(changed){listen(false);sequence++;generation++;refreshPending=false;state=null;report('');}
    toolKey=nextKey;visible=Boolean(active);enabled=Boolean(active&&toolEnabled);
    listen(visible);
    section.hidden=!visible;
    container.hidden=!visible;
    if(changed){state=null;paint();if(enabled)void refresh();}
    else paint();
  }
  return {render,refresh,dispose:()=>render(null)};
}

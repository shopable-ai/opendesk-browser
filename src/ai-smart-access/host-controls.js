// An extension-owned UI: user consent and Chrome permission dialogs can only
// originate from genuine clicks here, never from opaque sandbox content.
import {AI_ID,AI_CAPABILITY} from './policy.js';
export function createAiAccessPermissionControls({api,doc,container,notice,runOperation}){
  const section=doc.createElement('section');
  section.id='ai-access-trusted-controls';
  section.className='time-review-trusted-actions';
  section.hidden=true;
  const heading=doc.createElement('strong');heading.textContent='AI 智能访问';
  const status=doc.createElement('p');status.id='ai-access-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const action=doc.createElement('button');
  action.type='button';action.id='ai-access-toggle';action.className='od-button';
  const explanation=doc.createElement('p');
  explanation.className='hint';explanation.textContent='仅 AI 网站自动代理，其他网站直连';
  const activation=doc.createElement('div');activation.id='ai-access-activation';
  activation.hidden=true;
  const codeLabel=doc.createElement('label');
  codeLabel.htmlFor='ai-access-activation-code';codeLabel.textContent='激活码';
  const code=doc.createElement('input');
  code.id='ai-access-activation-code';code.type='password';
  code.autocomplete='off';code.spellcheck=false;code.maxLength=120;
  code.className='od-field';code.placeholder='输入激活码';
  const activate=doc.createElement('button');
  activate.type='button';activate.className='od-button od-button--secondary';
  activate.textContent='激活';
  activation.append(codeLabel,code,activate);
  section.append(heading,status,action,activation,explanation);
  container.append(section);
  let activeTool=null,toolEnabled=false,busy=false,renderEpoch=0,statusEpoch=0;
  let last={state:'unavailable',reason:'等待读取 Chrome 状态'};
  function show(data){
    last=data;
    const labels={enabled:'已启用',disabled:'未启用',activation_required:'需要激活',
      conflict:'由其他扩展管理',unavailable:'不可用'};
    status.textContent=(labels[data.state]||'不可用')+
      (data.reason?' · '+data.reason:'');
    action.textContent=data.canStop||data.state==='enabled'?'停止代理':'启用代理';
    action.disabled=busy||!toolEnabled||
      !(data.canStop||data.state==='disabled');
    activation.hidden=data.state!=='activation_required'||!toolEnabled;
    code.disabled=busy||!toolEnabled;activate.disabled=busy||!toolEnabled;
  }
  const setBusy=value=>{busy=value;show(last);};
  async function refresh(){
    const seq=++statusEpoch,tool=activeTool;
    if(!tool||!toolEnabled)return;
    try{
      const state=await runOperation('aiAccess.status',{},null);
      if(seq===statusEpoch&&activeTool===tool&&toolEnabled)show(state);
    }catch(error){
      if(seq===statusEpoch&&activeTool===tool)show({
        state:'unavailable',reason:String(error?.message||error).slice(0,140)
      });
    }
  }
  action.addEventListener('click',event=>{
    if(event.isTrusted!==true||busy||!toolEnabled)return;
    const operation=last.canStop||last.state==='enabled'?'aiAccess.disable':
      last.state==='disabled'?'aiAccess.enable':null;
    if(!operation)return;
    setBusy(true);
    // Chrome explicitly excludes proxy from optional permissions. Users grant it
    // when installing/updating the extension; this trusted click independently
    // authorizes a global proxy change and the worker checks permission status.
    Promise.resolve().then(()=>runOperation(operation,{},event))
      .then(()=>refresh(),error=>notice((error?.code||'E_AI')+'：'+
        String(error?.message||error).slice(0,180),true)).finally(()=>setBusy(false));
  });
  activate.addEventListener('click',event=>{
    if(event.isTrusted!==true||busy||!toolEnabled)return;
    const value=code.value.trim();
    if(!/^[a-zA-Z0-9_-]{6,120}$/.test(value)){
      notice('请输入有效格式的激活码（6–120 位字母、数字、- 或 _）',true);return;
    }
    setBusy(true);
    Promise.resolve().then(()=>runOperation('aiAccess.activate',{code:value},event))
      .then(()=>{code.value='';return refresh();},
        error=>notice((error?.code||'E_AI_ACTIVATION')+'：'+
          String(error?.message||error).slice(0,160),true))
      .finally(()=>setBusy(false));
  });
  function render(tool,readOnly=false,enabled=false){
    const visible=!readOnly&&tool?.id===AI_ID&&tool.capabilities.includes(AI_CAPABILITY);
    if(!visible){activeTool=null;section.hidden=true;statusEpoch++;return;}
    const changed=activeTool!==tool||toolEnabled!==Boolean(enabled);
    activeTool=tool;toolEnabled=Boolean(enabled);
    section.hidden=false;
    if(changed){show({state:'unavailable',reason:'正在核对 Chrome 状态'});void refresh();}
    if(!toolEnabled)show({state:'unavailable',reason:'请先启用已安装的工具'});
  }
  return {render,refresh};
}

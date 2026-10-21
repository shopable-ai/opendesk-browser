import * as React from 'react';
import {ConversationTranscript,ConversationInput} from '../components/conversation.tsx';

// R23.11: trusted chrome only. No Provider, Host, secrets, drafts or web-page
// content is copied into this view. Native user gestures go to WorkflowView.
export function WorkflowHeader({model,actions}) {
  const forward = (action,event) => {
    if(event.nativeEvent?.isTrusted) actions?.[action]?.(event.nativeEvent);
  };
  return <>
    <span id="workflow-saved-state" className="workflow-pill"
      hidden={!model.saved} title={model.savedTitle||''}>{model.savedText||''}</span>
    <button type="button" id="workflow-history-toggle"
      className="workflow-icon-button od-icon-button" disabled={Boolean(model.busy)}
      aria-label="历史" title="历史"
      aria-expanded={Boolean(model.historyExpanded)} aria-controls="workflow-history-panel"
      onClick={event=>forward('onHistory',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
    </button>
    <button type="button" id="workflow-ai-new-session"
      className="workflow-icon-button od-icon-button" disabled={Boolean(model.busy)}
      aria-label="新对话，保留当前工作流" title={model.sessionHint||'新对话'}
      onClick={event=>forward('onNewSession',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/>
        <path d="M9 11.5h7m-3.5-3.5v7"/>
      </svg>
    </button>
    <button type="button" id="workflow-new"
      className="workflow-icon-button od-icon-button" disabled={Boolean(model.busy && !model.planning)}
      aria-label="新建工作流" title="新建工作流（检查未保存草稿）"
      onClick={event=>forward('onNewWorkflow',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </button>
  </>;
}

/** The label is presentation-only; source IDs and the API credential stay in WorkflowView. */
export function WorkflowSourceName({value=''}) {
  return value ? <span id="workflow-source-name" className="workflow-source-name"
    title={`当前模型：${value}`} aria-label={`当前模型：${value}`}>{value}</span> : null;
}

/** The only history entries are real revision records or a resumable Codex session.
 * Restoring a saved workflow still goes through WorkflowView's hash verification. */
export function WorkflowHistory({model={open:false,rows:[],canResume:false},actions}) {
  const forward=(action,event,key)=>{
    if(event.nativeEvent?.isTrusted) actions?.[action]?.(key,event.nativeEvent);
  };
  const rows=model.rows||[];
  return <section id="workflow-history-panel" className="workflow-history-panel"
    role="region" aria-label="历史" tabIndex={-1} hidden={!model.open}>
    <div className="workflow-history-section">
      <h3>历史对话</h3>
      {model.canResume
        ? <button type="button" id="workflow-history-resume"
            className="workflow-history-row" disabled={Boolean(model.busy)}
            onClick={event=>forward('onResumeHistory',event)}>
            <span className="workflow-history-row-title">上次 Codex 对话</span>
            <small>恢复模型对话，不重新执行网页操作</small>
          </button>
        : <p className="workflow-history-empty">暂无可恢复的历史对话</p>}
    </div>
    <div className="workflow-history-section">
      <h3>已保存工作流</h3>
      {rows.length ? <div className="workflow-history-list">
        {rows.map(row=><button key={row.key} type="button"
          className="workflow-history-row" disabled={Boolean(model.busy)}
          title={row.fullTitle}
          onClick={event=>forward('onOpenSavedHistory',event,row.key)}>
          <span className="workflow-history-row-title">{row.title}</span>
          <small>{row.savedText}</small>
        </button>)}
      </div> : <p className="workflow-history-empty">尚未保存工作流。完成任务后可以保存并在这里打开。</p>}
    </div>
  </section>;
}

function focusableElements(panel) {
  return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(item => item.tabIndex>=0 && item.getAttribute('aria-hidden')!=='true' &&
      !item.closest('[hidden],[inert]') && item.getClientRects().length>0);
}


// Only trusted, already-minimized UI strings cross the adapter. Never mount
// provider HTML/markdown or give a page script access to this React tree.
export function WorkflowTranscript({rows=[]}) {
  // Speaker is expressed by alignment and accessible group naming; never by a
  // repeated visible title in the already narrow Workflow transcript.
  return <ConversationTranscript rows={rows} showSpeaker={false}/>;
}

// Only the trusted Durable Result presentation is React-owned; its value comes
// exclusively from WorkflowView after the existing RunHost receipt is read.
export function WorkflowResultText({value=''}) {return <>{String(value)}</>;}

// The whole settings form is React-owned. Only focus/inert use DOM APIs.
export function WorkflowSettingsSheet({open=false,onClose,doc=globalThis.document,children}) {
  const panel=React.useRef(null);
  React.useLayoutEffect(()=>{
    if(!open||!panel.current||!doc)return;
    const currentPanel=panel.current,editor=doc.getElementById('workflow-editor');
    const restore=doc.getElementById('workflow-provider-toggle')||doc.activeElement;
    const wasInert=editor?.inert;if(editor)editor.inert=true;
    const onKeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.();return;}
      if(event.key!=='Tab')return;
      const elements=focusableElements(currentPanel),first=elements[0],last=elements.at(-1);
      if(!first){event.preventDefault();currentPanel.focus();return;}
      if(!currentPanel.contains(doc.activeElement)||(event.shiftKey&&doc.activeElement===first)){
        event.preventDefault();(event.shiftKey?last:first).focus();
      }else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
    };
    doc.addEventListener('keydown',onKeydown,true);
    (currentPanel.querySelector('[aria-pressed="true"]')||currentPanel).focus({preventScroll:true});
    return ()=>{
      doc.removeEventListener('keydown',onKeydown,true);if(editor)editor.inert=wasInert;
      if(restore?.isConnected&&(currentPanel.contains(doc.activeElement)||doc.activeElement===doc.body))
        restore.focus?.({preventScroll:true});
    };
  },[open,onClose,doc]);
  return <div className="workflow-sheet-overlay" hidden={!open}>
    <div className="workflow-sheet-backdrop" aria-hidden="true" onClick={()=>onClose?.()}/>
    <section className="workflow-sheet-panel" role="dialog" aria-modal="true"
      aria-labelledby="workflow-sheet-title" ref={panel} tabIndex={-1}>
      <div className="workflow-sheet-heading od-toolbar"><h3 id="workflow-sheet-title">AI 设置</h3>
        <IconButton label="关闭 AI 设置" onClick={()=>onClose?.()}><Glyph kind="close"/></IconButton></div>
      <div className="workflow-sheet-content">{children}</div>
    </section>
  </div>;
}

import {Button,IconButton} from '../components/ui/button.tsx';
const EMPTY_MODEL=Object.freeze({controls:{}}),EMPTY_ACTIONS=Object.freeze({});
const noSubscribe=()=>()=>{};
function Glyph({kind='edit'}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={kind==='close'?'M18 6 6 18M6 6l12 12':kind==='send'?'M12 19V5m-7 7 7-7 7 7':
      kind==='refresh'?'M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7':
      kind==='settings'?'M4 7h9m6 0h1M4 17h1m6 0h9':
      'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z'}/>
  </svg>;
}
function StepField({step,field,label,actions,options,maxLength=512,type='text',placeholder}) {
  const id=`workflow-step-${step.stepId}-${field}`;
  return <label className="workflow-field" htmlFor={id}><span>{label}</span>
    {options?<select id={id} className="od-field" data-workflow-focus={field}
      value={step[field]||options[0]?.value||''}
      onChange={event=>actions.editStep?.(step.stepId,field,event.currentTarget.value)}>
      {options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select>:<input id={id} className="od-field" type={type} maxLength={maxLength}
      data-workflow-focus={field} placeholder={placeholder}
      value={step[field]??(field==='timeout'?10000:'')}
      onChange={event=>actions.editStep?.(step.stepId,field,event.currentTarget.value)}/>}
  </label>;
}
function WorkflowStep({step,index,count,model,actions}) {
  const [open,setOpen]=React.useState(model.expandStepId===step.stepId);
  React.useEffect(()=>{if(model.expandStepId===step.stepId)setOpen(true);},[model.expandStepId,step.stepId]);
  const label=model.operations?.find(item=>item.value===step.op)?.label||step.op;
  const suffix=step.op==='fill'&&step.param?' · 参数 '+step.param:
    step.locatorKind==='role'&&step.roleName?' · '+step.roleName:step.op==='navigate'?' · 同站页面':'';
  return <details className="workflow-step od-disclosure" data-step-id={step.stepId} open={open}
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary id={`workflow-step-${step.stepId}-summary`}>{index+1}. {label}{suffix}</summary>
    <div className="workflow-step-body">
      <StepField step={step} field="op" label="动作" actions={actions} options={model.operations}/>
      {['fill','click','wait','extract','assert'].includes(step.op)&&<>
        <StepField step={step} field="locatorKind" label="定位方法" actions={actions} options={model.locators}/>
        <StepField step={step} field="selector" label="目标元素" actions={actions}/>
        {step.locatorKind==='role'&&<StepField step={step} field="roleName" label="无障碍名称（可选）" actions={actions} maxLength={200}/>}
      </>}
      {step.op==='navigate'&&<StepField step={step} field="url" label="同站目标 URL" actions={actions} maxLength={2000} placeholder={model.siteOrigin+'/'}/>}
      {step.op==='fill'&&<>
        <StepField step={step} field="param" label="参数名（有值时使用参数）" actions={actions} maxLength={40}/>
        <StepField step={step} field="text" label="固定填写值（参数名留空时生效）" actions={actions}/>
      </>}
      {['assert','confirm'].includes(step.op)&&<StepField step={step} field="text" label={step.op==='assert'?'预期包含文字':'确认事项'} actions={actions}/>}
      {step.op==='wait'&&<StepField step={step} field="timeout" label="最长等待毫秒（100–30000）" type="number" maxLength={5} actions={actions}/>}
      <div className="workflow-step-actions">
        <Button data-workflow-focus="moveUp" aria-label={`上移第${index+1}步`} disabled={index===0} onClick={()=>actions.moveStep?.(step.stepId,-1)}>↑</Button>
        <Button data-workflow-focus="moveDown" aria-label={`下移第${index+1}步`} disabled={index===count-1} onClick={()=>actions.moveStep?.(step.stepId,1)}>↓</Button>
        <Button className="od-button--danger" data-workflow-focus="remove" onClick={()=>actions.removeStep?.(step.stepId)}>删除</Button>
      </div>
    </div>
  </details>;
}

/** One trusted page, one DOM owner. The optional controller owns business state,
 * while this tree owns fields, event wiring, disclosure, focus and modal DOM. */
export function WorkflowPage({controller=null,model:providedModel=EMPTY_MODEL,actions:providedActions=EMPTY_ACTIONS,
  active=true,document:doc=globalThis.document}) {
  const fallback=React.useCallback(()=>providedModel,[providedModel]);
  const model=React.useSyncExternalStore(controller?.subscribe||noSubscribe,controller?.getSnapshot||fallback,controller?.getSnapshot||fallback);
  const actions=controller?.actions||providedActions;
  const page=React.useRef(null),lastFocus=React.useRef(null),scroller=React.useRef(null);
  const nearBottom=React.useRef(true),composing=React.useRef(false);
  const c=id=>model.controls?.[id]||{};
  const click=(id,event)=>actions.click?.(id,event.nativeEvent);
  const field=(id,value,event,eventName='input')=>actions.input?.(id,value,event.nativeEvent,eventName);
  const closeSettings=React.useCallback(()=>actions.closeSettings?.(),[actions]);
  const openSettings=Boolean(c('workflow-provider-settings').open);
  React.useLayoutEffect(()=>{
    if(!active)return;
    const node=doc?.getElementById(model.focusRequest?.id);
    if(node&&page.current?.contains(node))node.focus?.({preventScroll:true});
  },[model.focusRequest?.version,active,doc]);
  React.useLayoutEffect(()=>{
    if(active&&lastFocus.current?.isConnected)lastFocus.current.focus?.({preventScroll:true});
    return ()=>{if(active&&page.current?.contains(doc?.activeElement))lastFocus.current=doc.activeElement;};
  },[active,doc]);
  React.useEffect(()=>{
    const node=scroller.current;if(!active||!node)return;
    const onScroll=()=>{nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<=48;};
    onScroll();node.addEventListener('scroll',onScroll,{passive:true});
    return ()=>node.removeEventListener('scroll',onScroll);
  },[active]);
  React.useLayoutEffect(()=>{
    if(active&&scroller.current&&nearBottom.current&&model.messages?.length)
      scroller.current.scrollTop=scroller.current.scrollHeight;
  },[model.messages,model.phase,active]);
  const action=(id,label,{icon=false,primary=false,kind,...props}={})=>icon
      ?<IconButton id={id} label={label} title={id==='workflow-ai-plan'?'发送并执行':label}
        className={'workflow-icon-button'+(primary?' od-icon-button--primary':'')} hidden={c(id).hidden}
        disabled={Boolean(c(id).disabled)} onClick={event=>click(id,event)} {...props}><Glyph kind={kind}/></IconButton>
    :<Button id={id} variant={primary?'primary':'secondary'} hidden={c(id).hidden}
        disabled={Boolean(c(id).disabled)} onClick={event=>click(id,event)} {...props}>{label}</Button>;
  const input=(id,label,{textarea=false,select=false,options=[],eventName='input',...props}={})=><>
    <label htmlFor={id} className="od-field-label">{label}</label>
    {select?<select id={id} className="od-field" value={c(id).value||''}
      onChange={event=>field(id,event.currentTarget.value,event,'change')} {...props}>
      {options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select>:textarea?<textarea id={id} className="od-field" value={c(id).value||''}
      onChange={event=>field(id,event.currentTarget.value,event,eventName)} {...props}/>
      :<input id={id} className="od-field" value={c(id).value||''}
        onChange={event=>field(id,event.currentTarget.value,event,eventName)} {...props}/>}
  </>;
  const text=(id,props={})=><p id={id} hidden={c(id).hidden} {...props}>{c(id).text||''}</p>;
  return <div id="workbench-workflow" ref={page} role="tabpanel" aria-labelledby="tab-workflow"
    className="od-page" data-workbench-page="workflow" hidden={!active} data-opendesk-react-owner="workflow-page">
    <section id="workflow-editor" className="workflow-editor" aria-label="AI 语义工作流"
      data-view-state={c('workflow-editor').dataset?.viewState||'empty'} data-history-open={Boolean(model.history?.open)}>
      <header className="workflow-head od-toolbar od-page-head">
        <div className="workflow-head-copy"><h2 id="workflow-display-title" className="od-page-title">{c('workflow-display-title').text||'新工作流'}</h2></div>
        <div className="workflow-head-actions od-page-actions" role="group" aria-label="工作流快捷操作">
          <WorkflowHeader model={model.header||{}} actions={actions}/>
        </div>
      </header>
      <WorkflowHistory model={model.history||{open:false}} actions={actions}/>
      <section id="workflow-new-review" className="workflow-new-review od-surface" aria-label="未保存工作流" hidden={c('workflow-new-review').hidden!==false}>
        <p>当前有未保存的修改。是否放弃修改并新建工作流？</p><div className="workflow-new-review-actions">
          {action('workflow-new-cancel','继续编辑')}{action('workflow-new-discard','放弃修改并新建',{primary:true})}
        </div>
      </section>
      <div className="workflow-scroll" ref={scroller}>
        <section className="workflow-card od-surface--padded workflow-chat od-surface" aria-labelledby="workflow-ai-title">
          <div id="workflow-chat-intro" className="workflow-chat-intro" hidden={c('workflow-chat-intro').hidden}>
            <div className="workflow-chat-mark" aria-hidden="true">✦</div>
            <h3 id="workflow-ai-title">{c('workflow-ai-title').text||'创建新工作流'}</h3>
            {text('workflow-intro-description')}
            <div id="workflow-intro-suggestions" className="workflow-intro-suggestions" aria-label="示例需求">
              {(model.entryMode==='new-chat'?[['continue','继续修改填写内容'],['check','检查当前网页']]:
                [['fill','填写表单并读回'],['read','只读提取网页信息']]).map(([key,title])=>
                <button key={key} type="button" data-workflow-example={key} onClick={event=>actions.chooseExample?.(key,event.nativeEvent)}>{title}</button>)}
            </div>
          </div>
          <div id="workflow-ai-transcript" className="workflow-chat-transcript" role="log" aria-label="浏览器任务对话与执行记录" aria-live="polite" hidden={!model.messages?.length}>
            <WorkflowTranscript rows={model.messages}/>
          </div>
          {text('workflow-planning-indicator',{className:'workflow-planning-indicator',role:'status'})}
          <ol id="workflow-ai-progress" className="workflow-ai-progress" aria-label="Codex 实时规划进度" hidden={c('workflow-ai-progress').hidden}>
            {model.progress?.map((item,index)=><li key={index} data-state={item.state}>{item.text}</li>)}
          </ol>
          <section id="workflow-ai-approval" className="workflow-ai-approval od-alert od-alert--warning" aria-labelledby="workflow-ai-approval-title" hidden={c('workflow-ai-approval').hidden!==false}>
            <h3 id="workflow-ai-approval-title">{c('workflow-ai-approval-title').text||'允许本次网页任务？'}</h3>
            {text('workflow-ai-approval-scope')}<div className="workflow-actions">
              {action('workflow-ai-approve','允许本轮并继续',{primary:true})}{action('workflow-ai-deny','拒绝')}
            </div>
          </section>
        </section>
        <section id="workflow-plan-panel" className="workflow-card od-surface--padded workflow-plan od-surface" aria-label="可编辑语义步骤" hidden={c('workflow-plan-panel').hidden!==false}>
          <div className="workflow-section-header od-toolbar"><h3>执行步骤</h3><div className="workflow-step-tools">
            <span id="workflow-step-count">{model.steps?.length||0} 步</span>{action('workflow-edit-details','编辑工作流详情及高级设置',{icon:true})}
          </div></div>
          <div id="workflow-steps" className="workflow-steps" aria-label="工作流步骤列表">
            {model.steps?.map((step,index)=><WorkflowStep key={step.stepId} step={step} index={index} count={model.steps.length} model={model} actions={actions}/>)}
          </div>
          {action('workflow-add-step','＋ 添加步骤')}
          {text('workflow-target-warning',{className:'workflow-target-warning od-alert od-alert--warning',role:'status'})}
        </section>
        <section id="workflow-params-panel" className="workflow-card od-surface--padded workflow-run-settings od-surface" aria-label="工作流运行参数" hidden={c('workflow-params-panel').hidden!==false}>
          <div className="workflow-section-header od-toolbar"><h3>运行前确认</h3><span>只影响本次运行</span></div>
          <div id="workflow-params">{model.params?.map(({name,rule,required,value})=><div key={name} className="workflow-param-row">
            <label className="workflow-field"><span>{rule.title}{required?' *':''}</span>
              {rule.enum?<select className="od-field" data-workflow-param={name} value={String(value)} onChange={event=>actions.setParam?.(name,event.currentTarget.value)}>
                {rule.enum.map(choice=><option key={String(choice)} value={String(choice)}>{String(choice)}</option>)}</select>:
                <input className={rule.type==='boolean'?undefined:'od-field'} data-workflow-param={name}
                  type={rule.type==='boolean'?'checkbox':['number','integer'].includes(rule.type)?'number':'text'}
                  step={rule.type==='integer'?'1':rule.type==='number'?'any':undefined}
                  {...(rule.type==='boolean'?{checked:Boolean(value)}:{value:String(value)})}
                  onChange={event=>actions.setParam?.(name,rule.type==='boolean'?event.currentTarget.checked:event.currentTarget.value)}/>}
            </label><Button className="od-button--danger" aria-label={'移除参数 '+name} onClick={()=>actions.removeParam?.(name)}>移除</Button>
          </div>)}</div>
          <label className="workflow-consent" id="workflow-run-consent" hidden={c('workflow-run-consent').hidden}>
            <input type="checkbox" id="workflow-confirm-run" checked={Boolean(c('workflow-confirm-run').checked)} onChange={event=>field('workflow-confirm-run',event.currentTarget.checked,event)}/>
            我已检查本次填写和点击操作，允许运行
          </label>
        </section>
        <section id="workflow-result-panel" className="workflow-card od-surface--padded workflow-result od-surface" aria-label="工作流运行结果" hidden={c('workflow-result-panel').hidden!==false}>
          <div className="workflow-section-header od-toolbar"><h3>运行结果</h3></div>
          <pre id="workflow-output" aria-label="本次持久运行结果">{c('workflow-output').text||'尚未运行'}</pre>
          <details id="workflow-result-raw" className="od-disclosure od-disclosure--flat" hidden={c('workflow-result-raw').hidden!==false} key={c('workflow-technical').text}>
            <summary>查看完整原值（可能包含敏感信息）</summary><pre id="workflow-raw">{c('workflow-raw').text}</pre>
          </details>
          <details className="workflow-advanced od-disclosure od-disclosure--flat"><summary>Run / Result / Revision 技术身份</summary><pre id="workflow-technical">{c('workflow-technical').text}</pre></details>
        </section>
        <section id="workflow-manage-panel" className="workflow-management od-surface" aria-label="工作流编辑与高级管理" hidden={c('workflow-manage-panel').hidden!==false}>
          <div className="workflow-section-header od-toolbar"><h3>工作流编辑</h3>{action('workflow-manage-close','收起版本与设置',{icon:true,kind:'close'})}</div>
          <div className="workflow-card od-surface--padded workflow-library od-surface">
            {input('workflow-saved-list','选择版本',{select:true,options:[{value:'',label:'选择已保存版本…'},...(model.savedOptions||[])]})}
            <div className="workflow-actions">{action('workflow-load','打开版本')}{action('workflow-refresh','刷新已保存版本',{icon:true,kind:'refresh'})}</div>
            {action('workflow-ai-resume','恢复上次对话')}
          </div>
          <details className="workflow-manage-details od-disclosure"><summary>名称与网站</summary>
            {input('workflow-title','名称',{maxLength:100,autoComplete:'off',placeholder:'例如：填写表单并读取结果'})}
            {input('workflow-description','用途（可选）',{textarea:true,rows:2,maxLength:800})}
            {input('workflow-site','执行网站（精确 origin）',{readOnly:true,'aria-describedby':'workflow-site-note'})}
            {text('workflow-site-note',{className:'hint'})}
          </details>
          <details className="workflow-manage-details od-disclosure"><summary>参数定义</summary>
            <div className="workflow-param-create"><input id="workflow-new-param-name" className="od-field" aria-label="新参数英文名称" maxLength={40} value={c('workflow-new-param-name').value||''}
              onChange={event=>field('workflow-new-param-name',event.currentTarget.value,event)} placeholder="参数名称，例如 keyword"/>{action('workflow-add-param','＋ 添加文本参数')}</div>
            <details className="workflow-advanced od-disclosure od-disclosure--flat"><summary>高级参数 Schema</summary>
              {input('workflow-schema','参数 Schema（string / number / integer / boolean）',{textarea:true,rows:6,spellCheck:false,eventName:'change'})}
            </details>
          </details>
          <details className="workflow-manage-details od-disclosure"><summary>代码与 Task 候选</summary>
            <details className="workflow-advanced od-disclosure od-disclosure--flat"><summary>JavaScript 与源码哈希</summary>
              {text('workflow-code-hash',{className:'hint'})}<pre id="workflow-code" aria-label="工作流生成的 JavaScript">{c('workflow-code').text}</pre>
              {action('workflow-open-code','复制到「开发」独立编辑')}
            </details>
            {action('workflow-candidate','提交为待验证 Task 候选')}
            <p className="workflow-minor-note">保存版本不等于安装。只有通过真实验证、设为 Available 并明确安装的版本才会出现在「我的」。</p>
          </details>
        </section>
      </div>
      <div className="workflow-composer">
        <label className="visually-hidden" htmlFor="workflow-ai-request">描述任务，或告诉 AI 怎样修改步骤</label>
        <ConversationInput id="workflow-ai-request" rows={2} maxLength={4000} placeholder="描述要自动完成的任务…" value={c('workflow-ai-request').value||''}
          onChange={event=>field('workflow-ai-request',event.currentTarget.value,event)}
          onCompositionStart={()=>{composing.current=true;}}
          onCompositionEnd={()=>{composing.current=false;}}
          onKeyDown={event=>{
            if(event.key!=='Enter'||event.shiftKey||composing.current||
              event.nativeEvent?.isComposing||event.nativeEvent?.keyCode===229)return;
            event.preventDefault();
            if(!c('workflow-ai-plan').hidden&&!c('workflow-ai-plan').disabled)
              click('workflow-ai-plan',event);
          }}/> 
        <div className="workflow-composer-actions">
          {action('workflow-provider-toggle','AI 设置',{icon:true,kind:'settings','aria-expanded':openSettings,'aria-controls':'workflow-provider-settings'})}
          <WorkflowSourceName value={model.sourceName||'Codex'}/>
        {action('workflow-ai-plan','发送并执行浏览器任务',{icon:true,primary:true,kind:'send'})}
          {action('workflow-ai-cancel','停止 AI 规划')}
        </div>
      </div>
      <div id="workflow-page-actions" className="workflow-actions od-toolbar" hidden={!model.hasSteps&&model.phase!=='running'}>
        {action('workflow-run','运行工作流',{primary:true})}{action('workflow-save','保存版本')}{action('workflow-stop','停止')}
      </div>
      {text('workflow-status',{className:'workflow-status',role:'status','aria-live':'polite','data-state':c('workflow-status').dataset?.state})}
    </section>
    <WorkflowSettingsSheet open={active&&openSettings} onClose={closeSettings} doc={doc}>
      <details id="workflow-provider-settings" className="workflow-provider od-disclosure od-disclosure--flat" open>
        <summary>AI 设置</summary>
        <div className="workflow-source-switch" role="group" aria-label="AI 来源">
          {action('workflow-source-local','Codex',{'aria-pressed':c('workflow-ai-provider').value==='local_codex'})}
          {action('workflow-source-https','HTTPS',{'aria-pressed':['custom_https','cloud_responses'].includes(c('workflow-ai-provider').value)})}
        </div>
        <div id="workflow-https-mode" className="workflow-https-mode" hidden={c('workflow-https-mode').hidden!==false}>
          {input('workflow-https-protocol','HTTPS 协议',{select:true,options:[{value:'custom_https',label:'Chat Completions'},{value:'cloud_responses',label:'Responses'}]})}
        </div>
        <div id="workflow-local-settings" hidden={c('workflow-local-settings').hidden}>
          <div className="workflow-connection-line" role="group" aria-label="OpenDesk 本机连接">
            <div className="workflow-connection-copy"><span className="workflow-connection-title">OpenDesk</span>
              {text('workflow-local-status',{className:'workflow-local-status',role:'status','aria-live':'polite',title:c('workflow-local-status').title,'data-state':c('workflow-local-status').dataset?.state})}</div>
            {action('workflow-local-connect','连接',{'aria-label':'连接本机 OpenDesk'})}
            <span id="workflow-local-connected" className="workflow-connection-connected" hidden={c('workflow-local-connected').hidden!==false}>已连接</span>
          </div>
          <details id="workflow-local-diagnostics" className="workflow-provider-diagnostics od-disclosure od-disclosure--flat"><summary>连接诊断</summary>
            {text('workflow-local-status-detail',{className:'workflow-minor-note'})}
            <div className="workflow-actions">{action('workflow-local-refresh','重新检查')}{action('workflow-local-help','连接设置 ↗')}</div>
          </details>
        </div>
        <div id="workflow-custom-settings" hidden={c('workflow-custom-settings').hidden!==false}>
          {input('workflow-ai-endpoint','接口地址',{type:'url',spellCheck:false,title:c('workflow-ai-endpoint').title})}
          {input('workflow-ai-model','模型 ID',{spellCheck:false,placeholder:'输入模型 ID'})}
          {input('workflow-ai-key','API Key（本次使用，不保存）',{type:'password',autoComplete:'off',spellCheck:false,placeholder:'输入 API Key'})}
        </div>
        <details id="workflow-provider-privacy" className="workflow-provider-info od-disclosure od-disclosure--flat"><summary>数据与隐私</summary>
          {text('workflow-provider-scope',{className:'workflow-minor-note'})}{text('workflow-observation-scope',{className:'workflow-minor-note',role:'status'})}
          {action('workflow-observation-revoke','撤销网页摘要授权')}
        </details>
      </details>
    </WorkflowSettingsSheet>
  </div>;
}

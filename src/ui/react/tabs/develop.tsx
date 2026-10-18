import * as React from 'react';

// Script Editor is the sole source of page identity. React renders only
// trusted indicators, without touching source/draft/compile/Run/Stop state.
export function DeveloperTargetText({value='',node,title,state}){
  React.useLayoutEffect(()=>{
    if(title!==undefined){
      if(title)node.title=title;else node.removeAttribute('title');
    }
    if(state!==undefined)node.dataset.state=state;
  },[node,title,state]);
  return value;
}

// React owns only the trusted buttons. Script Editor owns draft, RunHost,
// permissions and Stop receipts. Pass the original native click, not a
// programmatically fabricated event, to the existing controller.
export function DeveloperActions({model}){
  return <>
    <button type="button" id="script-run" className="od-button"
      disabled={Boolean(model.runDisabled)}
      onClick={event=>model.onRun?.(event.nativeEvent)}>{model.runLabel}</button>
    <button type="button" id="script-save" className="od-button od-button--secondary"
      disabled={Boolean(model.saveDisabled)} hidden={Boolean(model.saveHidden)}
      title={model.saveTitle||undefined}
      onClick={event=>model.onSave?.(event.nativeEvent)}>{model.saveLabel}</button>
    <button type="button" id="script-stop" className="od-button od-button--secondary"
      disabled={Boolean(model.stopDisabled)} hidden={Boolean(model.stopHidden)}
      onClick={event=>model.onStop?.(event.nativeEvent)}>{model.stopLabel}</button>
  </>;
}

// A controlled code-type picker. Framework/source preparation and edition
// checks remain in Script Editor; this component has no compiler or Host API.
export function DeveloperFramework({model}){
  // Chrome/React radio value tracking can suppress a later change event
  // after a controlled re-render. The trusted native click is the primary
  // activation; change also covers keyboard selection without double action.
  const select=(kind,event)=>{
    if(model.mode===kind||event.nativeEvent?.isTrusted!==true)return;
    model.onSelect?.(kind,event.nativeEvent);
  };
  return <>
    {[
      ['javascript','JavaScript','JavaScript'],
      ['react','React · JSX','React JSX'],
      ['vue','Vue · SFC','Vue SFC']
    ].map(([kind,title,label])=>
      <label key={kind} htmlFor={'page-component-'+kind} title={title}>
        <input id={'page-component-'+kind} type="radio" name="page-component-choice"
          value={kind} aria-label={label} checked={model.mode===kind}
          disabled={Boolean(model.disabled)||(!model.compilerEnabled&&kind!=='javascript')}
          onClick={event=>select(kind,event)}
          onChange={event=>select(kind,event)}/>
        <span>{kind==='javascript'?'JavaScript':kind==='react'?'React':'Vue'}</span>
      </label>)}
  </>;
}

 
// Only the trusted status text is React-owned. The actual execution, result
// projection and authorization still come from the original Script Editor.
export function DeveloperRunStatus({model,node}){
  React.useLayoutEffect(()=>{node.dataset.state=model.state;},[node,model.state]);
  return model.text;
}

// Script Editor retains the authorized result projection; this text-only
// React view never parses output as HTML or requests new Host capabilities.
export function DeveloperResultText({value=''}){
  return value;
}

 // React owns the editable element; Program Source owns the executable bytes.
 // An uncontrolled textarea preserves native IME, selection and undo between
 // renders. Only a deliberate external source replacement advances revision.
 export function DeveloperSourceEditor({model}){
   return <textarea key={model.revision} id="script-source" rows={6} wrap="off"
     aria-label="JavaScript、React JSX 或 Vue SFC 源码编辑器"
     spellCheck={false} autoCapitalize="off" className="od-field"
     defaultValue={model.source} readOnly={Boolean(model.readOnly)}
     hidden={Boolean(model.hidden)}
     onInput={event=>model.onInput?.(event.nativeEvent)}/>;
 }
 export function DeveloperJavascriptWorld({model}){
   return <>
     <label htmlFor="script-javascript-world" className="od-field-label">运行环境</label>
     <select id="script-javascript-world" className="od-field" aria-label="JavaScript 执行环境"
       value={model.value} disabled={Boolean(model.disabled)}
       onChange={event=>model.onSelect?.(event.target.value,event.nativeEvent)}>
       <option value="controller">Controller · 自动化 API</option>
       <option value="page">Page · 当前网页 DOM</option>
     </select>
   </>;
 }

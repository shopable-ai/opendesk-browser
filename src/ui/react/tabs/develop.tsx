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
      disabled={Boolean(model.stopDisabled)}
      onClick={event=>model.onStop?.(event.nativeEvent)}>{model.stopLabel}</button>
  </>;
}

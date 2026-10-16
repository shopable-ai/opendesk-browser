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

import * as React from 'react';

// Only focus/scroll effects touch real nodes. All visible state is rendered here.
export function useSettingsEffect(model){
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    if(!model?.visible||!model.effect)return;
    const {target,kind}=model.effect;
    const node=ref.current?.querySelector('[id="'+target+'"]');
    if(kind==='focus')node?.focus({preventScroll:true});
    else node?.scrollIntoView?.({block:'nearest'});
  },[model?.effect]);
  return ref;
}

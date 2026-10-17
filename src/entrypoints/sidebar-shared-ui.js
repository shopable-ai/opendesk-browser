import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {Card,CardContent} from '../ui/react/components/ui/card.tsx';
import {Switch} from '../ui/react/components/ui/switch.tsx';
import tokensCSS from '../ui/design-tokens.css?raw';
import componentCSS from '../ui/react/components/ui/sidebar-shared.css?raw';

// Fixed extension entry for opt-in sandbox, not installed user-code or host root.
export default defineUnlistedScript(()=>{
  if(globalThis.OpenDeskPageReact?.version!=='19.2.0')
    throw Error('E_TOOL_SHARED_REACT_VERSION');
  if(Object.hasOwn(globalThis,'OpenDeskSidebarUI'))
    throw Error('E_TOOL_SHARED_UI_COLLISION');
  const style=document.createElement('style');
  style.dataset.opendeskSharedUi='v1';
  style.textContent=tokensCSS+'\n'+componentCSS;
  document.head.append(style);
  Object.defineProperty(globalThis,'OpenDeskSidebarUI',{
    value:Object.freeze({Card,CardContent,Switch}),
    enumerable:false,configurable:false,writable:false
  });
});

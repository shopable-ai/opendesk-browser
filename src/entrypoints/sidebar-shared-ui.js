import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {Button,IconButton} from '../ui/react/components/ui/button.tsx';
import {Card,CardContent} from '../ui/react/components/ui/card.tsx';
import {Switch} from '../ui/react/components/ui/switch.tsx';
import tokensCSS from '../ui/design-tokens.css?raw';
import designSystemCSS from '../ui/design-system.css?raw';
import componentCSS from '../ui/react/components/ui/sidebar-shared.css?raw';

// Fixed extension entry for opt-in sandbox, not installed user-code or host root.
export default defineUnlistedScript(()=>{
  if(globalThis.OpenDeskPageReact?.version!=='19.2.0')
    throw Error('E_TOOL_SHARED_REACT_VERSION');
  if(Object.hasOwn(globalThis,'OpenDeskSidebarUI'))
    throw Error('E_TOOL_SHARED_UI_COLLISION');
  // Publish official Button/IconButton styles without defining a second palette.
  // Only the canonical button rules travel with the fixed sandbox resource.
  const buttonStart=designSystemCSS.indexOf('.od-button{');
  const buttonEnd=designSystemCSS.indexOf(':is(input,select,textarea).od-field{');
  if(buttonStart<0||buttonEnd<=buttonStart||
    !designSystemCSS.slice(buttonStart,buttonEnd).includes('.od-icon-button{'))
    throw Error('E_TOOL_SHARED_UI_CSS_DRIFT');
  const buttonCSS=designSystemCSS.slice(buttonStart,buttonEnd);
  const style=document.createElement('style');
  style.dataset.opendeskSharedUi='v1';
  style.textContent=tokensCSS+'\n'+componentCSS+'\n'+buttonCSS;
  document.head.append(style);
  Object.defineProperty(globalThis,'OpenDeskSidebarUI',{
    value:Object.freeze({Button,IconButton,Card,CardContent,Switch}),
    enumerable:false,configurable:false,writable:false
  });
});

import * as React from 'react';
import {createRoot} from 'react-dom/client';
import CookieEditorApp from '../CookieEditorApp.jsx';
import '../../src/react.css';

// The installed tool creates exactly ONE root inside its own Sandbox.
// It never mounts into the browser's privileged React application root.
const bridge=globalThis.OpenDeskTool;
const target=bridge?.root?.querySelector('#cookie-react-root');
if(!target||typeof bridge?.request!=='function')
  throw Error('E_COOKIE_REACT_SANDBOX_NOT_READY');
const root=createRoot(target);
root.render(<CookieEditorApp request={bridge.request} hostRoot={bridge.root}
  setState={bridge.setState}/>);
let released=false;
function release(){
  if(released)return;
  released=true;
  root.unmount();
}
globalThis.addEventListener('pagehide',release,{once:true});

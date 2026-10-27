import * as React from 'react';
import {createRoot} from 'react-dom/client';
import VipApp from './App.jsx';
import './style.css';
import './main.js';

const mount=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!mount)throw Error('E_AI_VIP_REACT_ROOT');
const root=createRoot(mount);
root.render(<VipApp/>);

let released=false;
const release=()=>{
  if(released)return;
  released=true;
  root.unmount();
};
globalThis.addEventListener('pagehide',release,{once:true});

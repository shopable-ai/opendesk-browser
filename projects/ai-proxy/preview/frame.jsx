import * as React from 'react';
import {createRoot} from 'react-dom/client';
import AIProxySurface from '../trusted/Surface.jsx';
import {configureEnvironment} from '../src/environment';
import {createPreviewBoundary} from './sdk-preview.js';

const {scenario='success',view='quick'}=JSON.parse(document.getElementById('ai-proxy-preview-config').textContent);
const environment=configureEnvironment({locale:'zh-CN',setState:state=>{
  parent.postMessage({type:'ai-proxy-preview-state',dirty:state.dirty===true,busy:state.busy===true},'*');
}},null,{trusted:true,preview:createPreviewBoundary(scenario)});
if(view==='settings')environment.navigation.navigate('#/profiles',{force:true});
const root=createRoot(document.getElementById('ai-proxy-app'));
root.render(<AIProxySurface/>);
if(view==='add'){
  const observer=new MutationObserver(()=>{
    const button=document.querySelector('.r86IconFirst');
    if(button){observer.disconnect();button.click();}
  });
  observer.observe(document.getElementById('ai-proxy-app'),{childList:true,subtree:true});
}
addEventListener('pagehide',()=>{root.unmount();environment.dispose();},{once:true});

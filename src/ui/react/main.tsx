import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ExtensionRows} from './tabs/tools.tsx';

// Reuse ui/tool-shell.js: no second WXT entry, page, router, or Host.
// In R33.3 only the list is React-owned; other surfaces remain legacy-owned.
export function mountExtensionList(doc){
  const container=doc.getElementById('extension-center-list');
  if(!container||container.dataset.opendeskReactOwner)
    throw new Error('E_REACT_LIST_MOUNT');
  if(container.childElementCount)throw new Error('E_REACT_LIST_NOT_EMPTY');
  container.dataset.opendeskReactOwner='extension-list';
  const root=createRoot(container);
  let disposed=false,menuKey=null,model=null;
  function paint(){
    if(disposed||!model)return;
    // Legacy focus restoration and trusted menu placement run immediately
    // after draw(), so commit this small list before those synchronous effects.
    flushSync(()=>root.render(<ExtensionRows {...model} menuKey={menuKey}/>));
  }
  return Object.freeze({
    owner:'extension-list',
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    dispose(){if(disposed)return;disposed=true;root.unmount();
      delete container.dataset.opendeskReactOwner;}
  });
}

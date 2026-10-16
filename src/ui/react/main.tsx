import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ExtensionRows,ExtensionDetail} from './tabs/tools.tsx';

// Reuse ui/tool-shell.js: no second WXT entry, page, router, or Host.
// The installed extension list and its detail body have disjoint React roots.
// Toolbar, back button, installer and other tabs remain legacy-owned.
export function mountExtensionList(doc){
  const container=doc.getElementById('extension-center-list');
  if(!container||container.dataset.opendeskReactOwner)
    throw new Error('E_REACT_LIST_MOUNT');
  if(container.childElementCount)throw new Error('E_REACT_LIST_NOT_EMPTY');
  container.dataset.opendeskReactOwner='extension-list';
  const detailContainer=doc.getElementById('extension-center-detail-body');
  if(!detailContainer||detailContainer.dataset.opendeskReactOwner||detailContainer.childElementCount)
    throw new Error('E_REACT_DETAIL_MOUNT');
  detailContainer.dataset.opendeskReactOwner='extension-detail';
  const root=createRoot(container);
  const detailRoot=createRoot(detailContainer);
  let disposed=false,menuKey=null,model=null,detailModel=null;
  function paint(){
    if(disposed||!model)return;
    // Legacy focus restoration and trusted menu placement run immediately
    // after draw(), so commit this small list before those synchronous effects.
    flushSync(()=>root.render(<ExtensionRows {...model} menuKey={menuKey}/>));
  }
  function paintDetail(){
    if(disposed||!detailModel)return;
    flushSync(()=>detailRoot.render(<ExtensionDetail model={detailModel} container={detailContainer}/>));
  }
  return Object.freeze({
    owner:'extension-list',
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    renderDetail(next){if(disposed)return;detailModel=next;paintDetail();},
    dispose(){if(disposed)return;disposed=true;detailRoot.unmount();root.unmount();
      delete detailContainer.dataset.opendeskReactOwner;
      delete container.dataset.opendeskReactOwner;}
  });
}

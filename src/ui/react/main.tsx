import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {flushSync} from 'react-dom';
import {ExtensionRows,ExtensionDetail,ExtensionToolbar} from './tabs/tools.tsx';

// One trusted React root and three portals in the existing fixed Side Panel.
// Portals preserve the installed DOM IDs, CSS and Host wiring; they never run
// user tool packages, which stay in their opaque-origin sandbox iframe.
export function mountExtensionList(doc){
  const container=doc.getElementById('extension-center-list');
  const detailContainer=doc.getElementById('extension-center-detail-body');
  const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
  const section=doc.getElementById('extension-center');
  if(!container||!detailContainer||!toolbar||!section||
    container.dataset.opendeskReactOwner||detailContainer.dataset.opendeskReactOwner||
    toolbar.dataset.opendeskReactOwner)
    throw new Error('E_REACT_EXTENSION_MOUNT');
  if(container.childElementCount||detailContainer.childElementCount)
    throw new Error('E_REACT_EXTENSION_NOT_EMPTY');

  // The toolbar's static HTML remains the non-React fallback for legacy test
  // harnesses. In the real shell it is replaced ONCE, before legacy handlers
  // are registered, and React exclusively owns its children thereafter.
  const host=doc.createElement('div');
  host.id='extension-center-react-root';
  host.hidden=true;
  section.append(host);
  toolbar.replaceChildren();
  container.dataset.opendeskReactOwner='extension-list';
  detailContainer.dataset.opendeskReactOwner='extension-detail';
  toolbar.dataset.opendeskReactOwner='extension-toolbar';
  const root=createRoot(host);
  let disposed=false,menuKey=null,detailModel=null;
  let model={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}};
  let toolbarModel={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
  function paint(){
    if(disposed)return;
    // Extension Center restores focus immediately after draw(). Commit the
    // single React tree and all portals synchronously before that readback.
    flushSync(()=>root.render(<>
      {createPortal(<ExtensionToolbar model={toolbarModel}/>,toolbar)}
      {createPortal(<ExtensionRows {...model} menuKey={menuKey}/>,container)}
      {createPortal(<ExtensionDetail model={detailModel} container={detailContainer}/>,detailContainer)}
    </>));
  }
  paint();
  return Object.freeze({
    owner:'extension-list',
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    renderDetail(next){if(disposed)return;detailModel=next;paint();},
    renderToolbar(next){if(disposed)return;toolbarModel=next;paint();},
    dispose(){if(disposed)return;disposed=true;root.unmount();
      delete toolbar.dataset.opendeskReactOwner;
      delete detailContainer.dataset.opendeskReactOwner;
      delete container.dataset.opendeskReactOwner;
      host.remove();}
  });
}

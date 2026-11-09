// The existing Extension Center is a Side Panel-only React projection.
// app.html renders only the shared ToolHost, so it must not claim absent
// Extension Center DOM nodes. There is still one React root and one Host.
const EXTENSION_CENTER_OWNERS=Object.freeze([
  ['extension-center','extension-center'],
  ['extension-center-list','extension-list'],
  ['extension-center-detail-body','extension-detail'],
  ['extension-center-cleanups','extension-cleanups'],
  ['extension-center-empty','extension-empty'],
  ['extension-center-count','extension-count'],
  ['extension-center-status','extension-status']
]);

export function claimExtensionCenterNodes(doc,surface){
  if(surface==='app')return [];
  if(surface!=='sidebar')throw new Error('E_REACT_SURFACE');
  const claims=[];
  try{
    for(const [id,owner] of EXTENSION_CENTER_OWNERS){
      const node=doc.getElementById(id);
      if(!node)throw new Error('E_REACT_EXTENSION_MOUNT');
      node.dataset.opendeskReactOwner=owner;claims.push([node,owner]);
    }
    const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
    if(toolbar){
      toolbar.dataset.opendeskReactOwner='extension-toolbar';
      claims.push([toolbar,'extension-toolbar']);
    }
    return claims;
  }catch(error){
    // Never leave half-claimed nodes if the legacy Side Panel contract breaks.
    for(const [node,owner] of claims)
      if(node.dataset.opendeskReactOwner===owner)delete node.dataset.opendeskReactOwner;
    throw error;
  }
}

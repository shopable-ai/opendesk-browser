// Display context only. This never grants capability, installation or Authority.
// A locator in a legacy sidepanel.html tab used to mean PC presentation, but
// the same URL can also occur in a genuine native Side Panel.
import {APP_DOCUMENT_PATHNAME,SIDEPANEL_DOCUMENT_PATHNAME} from '../tool-document-url.js';

export function initialToolSurface(pathname,hasLocator=false){
  if(pathname===APP_DOCUMENT_PATHNAME)return 'page';
  if(pathname===SIDEPANEL_DOCUMENT_PATHNAME)return hasLocator?'page':'sidebar';
  return 'page'; // Unexpected extension documents fail closed for PC-only controls.
}
export function verifiedToolSurface(pathname,hasLocator=false,nativeSidePanel=false){
  if(pathname===APP_DOCUMENT_PATHNAME)return 'page';
  if(pathname===SIDEPANEL_DOCUMENT_PATHNAME&&nativeSidePanel===true)return 'sidebar';
  return initialToolSurface(pathname,hasLocator);
}

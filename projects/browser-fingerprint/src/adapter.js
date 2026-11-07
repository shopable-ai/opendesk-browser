// Only a reviewed SDK request can read the target tab.
// Never replace this with the Sidebar iframe's navigator/window/screen.
export function createAdapter(bridge){
  if(typeof bridge?.request!=='function')throw Error('E_FINGERPRINT_SDK_UNAVAILABLE');
  return Object.freeze({
    context:()=>bridge.request('browser.page.getContext',{}),
    environment:context=>bridge.request('browser.page.readEnvironment',{tabRef:context.tabRef,documentRef:context.documentRef}),
    environmentStatus:url=>bridge.request('browser.capabilities.getStatus',{operation:'browser.page.readEnvironment',url}),
    request:(name,args)=>bridge.request(name,args)
  });
}

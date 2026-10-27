// Only a reviewed SDK request can read the target tab.
// Never replace this with the Sidebar iframe's navigator/window/screen.
export function createAdapter(bridge){
  if(typeof bridge?.request!=='function')throw Error('E_FINGERPRINT_SDK_UNAVAILABLE');
  return Object.freeze({
    context:()=>bridge.request('browser.page.getContext',{}),
    request:(name,args)=>bridge.request(name,args)
  });
}

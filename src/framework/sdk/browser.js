// One ergonomic public namespace; methods forward through the existing tool
// request boundary. The website Page SDK exposes only LOCAL status discovery.
import {BROWSER_OPERATIONS,browserCapabilityList,deniedBrowserStatus,normalizeBrowserOperation} from './browser-contract.js';
import {fail,fields} from './registry.js';
// Build the finite public method tree from the one approved operation Registry.
// The tool supplies only parameters, never native API paths or permissions.
function declaredFacade(ask){
  const root=Object.create(null);
  for(const operation of Object.keys(BROWSER_OPERATIONS)){
    if(!operation.startsWith('browser.'))throw fail('E_CONTRACT','Invalid Browser operation');
    const path=operation.slice('browser.'.length).split('.');
    if(path.some(part=>!/^[A-Za-z][A-Za-z0-9]*$/.test(part)||
      ['constructor','prototype','__proto__'].includes(part)))
      throw fail('E_CONTRACT','Unsafe public Browser operation');
    let node=root;
    for(const segment of path.slice(0,-1)){
      if(!Object.hasOwn(node,segment))node[segment]=Object.create(null);
      if(typeof node[segment]!=='object')throw fail('E_CONTRACT','Namespace conflict');
      node=node[segment];
    }
    const method=path.at(-1);
    if(Object.hasOwn(node,method))throw fail('E_CONTRACT','Duplicate Browser method');
    node[method]=(input={})=>ask(operation,input??{});
  }
  return root;
}
function freezeFacade(node){
  for(const value of Object.values(node))if(value&&typeof value==='object')freezeFacade(value);
  return Object.freeze(node);
}
export function createBrowserSdk({request,context='sidebar-tool'}={}){
  const page=context==='page-sdk';
  const ask=(name,args={})=>{
    normalizeBrowserOperation(name,args);
    if(page||typeof request!=='function')return Promise.reject(fail('E_CONTEXT','This browser operation needs an installed tool'));
    return request(name,args);
  };
  const capabilities=Object.freeze({
    list:()=>page?Promise.resolve(browserCapabilityList('page-sdk')):ask('browser.capabilities.list'),
    getStatus:input=>{
      const args=input??{};
      normalizeBrowserOperation('browser.capabilities.getStatus',args);
      return page?Promise.resolve(deniedBrowserStatus(args.operation)):
        ask('browser.capabilities.getStatus',args);
    }
  });
  if(page)return Object.freeze({apiVersion:'1.0.0',capabilities,
    // Explicit denial does not add any browser method to the admitted Page RPC list.
    contextMenu:Object.freeze({register:()=>Promise.reject(fail('E_CONTEXT','Page SDK cannot register context menus'))})});
  const facade=declaredFacade(ask);
  // Public developer convenience, not a second RPC operation or a new grant.
  // A watch remains an opaque, tool-owned session: each handle method uses the
  // SAME canonical browser.* operation and trusted Host authority as the
  // explicit network.observe.start / events.read / operations.cancel methods.
  const watch=async args=>{
    fields(args,['tabRef','origin','durationMs','maxEvents','maxBufferedBytes'],['tabRef','origin']);
    const {origin,...options}=args;
    const started=await ask('browser.network.observe.start',{...options,origins:[origin]});
    if(typeof started?.observationId!=='string'||
       !/^[A-Za-z0-9_-]{16,160}$/.test(started.observationId)||
       started.operationId!==started.observationId||
       !Number.isFinite(started.expiresAt)||started.status!=='running')
      throw fail('E_OUTCOME_UNKNOWN','Browser Host returned an invalid network observation receipt');
    const observationId=started.observationId,operationId=started.operationId;
    const read=(input={})=>{
      fields(input,['cursor','limit']);
      return ask('browser.events.read',{...input,sessionRef:observationId});
    };
    const exportJson=(input={})=>{
      fields(input,['format']);
      return ask('browser.network.observe.export',{
        observationId,format:input.format??'json'
      });
    };
    return Object.freeze({
      id:observationId,expiresAt:started.expiresAt,
      read,
      status:()=>ask('browser.network.observe.getStatus',{observationId}),
      stop:()=>ask('browser.network.observe.stop',{observationId}),
      export:exportJson,
      cancel:()=>ask('browser.operations.cancel',{operationId}),
      close:()=>ask('browser.events.close',{sessionRef:observationId})
    });
  };
  // Overrides preserve existing documented convenience shapes; neither adds RPC.
  facade.capabilities.list=capabilities.list;
  facade.capabilities.getStatus=capabilities.getStatus;
  facade.clipboard.writeText=text=>ask('browser.clipboard.writeText',{text});
  facade.network.watch=watch;
  return freezeFacade(Object.assign(facade,{apiVersion:'1.0.0'}));
}

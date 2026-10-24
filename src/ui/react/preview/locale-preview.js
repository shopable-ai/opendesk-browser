// Offline presentation adapter. The real language service uses a dedicated
// preview-only localStorage record; no Chrome registry, authority or tool runs.
import {createToolLocaleService} from '../../sidebar-tools/locale-packs.js';
import {SIDEBAR_TOOL_STORE} from '../../sidebar-tools/package.js';
import {createUiLocaleController,UI_LOCALE_STORE} from '../../app-localization.js';

export function createLocalePreview(tool){
  const key='opendesk.preview.locale-packs.r21',listeners=new Set();
  let stored={[UI_LOCALE_STORE]:'zh-CN'};
  try{const raw=JSON.parse(localStorage.getItem(key));if(raw&&typeof raw==='object')stored=raw;}catch{/* Fresh preview. */}
  stored[SIDEBAR_TOOL_STORE]=[tool];
  const api={storage:{local:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(id=>[id,structuredClone(stored[id])]));},
    async set(values){
      const next={...stored,...structuredClone(values)};
      localStorage.setItem(key,JSON.stringify(next));stored=next;
      const changes=Object.fromEntries(Object.entries(values).map(([id,newValue])=>[id,{newValue}]));
      for(const listener of listeners)listener(changes,'local');
    }
  },onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  // A single preview document has no concurrent privileged writers. This
  // adapter models ordering only; the service's actual locks have Node tests.
  let queue=Promise.resolve();
  const lockManager={request(name,work){
    if(name.endsWith(':catalog'))return work();
    const next=queue.then(work);queue=next.catch(()=>{});return next;
  }};
  const service=createToolLocaleService({api,lockManager});
  const localeController=createUiLocaleController(api,{storage:()=>undefined,eventTarget:null});
  return {service,localeController,tools:[tool],dispose(){service.dispose();localeController.dispose();}};
}

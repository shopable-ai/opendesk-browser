import {createPageUI} from '@opendesk/ui';
import {readListing,inspectListing,FIXTURE_URL} from './listing.js';
import {renderInspector} from './view.js';

// Page USER_SCRIPT, not Controller. This URL rule does NOT grant site permission.
const pageRules={matches:['http://127.0.0.1/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default async function main({assets}){
  const page=globalThis.document;
  if(page?.defaultView?.location?.href?.split(/[?#]/)[0]!==FIXTURE_URL)
    throw Object.assign(new Error('仅支持本地测试页 '+FIXTURE_URL+'；未读取其他站点。'),{code:'E_LISTING_SCOPE'});
  const ui=createPageUI({id:'exp005.listing-sku-inspector',assets,pageRules});
  try{
    ui.addStyle(ui.getAsset('assets/ui.css'));
    renderInspector(ui,{read:()=>readListing(page),inspect:inspectListing});
    return {project:'exp005.listing-sku-inspector',runtime:'page-userscript',
      state:ui.active()?'ready':'detached',readTriggered:false,source:'local-fixture'};
  }catch(error){ui.destroy();throw error;}
}

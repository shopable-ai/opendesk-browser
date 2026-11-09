// Static app-owned display-route registry, not an installer or Authority.
// Any unsupported view (e.g. Bookmark Manager settings) must fail closed.
import {acceptAppPage as aiProxyPage} from '../../projects/ai-proxy/trusted/app-page-routes.js';
import {acceptAppPage as webflowPage} from '../../projects/webflow/src/ui/app-page-routes.js';
import {normalizeOwnPageTarget} from './sidebar-tools/navigation.js';
const routes=new Map([['ai-proxy',aiProxyPage],['webflow',webflowPage]]);
export function resolveAppPageTarget(toolId,target){
  const page=normalizeOwnPageTarget(target),resolver=routes.get(toolId);
  return page&&typeof resolver==='function'?resolver(page):null;
}

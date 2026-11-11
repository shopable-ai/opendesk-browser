import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initMarketplace} from '../marketplace/page.js';
import {handleLegacyMarketEntry} from '../marketplace/legacy-market-entry.js';
export default defineUnlistedScript(() => {
  if(!handleLegacyMarketEntry())initMarketplace();
});

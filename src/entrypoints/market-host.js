import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerMarketHandoff} from '../marketplace/external.js';
export default defineUnlistedScript(()=>registerMarketHandoff());

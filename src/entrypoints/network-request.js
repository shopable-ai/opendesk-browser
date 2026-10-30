import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {startNetworkRequest} from '../platform/chrome/network-request.js';
export default defineUnlistedScript(()=>startNetworkRequest());

import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageCryptoJS} from '../libs/packages/crypto-js.js';
export default defineUnlistedScript(() => installPageCryptoJS(globalThis));

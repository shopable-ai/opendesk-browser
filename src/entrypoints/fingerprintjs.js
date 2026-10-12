import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageFingerprintJS} from '../libs/packages/fingerprintjs.js';
export default defineUnlistedScript(()=>installPageFingerprintJS(globalThis));

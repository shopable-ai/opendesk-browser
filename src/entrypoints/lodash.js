import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerLodash} from '../libs/packages/lodash.js';
export default defineUnlistedScript(()=>registerLodash(globalThis));

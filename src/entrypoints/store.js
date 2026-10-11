import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageStore} from '../libs/packages/store.js';
export default defineUnlistedScript(()=>installPageStore(globalThis));

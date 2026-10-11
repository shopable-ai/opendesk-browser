import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageQueryString} from '../libs/packages/query-string.js';
export default defineUnlistedScript(()=>installPageQueryString(globalThis));

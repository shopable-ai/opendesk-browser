import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageCookies} from '../libs/packages/js-cookie.js';
export default defineUnlistedScript(() => installPageCookies(globalThis));

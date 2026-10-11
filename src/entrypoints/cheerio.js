import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installPageCheerio} from '../libs/packages/cheerio.js';
export default defineUnlistedScript(()=>installPageCheerio(globalThis));

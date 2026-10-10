import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {registerDayjs} from '../libs/packages/dayjs.js';
export default defineUnlistedScript(()=>registerDayjs(globalThis));

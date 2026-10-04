import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initHealthAgent} from '../agents/health.js';
export default defineUnlistedScript(() => initHealthAgent());

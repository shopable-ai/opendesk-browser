import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initPageAgent} from '../agents/page-agent.js';
export default defineUnlistedScript(() => initPageAgent());

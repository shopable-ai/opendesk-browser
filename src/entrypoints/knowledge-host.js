import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installKnowledgeService} from '../knowledge/service.js';
export default defineUnlistedScript(() => installKnowledgeService());

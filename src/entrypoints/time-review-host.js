import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installTimeReviewService} from '../time-review/service.js';
export default defineUnlistedScript(()=>installTimeReviewService());

import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installTimeReviewService} from '../../projects/time-review/trusted/service.js';
export default defineUnlistedScript(()=>installTimeReviewService());

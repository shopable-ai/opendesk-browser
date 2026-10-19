import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
export const TIME_CONTROL_IDS=[
  'time-review-grant-idle','time-review-revoke-idle',
  'time-review-site-current-open','time-review-site-current-approve','time-review-site-current-cancel',
  'time-review-site-all-open','time-review-site-all-approve','time-review-site-all-cancel',
  'time-review-site-all-revoke','time-review-trusted-start',
  'time-review-clear-open','time-review-clear-approve','time-review-clear-cancel',
  'time-review-minute-enable','time-review-minute-disable',
  'time-review-minute-delete-approve','time-review-minute-delete-cancel'
];
export function makeTimeReviewReact(t){return settingsReactFixture('timeReview',t);}

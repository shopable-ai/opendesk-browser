// The one preinstalled date library: Day.js core plus four audited official plugins.
// This package is built as a standalone WXT IIFE. Do not introduce Moment or
// expose extend/locale/tz.setDefault to user scripts.
import dayjsCore from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

// Timezone requires UTC. Plugin code is pinned by the root npm lock and runs
// inside this fixed library bundle before the user-program registration step.
dayjsCore.extend(duration);
dayjsCore.extend(utc);
dayjsCore.extend(timezone);
dayjsCore.extend(customParseFormat);

function createPublicDayjs() {
  // Never return the upstream mutable dayjs factory: its extend(), locale(),
  // and tz.setDefault() APIs mutate shared realm-level configuration.
  // The public function returns real Day.js instances, not a Moment facade.
  const tz=(...args)=>dayjsCore.tz(...args);
  Object.defineProperty(tz,'guess',{value:()=>dayjsCore.tz.guess(),enumerable:false});
  Object.freeze(tz);
  return Object.freeze(Object.assign((...args)=>dayjsCore(...args),{
    isDayjs:dayjsCore.isDayjs,
    duration:(...args)=>dayjsCore.duration(...args),
    isDuration:dayjsCore.isDuration,
    utc:(...args)=>dayjsCore.utc(...args),
    tz
  }));
}

export function registerDayjs(scope=globalThis) {
  const register=scope[Symbol.for('opendesk.libs.register.v1')];
  if(typeof register!=='function')throw new Error('E_BUILTIN_NOT_READY');
  register('dayjs','1.11.23',createPublicDayjs());
}

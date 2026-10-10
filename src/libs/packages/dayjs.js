import dayjsCore from 'dayjs';

// Intentionally hide extend/locale mutators from isolated user scripts.
export function registerDayjs(scope=globalThis) {
  const register=scope[Symbol.for('opendesk.libs.register.v1')];
  if(typeof register!=='function')throw new Error('E_BUILTIN_NOT_READY');
  const dayjs=Object.freeze(Object.assign((...args)=>dayjsCore(...args),{isDayjs:dayjsCore.isDayjs}));
  register('dayjs','1.11.23',dayjs);
}

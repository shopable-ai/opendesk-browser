var openDeskMyUtils=(function(){
'use strict';
const register=globalThis[Symbol.for('opendesk.libs.register.v1')];
if(typeof register!=='function')throw new Error('E_BUILTIN_NOT_READY');
register('myUtils','1.0.0',Object.freeze({
  upper(text){return String(text).toUpperCase();}
}));
})();

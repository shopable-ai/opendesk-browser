var openDeskLibraryBootstrap=(function(){
'use strict';
const registerKey=Symbol.for('opendesk.libs.register.v1');
const entriesKey=Symbol.for('opendesk.libs.entries.v1');
if(Object.hasOwn(globalThis,registerKey)||Object.hasOwn(globalThis,entriesKey))throw new Error('E_BUILTIN_COLLISION');
const entries=Object.create(null);
Object.defineProperty(globalThis,entriesKey,{configurable:true,value:entries});
Object.defineProperty(globalThis,registerKey,{configurable:true,value:function(id,version,api){
  if(typeof id!=='string'||!(/^[A-Za-z][A-Za-z0-9]{0,63}$/).test(id)||
     typeof version!=='string'||!(/^\d+\.\d+\.\d+$/).test(version)||
     !api||typeof api!=='object'&&typeof api!=='function'||Object.hasOwn(entries,id))
    throw new Error('E_BUILTIN_REGISTRATION');
  Object.defineProperty(entries,id,{value:Object.freeze({version,api}),enumerable:true});
}});
})();

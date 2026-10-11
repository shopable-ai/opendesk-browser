import test from 'node:test';
import assert from 'node:assert/strict';
import {installBuiltinLibraries} from '../../src/libs/core.js';
import {BUILTIN_ABI,BUILTIN_CATALOG} from '../../src/libs/catalog.js';

const defaultRows=Object.entries(BUILTIN_CATALOG.libraries).filter(([,row])=>row.default);
const correctVersions=Object.fromEntries(defaultRows.map(([id,row])=>[id,row.version]));
const methodObject=methods=>Object.freeze(Object.fromEntries(methods.map(name=>[name,()=>true])));
const fail=error=>error?.code==='E_BUILTIN_COLLISION';

function makeScope({versions=correctVersions,lodashMethods=BUILTIN_CATALOG.libraries.lodash.methods,
  dayjsMethods=BUILTIN_CATALOG.libraries.dayjs.methods,myUtilsMethods=BUILTIN_CATALOG.libraries.myUtils.methods}={}) {
  const scope={};
  const dayjs=Object.freeze(Object.assign((...args)=>args, Object.fromEntries(
    dayjsMethods.map(name=>[name,()=>true]))));
  const facade=Object.freeze({abi:BUILTIN_ABI,versions:Object.freeze({...versions}),
    lodash:methodObject(lodashMethods),dayjs,myUtils:methodObject(myUtilsMethods)});
  for(const [key,value] of [['OpenDeskLibs',facade],['_',facade.lodash],['dayjs',facade.dayjs]])
    Object.defineProperty(scope,key,{value,writable:false,configurable:false});
  return scope;
}
test('R15.5 idempotent installer rejects incomplete Lodash / Day.js and wrong default versions',()=>{
  const cases=[
    makeScope({lodashMethods:['chunk']}),
    makeScope({dayjsMethods:[]}),
    makeScope({versions:{...correctVersions,lodash:'0.0.0'}}),
    makeScope({myUtilsMethods:[]})
  ];
  for(const scope of cases){
    assert.throws(()=>installBuiltinLibraries(scope),fail);
    assert.equal(scope.OpenDeskLibs.lodash!==undefined,true);
    assert.equal(scope[Symbol.for('opendesk.libs.register.v1')],undefined);
  }
});

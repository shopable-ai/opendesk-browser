// Test-only Node Worker prelude: materialize the real audited registry and
// raw IIFE bytes before executing the unchanged worker entrypoint. Never
// include this helper in the production extension or claim Chrome evidence.
import {runInThisContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {registerLodash} from '../../src/libs/packages/lodash.js';
import {registerDayjs} from '../../src/libs/packages/dayjs.js';
export function primeNodeWorkerBuiltinLibraries(){
  runInThisContext(readFileSync('src/libs/runtime/bootstrap.js','utf8'));
  registerLodash(globalThis);registerDayjs(globalThis);
  runInThisContext(readFileSync('src/libs/vendor/my-utils/1.0.0/index.js','utf8'));
}

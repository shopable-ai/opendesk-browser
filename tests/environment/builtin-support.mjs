// Node-only stub for component fixtures. It is not a shipped library bundle
// and must never be used as evidence of packaged Lodash/Day.js behavior.
import {createHash} from 'node:crypto';
import {BUILTIN_ABI} from '../../src/runtime/builtin-libraries/catalog.js';
const code="globalThis.OpenDeskLibs={abi:"+JSON.stringify(BUILTIN_ABI)+",lodash:{},dayjs:()=>{}};"+
  "globalThis._=globalThis.OpenDeskLibs.lodash;globalThis.dayjs=globalThis.OpenDeskLibs.dayjs;";
export const fakeBuiltinSource=Object.freeze({
  code,sha256:createHash('sha256').update(code).digest('hex'),
  catalogSha256:'a'.repeat(64),abi:BUILTIN_ABI
});
export async function loadFakeBuiltin(){return fakeBuiltinSource;}

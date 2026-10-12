// Genuine locked Axios 1.20.0 WXT-like asset for real macOS CFT.
// The same physically pinned resource serves Page and an opted-in Controller,
// but only the latter receives the lexical, authenticated axiosx transport.
import {installPageAxios,installControllerAxios} from '../../src/libs/packages/axios.js';
if(globalThis.document)installPageAxios(globalThis);
else if(typeof axiosx!=='undefined')installControllerAxios(globalThis,axiosx);
else throw Object.assign(new Error('Unapproved Axios execution world'),{code:'E_BUILTIN_WORLD'});

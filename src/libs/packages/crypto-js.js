// Real upstream crypto-js@4.2.0, pinned by the root npm lock.
// Explicit Page USER_SCRIPT opt-in only; never auto-install in privileged
// Service Workers, website MAIN, or another user's run.
import CryptoJS from 'crypto-js';

export function installPageCryptoJS(scope=globalThis) {
  if(!scope.document)
    throw Object.assign(new Error('CryptoJS requires a Page world'),{code:'E_BUILTIN_WORLD'});
  if(Object.hasOwn(scope,'CryptoJS'))
    throw Object.assign(new Error('CryptoJS global already exists'),{code:'E_BUILTIN_COLLISION'});
  if(typeof CryptoJS?.SHA256!=='function'||typeof CryptoJS.HmacSHA256!=='function'||
    typeof CryptoJS.AES?.encrypt!=='function'||typeof CryptoJS.AES?.decrypt!=='function'||
    !CryptoJS.enc?.Hex||!CryptoJS.enc?.Utf8||!CryptoJS.enc?.Base64)
    throw Object.assign(new Error('Upstream crypto-js API changed'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
  // Compatibility subset: do not expose upstream MD5/SHA1/RC4. For new
  // cryptographic work prefer appropriate native WebCrypto primitives.
  const api=Object.freeze({
    SHA256:CryptoJS.SHA256,HmacSHA256:CryptoJS.HmacSHA256,
    AES:Object.freeze({encrypt:CryptoJS.AES.encrypt,decrypt:CryptoJS.AES.decrypt}),
    enc:Object.freeze({Hex:CryptoJS.enc.Hex,Utf8:CryptoJS.enc.Utf8,Base64:CryptoJS.enc.Base64})
  });
  Object.defineProperty(scope,'CryptoJS',{value:api,configurable:false,writable:false,enumerable:false});
}

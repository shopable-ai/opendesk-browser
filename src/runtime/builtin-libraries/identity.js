import {canonical,invariant} from '../../platform/protocol.js';
import {BUILTIN_ABI} from './catalog.js';

// Only trusted loaders/receipts supply these fields; never user return values.
export function builtinIdentity(asset) {
  return {abi:asset?.abi??asset?.builtinAbi,
    catalogSha256:asset?.catalogSha256??asset?.builtinCatalogSha256,
    bundleSha256:asset?.sha256??asset?.builtinBundleSha256};
}
export function assertBuiltinIdentity(expected,current) {
  invariant(expected?.abi===BUILTIN_ABI&&current?.abi===BUILTIN_ABI&&
    /^[a-f0-9]{64}$/.test(expected.catalogSha256)&&
    /^[a-f0-9]{64}$/.test(expected.bundleSha256)&&
    canonical(expected)===canonical(current),'E_BUILTIN_VERSION_UNAVAILABLE',
    '内置运行时已改变或旧版本未记录身份；请保存新版本并重新验证');
}

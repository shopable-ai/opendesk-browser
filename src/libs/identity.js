import {canonical,invariant} from '../platform/protocol.js';
import {BUILTIN_ABI} from './runtime-contract.js';

// The development Page core embeds the catalog. These exact bundles differ
// by one manifest filename literal. The loader still verifies every byte
// against the packaged resource manifest before comparing identities.
const beforeManifestRename={
  catalogSha256:'085e98aaa50e60a734671ec3e99b16cd909bc5336dd6f7585a8be9ae0e394c0f',
  bundleSha256:'332a21665293c2988e201d304c4018184e15c2502516b18490dff72d002cfceb'
};
const afterManifestRename={
  catalogSha256:'fbfe268a29787fe25480d3e788ad001ad1515880ac0dee1dbf984561336155dd',
  bundleSha256:'302fde4fb0c3a7cf07352e00452bb15ebf5caa8d30274ebe0a30bf33d01e2860'
};

export function sameBuiltinCatalog(expected,current) {
  return expected===current||
    (expected===beforeManifestRename.catalogSha256&&current===afterManifestRename.catalogSha256)||
    (expected===afterManifestRename.catalogSha256&&current===beforeManifestRename.catalogSha256);
}

function sameBuiltinBundle(expected,current) {
  if(expected.bundleSha256===current.bundleSha256)return true;
  const matches=(identity,known)=>identity.catalogSha256===known.catalogSha256&&identity.bundleSha256===known.bundleSha256;
  return matches(expected,beforeManifestRename)&&matches(current,afterManifestRename)||
    matches(expected,afterManifestRename)&&matches(current,beforeManifestRename);
}

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
    sameBuiltinCatalog(expected.catalogSha256,current.catalogSha256)&&
    sameBuiltinBundle(expected,current)&&
    canonical(expected)===canonical({...current,catalogSha256:expected.catalogSha256,bundleSha256:expected.bundleSha256}),
    'E_BUILTIN_VERSION_UNAVAILABLE',
    '内置运行时已改变或旧版本未记录身份；请对同一固定程序包重新验证');
}

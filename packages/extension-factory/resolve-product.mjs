import {FEATURE_CATALOG} from './feature-catalog.mjs';

export const PRODUCT_SCHEMA = 'opendesk.extension-product.v1';
const KEYS = ['schema','productId','displayName','purpose','description','owner','userStories',
  'version','minimumChromeVersion','channels','ui','features','hostPatterns',
  'optionalHostPatterns','requiredPermissions','optionalPermissions','runtimeModules',
  'storageSchemaVersion','budgets','releasePolicy'];
const UI_KEYS = ['popup','sidePanel','options'];
const RUNTIME_KEYS = ['controller','userscript','native'];
const PERMISSION_ALLOWLIST = new Set(['activeTab','scripting','storage']);
const forbiddenHosts = /\*|<all_urls>|:|\//;

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
    throw new Error('Invalid or unknown '+label+' fields');
}
function uniqueStrings(value, label, {allowEmpty=false}={}) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) ||
      value.some(row=>typeof row!=='string'||!row.trim()) ||
      new Set(value).size !== value.length)
    throw new Error('Invalid or duplicate '+label);
  return value;
}
function sameSet(actual, expected) {
  return actual.length === expected.length &&
    actual.every(value=>expected.includes(value));
}
export function indexProducts(products) {
  if (!Array.isArray(products) || !products.length) throw Error('Product registry is empty');
  const index = new Map();
  for (const product of products) {
    if (!product || typeof product.productId!=='string' || !/^[a-z][a-z0-9-]{2,63}$/.test(product.productId))
      throw Error('Invalid product ID');
    if(index.has(product.productId)) throw Error('Duplicate product ID: '+product.productId);
    index.set(product.productId,product);
  }
  return index;
}
export function resolveProduct(product, {catalog=FEATURE_CATALOG}={}) {
  exactKeys(product,KEYS,'ProductConfig');
  if(product.schema!==PRODUCT_SCHEMA)throw Error('Unknown ProductConfig schema');
  indexProducts([product]);
  for(const field of ['displayName','purpose','description','owner']) {
    if(typeof product[field]!=='string'||product[field].trim().length<3)
      throw Error('Missing product '+field);
  }
  uniqueStrings(product.userStories,'user stories');
  if(!/^\d+\.\d+\.\d+$/.test(product.version))throw Error('Invalid product version');
  if(product.minimumChromeVersion!=='138')throw Error('Unreviewed Chrome minimum');
  uniqueStrings(product.channels,'channels');
  if(!sameSet(product.channels,['production','development']))
    throw Error('Unreviewed release channel');
  exactKeys(product.ui,UI_KEYS,'product UI');
  if(product.ui.popup!==true||product.ui.sidePanel!==false||product.ui.options!==false)
    throw Error('Unsupported product surface');
  exactKeys(product.runtimeModules,RUNTIME_KEYS,'runtime modules');
  if(Object.values(product.runtimeModules).some(value=>value!==false))
    throw Error('Independent Page QA cannot inherit OpenDesk privileged runtime');
  if(product.storageSchemaVersion!==1)throw Error('Unreviewed storage schema');
  exactKeys(product.budgets,['maxJsBytes','maxZipBytes'],'product budgets');
  if(!Number.isSafeInteger(product.budgets.maxJsBytes)||product.budgets.maxJsBytes<4096||
     product.budgets.maxJsBytes>160000||
     !Number.isSafeInteger(product.budgets.maxZipBytes)||product.budgets.maxZipBytes<4096||
     product.budgets.maxZipBytes>1200000)
    throw Error('Oversized or invalid product budget');
  exactKeys(product.releasePolicy,['manualReviewRequired'],'release policy');
  if(product.releasePolicy.manualReviewRequired!==true)throw Error('Manual release review is required');
  uniqueStrings(product.hostPatterns,'host patterns',{allowEmpty:true});
  uniqueStrings(product.optionalHostPatterns,'optional host patterns',{allowEmpty:true});
  if(product.hostPatterns.length||product.optionalHostPatterns.length)
    throw Error('Page QA only supports transient activeTab, never standing host grants');
  const features=uniqueStrings(product.features,'features'),visited=new Set(),visiting=new Set(),ordered=[];
  function visit(id) {
    if(!Object.hasOwn(catalog,id))throw Error('Unknown feature: '+id);
    if(visiting.has(id))throw Error('Cyclic feature graph: '+id);
    if(visited.has(id))return;
    visiting.add(id);
    const feature=catalog[id];
    exactKeys(feature,['dependencies','permissions','modules','entrypoints'],'feature');
    for(const dependency of uniqueStrings(feature.dependencies,'dependencies',{allowEmpty:true})) {
      if(!features.includes(dependency))throw Error('Missing declared feature dependency: '+id+' -> '+dependency);
      visit(dependency);
    }
    for(const permission of uniqueStrings(feature.permissions,'feature permissions',{allowEmpty:true}))
      if(!PERMISSION_ALLOWLIST.has(permission))throw Error('Unreviewed feature permission: '+permission);
    uniqueStrings(feature.modules,'feature modules',{allowEmpty:true});
    if(feature.modules.some(name=>!/^packages\/features\/[a-z0-9/-]+\.js$/.test(name)))
      throw Error('Feature declares a non-static source module');
    if(!sameSet(uniqueStrings(feature.entrypoints,'feature entrypoints'),['popup']))
      throw Error('Feature declares an unapproved entrypoint');
    visiting.delete(id);visited.add(id);ordered.push(id);
  }
  for(const id of features)visit(id);
  const permissions=[...new Set(ordered.flatMap(id=>catalog[id].permissions))].sort();
  const required=uniqueStrings(product.requiredPermissions,'required permissions');
  if(required.some(item=>!PERMISSION_ALLOWLIST.has(item))||!sameSet(required,permissions))
    throw Error('Unused, missing or privileged required permission');
  const optional=uniqueStrings(product.optionalPermissions,'optional permissions',{allowEmpty:true});
  if(optional.length)throw Error('Unapproved optional permissions');
  // No implicit grants may be introduced by manifest merging.
  const manifest=Object.freeze({
    name: product.displayName,
    version: product.version,
    description: product.description,
    minimum_chrome_version: product.minimumChromeVersion,
    permissions,
    action:{default_title:product.displayName},
    incognito:'not_allowed',
    content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'"}
  });
  return Object.freeze({
    productId:product.productId,version:product.version,
    features:Object.freeze([...ordered]),
    modules:Object.freeze([...new Set(ordered.flatMap(id=>catalog[id].modules))]),
    entrypoints:Object.freeze(['popup']),
    permissions:Object.freeze(permissions),
    manifest, budgets:Object.freeze({...product.budgets})
  });
}

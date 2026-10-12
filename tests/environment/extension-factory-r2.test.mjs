import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import product from '../../products/page-qa-inspector/product.config.mjs';
import {PRODUCT_SCHEMA,indexProducts,resolveProduct} from '../../packages/extension-factory/resolve-product.mjs';
import {FEATURE_CATALOG} from '../../packages/extension-factory/feature-catalog.mjs';
import {PAGE_QA_PRODUCT_ID,PAGE_QA_VERSION} from '../../packages/features/page-qa/identity.js';
import {analyzeSnapshot} from '../../packages/features/page-qa/a11y.js';
import {capturePage} from '../../packages/features/page-qa/capture.js';
import {highlightPageElement} from '../../packages/features/page-qa/highlight.js';
import {verifyProductManifest} from '../../scripts/product-verify.mjs';
import {parseProductArgs} from '../../scripts/product-build.mjs';

const clone=()=>structuredClone(product);
const mutate=patch=>Object.assign(clone(),patch);
const plan=resolveProduct(product);

test('ProductConfig derives only selected permissions and one popup from a closed module graph',()=>{
  assert.equal(product.schema,PRODUCT_SCHEMA);
  assert.equal(plan.productId,PAGE_QA_PRODUCT_ID);
  assert.equal(plan.version,PAGE_QA_VERSION);
  assert.deepEqual(plan.permissions,['activeTab','scripting','storage']);
  assert.deepEqual(plan.entrypoints,['popup']);
  assert.deepEqual(plan.features,['dom-inspector','a11y-check','local-settings']);
  assert(plan.modules.some(item=>item.endsWith('/capture.js')));
  assert(plan.modules.some(item=>item.endsWith('/a11y.js')));
  assert(plan.modules.some(item=>item.endsWith('/settings.js')));
  assert(!JSON.stringify(plan.manifest).includes('all_urls'));
  assert.equal(plan.manifest.background,undefined);
});
test('Unknown features, undeclared dependencies, cycles, duplicate feature/product IDs are hard failures',()=>{
  assert.throws(()=>resolveProduct(mutate({features:['dom-inspector','does-not-exist']})),/Unknown feature/);
  assert.throws(()=>resolveProduct(mutate({features:['a11y-check','local-settings']})),/Missing declared feature dependency/);
  assert.throws(()=>resolveProduct(mutate({features:['dom-inspector','dom-inspector']})),/duplicate features/);
  assert.throws(()=>indexProducts([product,clone()]),/Duplicate product ID/);
  const badCatalog={...FEATURE_CATALOG,
    'dom-inspector':{...FEATURE_CATALOG['dom-inspector'],dependencies:['a11y-check']}};
  assert.throws(()=>resolveProduct(product,{catalog:badCatalog}),/Cyclic feature graph/);
});
test('Reject unexpected fields, inherited rights, hosts, overbudget and version/identity drift',()=>{
  const bad=mutate({permissions:['activeTab']});assert.throws(()=>resolveProduct(bad),/unknown ProductConfig fields/i);
  assert.throws(()=>resolveProduct(mutate({hostPatterns:['<all_urls>']})),/standing host grants/);
  assert.throws(()=>resolveProduct(mutate({optionalHostPatterns:['https:\/\/example.com\/*']})),/standing host grants/);
  assert.throws(()=>resolveProduct(mutate({requiredPermissions:['activeTab','scripting','storage','cookies']})),/permission/);
  assert.throws(()=>resolveProduct(mutate({optionalPermissions:['nativeMessaging']})),/optional permissions/);
  assert.throws(()=>resolveProduct(mutate({version:'0.1.0.1'})),/version/);
  assert.throws(()=>resolveProduct(mutate({budgets:{maxJsBytes:999999,maxZipBytes:1200000}})),/budget/);
  assert.throws(()=>resolveProduct(mutate({runtimeModules:{controller:true,userscript:false,native:false}})),/privileged runtime/);
  const catalog={...FEATURE_CATALOG,
    'a11y-check':{...FEATURE_CATALOG['a11y-check'],permissions:['downloads']}};
  assert.throws(()=>resolveProduct(product,{catalog}),/Unreviewed feature permission/);
});
test('Exact generated Manifest accepts only the product popup, not OpenDesk features',()=>{
  const manifest={
    manifest_version:3,...structuredClone(plan.manifest),
    action:{...plan.manifest.action,default_popup:'popup.html'}
  };
  assert.equal(verifyProductManifest(manifest,plan),true);
  for(const field of [
    {host_permissions:['<all_urls>']},{permissions:[...plan.permissions,'cookies']},
    {background:{service_worker:'sw.js'}},{side_panel:{default_path:'ui/tool.html'}},
    {content_scripts:[{matches:['<all_urls>'],js:['agents/page-relay.js']}]},
    {externally_connectable:{matches:['https://example.com/*']}},
    {key:'unauthorized-store-identity'}
  ])assert.throws(()=>verifyProductManifest({...structuredClone(manifest),...field},plan),/permissions|privileged|Unreviewed|capabilities/);
  assert.throws(()=>verifyProductManifest({...manifest,version:'9.9.9'},plan),/identity or version/);
});
test('Only one explicit known product ID accepted by CLI; default npm build remains unchanged',async()=>{
  assert.equal(parseProductArgs(['--product','page-qa-inspector']),PAGE_QA_PRODUCT_ID);
  for(const args of [[],['--product','opendesk'],['--product','page-qa-inspector','--unsafe']])
    assert.throws(()=>parseProductArgs(args),/--product/);
  const root=JSON.parse(await readFile(resolve('package.json'),'utf8'));
  assert.equal(root.scripts.build,'node scripts/build.mjs production');
  assert.equal(root.scripts.pack,'node scripts/pack.mjs production');
  assert.match(root.scripts['build:product'],/product-build/);
});
test('Page QA snapshot reports heuristic issues and never includes form contents, full URL tokens, or HTML',()=>{
  const source={
    schema:'opendesk.page-qa.snapshot.v1',
    page:{url:'https://example.test/fixture',title:'',lang:''},
    inspected:5,truncated:false,
    elements:[
      {tag:'img',selector:'#hero',hasAlt:false},
      {tag:'button',selector:'#submit',hasName:false},
      {tag:'input',selector:'#email',type:'text',hasLabel:false},
      {tag:'a',selector:'#link',hasName:false},
      {tag:'h3',selector:'#heading',headingLevel:3}
    ]
  };
  const report=analyzeSnapshot(source);
  assert.equal(report.stats.inspected,5);
  assert.deepEqual(report.issues.filter(row=>row.severity==='warning').map(row=>row.code),
    ['IMAGE_ALT','BUTTON_NAME','FORM_LABEL','LINK_NAME']);
  assert(report.issues.some(row=>row.code==='DOCUMENT_TITLE'));
  assert(report.issues.some(row=>row.code==='HTML_LANG'));
  assert(report.issues.some(row=>row.code==='H1_MISSING'));
  assert.deepEqual(report.sampleLocators[0],{tag:'img',selector:'#hero'});
  assert.throws(()=>analyzeSnapshot({schema:'unknown'}),/Invalid/);
  assert(!JSON.stringify(report).includes('password'));
});
test('Page-world capture is closure-free and redacts query/fragment and typed values',()=>{
  const oldDocument=globalThis.document,oldLocation=globalThis.location;
  try{
    globalThis.location={href:'https://example.test/path?token=secret#private',protocol:'https:'};
    const fake={
      documentElement:{getAttribute:()=> 'zh-CN'},
      title:'QA test',
      querySelectorAll:()=>[{
        id:'',nodeType:1,tagName:'INPUT',parentElement:null,previousElementSibling:null,
        labels:[],textContent:'',getAttribute:(key)=>key==='type'?'text':null,
        hasAttribute:()=>false,querySelector:()=>null
      }],
      getElementById:()=>null
    };
    globalThis.document=fake;
    const snapshot=capturePage();
    assert.equal(snapshot.page.url,'https://example.test/path');
    assert.equal(snapshot.elements[0].hasLabel,false);
    assert.equal(snapshot.elements[0].selector,'input:nth-of-type(1)');
    assert(!JSON.stringify(snapshot).includes('secret'));
  }finally{globalThis.document=oldDocument;globalThis.location=oldLocation;}
});
test('Highlight is guarded against stale page navigation or invalid selectors',()=>{
  const oldLocation=globalThis.location;
  try{
    globalThis.location={href:'https://example.test/next?token=abc',protocol:'https:'};
    assert.deepEqual(highlightPageElement({selector:'#submit',expectedUrl:'https://example.test/old',tag:'button'}),
      {ok:false,reason:'页面已导航，请重新检查'});
    assert.deepEqual(highlightPageElement({selector:'x'.repeat(401),expectedUrl:'https://example.test/next',tag:'button'}),
      {ok:false,reason:'无效定位表达式'});
  }finally{globalThis.location=oldLocation;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileToolLocaleCatalog} from '../../src/ui/app-localization.js';
import {validateToolLocalization,canonicalToolSource,verifyToolLocalization,createToolLocalization}
  from '../../src/ui/sidebar-tools/localization.js';
import {serializeSidebarToolPackage,validateSidebarToolPackage,verifySidebarToolBackground,
  sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const draft=()=>({sourceLocale:'en',messages:{en:{zebra:'Count {count}',alpha:'Hello'},
  fr:{zebra:{source:'Count {count}',text:'Nombre {count}'}}}});
const metadata=()=>createToolLocalization(compileToolLocaleCatalog(draft()));
function tool(v2=false){return {format:'opendesk.sidebar-tool.v'+(v2?'2':'1'),
  id:'locale-fixture',version:'1.0.0',title:'Fixture',description:'Fixture tool',
  capabilities:[],html:'<p>Fixture</p>',css:'',js:'void 0;',
  ...(v2?{requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}}:{})};}
const reverse=value=>value&&typeof value==='object'&&!Array.isArray(value)?
  Object.fromEntries(Object.entries(value).reverse().map(([key,row])=>[key,reverse(row)])):value;

test('canonical source hash has exact fixed JSON and UTF-8 SHA-256 semantics',async()=>{
  const value=await metadata();
  const expected='{"sourceLocale":"en","messages":{"alpha":"Hello","zebra":"Count {count}"}}';
  assert.equal(canonicalToolSource(value),expected);
  assert.equal(value.sourceCatalogHash,createHash('sha256').update(expected,'utf8').digest('hex'));
  assert.deepEqual(await verifyToolLocalization(reverse(value)),reverse(value));
  const translated=structuredClone(value);translated.messages.fr.zebra='Total {count}';
  assert.equal(canonicalToolSource(translated),expected,'only source text contributes to source digest');
  await verifyToolLocalization(translated);
  translated.messages.en.alpha='Changed';
  await assert.rejects(verifyToolLocalization(translated),/SHA-256 mismatch/);
});

test('v1/v2 old package bytes stay unchanged; localized storage key order stays canonical',async()=>{
  for(const v2 of [false,true]){
    const old=tool(v2),bytes=JSON.stringify(old,null,2)+'\n';
    assert.equal(serializeSidebarToolPackage(old),bytes);
    assert.equal(encodeSidebarToolPackage(old).toString(),bytes);
    assert.equal(serializeSidebarToolPackage(reverse(old)),bytes);
    const localized={...old,localization:await metadata()};
    assert.deepEqual(validateSidebarToolPackage(localized),localized);
    assert.equal(serializeSidebarToolPackage(localized),serializeSidebarToolPackage(reverse(localized)));
    assert.equal(await sidebarToolPackageHash(localized),await sidebarToolPackageHash(reverse(localized)));
  }
});

test('async installation and package hashing reject bad source digest with or without background',async()=>{
  for(const background of [false,true]){
    const value={...tool(background),localization:await metadata()};
    if(background){value.capabilities=['browser.storage','browser.scheduler'];
      value.background={kind:'opendesk.app-service.v1',js:'void 0;',
        sha256:createHash('sha256').update('void 0;').digest('hex')};}
    await verifySidebarToolBackground(value);
    value.localization.sourceCatalogHash='0'.repeat(64);
    validateSidebarToolPackage(value); // Structure alone cannot verify a digest.
    await assert.rejects(verifySidebarToolBackground(value),/SHA-256 mismatch/);
    await assert.rejects(sidebarToolPackageHash(value),/SHA-256 mismatch/);
  }
});

test('metadata rejects unknown fields, unsafe text, dangerous keys and placeholder drift',async()=>{
  const base=await metadata();
  for(const message of ['<script>alert(1)</script>','onload=alert(1)','javascript:alert(1)',
    'vbscript:evil','data:text/html,evil','file:///tmp/a','text\u0000','text\u007f',
    'text\u0085','text\u061c','text\u200e','text\u202e','text\u2066','x'.repeat(381),'']){
    for(const locale of ['en','fr']){
      const value=structuredClone(base);value.messages[locale].zebra=message;
      assert.throws(()=>validateToolLocalization(value),undefined,JSON.stringify(message));
    }
  }
  for(const key of ['constructor','prototype','__proto__']){
    const value=structuredClone(base);
    Object.defineProperty(value.messages.en,key,{value:'Bad',enumerable:true});
    assert.throws(()=>validateToolLocalization(value),/unsafe data field/);
  }
  for(const change of [v=>{v.extra=true;},v=>{v.messages.fr.zebra='Missing count';},
    v=>{v.messages.fr.unknown='Unknown';},v=>{v.messages['EN']=v.messages.en;},
    v=>{v.sourceLocale='EN';},v=>{v.sourceCatalogHash='ABC';},
    v=>{v.messages.fr.zebra={source:'Count {count}',text:'Nombre {count}'};},
    v=>{v.messages.en={};},v=>{v.messages.en=Object.fromEntries(Array.from({length:161},(_,i)=>['key'+i,'Text']));},
    v=>{for(const id of ['de','es','it','ja','ko','pt','ru','ar','nl','sv','pl'])v.messages[id]={};}]){
    const value=structuredClone(base);change(value);
    assert.throws(()=>validateToolLocalization(value));
  }
  assert.throws(()=>validateToolLocalization({...base,script:'evil'}));
});

test('metadata accepts exact language/message/text limits and preserves existing distributable bytes',async()=>{
  const source=Object.fromEntries(Array.from({length:160},(_,i)=>['key'+i,'字'.repeat(380)]));
  const ids=['en','fr','de','es','it','ja','ko','pt','ru','ar','nl','sv'];
  const value=await createToolLocalization({sourceLocale:'en',
    messages:Object.fromEntries(ids.map(id=>[id,{...source}]))});
  await verifyToolLocalization(value);
  const path=new URL('../../examples/sidebar-tools/shared-ui-demo/shared-ui-demo.opendesk-tool.json',import.meta.url);
  const original=await readFile(path,'utf8');
  assert.equal(serializeSidebarToolPackage(JSON.parse(original)),original);
});

test('source-only compiled catalog creates valid metadata and enforces exact compiled shape',async()=>{
  const compiled=compileToolLocaleCatalog({sourceLocale:'en',messages:{en:{hello:'Hello'}}});
  const value=await createToolLocalization(compiled);
  assert.deepEqual((await verifyToolLocalization(value)).messages,{en:{hello:'Hello'}});
  await assert.rejects(createToolLocalization({...compiled,unknown:true}));
  await assert.rejects(createToolLocalization(draft()),/unsafe message/);
});

test('packer reads independent catalog JSON, replaces marker without executing JS, supports source-only',async()=>{
  const root=await mkdtemp(join(tmpdir(),'tool-localization-r2-'));
  try{
    for(const v2 of [false,true])for(const sourceOnly of [false,true]){
      const pkg=tool(v2),{format,html,css,js,...meta}=pkg;
      const catalog=draft();if(sourceOnly)delete catalog.messages.fr;
      const source='throw Error("must never execute"); const messages=__OPENDESK_TOOL_MESSAGES__;';
      await Promise.all([
        writeFile(join(root,'tool.config.json'),JSON.stringify({...meta,...(v2?{format}:{}),
          files:{html:'index.html',css:'style.css',js:'main.js'},locales:'words.json'})),
        writeFile(join(root,'index.html'),html),writeFile(join(root,'style.css'),css),
        writeFile(join(root,'main.js'),source),writeFile(join(root,'words.json'),JSON.stringify(catalog))
      ]);
      const built=await createSidebarToolPackage(root);
      assert.deepEqual(built.localization,await createToolLocalization(compileToolLocaleCatalog(catalog)));
      assert.equal(built.js,source.replace('__OPENDESK_TOOL_MESSAGES__',JSON.stringify(compileToolLocaleCatalog(catalog))));
      assert.equal(await readFile(join(root,'main.js'),'utf8'),source);
      await verifySidebarToolBackground(built);
      catalog.messages.en.alpha='Changed in independent source';
      await writeFile(join(root,'words.json'),JSON.stringify(catalog));
      const updated=await createSidebarToolPackage(root);
      assert.notEqual(updated.localization.sourceCatalogHash,built.localization.sourceCatalogHash);
      assert.match(updated.js,/Changed in independent source/);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

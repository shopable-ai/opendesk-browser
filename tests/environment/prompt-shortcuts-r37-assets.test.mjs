// R3.7 exact asset Host+model source exercise. Node/mock Chrome storage, NOT installed Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PROMPT_ASSET_STORE,PROMPT_ASSET_OPERATIONS,imageAssetDataUrl} from
  '../../examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js';
import {executePromptAsset} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/asset-host.js';
import {PROMPT_DATA_STORE} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
const ROOT='examples/sidebar-tools/prompt-shortcuts';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
const dataUrl='data:image/png;base64,'+PNG;
function mockChrome(){
 const values=new Map(),changes=[];
 const api={storage:{local:{
  async get(key){return {[key]:structuredClone(values.get(key))};},
  async set(row){for(const [key,value] of Object.entries(row)){
   values.set(key,structuredClone(value));changes.push(key);
  }}
 }}};
 return {api,values,changes};
}
async function model(){
 const sandbox={URL,Intl,TextEncoder,crypto:webcrypto};
 runInNewContext(await readFile(ROOT+'/trusted/model.js','utf8'),sandbox,{filename:'trusted/model.js'});
 return sandbox.OpenDeskPromptShortcutsModel;
}
test('R3.7 reviewed Host stores decoded PNG under scoped resource key, not in 8 KiB text library',async()=>{
 const {api,values,changes}=mockChrome();let authorizations=0;
 const authorize=async()=>{authorizations++;};
 const saved=await executePromptAsset({api,operation:'prompt.asset.put',payload:{mime:'image/png',dataUrl},authorize});
 assert.match(saved.id,/^psa_[a-f0-9]{32}$/);assert.equal(saved.mime,'image/png');
 assert(saved.bytes>12);assert(authorizations>=3);
 assert.equal(changes[0],PROMPT_ASSET_STORE);
 const retried=await executePromptAsset({api,operation:'prompt.asset.put',payload:{mime:'image/png',dataUrl},authorize});
 assert.equal(retried.id,saved.id,'retrying the same verified bytes reuses the same resource ID');
 assert.equal(retried.reused,true);
 assert.equal(Object.keys(values.get(PROMPT_ASSET_STORE).assets).length,1);
 assert.equal(changes.length,1,'deduplicated asset must not write a second copy');
 assert.equal(values.has(PROMPT_DATA_STORE),false,'image bytes cannot silently enter the text library');
 const got=await executePromptAsset({api,operation:'prompt.asset.get',payload:{id:saved.id},authorize});
 assert.equal(got.dataUrl,dataUrl);
 assert.equal(imageAssetDataUrl(values.get(PROMPT_ASSET_STORE).assets[saved.id],saved.id),dataUrl);
 values.set(PROMPT_DATA_STORE,{library:{schema:1,items:[{imageAssetId:saved.id}]}});
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.remove',payload:{id:saved.id},authorize}),
  error=>error?.code==='E_IMAGE_REFERENCED');
 values.set(PROMPT_DATA_STORE,{library:{schema:1,items:null}});
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.remove',payload:{id:saved.id},authorize}),
  error=>error?.code==='E_STORAGE_CORRUPT');
 assert(values.get(PROMPT_ASSET_STORE).assets[saved.id],'corrupt library must not delete the image');
 values.set(PROMPT_DATA_STORE,{library:{schema:1,items:[]}});
 assert.deepEqual(await executePromptAsset({api,operation:'prompt.asset.remove',payload:{id:saved.id},authorize}),{removed:true});
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.get',payload:{id:saved.id},authorize}),
  error=>error?.code==='E_IMAGE_MISSING');
});
test('R3.7 file-type mismatch, inline SVG and oversize payload are denied',async()=>{
 const {api}=mockChrome(),authorize=async()=>{};
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.put',
   payload:{mime:'image/jpeg',dataUrl:dataUrl.replace('image/png','image/jpeg')},authorize}),
   /图片头与格式不符/);
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.put',
   payload:{mime:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},authorize}),
   error=>error?.code==='E_PROMPT_ASSET'&&/PNG.*JPEG.*WebP/.test(error.message));
 const tooBig='data:image/png;base64,'+Buffer.alloc(65537,42).toString('base64');
 await assert.rejects(executePromptAsset({api,operation:'prompt.asset.put',
   payload:{mime:'image/png',dataUrl:tooBig},authorize}),/64 KiB/);
 assert.deepEqual(PROMPT_ASSET_OPERATIONS,['prompt.asset.put','prompt.asset.get','prompt.asset.remove']);
});
test('R3.7 existing model stores only resource refs and blocks incomplete v2 local-image exports',async()=>{
 const m=await model(),id='psa_'+'a'.repeat(32);
 const row=m.draft({body:'你好',appearance:'image',imageAssetId:id,imageUrl:''},null,()=> 'promptasset0001');
 const library=m.load({schema:1,items:[{...row,order:0}],settings:{webButtons:true,imageSize:'large'}});
 assert.equal(library.items[0].imageAssetId,id);
 assert(m.bytes(library)<8192);
 assert(!JSON.stringify(library).includes(PNG));
 assert.throws(()=>m.backupExport(library),/无法完整备份图片/);
 const v1=m.draft({body:'你好',appearance:'image',imageUrl:'https://example.com/picture.png'},null,()=> 'promptasset0002');
 assert(m.backupExport(m.load({schema:1,items:[{...v1,order:0}],settings:{webButtons:true}}))
   .includes('"version": 2'));
 assert.throws(()=>m.draft({body:'hello',appearance:'image',imageAssetId:'../../bad'}),
   /无效的本地图片资源/);
});
test('R3.7 original full preview and formal source reuse compact image controls',async()=>{
 const [preview,html,css,main,page]=await Promise.all([
  readFile(ROOT+'/preview/index.html','utf8'),readFile(ROOT+'/src/index.html','utf8'),
  readFile(ROOT+'/src/style.css','utf8'),readFile(ROOT+'/src/main.js','utf8'),
  readFile(ROOT+'/trusted/page.js','utf8')
 ]);
 assert(preview.length>125000,'must preserve original complete HTML');
 for(const id of ['pageRail','mockDraft','promptList','imageSourceLocal','imageSourceUrl','imageFile','imagePick','imageClear'])
  assert(preview.includes('id="'+id+'"'),id);
 for(const id of ['ps-image-source-local','ps-image-source-url','ps-image-file','ps-image-pick','ps-image-clear'])
  assert(html.includes('id="'+id+'"'),id);
 // Count actual HTML buttons, not CSS selectors or JavaScript query strings.
 const sizeButtons=source=>[...source.matchAll(/<button\b[^>]*\bdata-image-size="([^"]+)"[^>]*>/g)]
   .map(match=>match[1]);
 assert.deepEqual(sizeButtons(preview),['compact','standard','large']);
 assert.deepEqual(sizeButtons(html),['compact','standard','large']);
 assert.match(preview,/lastSitePromptId===item\.id/);
 assert.match(preview,/img\.src=offlineSample\?PREVIEW_OFFLINE_PNG:url/);
 // Selected appearance comes from the canonical shared icon-button, not a private skin.
 assert.match(css,/\.ps-image-size-button\{[^}]*width:/);
 assert.match(html,/class="od-icon-button od-icon-button--primary ps-image-size-button"[^>]*data-image-size="large"/);
 assert.match(main,/button\.classList\.toggle\('od-icon-button--primary',selected\)/);
 assert.match(main,/button\.setAttribute\('aria-pressed',String\(selected\)\)/);
 assert.match(main,/prompt\.asset\.put/);
 assert.match(main,/prompt\.asset\.get/);
 assert.match(main,/function removeUnreferencedAsset\(id\)/);
 assert.doesNotMatch(main,/prompt\.asset\.remove'[^\n]*\.catch\(\(\)=>\{\}\)/,
   'resource cleanup errors must never be silently discarded');
 assert.match(page,/PROMPT_ASSET_STORE/);
 assert.match(page,/doc\.execCommand\('insertText'/);
 new Function(main);
 const sources=[...preview.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(sources.length,1);
 for(const [,source] of sources)new Function(source);
});

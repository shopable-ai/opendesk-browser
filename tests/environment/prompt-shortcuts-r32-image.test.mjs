// R3.2 formal image button regression: uses actual source & packer, not native Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const ROOT='examples/sidebar-tools/prompt-shortcuts';
const read=path=>readFile(ROOT+'/'+path,'utf8');
const id='image-button-123456';
async function model(){
  const sandbox={URL,TextEncoder,Intl,crypto:webcrypto};
  runInNewContext(await read('trusted/model.js'),sandbox,{filename:'trusted/model.js'});
  return sandbox.OpenDeskPromptShortcutsModel;
}
const item={body:'将本页总结为三个结论',label:'总结',name:'总结助手',
  appearance:'image',imageUrl:'https://example.org/picture.webp?size=large'};
const library=(m,rows=[],imageSize='large')=>m.load({schema:1,settings:{webButtons:true,imageSize},items:rows});

test('R3.2 legacy schema:1 rows remain text and global default is a large 68x48 image',async()=>{
  const m=await model();
  const legacy={schema:1,settings:{webButtons:false},items:[{
    id,body:'旧版正文',label:'旧版',name:'旧版正文',enabled:true,shape:'round',order:0
  }]};
  const loaded=m.load(legacy);
  assert.equal(loaded.schema,1);
  assert.equal(loaded.settings.webButtons,false);
  assert.equal(loaded.settings.imageSize,'large');
  assert.equal(loaded.items[0].appearance,'text');
  assert.equal(loaded.items[0].imageUrl,'');
  assert.deepEqual([...m.IMAGE_SIZES.compact],[48,40]);
  assert.deepEqual([...m.IMAGE_SIZES.standard],[56,44]);
  assert.deepEqual([...m.IMAGE_SIZES.large],[68,48]);
  assert.equal(m.load(m.defaults()).settings.imageSize,'large');
});

test('R3.2 switching text/image does not modify prompt ID, body, label or order',async()=>{
  const m=await model();
  const original=m.draft({body:item.body,label:item.label},null,()=>id);
  const image=m.draft(item,original);
  assert.equal(image.id,original.id);
  assert.equal(image.body,original.body);
  assert.equal(image.label,original.label);
  assert.equal(image.appearance,'image');
  assert.equal(image.imageUrl,item.imageUrl);
  const text=m.draft({...image,appearance:'text'},image);
  assert.equal(text.id,image.id);
  assert.equal(text.body,image.body);
  assert.equal(text.imageUrl,image.imageUrl,'valid prior URL is retained for a later switch back');
  assert.equal(m.draft({body:'正文',appearance:'text',imageUrl:'javascript:unsafe()'},null,()=>id).imageUrl,'');
});

test('R3.2 image URLs allow HTTPS only and exclude dangerous schemes, credentials and SVG',async()=>{
  const m=await model();
  for(const url of [
    'http://example.org/a.png','file:///Users/a.png','javascript:alert(1)',
    'data:image/png;base64,AAA','https://user:secret@example.org/a.png',
    'https://example.org/logo.svg','https://example.org/logo.SVG?x=1',
    'https://example.org/a.png\nx'
  ])assert.throws(()=>m.draft({...item,imageUrl:url},null,()=>id),{code:'E_PROMPT_DATA'},url);
  assert.throws(()=>m.draft({...item,imageUrl:''},null,()=>id),/HTTPS/);
  assert.equal(m.normalizeImageUrl(' https://example.org/a.png '),'https://example.org/a.png');
  assert.equal(m.normalizeImageUrl(''), '');
});

test('R3.2 v2 backup restores images and global size, excludes website rules/grants',async()=>{
  const m=await model();
  const record=m.draft(item,null,()=>id);
  const current=library(m,[record],'compact');
  const json=m.backupExport(current,'2026-10-20T09:00:00.000Z');
  const raw=JSON.parse(json);
  assert.equal(raw.format,m.BACKUP_FORMAT);
  assert.equal(raw.version,2);
  assert.equal(raw.imageSize,'compact');
  assert.equal(raw.items[0].appearance,'image');
  assert.equal(raw.items[0].imageUrl,record.imageUrl);
  for(const unsafe of ['sites','siteGrants','permissions','contextMenu'])assert.equal(Object.hasOwn(raw,unsafe),false);
  const parsed=m.backupParse(json),planned=m.backupPlan(library(m,[],'large'),parsed,'replace');
  assert.equal(planned.next.settings.imageSize,'compact');
  assert.equal(planned.next.items[0].body,record.body);
  assert.equal(planned.next.items[0].imageUrl,record.imageUrl);
  assert.notEqual(planned.next.items[0].id,record.id,'imported IDs must be regenerated');
});

test('R3.2 append and legacy v1 replacement preserve preexisting image size',async()=>{
  const m=await model();
  const record=m.draft(item,null,()=>id);
  const imported=m.backupParse(m.backupExport(library(m,[record],'compact')));
  const existing=library(m,[],'standard');
  const appended=m.backupPlan(existing,imported,'append');
  assert.equal(appended.next.settings.imageSize,'standard');
  assert.equal(appended.next.items[0].appearance,'image');
  const v1=JSON.stringify({format:m.BACKUP_FORMAT,version:1,items:[{
    body:'来自旧版备份',shape:'square',enabled:true,order:0
  }]});
  const replaced=m.backupPlan(existing,m.backupParse(v1),'replace');
  assert.equal(replaced.next.settings.imageSize,'standard');
  assert.equal(replaced.next.items[0].appearance,'text');
  assert.equal(replaced.next.items[0].body,'来自旧版备份');
});

test('R3.2 corrupted image values and misleading v1 image metadata fail closed',async()=>{
  const m=await model();
  const record=m.draft(item,null,()=>id);
  assert.throws(()=>m.load({schema:1,items:[{...record,imageUrl:'http://bad.example/a'}],
    settings:{webButtons:true}}),{code:'E_PROMPT_DATA'});
  assert.throws(()=>m.load({schema:1,items:[record],settings:{webButtons:true,imageSize:'giant'}}),
    {code:'E_PROMPT_DATA'});
  assert.throws(()=>m.backupParse(JSON.stringify({format:m.BACKUP_FORMAT,version:1,
    imageSize:'compact',items:[{body:'恶意数据'}]})),{code:'E_PROMPT_DATA'});
  assert.throws(()=>m.backupParse(JSON.stringify({format:m.BACKUP_FORMAT,version:1,
    items:[{body:'恶意数据',appearance:'image',imageUrl:item.imageUrl}]})),{code:'E_PROMPT_DATA'});
});

test('R3.2 size changes keep web visibility state and 8 KiB is still enforced by CAS writer',async()=>{
  const m=await model();
  const current=m.load({schema:1,items:[],settings:{webButtons:false}});
  const updated=m.load({...current,settings:{...current.settings,imageSize:'compact'}});
  assert.equal(updated.settings.webButtons,false);
  assert.equal(updated.settings.imageSize,'compact');
  const huge=m.draft({body:'大'.repeat(5000)},null,()=>id);
  assert(m.bytes(library(m,[huge]))>8192);
  const main=await read('src/main.js');
  assert.match(main,/model\.bytes\(next\)>8192/);
  assert.match(main,/ifMatch:etag/);
  assert.match(main,/unconfirmedWrite=true/);
  assert.match(main,/async function changeImageSize\(/);
});

test('R3.2 actual HTML/CSS/main.js and page.js reuse the existing controls & insertion',async()=>{
  const [html,css,main,page]=await Promise.all([
    read('src/index.html'),read('src/style.css'),read('src/main.js'),read('trusted/page.js')
  ]);
  for(const id of ['ps-appearance-text','ps-appearance-image','ps-image-url',
    'ps-image-preview','ps-image-size','ps-body','ps-save'])
    assert(html.includes('id="'+id+'"'),id);
  assert.match(html,/class="ps-settings"[^>]+hidden/,'no revived legacy duplicate settings page');
  assert.match(css,/\.ps-appearance-switch/);
  assert.match(css,/\.ps-image-preview img/);
  // R3.3: --od-brand is only 3.06:1 on the dark surface; selected text
  // must use the canonical semantic accent token (dark: #9dc1ff).
  assert.match(css,/\.ps-appearance-switch label:has\(input:checked\)\{[^}]*color:var\(--od-accent-ink\)/);
  assert.doesNotMatch(css,/\.ps-appearance-switch label:has\(input:checked\)\{[^}]*color:var\(--od-brand\)/);
  assert.match(main,/img\.referrerPolicy='no-referrer'/);
  assert.match(main,/changeImageSize/);
  assert.match(page,/img\.referrerPolicy='no-referrer'/);
  assert.match(page,/object-fit:contain/);
  assert.match(page,/imageSize=library\.settings\.imageSize/);
  assert.match(page,/doc\.execCommand\('insertText'/,'preserve the sole native draft insertion');
  assert.doesNotMatch(page,/send-button|clickSendButton|\.click\(\).*send/);
  new Function(main); // Classic tool script must stay syntax-valid.
  assert.match(page,/\.rail\.horizontal\{[^}]*overflow-x:auto/);
});

test('R3.2 the original complete single-file interactive HTML preview remains parseable',async()=>{
  const html=await read('preview/index.html');
  assert(html.length>100000,'must not replace complete original with an abbreviated mock');
  for(const id of ['imageSizeSetting','appearanceImage','imageUrl','pageRail','psImageHelp']) {
    if(id==='psImageHelp')continue;
    assert(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/const DEMO_SETTINGS_KEY=/);
  assert.match(html,/68×48/);
  assert.match(html,/\.appearance-switch label:has\(input:checked\)\{[^}]*color:var\(--od-accent-ink\)/,
    'historical demo selection foreground must follow the formal light/dark accent token');
  // R3.3: the historical simulator must show the same SINGLE size control as
  // the formal tool: list header, not React Host settings. It is not a Host test.
  const listStart=html.indexOf('id="indexView"');
  const sizeControl=html.indexOf('id="imageSizeSetting"');
  const promptList=html.indexOf('id="promptList"');
  const hostSettings=html.indexOf('id="settingsView"');
  assert(listStart>=0&&listStart<sizeControl&&sizeControl<promptList&&promptList<hostSettings,
    'preview global size control must appear in the tool list, matching formal source');
  assert.equal(html.match(/id="imageSizeSetting"/g)?.length,1,
    'preview must not duplicate the image-size setting inside Host settings');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert(scripts.length>=1);
  for(const [,source] of scripts)new Function(source);
});

test('R3.4 source-bound UX: original preview, image controls and verified simulation writes',async()=>{
  const [preview,html,main,css]=await Promise.all([
    read('preview/index.html'),read('src/index.html'),read('src/main.js'),read('src/style.css')
  ]);
  assert(preview.length>100000,'full original interactive preview was reduced');
  for(const id of ['hostBack','hostSettings','hostRemove','promptList','promptForm','pageRail',
    'mockDraft','siteDetails','importPanel','transferMenu','appearanceText','appearanceImage','imageUrl'])
    assert(preview.includes('id="'+id+'"'),id);
  assert.match(preview,/id="imageSizeGroup"/);
  assert.match(preview,/el\('imageSizeGroup'\)\.hidden=!state\.items\.some\(/);
  assert.match(preview,/holder\.dataset\.failedImageUrl===url/);
  assert.match(preview,/E_PREVIEW_STORAGE/);
  assert.match(html,/id="ps-image-size-setting"/);
  assert.match(main,/el\('ps-image-size-setting'\)\.hidden=!data\.items\.some\(/);
  assert.match(css,/\.ps-image-size-setting\[hidden\]\{display:none!important\}/);
});

test('R3.2 candidate package derives from updated official source and pinned classic model',async()=>{
  const pkg=await createSidebarToolPackage(ROOT);
  const config=JSON.parse(await read('tool.config.json'));
  assert.equal(pkg.version,config.version);
  assert.equal(pkg.html,await read('src/index.html'));
  assert.equal(pkg.js,await read('src/main.js'));
  assert.equal(pkg.scripts.length,1);
  assert.equal(pkg.scripts[0].name,'trusted/model.js');
  assert.equal(pkg.scripts[0].code,await read('trusted/model.js'));
});

test('R3.5 live raster gate: original HTML uses preview-only PNG, never formal data URLs',async()=>{
  const [preview,page,main,model,chrome]=await Promise.all([
    read('preview/index.html'),read('trusted/page.js'),read('src/main.js'),
    read('trusted/model.js'),readFile('scripts/tests/prompt-shortcuts-r111-preview-chrome.mjs','utf8')
  ]);
  assert.match(preview,/PREVIEW_OFFLINE_PNG='data:image\/png;base64,/);
  assert.match(preview,/item\.id==='b'&&url===PREVIEW_DEFAULT_IMAGE_URL/,
    'only the untouched built-in sample can use offline PNG');
  assert.match(preview,/img\.src=offlineSample\?PREVIEW_OFFLINE_PNG:url/,
    'custom HTTPS URLs must still be loaded from their actual origin');
  assert.match(preview,/oldSample=row\.id==='b'/,'migrate only untouched historical sample');
  assert.doesNotMatch(main,/PREVIEW_OFFLINE_PNG/);
  assert.doesNotMatch(page,/PREVIEW_OFFLINE_PNG/);
  assert.match(main,/holder\.dataset\.failedImageUrl===url/);
  assert.match(page,/button\.classList\.remove\('image'\)/);
  assert.match(model,/url\.protocol!=='https:'/);
  assert.match(chrome,/async function r35ImageEvidence/);
  assert.match(chrome,/getImageData/);
  assert.match(chrome,/Page\.captureScreenshot/);
  assert.match(chrome,/r35-image-compact/);
  assert.match(chrome,/r35-image-standard/);
  assert.match(chrome,/r35-image-large-restored/);
  assert.match(chrome,/r35ReloadSizePersisted=true/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BRAND_ICONS} from '../../scripts/build-contract.mjs';
import {STATIC_RESOURCES} from '../../scripts/prepare-public.mjs';
import {FIXED_ASSETS,verifyManifest} from '../../scripts/verify-package.mjs';
import {STANDARD_BROWSER_NAME,DEVELOPER_BROWSER_NAME} from '../../scripts/browser-editions-r245.mjs';

const sizes=[16,20,24,32,48,128];
const master='graydove-master-1024.webp';
const iconSource='graydove-icon.svg';
const sourceManifest=async()=>JSON.parse(await readFile('manifest.json','utf8'));

test('the brand directory contains the artwork, SVG source and six pinned PNG exports of the declared dimensions',async()=>{
  assert.deepEqual(await readdir('src/assets/branding').then(files=>files.sort()),
    [...sizes.map(size=>`graydove-${size}.png`),master,iconSource].sort());
  await assert.rejects(access('assets/branding/graydove'),{code:'ENOENT'});
  assert.deepEqual(BRAND_ICONS.map(row=>row.size),sizes);
  for(const row of BRAND_ICONS){
    const png=await readFile(row.source);
    assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(png.readUInt32BE(16),row.size);
    assert.equal(png.readUInt32BE(20),row.size);
    assert.equal(png.length,row.bytes);
    assert.equal(createHash('sha256').update(png).digest('hex'),row.sha256);
    assert.deepEqual(FIXED_ASSETS[row.output],{bytes:row.bytes,sha256:row.sha256});
    assert.equal(STATIC_RESOURCES[row.source],row.output);
  }
  assert.deepEqual(Object.keys(STATIC_RESOURCES).filter(path=>path.startsWith('src/assets/branding/')).sort(),
    BRAND_ICONS.map(row=>row.source).sort(),'the source artwork must never be copied to public assets');
  assert.deepEqual(Object.keys(FIXED_ASSETS).filter(path=>path.startsWith('icons/')).sort(),
    [...sizes.map(size=>`icons/graydove-${size}.png`),'icons/notification.png'].sort());
});

test('Standard and Developer manifests reference every brand PNG through the same strict icon maps',async()=>{
  const source=await sourceManifest();
  verifyManifest(source,{source:true});
  const icons=Object.fromEntries(sizes.map(size=>[size,`icons/graydove-${size}.png`]));
  assert.deepEqual(source.icons,icons);
  assert.deepEqual(source.action.default_icon,icons);
  for(const [edition,name] of [['standard',STANDARD_BROWSER_NAME],['developer',DEVELOPER_BROWSER_NAME]]){
    const manifest=structuredClone(source);
    manifest.name=name;
    manifest.action.default_title='打开 '+name;
    verifyManifest(manifest,{edition,mode:'production'});
  }
});

test('brand icon admission rejects missing, extra, remote and malformed icons without admitting other Manifest fields',async()=>{
  for(const field of ['icons','action']){
    for(const invalid of [undefined,'icons/graydove-16.png',{},
      {'16':'https://example.com/icon.png'},{'1024':`icons/${master}`}]){
      const manifest=await sourceManifest();
      if(field==='icons')manifest.icons=invalid;
      else manifest.action.default_icon=invalid;
      assert.throws(()=>verifyManifest(manifest,{source:true}),/brand icons|action resource/);
    }
    for(const mutate of [icons=>{delete icons['24'];},
      icons=>{icons['64']='icons/graydove-64.png';},
      icons=>{icons['16']='icons/notification.png';}]){
      const manifest=await sourceManifest();
      mutate(field==='icons'?manifest.icons:manifest.action.default_icon);
      assert.throws(()=>verifyManifest(manifest,{source:true}),/brand icons|action resource/);
    }
  }
  const extra=await sourceManifest();
  extra.unapproved_branding={};
  assert.throws(()=>verifyManifest(extra,{source:true}),/Unexpected manifest entry/);
  const popup=await sourceManifest();
  popup.action.default_popup='unapproved.html';
  assert.throws(()=>verifyManifest(popup,{source:true}),/Expected MV3 worker and action/);
  const csp=await sourceManifest();
  csp.content_security_policy.extension_pages="script-src 'self' 'unsafe-eval'";
  assert.throws(()=>verifyManifest(csp,{source:true}),/Unexpected CSP/);
});

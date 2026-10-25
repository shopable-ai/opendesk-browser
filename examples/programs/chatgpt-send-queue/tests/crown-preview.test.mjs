import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=path=>readFileSync(resolve(base,path));
const css=file('assets/queue.css').toString(),img=file('assets/crown-premium.webp');
const html=file('preview/index.html').toString();
test('WebP is packaged as the one crown resource, pointer-safe and small',()=>{
 assert.equal(img.toString('ascii',0,4),'RIFF');
 assert.equal(img.toString('ascii',8,12),'WEBP');
 assert.ok(img.length<15000);
 assert.deepEqual(JSON.parse(file('package.json').toString()).opendesk.assets.filter(x=>x.kind==='image').map(x=>x.path),['assets/crown-premium.webp']);
 assert.match(css,/\.sq-crown\{[^}]*pointer-events:none/);
 assert.match(css,/url\("crown-premium\.webp"\)/);
});
test('production CSS and chosen WebP match the standalone preview',()=>{
 const run=spawnSync(process.execPath,['scripts/sync-crown-preview.mjs','--check'],{cwd:base,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const found=html.match(/<script id="crown-variants" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(found);
 assert.deepEqual(Buffer.from(JSON.parse(found[1]).a,'base64'),img);
});
test('preview has offline controls and no relative or remote assets',()=>{
 assert.doesNotMatch(html,/<(?:script|link)\b[^>]+(?:src|href)\s*=\s*["'](?:https?:|\.\.?\/)/i);
 assert.doesNotMatch(html,/url\(["']?\.\.?\//);
 for(const id of ['blue','draft','more','reset','angle','scale','offsetX','offsetY','sizes','widths','themes','variants'])
   assert.ok(html.includes('id="'+id+'"'),'missing '+id);
});

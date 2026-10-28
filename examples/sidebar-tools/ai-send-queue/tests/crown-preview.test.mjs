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
const tuner=file('legacy/preview/crown-tuner-r53.html').toString();
const find=(start,end)=>{const i=html.indexOf(start),j=html.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'missing region '+start);return html.slice(i+start.length,j)};
test('selected C WebP is the only packaged crown image: valid, alpha capable and small',()=>{
 assert.equal(img.toString('ascii',0,4),'RIFF');
 assert.equal(img.toString('ascii',8,12),'WEBP');
 assert.equal(img.toString('ascii',12,16),'VP8X');
 assert.ok((img[20]&0x10)!==0,'WebP alpha flag must be set');
 assert.ok(img.length>5000 && img.length<15000,'production crown bytes unexpectedly changed');
 const manifest=JSON.parse(file('package.json'));
 assert.deepEqual(manifest.opendesk.assets.filter(x=>x.kind==='image').map(x=>x.path),['assets/crown-premium.webp']);
 assert.match(css,/\.sq-crown\{[^}]*pointer-events:none/);
 assert.match(css,/url\("crown-premium\.webp"\)/);
 assert.match(css,/R5\.4 CROWN-USER-FIT-BEGIN/);
});
test('production CSS and exact selected C WebP match the standalone preview bytes',()=>{
 const run=spawnSync(process.execPath,['scripts/sync-crown-preview.mjs','--check'],{cwd:base,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const art=JSON.parse(find('<script id="crown-variants" type="application/json">','</script>'));
 assert.deepEqual(Object.keys(art),['a'],'a is the legacy sync slot for the sole selected C artwork');
 assert.deepEqual(Buffer.from(art.a,'base64'),img);
 const inlineCss=css.replace('url("crown-premium.webp")','url("data:image/webp;base64,'+art.a+'")');
 assert.equal(find('<style id="program-css">\n','</style>'),inlineCss);
});
test('single HTTP preview retains the locked crown and consumes official React build',()=>{
 const boot=file('preview/boot.js').toString();
 assert.match(html,/SEND QUEUE · 交互预览/);
 assert.match(html,/<script type="module" src=".\/boot.js"><\/script>/);
 assert.doesNotMatch(html,/<(?:script|link)\b[^>]+(?:src|href)\s*=\s*["']https?:/i);
 for(const id of ['blue','native','draft','more','reset','sizes','widths','themes','finish','sample-add','unknown','sidebar-frame'])
   assert.ok(html.includes('id="'+id+'"'),'missing main preview '+id);
 for(const id of ['angle','scale','x','y'])
   assert.ok(tuner.includes('id="'+id+'"'),'missing separate tuner '+id);
 assert.doesNotMatch(html,/id="angle"|id="scale"|id="restore-style"|id="toggle-pause"/);
 assert.match(boot,/src\/page\/engine.js/);
 assert.match(boot,/dist\/tool.js/);
 assert.doesNotMatch(boot,/createRoot\(|function App\(/);
 assert.match(boot,/window\.__sendQueuePreview/);
 assert.match(boot,/state.expanded\?items:items.slice\(0,3\)/);
 assert.match(boot,/items.length<=3/);
 assert.match(html,/pointer-events:none/);
 assert.match(html,/data-value="440">440<\/button><button type="button" data-value="520">520<\/button>/);
});

test('front-only two-layer crown does not hide send arrow or consume pointer hits',()=>{
 assert.match(css,/\.sq-send>svg\{[^}]*z-index:1;pointer-events:none/);
 assert.match(css,/\.sq-crown\{[^}]*pointer-events:none;z-index:2/);
 assert.match(css,/--sq-crown-desktop-angle:-1deg/);
 assert.match(css,/--sq-crown-touch-angle:-1deg/);
 assert.match(html,/蓝色圆形按钮在后、正面金冠在前/);
});

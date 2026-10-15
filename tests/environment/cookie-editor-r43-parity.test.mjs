import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root='examples/sidebar-tools/cookie-editor';
const read=name=>readFile(root+'/'+name,'utf8');

test('approved original R4.3 interactive preview is preserved inside the Cookie Editor tool',async()=>{
  const preview=await read('preview/cookie-editor-r4.3-preview.html');
  assert.equal(Buffer.byteLength(preview,'utf8'),45133);
  const sha=createHash('sha1').update('blob '+Buffer.byteLength(preview,'utf8')+String.fromCharCode(0)).update(preview).digest('hex');
  assert.equal(sha,'7a129f509814805ab78827eaccbc77a64b20010f');
  assert.match(preview,/<title>Cookie Editor R4\.3/);
  assert.match(preview,/data-scene="first"/);
  assert.match(preview,/data-scene="ready"/);
  assert.match(preview,/function ioPanel\(\)/);
  assert.match(preview,/function editor\(\)/);
  assert.match(preview,/模拟数据原型/);
});

test('R4.3 installed HTML presents visible import/export/new actions without entering advanced settings',async()=>{
  const [html,js,css,json]=await Promise.all([
    read('src/index.html'),read('src/main.js'),read('src/style.css'),
    read('cookie-editor.opendesk-tool.json')]);
  const pkg=JSON.parse(json);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length);
  const toolbar=html.slice(html.indexOf('class="toolbar live-toolbar"'),html.indexOf('id="live-export-panel"'));
  for(const name of ['live-import','live-export','live-new'])
    assert.match(toolbar,new RegExp('id="'+name+'"'));
  for(const name of ['live-filter-toggle','live-filter-advanced','browser-import-slot',
    'browser-editor-slot','live-export-content','site-grant-status'])
    assert(ids.includes(name),'missing R4.3 UI element '+name);
  const advanced=html.slice(html.indexOf('id="browser-permissions"'),html.indexOf('id="offline-tools"'));
  for(const name of ['live-import','live-export','live-new'])
    assert(!advanced.includes('id="'+name+'"'),'primary action hidden behind disclosure: '+name);
  assert.match(js,/expandedCookieKey/);
  assert.match(js,/function confirmLiveImport\(\)/);
  assert.match(js,/originalExpiryInput/);
  assert.match(css,/#live-cookie-list \.cookie-row\{/);
  assert.match(html,/<option value="metadata" selected>/);
  assert.equal(pkg.version,'2.0.8');
  assert.equal(pkg.html,html);
  assert.equal(pkg.js,js);
  assert.equal(pkg.css,css);
});


test('R4.4 mirrors the approved R4.3 list and inline editing without weakening real Cookie contracts',async()=>{
  const [html,js,css]=await Promise.all([read('src/index.html'),read('src/main.js'),read('src/style.css')]);
  const daily=html.slice(html.indexOf('id="live-toolbar"'),html.indexOf('id="live-export-panel"'));
  for(const id of ['live-import','live-export','live-new'])assert.match(daily,new RegExp('id="'+id+'"'));
  assert.match(html,/<details id="cookie-advanced"/);
  assert.match(html,/id="editor-reveal-value"[^>]*hidden/);
  assert.match(html,/id="editor-revealed-value"[^>]*data-sensitive="true" hidden/);
  assert.match(html,/id="editor-delete"[^>]*hidden/);
  assert.match(html,/data-cookie-filter="secure"/);
  assert.match(html,/id="browser-list-hint"/);
  assert.match(js,/toggle\.append\(summary,badge,chev\)/);
  assert.match(js,/toggle\.addEventListener\('click',\(\)=>guarded/);
  assert.match(js,/meta\.textContent=row\.domain\+row\.path;/);
  assert.doesNotMatch(js,/meta\.textContent=row\.domain\+row\.path\+\(row\.hostOnly/);
  assert.match(js,/E\('cookie-advanced'\)\.open=false/);
  assert.match(js,/E\('editor-revealed-value'\)\.textContent='';/);
  assert.match(js,/old\.valueRedacted===true&&!liveValueEdited/);
  assert.match(js,/sameCookieMetadata\(row,editing\)/);
  assert.match(css,/#live-cookie-list \.cookie-row-trigger/);
  assert.match(css,/\.live-filter-chip\.sel/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../../examples/sidebar-tools/react-starter/',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('React Sidebar starter pins and bundles a CDN-published library locally',async()=>{
  const [pkg,manifest,chart,app,vite,html]=await Promise.all([
    read('package.json').then(JSON.parse),
    read('tool.config.json').then(JSON.parse),
    read('src/ActivityChart.jsx'),
    read('src/App.jsx'),
    read('vite.config.mjs'),
    read('src/root.html')
  ]);
  assert.equal(pkg.dependencies['@fnando/sparkline'],'0.3.10');
  assert.equal(pkg.dependencies.react,'19.2.0');
  assert.equal(manifest.id,'react-notes-starter');
  assert.equal(manifest.version,'1.1.0');
  assert.deepEqual(manifest.capabilities,['storage.local']);
  assert.match(chart,/from '@fnando\/sparkline'/);
  assert.match(chart,/drawSparkline\(svg,selected\.values/);
  assert.match(chart,/return \(\)=>svg\.replaceChildren\(\)/);
  assert.match(chart,/aria-pressed/);
  assert.match(chart,/<table>/);
  assert.match(app,/request\('storage\.set'/);
  assert.match(app,/<ActivityChart\/>/);
  assert.match(vite,/external:\[\]/);
  assert.match(vite,/inlineDynamicImports:true/);
  assert.match(html,/<div id="tool-app"><\/div>/);
  const bundledSource=chart+app+html;
  assert.doesNotMatch(bundledSource,/(?:<script|<link|import\s*\(\s*['"]https?:|eval\s*\(|new\s+Function\s*\(|fetch\s*\(\s*['"]https?:)/i);
});

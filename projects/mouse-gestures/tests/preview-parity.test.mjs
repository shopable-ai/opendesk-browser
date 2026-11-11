import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('standalone preview embeds the exact pure segmentation code, without ESM exports',async()=>{
  const source=await fs.readFile(new URL('../src/page/segments.js',import.meta.url),'utf8');
  const html=await fs.readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  const marker='// kept byte-equivalent by the project parity test (without ES exports).';
  const start=html.indexOf('\n',html.indexOf(marker))+1;
  const end=html.indexOf('      // PREVIEW_SEGMENT_LOGIC_END',start);
  assert.ok(start>0&&end>start,'preview logic markers exist');
  assert.equal(html.slice(start,end).trimEnd(),source.replace(/^export /gm,'').trimEnd());
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'preview inline script exists');
  assert.doesNotThrow(()=>new vm.Script(script),'preview inline JavaScript parses');
});
test('formal and preview feedback use independent rounded square arrows, not joined arrow glyphs',async()=>{
  const formal=await fs.readFile(new URL('../src/page/gesture.js',import.meta.url),'utf8');
  const preview=await fs.readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  assert.match(formal,/width:'36',height:'36',rx:'9'/);
  assert.match(preview,/class="practice-arrow-badge"/);
  assert.match(preview,/border-radius:9px/);
});

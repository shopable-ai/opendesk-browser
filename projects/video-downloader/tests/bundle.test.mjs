import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeBundle} from '../../../scripts/bundle-provenance.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const trusted=[
  'projects/video-downloader/trusted/policy.js',
  'projects/video-downloader/trusted/hls.js',
  'projects/video-downloader/trusted/host.js',
  'projects/video-downloader/trusted/admission.js'
];
const bundle=(target,paths)=>({fileName:target,
  modules:Object.fromEntries(paths.map(path=>[resolve(root,path),{renderedLength:1,originalLength:1}]))});

test('Video Downloader permits exactly pinned trusted source blobs in fixed sidebar host',()=>{
  const result=describeBundle({chunk:bundle('ui/sidebar-tool-host.js',trusted),root,lock:{packages:{}}});
  assert.equal(result.modules.length,4);
  for(const item of result.modules){
    assert.ok(trusted.includes(item.path));
    assert.match(item.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  }
});
test('Video Downloader cannot enter SW, page relay, or arbitrary project source modules',()=>{
  for(const target of ['sw.js','page-relay.js','ui/tool-shell.js']){
    assert.throws(()=>describeBundle({chunk:bundle(target,[trusted[0]]),root,lock:{packages:{}}}),
      /Historical\/user\/vendor code cannot enter/);
  }
  assert.throws(()=>describeBundle({chunk:bundle('ui/sidebar-tool-host.js',
    ['projects/video-downloader/src/main.js']),root,lock:{packages:{}}}),
    /Historical\/user\/vendor code cannot enter/);
});

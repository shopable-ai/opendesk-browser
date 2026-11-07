import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWebflowPreview} from '../preview/build-design.mjs';
import {verifyWebflowPreview} from '../preview/check-design.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const candidate=await createWebflowPreview();
test('source preview remains valid when only recorded Git provenance changes',async()=>{
 const manifest={...candidate.manifest,sourceCommit:'0'.repeat(40)};
 const result=await verifyWebflowPreview({html:candidate.html,manifest});
 assert.equal(result.sourceState,'MATCHES_CURRENT_WORKTREE');
});
test('source preview rejects patched embedded code even with recomputed artifact hashes',async()=>{
 const documents=JSON.parse(candidate.html.match(/<script id="webflow-preview-sources" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 documents.candidate=documents.candidate.replace('<script type="module">','<script type="module">window.__previewTamper=true;');
 const html=candidate.html.replace(/(<script id="webflow-preview-sources" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_,open,close)=>open+JSON.stringify(documents).replaceAll('<','\\u003c')+close);
 const manifest=structuredClone(candidate.manifest);
 manifest.htmlSha256=sha(html);manifest.documents.candidate=sha(documents.candidate);
 manifest.embeddedCandidateJS=sha(documents.candidate.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 await assert.rejects(verifyWebflowPreview({html,manifest}),/delivered HTML must equal/);
});
test('source preview rejects patched outer behavior even when its HTML hash is updated',async()=>{
 const html=candidate.html.replace('已切换视图，模拟草稿仍保留。','伪造外壳行为');
 assert.notEqual(html,candidate.html);
 await assert.rejects(verifyWebflowPreview({html,manifest:{...candidate.manifest,htmlSha256:sha(html)}}),/delivered HTML must equal/);
});

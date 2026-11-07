// Verify current-worktree parity and the offline boundary; browser evidence is separate.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {parse} from 'acorn';
import {createWebflowPreview} from './build-design.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=new URL('../../../',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function verifyWebflowPreview({html,manifest}){
assert.equal(manifest.sourceMode,'CURRENT_WORKTREE');
assert.equal(sha(html),manifest.htmlSha256,'delivered HTML differs');
for(const [path,expected]of Object.entries(manifest.inputs))
 assert.equal(sha(await readFile(new URL(path,root))),expected,'current input differs: '+path+'; regenerate preview');
assert.equal(sha(JSON.stringify(manifest.inputs)),manifest.candidateHash);
const rebuilt=await createWebflowPreview(),{fixture}=rebuilt;
assert.deepEqual(manifest.inputs,rebuilt.manifest.inputs,'manifest must contain the complete current input closure');
assert.equal(manifest.candidateHash,rebuilt.manifest.candidateHash);
assert.equal(html,rebuilt.html,'delivered HTML must equal the current generated source bytes, including wrapper and behavior');
assert.equal(sha(fixture.js),manifest.fixtureJS,'compiled current trusted UI differs');
assert.equal(sha(fixture.css),manifest.fixtureCSS,'current shared styles differ');
assert.equal(sha(fixture.applicationHtml),manifest.applicationDocumentSHA,'current sandbox application differs');
for(const [path,bytes]of fixture.appSources)assert.equal(sha(bytes),manifest.applicationSources[path]);
const $=load(html),documents=JSON.parse($('#webflow-preview-sources').text());
assert.deepEqual(Object.keys(documents),['candidate'],'only the current candidate is shown');
const doc=documents.candidate,d=load(doc),code=d('script[type=module]').text();
assert.equal(sha(doc),manifest.documents.candidate);
assert.equal(sha(code),manifest.embeddedCandidateJS);
parse(code,{ecmaVersion:'latest',sourceType:'module'});
parse($('script').last().text(),{ecmaVersion:'latest'});
assert.equal(d('#opendesk-react-app').length,1);
assert.match(d('meta[http-equiv=Content-Security-Policy]').attr('content'),/connect-src 'none'/);
assert.match(code,/allow-scripts/);assert.doesNotMatch(code,/allow-same-origin/);
assert.equal($('iframe').length,1);assert.equal($('#candidate').attr('sandbox'),'allow-scripts');
assert.equal($('.preview-device #lab-task').length,0,'diagnostics must remain outside the device');
assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/,'offline HTML must contain all runtime assets');
return {level:'CURRENT_SOURCE_PARITY_AND_OFFLINE_SCOPE',candidateHash:manifest.candidateHash,
 htmlSha256:manifest.htmlSha256,sourceInputs:Object.keys(manifest.inputs).length,sourceState:'MATCHES_CURRENT_WORKTREE',
 checks:['current source and dependency hashes','rebuilt trusted components and sandbox bytes','one source implementation without presentation patches','opaque sandbox; no network; external diagnostics'],
 visualInteraction:'SEPARATE_BROWSER_EVIDENCE',nativeChrome:'NOT_TESTED',production:'NOT_TESTED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const html=await readFile(new URL('webflow-v0.3-preview.html',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('webflow-v0.3-preview.manifest.json',import.meta.url)));
console.log(JSON.stringify(await verifyWebflowPreview({html,manifest}),null,2));
}

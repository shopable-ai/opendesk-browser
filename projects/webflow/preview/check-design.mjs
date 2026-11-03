// Guard against the original failure: a preview that drifts from its sources.
// This verifies frozen bytes and scope; browser interaction evidence is separate.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {parse} from 'acorn';
const project=new URL('../',import.meta.url),root=new URL('../../../',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const html=await readFile(new URL('preview/webflow-v0.3-preview.html',project),'utf8');
const manifest=JSON.parse(await readFile(new URL('preview/webflow-v0.3-preview.manifest.json',project)));
const $=load(html),documents=JSON.parse($('#webflow-preview-sources').text());
assert.equal(sha(html),manifest.htmlSha256,'delivered HTML must match manifest');
const changedSources=[];
for(const [path,expected]of Object.entries(manifest.inputs))
 if(sha(await readFile(new URL(path,root)))!==expected)changedSources.push(path);
for(const [path,revision]of Object.entries(manifest.sourceRevisions??{}))
 assert.equal(sha(execFileSync('git',['show',revision+':'+path],{cwd:root})),manifest.inputs[path],'recorded Git source differs: '+path);
if(!process.argv.includes('--frozen'))assert.deepEqual(changedSources,[],'current source differs; regenerate intentionally, or verify the disclosed frozen snapshot with --frozen');
for(const [route,expected]of Object.entries(manifest.applicationSources)){
 const bytes=execFileSync('git',['show',manifest.appRevision+':projects/webflow/src/ui/'+route.split('/').at(-1)],{cwd:root,encoding:'utf8'});
 assert.equal(sha(bytes),expected,'historical installed application source: '+route);
}
const css=await readFile(new URL('preview/runtime-layout.css',project),'utf8');
const withoutRuntime=doc=>{const d=load(doc);d('style').remove();d('script[type=module]').remove();return d.html();};
assert.equal(withoutRuntime(documents.candidate),withoutRuntime(documents.baseline),'host markup must remain identical');
const baselineStyle=load(documents.baseline)('style').text(),candidateStyle=load(documents.candidate)('style').text();
const comparison=manifest.comparisonBaseline;
const baselineCSS=execFileSync('git',['show',comparison.revision+':projects/webflow/preview/runtime-layout.css'],{cwd:root,encoding:'utf8'});
for(const [path,expected]of Object.entries(comparison.inputs))
 assert.equal(sha(execFileSync('git',['show',comparison.revision+':'+path],{cwd:root})),expected,'previous delivered layout differs: '+path);
assert.equal(sha(baselineCSS),comparison.css);
assert.equal(candidateStyle.replace(css,''),baselineStyle.replace(baselineCSS,''),'only declared runtime CSS may differ');
const patch=JSON.parse(await readFile(new URL('preview/runtime-presentation.json',project)));
assert.deepEqual(patch,manifest.presentationPatch);
assert.equal(patch.file,'projects/webflow/trusted/AutoSettings.tsx');
for(const row of patch.replacements){
 assert.ok(!/webflowAuto\.|chrome\.|fetch\(|request\(|setSnapshot|setDraft|approveAutoTask|setAutoEnabled/.test(row.to),'presentation patch must not change authority or business state');
}
const noComments=css.replace(/\/\*[\s\S]*?\*\//g,'');
for(const rule of noComments.trim().split('}').filter(value=>value.trim())){
 const selector=rule.split('{')[0].trim();
 assert.ok(selector.startsWith('#webflow-runtime-panel '),'layout escaped runtime panel');
 assert.doesNotMatch(rule,/--(?:bg|ink|brand)|color:|font:|display:\s*none|visibility:|opacity:/,'layout must not replace the palette or hide features');
}
for(const [name,doc]of Object.entries(documents)){
 assert.equal(sha(doc),manifest.documents[name]);
 const d=load(doc);
 assert.equal(d('#opendesk-react-app').length,1);
 const code=d('script[type=module]').text();
 parse(code,{ecmaVersion:'latest',sourceType:'module'});
 assert.equal(sha(code),name==='candidate'?manifest.embeddedCandidateJS:manifest.embeddedFixtureJS,'compiled UI must match its disclosed presentation source');
 assert.match(d('meta[http-equiv=Content-Security-Policy]').attr('content'),/connect-src 'none'/);
 assert.match(code,/allow-scripts/);
 assert.doesNotMatch(code,/allow-same-origin/);
}
assert.equal($('iframe').length,2);
$('iframe').each((_,node)=>assert.equal($(node).attr('sandbox'),'allow-scripts'));
assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/,'single file must not fetch runtime assets');
const out=new URL('artifacts/sidebar-tools/webflow/source-preview-20261103/',root);
await mkdir(out,{recursive:true});
const result={date:'2026-11-03',htmlSha256:manifest.htmlSha256,level:'STATIC_SOURCE_AND_SCOPE',
 sourceInputs:Object.keys(manifest.inputs).length,applicationRevision:manifest.appRevision,
 sourceState:changedSources.length?'FROZEN_SNAPSHOT_CURRENT_SOURCE_DIFFERS':'MATCHES_CURRENT_INPUTS',changedSources,
 checks:['HTML and pinned source hashes','same application and host markup in both panes',
 'candidate only runtime CSS and declared presentation patch','real JavaScript parses','opaque sandbox and no network or external runtime'],
 nativeChrome:'NOT_TESTED',visualInteraction:'SEPARATE_BROWSER_EVIDENCE'};
await writeFile(new URL('source-checks.json',out),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

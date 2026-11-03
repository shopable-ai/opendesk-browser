// Reuse the original project's DOM harness against the exact frozen candidate.
// This is bounded component evidence, never browser focus/IME/permission proof.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createWebflowUIFixture} from '../tests/auto-trigger-ui-server.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await readFile(dir+'webflow-v0.3-preview.manifest.json'));
const patch=JSON.parse(await readFile(dir+'runtime-presentation.json'));
const baseline=process.argv.includes('--baseline');
const fixture=await createWebflowUIFixture({selfContained:true,appRevision:manifest.appRevision,
 sourceRevision:manifest.uiSourceRevision,sourcePatches:baseline?[]:[patch]});
assert.equal(createHash('sha256').update(fixture.js).digest('hex'),baseline?manifest.fixtureJS:manifest.candidateJS,'component check must use the delivered bytes');
const ui=await build({stdin:{contents:`export {WebflowAutoSettings,WebflowAutoControls} from './projects/webflow/trusted/AutoSettings.tsx';`,
 resolveDir:root,loader:'tsx'},bundle:true,write:false,packages:'external',format:'esm',jsx:'transform',
 plugins:[{name:'same-frozen-presentation-source',setup(builder){
  builder.onLoad({filter:/\.(?:[cm]?js|jsx|tsx?)$/},async args=>({contents:await fixture.readSource(args.path),loader:extname(args.path).slice(1)}));
 }}]});
const code=ui.outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const testPath='projects/webflow/tests/auto-settings-ui.test.mjs';
const original=execFileSync('git',['show',manifest.uiSourceRevision+':'+testPath],{cwd:root,encoding:'utf8'});
let harness=original.slice(0,original.indexOf("test('defaults come from"));
const start=harness.indexOf('// Only transpile'),end=harness.indexOf('const installation=');
assert.ok(start>0&&end>start,'original test harness discovery drift');
harness=harness.slice(0,start)+`const {WebflowAutoSettings,WebflowAutoControls}=await import(${JSON.stringify('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))});const SharedProviderSettingsSheet=null;\n`+harness.slice(end);
harness=harness.replace(/from '([^']+)'/g,(_,name)=>`from ${JSON.stringify(name.startsWith('.')?new URL(name,new URL(testPath,new URL('../../../',import.meta.url))).href:import.meta.resolve(name))}`)
 .replace("import('react-dom/client')",`import(${JSON.stringify(import.meta.resolve('react-dom/client'))})`);
const checks=`
test('candidate ties JSON, empty-address and native URL errors to the edited field, then clears them',async t=>{
 const f=await fixture(t,{entry:true});
 await f.click('webflow-runtime-open');await f.click('webflow-runtime-tab-scope');
 await f.input('webflow-auto-args','{');await f.click('webflow-auto-prepare');
 const args=f.find('webflow-auto-args'),target=f.find('webflow-auto-target');
 assert.equal(args.getAttribute('aria-invalid'),'true');
 assert.equal(args.getAttribute('aria-describedby'),'webflow-auto-error');
 assert.match(f.find('webflow-auto-error').textContent,/JSON/);
 await f.input('webflow-auto-args','{}');await f.input('webflow-auto-target','');await f.click('webflow-auto-prepare');
 assert.equal(args.hasAttribute('aria-invalid'),false);
 assert.equal(target.getAttribute('aria-invalid'),'true');assert.equal(target.getAttribute('aria-describedby'),'webflow-auto-error');
 f.host.api.prepareAutoGrant=async scope=>{new URL(scope.targetUrl);return {...scope,taskName:'搜索任务'};};
 await f.input('webflow-auto-target','not-a-url');await f.click('webflow-auto-prepare');
 assert.match(f.find('webflow-auto-error').textContent,/Invalid URL/);
 assert.equal(target.getAttribute('aria-invalid'),'true');
 await f.input('webflow-auto-target','https://search.example/');
 assert.equal(target.hasAttribute('aria-invalid'),false);assert.equal(target.hasAttribute('aria-describedby'),false);
 assert.equal(f.host.calls.some(([kind])=>kind==='approve'||kind==='enabled'),false);
});
test('candidate announces review, focuses within it, and does not trap Tab back at the close button',async t=>{
 const f=await fixture(t,{entry:true});let focused=null;
 // Explicit DOM-only shims; no claim about native browser defaults.
 Object.defineProperty(f.document,'activeElement',{configurable:true,get:()=>focused});
 f.window.HTMLElement.prototype.focus=function(){focused=this;};
 f.window.HTMLElement.prototype.getClientRects=function(){return [{}];};
 Object.defineProperty(f.window.HTMLElement.prototype,'tabIndex',{configurable:true,get(){
  return this.hasAttribute('tabindex')?Number(this.getAttribute('tabindex')):
   ['BUTTON','INPUT','TEXTAREA','SELECT','SUMMARY'].includes(this.tagName)?0:-1;
 }});
 f.find('webflow-runtime-open').focus();await f.click('webflow-runtime-open');await f.click('webflow-runtime-tab-scope');
 await f.click('webflow-auto-prepare');const review=f.find('webflow-auto-review');
 assert.ok(f.document.activeElement===review,'the review group receives focus');assert.equal(review.tabIndex,0);
 assert.ok([...f.document.querySelectorAll('[role=status]')].some(node=>node.textContent.includes('审核已就绪')));
 const tab=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(tab,'key',{value:'Tab'});
 review.dispatchEvent(tab);assert.equal(tab.defaultPrevented,false,'Tab must follow native order within the review instead of jumping to close');
 await f.input('webflow-auto-args','{}');assert.equal(f.find('webflow-auto-review'),null,'editing still invalidates the review');
 assert.equal(f.host.calls.some(([kind])=>kind==='approve'||kind==='enabled'),false);
});
test('candidate highlights copy, preserves exact text and exposes clipboard failure without a task operation',async t=>{
 const host=controller();host.snapshot={...host.snapshot,enabled:true,
  grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied='';
 const clipboard={writeText:async value=>{copied=value;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;});
 const f=await fixture(t,{entry:true,host});await f.click('webflow-runtime-open');await f.click('webflow-runtime-tab-scope');
 const button=label=>[...f.find('webflow-auto-grants').querySelectorAll('button')].find(node=>node.textContent===label);
 const click=label=>React.act(async()=>button(label).dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await click('生成 ChatGPT 指令');const prompt=f.find('webflow-auto-grants').querySelector('textarea').value;
 assert.ok(button('复制指令').classList.contains('od-button--primary'));
 assert.ok(button('生成下一次指令').classList.contains('od-button--quiet'));
 await click('复制指令');assert.equal(copied,prompt);assert.match(f.find('webflow-auto-grants').textContent,/指令已复制/);
 clipboard.writeText=async()=>{throw Error('simulated clipboard failure');};
 await click('复制指令');assert.ok(f.find('webflow-auto-grants').textContent.includes('⌘C / Ctrl+C'));
 assert.equal(f.find('webflow-auto-grants').querySelector('textarea').value,prompt);
 assert.deepEqual(host.calls.map(([kind])=>kind),['read']);
});
`;
const temp=await mkdtemp(resolve(tmpdir(),'webflow-presentation-'));
try{
 await writeFile(resolve(temp,'candidate-ui.mjs'),code);
 harness=harness.replace(JSON.stringify('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),JSON.stringify(pathToFileURL(resolve(temp,'candidate-ui.mjs')).href));
 const path=resolve(temp,'presentation.test.mjs');await writeFile(path,harness+checks);
 const out=resolve(root,'artifacts/sidebar-tools/webflow/source-preview-20261103',manifest.htmlSha256.slice(0,12));
 await mkdir(out,{recursive:true});
 let result='',failed=false;
 try{result=execFileSync(process.execPath,['--test',path],{cwd:root,encoding:'utf8'});}
 catch(error){failed=true;result=String(error.stdout??'')+String(error.stderr??'');}
 await writeFile(resolve(out,baseline?'presentation-baseline-red.log':'presentation-checks.log'),result);
 if(baseline){assert.ok(failed&&/fail 3/.test(result),'the original accessibility and action hierarchy gaps must reproduce');console.log('EXPECTED_BASELINE_RED: field association, review focus and action hierarchy checks failed on original UI.');}
 else{assert.ok(!failed,result);console.log(result);}
 console.log('Candidate HTML SHA: '+manifest.htmlSha256);
}finally{await rm(temp,{recursive:true,force:true});}

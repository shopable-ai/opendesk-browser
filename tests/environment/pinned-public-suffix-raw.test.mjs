import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {transformSync} from 'esbuild';
import {transformPinnedPublicSuffixRaw} from '../../scripts/pinned-public-suffix-raw.mjs';

const path='projects/ai-proxy/src/usage/vendor/public_suffix_list.dat';
const consumer='projects/ai-proxy/src/usage/domain.ts';
const raw=readFileSync(resolve(path),'utf8'),source=readFileSync(resolve(consumer),'utf8');
// This is the exact module shape returned by the installed Vite raw loader.
const rawModule='export default '+JSON.stringify(raw);
const transformed=transformPinnedPublicSuffixRaw(rawModule,resolve(path)+'?raw',{target:'ui/tool-shell.js'});
const compact=parse(transformed,{ecmaVersion:'latest',sourceType:'module'}).body[0].declaration.value;
const rules=value=>value.split('\n').map(line=>line.trim().split(/\s/)[0])
  .filter(line=>line&&!line.startsWith('//'));
const canonical=rule=>({rule,kind:rule.startsWith('!')?'exception':rule.startsWith('*.')?'wildcard':'exact',
  ascii:new URL('https://'+rule.replace(/^(?:!|\*\.)/,'')).hostname});

test('pinned PSL raw compaction retains every rule and original licensing/source notices',t=>{
  const before=rules(raw).map(canonical),after=rules(compact).map(canonical);
  assert.deepEqual(after,before,'ordered rules, rule classes and IDNA forms must all remain equal');
  assert.equal(before.length,10336);
  for(const kind of ['exact','wildcard','exception'])assert.ok(before.some(rule=>rule.kind===kind));
  assert.ok(before.some(({rule})=>/[^\x00-\x7f]/.test(rule)),'the source exercises IDNA rules');
  const firstRule=raw.indexOf('\nac\n');
  assert.ok(firstRule>0);assert.ok(compact.startsWith(raw.slice(0,firstRule+1)));
  for(const line of raw.split('\n').filter(line=>/^\s*\/\//.test(line)&&
    /copyright|licen[cs]|mozilla|\bmpl\b|\bpermission\b|all rights reserved|©|===.*DOMAINS===/i.test(line)))
    assert.ok(compact.includes(line+'\n'),'missing notice: '+line);
  for(const line of ['// VERSION: 2026-10-07_07-28-19_UTC',
    '// COMMIT: 3929462652695bad04f0a27afb600974014a3c8b',
    '// Please pull this list from, and only from https://publicsuffix.org/list/public_suffix_list.dat,',
    '// rather than any other VCS sites. Pulling from any other URL is not guaranteed to be supported.'])
    assert.ok(compact.includes(line+'\n'));
  assert.ok(Buffer.byteLength(raw)-Buffer.byteLength(compact)>180000);
  t.diagnostic(JSON.stringify({rules:before.length,rawBytes:Buffer.byteLength(raw),
    compactBytes:Buffer.byteLength(compact),rawModuleBytes:Buffer.byteLength(rawModule),
    compactModuleBytes:Buffer.byteLength(transformed),native:false}));
});

const catalogCode=transformSync(readFileSync(resolve('projects/ai-proxy/src/diagnostics/catalog.ts'),'utf8'),
  {loader:'ts',format:'cjs'}).code;
const domainCode=transformSync(source,{loader:'ts',format:'cjs'}).code;
function domainWith(list){
  const catalog={exports:{}},module={exports:{}};
  runInNewContext(catalogCode,{module:catalog,exports:catalog.exports,URL},{timeout:1000});
  runInNewContext(domainCode,{module,exports:module.exports,URL,require(id){
    if(id==='../diagnostics/catalog')return catalog.exports;
    if(id==='./vendor/public_suffix_list.dat?raw')return list;
    throw Error('Unexpected domain dependency: '+id);
  }},{timeout:1000});
  return module.exports;
}
const plain=value=>value===null?null:JSON.parse(JSON.stringify(value));
test('the original domain consumer behaves identically before and after the raw-only transform',()=>{
  const original=domainWith(raw),reduced=domainWith(compact);
  for(const {rule,ascii} of rules(raw).map(canonical)){
    const unicode=rule.replace(/^(?:!|\*\.)/,'');
    for(const host of [ascii,'audit.'+ascii,'one.audit.'+ascii]){
      assert.equal(reduced.registrableDomain(host),original.registrableDomain(host),host);
      assert.deepEqual(plain(reduced.usageDomainFromHostname(host)),plain(original.usageDomainFromHostname(host)),host);
    }
    for(const host of [unicode,'audit.'+unicode])
      assert.deepEqual(plain(reduced.usageDomainFromUrl('https://'+host+'/path?q=1#fragment')),
        plain(original.usageDomainFromUrl('https://'+host+'/path?q=1#fragment')),host);
  }
  assert.equal(reduced.registrableDomain('github.io'),null);
  assert.equal(reduced.registrableDomain('tenant.github.io'),'tenant.github.io');
  assert.equal(reduced.registrableDomain('www.ck'),'www.ck');
  assert.equal(reduced.registrableDomain('a.b.ck'),'a.b.ck');
  assert.deepEqual(plain(reduced.usageDomainFromUrl('https://chatgpt.com/c/a')),
    {siteKey:'chatgpt',domain:'chatgpt.com'});
  for(const url of ['http://localhost/','https://127.0.0.1/','https://x.invalid/',
    'https://user:pass@example.com/','file:///tmp/a','https://%31%32%37.0.0.1/']){
    assert.equal(reduced.usageDomainFromUrl(url),null);
    assert.equal(original.usageDomainFromUrl(url),null);
  }
});

test('PSL transform does not process other targets, paths or raw query variants',()=>{
  for(const target of ['sw.js','native-agent/settings.js','ui/sidebar-tool-host.js',
    'agents/page-relay.js','scripting/sandbox/worker-runtime.js'])
    assert.equal(transformPinnedPublicSuffixRaw(rawModule,resolve(path)+'?raw',{target}),null);
  for(const id of [resolve(path),resolve(path)+'?url',resolve(path)+'?raw&other',
    resolve(path)+'?other&raw',resolve(path+'.js')+'?raw','virtual:'+resolve(path)+'?raw'])
    assert.equal(transformPinnedPublicSuffixRaw(rawModule,id,{target:'ui/tool-shell.js'}),null);
});

test('PSL raw transform rejects expressions, additional statements and substituted string content',()=>{
  const run=code=>transformPinnedPublicSuffixRaw(code,resolve(path)+'?raw',{target:'ui/tool-shell.js'});
  for(const code of ['export default JSON.parse('+JSON.stringify(JSON.stringify(raw))+');',
    'export default `data`;',rawModule+';globalThis.__pslUnexpectedExecution=true;',
    'import "./other.js";'+rawModule,'export default (0,'+JSON.stringify(raw)+');'])
    assert.throws(()=>run(code),/must be one default string export/);
  assert.throws(()=>run('export default '+JSON.stringify(raw+'\n// substituted')),
    /differs from reviewed source bytes/);
  assert.equal(globalThis.__pslUnexpectedExecution,undefined,'untrusted module text was never executed');
});

test('PSL source and its parsing consumer remain byte-pinned and reject symlinks',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'pinned-psl-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [name,bytes] of [[path,raw],[consumer,source]]){
    await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),bytes);
  }
  const run=()=>transformPinnedPublicSuffixRaw(rawModule,resolve(root,path)+'?raw',{target:'ui/tool-shell.js',root});
  assert.equal(run(),transformed);
  for(const [name,bytes] of [[path,raw],[consumer,source]]){
    await writeFile(join(root,name),bytes+'\n// drift\n');
    assert.throws(run,/Pinned PSL input changed/);
    await writeFile(join(root,name),bytes);
    await rm(join(root,name));await symlink(resolve(name),join(root,name));
    assert.throws(run,/must not be a symlink/);
    await rm(join(root,name));await writeFile(join(root,name),bytes);
  }
});

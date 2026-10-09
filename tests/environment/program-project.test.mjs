import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';

const sample='examples/programs/page-heading';
const sampleManifest=JSON.parse(await readFile(sample+'/package.json','utf8'));
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'opendesk-author-'));
  try {
    await mkdir(join(root,'src'));
    const pkg=structuredClone(sampleManifest);
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await writeFile(join(root,'src/main.js'),"import {heading} from './dom.js';\nexport default async function main(){return heading(document);}");
    await writeFile(join(root,'src/dom.js'),"export const heading = doc => doc.title;");
    await fn(root,pkg);
  } finally {await rm(root,{recursive:true,force:true});}
}
const rejects=code=>error=>error.code===code;

test('multi-file ESM authoring project is a source contract, not an installed program',async()=>{
  const result=await validateProgramProject(sample);
  assert.equal(result.status,'AUTHORING_VALID_NOT_PACKAGED');
  assert.equal(result.installable,false);
  assert.equal(result.runtimeKind,'page-userscript');
  assert.deepEqual(result.sources.map(x=>x.path),['src/describe.js','src/dom.js','src/main.js']);
  assert.ok(result.sources.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
});
test('HTTPS ESM may be declared for build-time pinning, but HTTP and escaping local imports are rejected',async()=>{
  await fixture(async(root)=>{
    await writeFile(join(root,'src/main.js'),"import x from 'https://cdn.example.org/x.mjs';\nexport default function main(){return x;}");
    const checked=await validateProgramProject(root);
    assert.deepEqual(checked.remoteImports,['https://cdn.example.org/x.mjs']);
    await writeFile(join(root,'src/main.js'),"import x from 'http://evil.example/x.js';\nexport default x;");
    await assert.rejects(validateProgramProject(root),error=>{
      assert.equal(error.code,'E_REMOTE_URL');
      assert.equal(error.project,root.split('/').pop());
      assert.equal(error.phase,'validate');
      assert.equal(error.location.file,'src/main.js');
      assert.equal(error.location.line,1);
      return true;
    });
    await writeFile(join(root,'src/main.js'),"import x from '../../escape.js';\nexport default x;");
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_PATH'));
  });
});

test('entry diagnostics distinguish missing and non-function defaults with source location',async()=>{
  await fixture(async(root)=>{
    await writeFile(join(root,'src/main.js'),"export const value = 1;");
    await assert.rejects(validateProgramProject(root),error=>{
      assert.equal(error.code,'E_PROJECT_ENTRY');
      assert.equal(error.phase,'validate');
      assert.equal(error.location,'src/main.js');
      return true;
    });
    await writeFile(join(root,'src/main.js'),"export default 1;");
    await assert.rejects(validateProgramProject(root),error=>{
      assert.equal(error.code,'E_PROJECT_ENTRY');
      assert.equal(error.phase,'validate');
      assert.equal(error.location.file,'src/main.js');
      assert.equal(error.location.line,1);
      return true;
    });
  });
});
test('dynamic import is not quietly kept as an unlocked runtime dependency',async()=>{
  await fixture(async(root)=>{
    await writeFile(join(root,'src/main.js'),"export default async function main(){return import('./dom.js');}");
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_DYNAMIC_IMPORT'));
  });
});
test('npm imports require declared dependencies and a committed matching npm lock',async()=>{
  await fixture(async(root,pkg)=>{
    await writeFile(join(root,'src/main.js'),"import {debounce} from 'lodash-es';\nexport default async function main(){return debounce;}");
    await assert.rejects(validateProgramProject(root),error=>{
      assert.equal(error.code,'E_PROJECT_IMPORT');
      assert.equal(error.phase,'validate');
      assert.equal(error.location.file,'src/main.js');
      assert.equal(error.location.line,1);
      return true;
    });
    pkg.dependencies={'lodash-es':'4.17.21'};
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_FILE'));
    const lock={lockfileVersion:3,packages:{
      '':{dependencies:{'lodash-es':'4.17.21'}},
      'node_modules/lodash-es':{version:'4.17.21',
        resolved:'https://registry.npmjs.org/lodash-es/-/lodash-es-4.17.21.tgz',
        integrity:'sha512-'+Buffer.alloc(64).toString('base64')}
    }};
    await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
    const checked=await validateProgramProject(root);
    assert.deepEqual(checked.npmPackages,['lodash-es']);
    assert.equal(checked.npmDependencies[0].version,'4.17.21');
    delete lock.packages['node_modules/lodash-es'].integrity;
    await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_NPM_LOCK'));
    lock.packages['node_modules/lodash-es'].integrity='sha512-'+Buffer.alloc(64).toString('base64');
    lock.packages['node_modules/lodash-es'].version='4.17.20';
    await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_NPM_LOCK'));
  });
});
test('Page/Controller source contracts remain discriminated without changing Task v1',async()=>{
  await fixture(async(root,pkg)=>{
    pkg.opendesk.permissions=['page.automation'];
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_SCHEMA'));
    delete pkg.opendesk.pageRules;
    pkg.opendesk.runtimeKind='controller';
    pkg.opendesk.siteOrigins=['https://example.com'];
    pkg.opendesk.paramsSchema={type:'object',properties:{},required:[],additionalProperties:false};
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    const checked=await validateProgramProject(root);
    assert.equal(checked.runtimeKind,'controller');
    assert.equal(checked.installable,false);
  });
});
test('assets can be listed and hashed but never silently injected',async()=>{
  await fixture(async(root,pkg)=>{
    await mkdir(join(root,'assets'));
    await writeFile(join(root,'assets/style.css'),'h1{font-weight:700}');
    pkg.opendesk.assets=[{path:'assets/style.css',kind:'css'}];
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    const checked=await validateProgramProject(root);
    assert.equal(checked.assets[0].kind,'css');
    assert.equal(checked.installable,false);
    pkg.opendesk.assets=[{path:'../../outside.css',kind:'css'}];
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),rejects('E_PROJECT_PATH'));
  });
});

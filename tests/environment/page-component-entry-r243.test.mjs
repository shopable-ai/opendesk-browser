import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';

const rules={matches:['http://127.0.0.1:43111/*'],excludeMatches:['http://127.0.0.1:43111/private/*'],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
const source={
  react:"import {createElement,useState} from 'react';\nexport default function App(){const [n,setN]=useState(0);return createElement('button',{type:'button',onClick:()=>setN(n+1)},'Clicked '+n);}",
  vue:"import {h,ref} from 'vue';\nexport default {setup(){const n=ref(0);return ()=>h('button',{type:'button',onClick:()=>n.value++},'Clicked '+n.value);}}"
};
async function fixture(framework,fn){
  const root=await mkdtemp(join(tmpdir(),'opendesk-component-'));
  try{
    await mkdir(join(root,'src'));
    const pkg={name:'@test/page-'+framework,version:'1.0.0',private:true,type:'module',description:'Component regression fixture',
      opendesk:{format:'opendesk.project.v1',id:'test.page-'+framework,runtimeKind:'page-userscript',
        sourceFormat:'esm',entry:'src/App.js',entryMode:'component',framework,pageRules:rules}};
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await writeFile(join(root,'src/App.js'),source[framework]);
    await fn(root,pkg);
  }finally{await rm(root,{recursive:true,force:true});}
}
test('R24.3 standard React/Vue JS imports link to fixed runtime and generated UI wrapper',async()=>{
  for(const framework of ['react','vue'])await fixture(framework,async(root,pkg)=>{
    const checked=await validateProgramProject(root);
    assert.equal(checked.entryMode,'component');
    assert.deepEqual(checked.npmDependencies,[]);
    const output=await buildProgramProjectInMemory(root,{mode:'production'});
    assert.ok(output.sourceBytes<100000);
    assert.match(output.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
    assert.match(output.sourceUtf8,/async function main\(\)/);
    assert.match(output.sourceUtf8,new RegExp('globalThis\\.OpenDeskPage'+(framework==='react'?'React':'Vue')));
    const wrapper=createPageComponentEntry(pkg.opendesk);
    assert.match(wrapper,/createPageUI/);
    assert.match(wrapper,framework==='react'?/root\.unmount\(\)/:/app\.unmount\(\)/);
  });
});
test('R24.3 Native resolver snapshots implicit UI helpers and invalidates component edits',async()=>{
  await fixture('react',async(root)=>{
    const resolver=new LocalDevResolver({allowedPaths:[root]});
    try{
      const binding=resolver.attach({path:root});
      const first=await resolver.resolve(binding.bindingId);
      assert.equal(first.managedUI,true);
      const second=await resolver.resolve(binding.bindingId);
      assert.equal(second.cacheHit,true);
      await writeFile(join(root,'src/App.js'),source.react+'\n// saved revision');
      const third=await resolver.resolve(binding.bindingId);
      assert.equal(third.cacheHit,false);
      assert.notEqual(third.inputHash,first.inputHash);
    }finally{resolver.close();}
  });
});
test('R24.3 wrong-framework imports, unavailable fixed APIs and missing framework are diagnosed',async()=>{
  await fixture('react',async(root,pkg)=>{
    await writeFile(join(root,'src/App.js'),"import {ref} from 'vue';export default function App(){}");
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_FRAMEWORK_IMPORT'});
    await writeFile(join(root,'src/App.js'),"import {useReducer} from 'react';export default function App(){}");
    await assert.rejects(validateProgramProject(root),error=>{
      assert.equal(error.code,'E_PROJECT_FRAMEWORK_EXPORT');
      assert.equal(error.location.file,'src/App.js');return true;
    });
    delete pkg.opendesk.framework;
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_ENTRY_MODE'});
  });
});
test('R24.3 old async-main remains default and Controller cannot opt into component',async()=>{
  await fixture('react',async(root,pkg)=>{
    delete pkg.opendesk.entryMode;
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    assert.equal((await validateProgramProject(root)).entryMode,undefined);
    assert.equal(createPageComponentEntry(pkg.opendesk),null);
    pkg.opendesk.runtimeKind='controller';
    pkg.opendesk.entryMode='component';
    pkg.opendesk.siteOrigins=['http://127.0.0.1:43111'];
    pkg.opendesk.permissions=['page.automation'];
    pkg.opendesk.paramsSchema={type:'object',properties:{},required:[],additionalProperties:false};
    delete pkg.opendesk.pageRules;
    await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_SCHEMA'});
  });
});

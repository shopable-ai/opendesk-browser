import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {FIXED_OUTPUTS} from '../../scripts/build-contract.mjs';

const prefix='projects/webflow/trusted/';
// Snapshot of the read source bytes. Later page edits require explicit re-review
// and re-pinning here and in the gate; never auto-approve current working bytes.
const sources={
  'chatgpt-files-service.js':{pin:'65a9aee1d533a85bc9bbf5c529a7993859a657a5',targets:['native-agent/transport.js']},
  'chatgpt-files-controller.js':{pin:'ca202ad9d2b8e4586bd4582b9a78ac07d9e379b7',targets:['native-agent/transport.js']},
  'chatgpt-project-policy.js':{pin:'647fcd233f662e9239c46d348205329b39db15e9',targets:['native-agent/transport.js']},
  'chatgpt-file-intent-page.js':{pin:'5de3861f877efc97235f1831c7d6826c16ac8c80',targets:['agents/chatgpt-fixed-bridge.js']},
  'chatgpt-files-settings-ui.js':{pin:'2553160d9625c694a3ea77537daa4e83aac8a558',targets:['native-agent/settings.js']},
  'chatgpt-files-ui.js':{pin:'6f19ea933b4eaf1e7f7274bb8629d55545529d5a',targets:['native-agent/settings.js']},
  'chatgpt-file-intent-gate.js':{pin:'1222d7775877b78ba5d42ecf76367f2a1ddc035b',targets:['native-agent/transport.js']},
  'chatgpt-files-config.js':{pin:'622509c3ecf38fa40b32275b705e068a49c6c530',targets:['native-agent/transport.js','agents/chatgpt-fixed-bridge.js']},
  'chatgpt-files.html':{pin:'b8a723d99b97130a9f3fb7f75f2a9e29b34977e8',targets:['native-agent/settings.js']},
  'chatgpt-project-runtime-ui.js':{pin:'b775438992847dabc2f43ff5f42531d7a207389d',targets:['native-agent/settings.js']},
  'chatgpt-conversation-route.js':{pin:'8e28adedd8cc2b49ff34897c0857d33cf2478c87',targets:['sw.js','ui/tool-shell.js','agents/chatgpt-fixed-bridge.js']}
};
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const describe=(root,path,target)=>describeBundle({root,lock:{packages:{}},chunk:{
  fileName:target,modules:{[resolve(root,path)]:{originalLength:100,renderedLength:80}}
}});
function fixture(t){
  const root=realpathSync(mkdtempSync(resolve(tmpdir(),'od-chatgpt-files-provenance-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const [name,{pin}] of Object.entries(sources)){
    const bytes=readFileSync(new URL('../../'+prefix+name,import.meta.url));
    assert.equal(blob(bytes),pin,'Review and re-pin changed source: '+name);
    const file=resolve(root,prefix+name);
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);
  }
  return root;
}

test('ChatGPT files: exact reviewed blobs enter only their enumerated fixed targets',t=>{
  const root=fixture(t);
  const targets=[...new Set(['sw.js',...Object.values(FIXED_OUTPUTS),'unregistered/custom.js'])];
  for(const [name,{pin,targets:allowed}] of Object.entries(sources)){
    for(const target of targets){
      if(allowed.includes(target)){
        // Raw HTML module IDs retain the same exact source admission.
        const path=prefix+name+(name.endsWith('.html')?'?raw':'');
        // The real shell also verifies its unrelated AI Proxy sources. Keep
        // that invariant active rather than weakening it in this fixture.
        const row=describe(process.cwd(),path,target).modules[0];
        assert.equal(row.path,prefix+name);
        assert.equal(row.reviewedFirstPartyBlob,pin);
      }else assert.throws(()=>describe(root,prefix+name,target),
        /Historical\/user\/vendor code cannot enter/,`${name} must not enter ${target}`);
    }
  }
});

test('ChatGPT files: changed bytes fail closed for every allowed source-target pair',t=>{
  const root=fixture(t);
  for(const [name,{targets}] of Object.entries(sources)){
    const file=resolve(root,prefix+name);
    writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\n// unreviewed drift\n')]));
    for(const target of targets)assert.throws(()=>describe(root,prefix+name,target),
      /Trusted ChatGPT files source changed/);
  }
});

test('ChatGPT files: identical bytes through file or ancestor symlinks remain rejected',t=>{
  const root=fixture(t),linked=fixture(t);
  for(const [name,{targets}] of Object.entries(sources)){
    const file=resolve(linked,prefix+name);rmSync(file);symlinkSync(resolve(root,prefix+name),file);
    for(const target of targets)assert.throws(()=>describe(linked,prefix+name,target),/must not be a symlink/);
  }
  const directory=resolve(linked,prefix);rmSync(directory,{recursive:true});
  symlinkSync(resolve(root,prefix),directory);
  for(const [name,{targets}] of Object.entries(sources))
    for(const target of targets)assert.throws(()=>describe(linked,prefix+name,target),/must not be a symlink/);
});

test('ChatGPT files: adjacent project code and lookalike paths gain no admission',t=>{
  const root=fixture(t);
  const paths=[prefix+'unreviewed.js',prefix+'chatgpt-files-service.js.backup',
    prefix+'nested/chatgpt-files-service.js','projects/other/trusted/chatgpt-files-service.js',
    'projects/webflow/src/chatgpt-files-service.js','projects/webflow/webflow.opendesk-tool.json'];
  for(const path of paths)for(const target of ['native-agent/transport.js','native-agent/settings.js','agents/chatgpt-fixed-bridge.js'])
    assert.throws(()=>describe(root,path,target),/Historical\/user\/vendor code cannot enter/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,appendFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {officialSourceProjectPath} from '../../src/sidebar-tools/official-catalog.js';

const paths=[
  'projects/ai-scroll-navigation/trusted/react-controls.tsx',
  'projects/ai-scroll-navigation/trusted/host-localization.js',
  'projects/ai-scroll-navigation/trusted/ai-controls.tsx',
  'projects/ai-scroll-navigation/trusted/ai-configuration.js',
  'projects/time-review/trusted/react-controls.tsx',
  'projects/time-review/trusted/localization.js',
  'projects/prompt-shortcuts/trusted/host-localization.js',
  ...['stay-focus','ai-vip-share'].map(id=>`${officialSourceProjectPath(id)}/trusted/react-controls.tsx`),
  ...['time-review','bookmark-manager','cookie-editor','ai-vip-share','prompt-shortcuts','reading-toc']
    .map(id=>`${officialSourceProjectPath(id)}/trusted/host.css`)];
const describe=(root,path,target)=>describeBundle({root,lock:{packages:{}},chunk:{fileName:target,
  modules:{[resolve(root,path)]:{originalLength:100,renderedLength:80}}}});
for(const path of paths){
  const hostLocale=['projects/prompt-shortcuts/trusted/host-localization.js',
    'projects/time-review/trusted/localization.js'].includes(path);
  test(`${path}: exact static UI source enters only its declared fixed UI targets`,()=>{
    assert.match(describe(process.cwd(),path,'ui/tool-shell.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    if(hostLocale)assert.match(describe(process.cwd(),path,'ui/sidebar-tool-host.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    for(const target of ['sw.js',...(!hostLocale?['ui/sidebar-tool-host.js']:[]),'sidebar-tools/bridge.js','cloud-control/runner.js','unregistered/custom.js'])
      assert.throws(()=>describe(process.cwd(),path,target),/Historical\/user\/vendor code/);
  });
  test(`${path}: changed or symlinked UI cannot acquire trusted admission`,()=>{
    const root=realpathSync(mkdtempSync(resolve(tmpdir(),'od-app-controls-')));
    try{
      const file=resolve(root,path);mkdirSync(dirname(file),{recursive:true});
      copyFileSync(resolve(path),file);appendFileSync(file,'\n// unreviewed drift\n');
      assert.throws(()=>describe(root,path,'ui/tool-shell.js'),/review and re-pin/);
      rmSync(file);symlinkSync(resolve(path),file);
      assert.throws(()=>describe(root,path,'ui/tool-shell.js'),/must not be a symlink/);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
}

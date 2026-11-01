import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {buildCookieEditorReactIfOfficial} from '../../scripts/build-cookie-editor-react.mjs';

test('framework startup uses the promoted Cookie package without compiling unrelated draft source',async()=>{
  const root=new URL('../../examples/sidebar-tools/cookie-editor/',import.meta.url);
  const release=new URL('cookie-editor.opendesk-tool.json',root);
  const before=await readFile(release),compiled=new URL('dist/tool.js',root);
  const compiledMtime=async()=>stat(compiled).then(row=>row.mtimeMs,error=>{
    if(error.code==='ENOENT')return null;throw error;
  });
  const mtime=await compiledMtime();
  assert.equal(await buildCookieEditorReactIfOfficial({log:false}),null);
  assert.equal(await compiledMtime(),mtime);
  assert.deepEqual(await readFile(release),before);
});

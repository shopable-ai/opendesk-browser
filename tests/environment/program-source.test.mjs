import test from 'node:test';
import assert from 'node:assert/strict';
import {programDraft} from '../fixtures/program-draft.mjs';
import {validateProgramDraft, createProgramSourceView} from '../../src/ui/program-source.js';


test('source snapshots and executable hashes are independently checked before import',async()=>{
  const input=await programDraft(),value=await validateProgramDraft(input);
  assert.ok(Object.isFrozen(value.authoring.files[0]));
  input.authoring.files[0].sourceUtf8='changed after import';
  assert.notEqual(value.authoring.files[0].sourceUtf8,input.authoring.files[0].sourceUtf8);
  for(const change of [v=>v.sourceUtf8+=' ',v=>v.build.byteLength++,v=>v.authoring.files[0].sourceUtf8+=' ',
    v=>v.authoring.files[0].path='../main.js',v=>v.project.entry='src/missing.js',
    v=>v.authoring.files.push(v.authoring.files[0]),v=>v.runtimeKind='main-world']){
    const invalid=await programDraft();change(invalid);
    await assert.rejects(validateProgramDraft(invalid));
  }
});

test('project file selection only changes the read-only viewer; execution uses exact frozen build',async()=>{
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',replaceChildren(...children){this.children=children;}});return elements.get(id);};
  const callbacks=new Map();
  const previous=globalThis.Option;globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
  try{
    const view=createProgramSourceView({document:{getElementById:get},listen:(element,type,callback)=>callbacks.set(element,callback),onChange:()=>{}});
    const draft=await programDraft();await view.importProject(draft);
    assert.equal(get('script-source').readOnly,true);
    assert.equal(get('script-source').value,draft.authoring.files[0].sourceUtf8);
    assert.equal(get('program-generated').open,false);
    get('program-source-files').value='src/answer.js';callbacks.get(get('program-source-files'))();
    assert.equal(get('script-source').value,draft.authoring.files[1].sourceUtf8);
    assert.equal(view.source(),draft.sourceUtf8);
    view.replaceSource(draft.sourceUtf8);assert.equal(get('script-source').value,draft.authoring.files[1].sourceUtf8);
    callbacks.get(get('program-new-script'))();
    assert.equal(get('script-source').readOnly,false);assert.equal(view.kind(),undefined);
    view.replaceSource(draft.sourceUtf8);assert.equal(get('script-source').hidden,true);
    assert.match(get('program-source-info').textContent,/无项目源码快照/);assert.equal(view.source(),draft.sourceUtf8);
  }finally{globalThis.Option=previous;}
});

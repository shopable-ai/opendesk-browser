import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceFileIcon,createWorkspaceTreeChevron,workspaceFileIconVariant} from '../../src/native-agent/workspace-file-icons.js';

test('workspace explorer maps supported extensions to local SVG illustrations, never text badges',()=>{
  const expected={
    'README.md':'markdown','README.markdown':'markdown','index.html':'markup','site.htm':'markup',
    'package.json':'json','app.tsx':'code','script.mjs':'code','style.css':'style','notes.txt':'text',
    'file':'file','image.png':'file'
  };
  for(const [name,variant] of Object.entries(expected))
    assert.equal(workspaceFileIconVariant('file',name),variant);
  assert.equal(workspaceFileIconVariant('directory','src',false),'folder');
  assert.equal(workspaceFileIconVariant('directory','src',true),'folder-open');
});

test('SVG icon nodes contain only fixed vector paths and do not interpret file names as markup',()=>{
  const doc={createElementNS(_ns,name){
    return {name,attributes:{},children:[],setAttribute(key,value){this.attributes[key]=value;},
      append(child){this.children.push(child);}};
  }};
  const malicious='<img src=x onerror=alert(1)>.tsx';
  const vector=createWorkspaceFileIcon(doc,'file',malicious);
  assert.equal(vector.name,'svg');assert.equal(vector.attributes['data-variant'],'code');
  assert.equal(vector.attributes['aria-hidden'],'true');
  assert.equal(vector.attributes.viewBox,'0 0 24 24');
  assert.ok(vector.children.length>=2);
  assert.ok(vector.children.every(row=>row.name==='path'&&/^[-.\d A-Za-z]+$/.test(row.attributes.d)));
  assert.doesNotMatch(JSON.stringify(vector),/onerror|<img/);
  const caret=createWorkspaceTreeChevron(doc,true);
  assert.equal(caret.attributes['data-expanded'],'true');
  assert.equal(caret.children.length,1);
});

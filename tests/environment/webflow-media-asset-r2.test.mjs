import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundPage} from '../../src/framework/ChromePage.js';
import {validateTaskManifest} from '../../src/platform/tasks/contract.js';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';

const assetId='wf-media-12345678-1234-4123-a123-123456789abc';
const localOrigin='http://127.0.0.1:43111';

test('R2 Controller passes only opaque assetId, never Blob/Base64 or filesystem path',async()=>{
  const calls=[];
  const page=createBoundPage({
    capture:()=>({documentId:'local-fixture-document'}),
    guard:()=>{},
    request:async(method,args,extra)=>{calls.push({method,args,extra});return {state:'file-input-committed'};},
    environment:'CHROME'
  });
  await page.uploadAsset('#image-0',assetId);
  assert.deepEqual(calls.map(x=>[x.method,x.args,x.extra?.kind]),
    [['uploadFromAsset',['#image-0',assetId],'browser']]);
  assert.equal(JSON.stringify(calls).includes('base64'),false);
  for(const bad of ['', '/Users/example/Pictures/cover.png', 'data:image/png;base64,AAAA', 'https://example.com/foo.png']){
    assert.rejects(page.uploadAsset('#image-0',bad),{code:'E_MEDIA_ID'});
  }
});

test('R2 immutable installed Task Manifest must explicitly review media.read',()=>{
  const schema={type:'object',properties:{
    assetId:{type:'string',title:'素材 ID',minLength:45,maxLength:60}
  },required:['assetId'],additionalProperties:false};
  const manifest={format:'opendesk.task.v1',taskId:'webflow-media-png-local',
    version:'0.1.0',title:'PNG 本地上传',description:'本地网页验证文件内容',
    author:'OpenDesk',source:'local-developer',siteOrigins:[localOrigin],
    permissions:['page.automation','media.read'],entryFormat:'async-main',
    program:{revision:1,sourceHash:'a'.repeat(64)},paramsSchema:schema};
  assert.equal(validateTaskManifest(manifest),manifest);
  assert.throws(()=>validateTaskManifest({...manifest,permissions:['media.read']}),{code:'E_PERMISSION'});
  assert.throws(()=>validateTaskManifest({...manifest,permissions:['page.automation','media.read','media.read']}),{code:'E_PERMISSION'});
  assert.throws(()=>validateTaskManifest({...manifest,permissions:['page.automation','filesystem.read']}),{code:'E_PERMISSION'});
});

test('R3 staged page upload can abort exact ID without affecting a second run',async()=>{
  const session=createPackagedPageSession({
    document:{querySelector:()=>null},
    window:{}
  });
  try{
    const bytes=Buffer.from([137,80,78,71]);
    await session.execute('uploadChunk',['upload-1',0,bytes.length,bytes.toString('base64')]);
    assert.equal(session.snapshot().uploads,1);
    await session.execute('uploadAbort',['upload-1']);
    assert.equal(session.snapshot().uploads,0);
    await session.execute('uploadAbort',['upload-1']); // idempotent cleanup
    assert.equal(session.snapshot().uploads,0);
    await session.execute('uploadChunk',['upload-2',0,bytes.length,bytes.toString('base64')]);
    assert.equal(session.snapshot().uploads,1);
  }finally{session.dispose();}
  assert.equal(session.snapshot().uploads,0);
});

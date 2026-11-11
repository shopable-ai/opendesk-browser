import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {File} from 'node:buffer';
import {inspectMediaFile,validatePngBytes,sha256Hex,createWebflowMediaVault,MEDIA_VAULT_POLICY} from '../../projects/webflow/trusted/media-vault.js';

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,73,69,78,68]);
const named = (name='cover.png',type='image/png',bytes=png) => new File([bytes],name,{type});

test('R1 PNG selection metadata, signature and nonempty bytes', () => {
  const file = named();
  assert.deepEqual(inspectMediaFile(file),{name:'cover.png',mime:'image/png',size:png.length});
  assert.equal(validatePngBytes(png),true);
  assert.throws(()=>validatePngBytes(Uint8Array.from([0,1,2,3,4,5,6,7])),{code:'E_MEDIA_SIGNATURE'});
});
test('R1 rejects oversize, mismatched MIME/extension, unsupported file types', () => {
  assert.throws(()=>inspectMediaFile(named('cover.jpg','image/png')),{code:'E_MEDIA_FORMAT'});
  assert.throws(()=>inspectMediaFile(named('cover.png','image/jpeg')),{code:'E_MEDIA_FORMAT'});
  assert.throws(()=>inspectMediaFile(named('cover.mp4','video/mp4')),{code:'E_MEDIA_TYPE'});
  assert.throws(()=>inspectMediaFile(named('bad.png','image/png',new Uint8Array(1048577))),{code:'E_MEDIA_SIZE'});
  assert.equal(MEDIA_VAULT_POLICY.fileBytes,1048576);
});
test('R1 digest uses original binary (not base64 or JSON)', async () => {
  assert.equal(await sha256Hex(png,webcrypto), createHash('sha256').update(png).digest('hex'));
});
test('R1 extension-owned origin fence rejects target pages, incorrect extension ID and opaque sandbox', () => {
  const id='a'.repeat(32);
  const config={indexedDB:{open(){}},crypto:webcrypto,extensionId:id};
  for(const origin of ['https://chatgpt.com','http://127.0.0.1:43111','null','chrome-extension://'+'b'.repeat(32)])
    assert.throws(()=>createWebflowMediaVault({...config,origin}),{code:'E_MEDIA_ORIGIN'});
  assert.ok(createWebflowMediaVault({...config,origin:'chrome-extension://'+id}));
});

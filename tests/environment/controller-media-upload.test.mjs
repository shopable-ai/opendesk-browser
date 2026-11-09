import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundPage} from '../../src/framework/ChromePage.js';
import {normalizeUploadMetadata} from '../../src/framework/control/value.js';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';

const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function packagedFixture() {
  const events = [];
  const input = {
    tagName: 'INPUT', type: 'file', disabled: false, multiple: false,
    webkitdirectory: false, files: null,
    dispatchEvent(event) { events.push(event.type); return true; }
  };
  const doc = {querySelector: css => css === '#media' ? input : null};
  class FakeFile {
    constructor(parts, name, {type}) {
      this.name = name;
      this.type = type;
      this.bytes = Uint8Array.from(parts[0]);
    }
  }
  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = {add: file => {this.files.push(file);}};
    }
  }
  class FakeEvent {
    constructor(type) {this.type = type;}
  }
  const session = createPackagedPageSession({
    document: doc, window: {File: FakeFile, DataTransfer: FakeDataTransfer, Event: FakeEvent}
  });
  return {session, input, events};
}

test('typed image/video media filenames and MIME are validated before dispatch', () => {
  assert.deepEqual(normalizeUploadMetadata({name:'封面.png', type:'image/png'}),
    {name:'封面.png', type:'image/png'});
  assert.deepEqual(normalizeUploadMetadata({name:'clip.mp4', type:'video/mp4'}),
    {name:'clip.mp4', type:'video/mp4'});
  assert.deepEqual(normalizeUploadMetadata(), {name:'filename.jpg', type:'image/jpeg'});
  for (const metadata of [
    {name:'../escape.mp4', type:'video/mp4'},
    {name:'clip.jpg', type:'video/mp4'},
    {name:'x.svg', type:'image/svg+xml'},
    {name:'x.png', type:'text/html'},
    {name:'a/b.png', type:'image/png'},
    {name:'x.png', type:'image/png', unexpected:true}
  ]) assert.throws(() => normalizeUploadMetadata(metadata));
});

test('Controller page.uploadFile sends typed media with original upload budget', async () => {
  const calls = [];
  const bound = createBoundPage({
    request: async (method, args, extra) => {calls.push({method, args, extra});},
    capture: () => ({documentId: 'demo'}), guard: () => {},
    environment: 'CHROME'
  });
  await bound.uploadFile('#media', 'data:image/png;base64,iVBORw==',
    {name:'封面.png', type:'image/png'});
  assert.deepEqual(calls.map(x => x.method), ['uploadChunk','uploadCommit']);
  assert.deepEqual(calls[1].args.slice(0, 1), ['#media']);
  assert.deepEqual(calls[1].args[3], {name:'封面.png', type:'image/png'});
  calls.length = 0;
  await bound.uploadFile('#media', 'https://example.test/clip.mp4',
    {name:'clip.mp4', type:'video/mp4'});
  assert.equal(calls[0].method, 'uploadFromUrl');
  assert.deepEqual(calls[0].args[2], {name:'clip.mp4', type:'video/mp4'});
  await assert.rejects(
    bound.uploadFile('#media', new ArrayBuffer(1048577), {name:'cover.png', type:'image/png'}),
    error => error.code === 'E_UPLOAD_TOO_LARGE'
  );
});

test('packaged page file input receives real typed File metadata and change event', async () => {
  const {session, input, events} = packagedFixture();
  await session.execute('uploadChunk', ['upload-a', 0, bytes.length, Buffer.from(bytes).toString('base64')]);
  await session.execute('uploadCommit', ['#media', 'upload-a', bytes.length,
    {name:'封面.png', type:'image/png'}]);
  assert.equal(input.files.length, 1);
  assert.equal(input.files[0].name, '封面.png');
  assert.equal(input.files[0].type, 'image/png');
  assert.deepEqual(input.files[0].bytes, bytes);
  assert.deepEqual(events, ['change']);
  session.dispose();
});

test('legacy three-argument uploadCommit still produces JPEG and blocks bad MIME', async () => {
  const {session, input, events} = packagedFixture();
  await session.execute('uploadChunk', ['upload-b', 0, bytes.length, Buffer.from(bytes).toString('base64')]);
  await session.execute('uploadCommit', ['#media', 'upload-b', bytes.length]);
  assert.equal(input.files[0].name, 'filename.jpg');
  assert.equal(input.files[0].type, 'image/jpeg');
  assert.deepEqual(events, ['change']);
  await assert.rejects(
    session.execute('uploadCommit', ['#media', 'unused', 0, {name:'shell.html', type:'text/html'}]),
    error => error.code === 'E_UPLOAD_FORMAT'
  );
  session.dispose();
});

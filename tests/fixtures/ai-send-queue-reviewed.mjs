// Historical reviewed package for framework runtime/permission regression only.
// Gzip keeps it out of installation discovery; never promote it as a release.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const bytes=gunzipSync(await readFile(new URL('./ai-send-queue-reviewed-0.1.34.json.gz',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '0f2383b6bbfe8b5c9371a8bdf1956d13fde30b1242ccf3e11e8b25b42c299760');
export const reviewedQueue=JSON.parse(bytes);
assert.equal(reviewedQueue.version,'0.1.34');

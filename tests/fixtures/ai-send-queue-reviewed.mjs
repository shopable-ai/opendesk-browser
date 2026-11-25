// Historical reviewed package for framework runtime/permission regression only.
// Gzip keeps it out of installation discovery; never promote it as a release.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
async function readReviewedQueue(version,sha256){
  const bytes=gunzipSync(await readFile(new URL('./ai-send-queue-reviewed-'+version+'.json.gz',import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);
  const pkg=JSON.parse(bytes);
  assert.equal(pkg.version,version);
  return pkg;
}

export const reviewedQueue=await readReviewedQueue('0.1.34',
  '0f2383b6bbfe8b5c9371a8bdf1956d13fde30b1242ccf3e11e8b25b42c299760');
export const releaseQueue=()=>readReviewedQueue('0.1.28',
  '99e5f3f6854532376cfca07f195b7c3e3cc8e77f68293a499198fdf41f7ba619');

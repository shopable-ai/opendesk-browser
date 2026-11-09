// Historical dual-installation packages archived from HEAD dededa8c3.
// Test data only: never an installable artifact or current catalog resource.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

export const {tool,pagePackage}=JSON.parse(gunzipSync(
  await readFile(new URL('./legacy-installation.json.gz',import.meta.url))).toString('utf8'));

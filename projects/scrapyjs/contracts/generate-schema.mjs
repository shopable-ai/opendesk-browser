// Keep the portable Android/Desktop JSON contract in sync with the Browser authority.
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CONTRACT_SCHEMA} from './execution-v1.mjs';
const path=fileURLToPath(new URL('./execution-v1.schema.json',import.meta.url));
await writeFile(path,JSON.stringify(CONTRACT_SCHEMA,null,2)+'\n','utf8');

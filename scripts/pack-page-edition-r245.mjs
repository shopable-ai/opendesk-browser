#!/usr/bin/env node
// No release is published here. The Developer ZIP carries its own package hash.
const mode=process.argv[2]??'production';
if(!['production','development'].includes(mode))
  throw Error('E_BROWSER_EDITION_MODE');
process.env.OPENDESK_BROWSER_EDITION='developer';
await import('./pack.mjs');

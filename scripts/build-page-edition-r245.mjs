#!/usr/bin/env node
// Separate Developer Edition from default npm run build: one product source graph.
const mode=process.argv[2]??'production';
if(!['production','development'].includes(mode))
  throw Error('E_BROWSER_EDITION_MODE');
process.env.OPENDESK_BROWSER_EDITION='developer';
await import('./build.mjs');

#!/usr/bin/env node
// Headless candidate-only Chromium regression. Does not overwrite approved HTML.
import {spawnSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {access} from 'node:fs/promises';
const here=dirname(fileURLToPath(import.meta.url));
const toolDir=resolve(here,'../..'),root=resolve(toolDir,'../../..');
const candidate=join(toolDir,'preview/dev.html');
await access(candidate);
const result=spawnSync(process.execPath,[
 join(toolDir,'preview/r304-chrome.mjs'),join(here,'.opendesk-preview/chrome-evidence')
],{cwd:root,stdio:'inherit',env:{...process.env,BOOKMARK_REACT_PREVIEW_HTML:candidate}});
if(result.error)throw result.error;
process.exitCode=result.status??1;

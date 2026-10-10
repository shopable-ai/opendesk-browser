#!/usr/bin/env node
// Source-tree entry for local authoring. The package builder rewrites its only
// import to the bundled runtime path before npm pack.
import {runDevCli} from '../../../native-agent/local-dev/dev-cli.mjs';
process.exitCode=await runDevCli(process.argv.slice(2));

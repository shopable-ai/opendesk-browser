#!/usr/bin/env node
// One-shot experiment only. JSON comes from a trusted local pipe (never argv).
import {probeCookieOnly} from './probe.mjs';

async function main() {
  if (process.argv.length !== 2 || process.stdin.isTTY) {
    process.stdout.write('{"status":"UNAVAILABLE","reason":"PIPE_INPUT_REQUIRED"}\n');
    process.exitCode = 2;
    return;
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const part of process.stdin) {
      size += part.length;
      if (size > 512_000) throw Error('LIMIT');
      chunks.push(part);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const output = await probeCookieOnly({snapshot: input.snapshot, expectedIdentity: input.expectedIdentity});
    process.stdout.write(JSON.stringify(output) + '\n');
    process.exitCode = output.status === 'OK' ? 0 : 2;
  } catch {
    // No body, Cookie, token, stack trace or raw upstream response in logs.
    process.stdout.write('{"status":"UNAVAILABLE","reason":"INPUT_INVALID"}\n');
    process.exitCode = 2;
  }
}
await main();

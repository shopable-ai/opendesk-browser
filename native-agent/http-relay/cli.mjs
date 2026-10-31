#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { startRelay } from './service.mjs';
import { post } from './client.mjs';
import { random, sign, secretBytes, check } from './protocol.mjs';

export async function main(args = process.argv.slice(2)) {
  check(process.versions.node.split('.')[0] === '24', 'NODE_24_REQUIRED');
  const [command, ...rest] = args;
  check(['start', 'status', 'stop', 'invite', 'revoke'].includes(command), 'Usage: node cli.mjs start|status|stop|invite|revoke [--state-dir PATH]');
  const options = {};
  for (let i = 0; i < rest.length; i += 2) { check(['--state-dir', '--origin'].includes(rest[i]) && rest[i + 1] && !options[rest[i]], 'INVALID_ARGUMENTS'); options[rest[i]] = rest[i + 1]; }
  const stateDir = options['--state-dir'] ? resolve(options['--state-dir']) : join(homedir(), '.opendesk-browser', 'http-relay');
  if (command === 'start') {
    const relay = await startRelay({ stateDir, origin: options['--origin'] });
    process.once('SIGTERM', () => relay.close().catch(error => { console.error(error.message); process.exitCode = 1; }));
    process.once('SIGINT', () => relay.close().catch(error => { console.error(error.message); process.exitCode = 1; }));
    console.log(JSON.stringify({ status: 'listening', ...relay.address, pid: process.pid, nodeVersion: process.version }));
    return;
  }
  const file = join(stateDir, 'state.json');
  check(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && (lstatSync(file).mode & 0o077) === 0, 'UNSAFE_STATE');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  let invitation;
  if (command === 'invite') {
    invitation = { invitationId: random(), secret: random(), generation: state.generation, expiresAt: Date.now() + 60000 };
    const tmp = join(stateDir, `invitation-${random()}.tmp`);
    writeFileSync(tmp, JSON.stringify(invitation), { mode: 0o600, flag: 'wx' });
    renameSync(tmp, join(stateDir, 'invitation.json'));
  }
  const response = await post('/control', sign(secretBytes(state.controlKey), { id: random(), at: Date.now(), method: command, body: {} }));
  check(!response.error, response.error);
  console.log(JSON.stringify(invitation ? { ...response, invitation: Buffer.from(JSON.stringify(invitation)).toString('base64url') } : response));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
